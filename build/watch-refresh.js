/**
 * WHAT DOES A REFRESH ACTUALLY LOOK LIKE?
 *
 * Every load number this project has produced is a stage timing — when a
 * fetch finished, when a task blocked, when a mark fired. None of them can
 * answer "I still see it", because none of them look at the screen.
 *
 * This records the frames the compositor actually presented, from navigation
 * through the load screen lifting, the hero playing, and a real wheel scroll
 * down into the tour. Then it says where the picture stopped moving.
 *
 * ── What counts as a stutter ──────────────────────────────────────────────
 *
 * Two different things, and they need separating:
 *
 *   GAP        no frame was presented for N ms. The compositor had nothing
 *              new. This is a stall.
 *   REPEAT     frames were presented but identical to each other while
 *              something on screen was supposed to be moving. The page is
 *              alive and the content is frozen — a stalled video decode
 *              looks like this and a stalled main thread does not.
 *
 * Frames are compared by their encoded bytes. JPEG encoding here is
 * deterministic, so byte-identical means pixel-identical; it can call two
 * genuinely different frames "different" when they differ by noise, which
 * errs toward reporting MORE motion than there was rather than less.
 *
 * ── Honesty about the instrument ──────────────────────────────────────────
 *
 * Screencasting is not free: it costs an encode per frame and it acks back
 * over the DevTools pipe. Numbers from here are an upper bound on stutter,
 * not a clean measurement of the page alone — which is the right direction
 * for a "is anything visibly wrong" question, and the wrong direction for
 * quoting a frame rate. measure-load.js is the instrument for timings.
 *
 * Usage: node build/watch-refresh.js <profile> <out-dir> [url] [--warm]
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const WARM = process.argv.includes("--warm");
const NOCAST = process.argv.includes("--nocast");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9831);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + PORT + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const frames = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Page.screencastFrame") {
      frames.push({ ts: x.params.metadata.timestamp, data: x.params.data });
      ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: x.params.sessionId } }));
    }
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (!WARM) {
    /* A HARD refresh is a cold cache. Network is enabled only to clear it,
       then disabled — with it on, Chrome buffers every response body over
       the DevTools pipe and an 8 MB fetch reads as 13.7s. */
    await send("Network.enable");
    await send("Network.clearBrowserCache");
    await send("Network.disable");
  }
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__loadScreenGone = null; window.__loadScreenSeen = false;
      (function poll() {
        const el = document.querySelector('[data-load-screen]');
        if (el) window.__loadScreenSeen = true;
        if (!el && window.__loadScreenSeen && window.__loadScreenGone === null) {
          window.__loadScreenGone = +performance.now().toFixed(1); return;
        }
        if (performance.now() < 40000) setTimeout(poll, 30);
      })();
      /*
       * FRAME CADENCE, from inside the page.
       *
       * The screencast cannot measure this honestly — it encodes a JPEG per
       * frame and acks each one over the DevTools pipe, so its own cost is
       * mixed into every gap it reports. rAF timestamps cost nothing and are
       * the compositor's own account of when a frame went out. Run with
       * --nocast for a cadence number with no observer on it at all.
       */
      window.__raf = [];
      (function tick(t) {
        window.__raf.push(+t.toFixed(1));
        if (t < 40000) requestAnimationFrame(tick);
      })(0);
    `,
  });

  const t0 = Date.now();
  if (!NOCAST) await send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 });
  await send("Page.navigate", { url: URL });

  /* Hold still while the page loads, so anything that moves in this stretch
     is the page moving and not the harness scrolling it. */
  for (let i = 0; i < 60; i++) {
    if (await ev("window.__loadScreenGone !== null")) break;
    await sleep(250);
  }
  const liftAt = await ev("window.__loadScreenGone");
  await sleep(3000);           /* watch the hero play, uninterrupted */
  const heroWatchEnd = await ev("performance.now()");

  /* Then scroll down into the tour, at a steady wheel cadence. */
  const scrollFrom = await ev("performance.now()");
  const top = await ev(`(() => {
    const rw = document.querySelector('#parent-app [data-tour-runway]');
    return rw ? Math.round(rw.getBoundingClientRect().top + scrollY) : null;
  })()`);
  const notches = 45;
  for (let i = 0; i < notches; i++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: Math.round(VW / 2), y: Math.round(VH / 2),
      deltaX: 0, deltaY: 220, pointerType: "mouse",
    });
    await sleep(80);
  }
  await sleep(1200);
  const endAt = await ev("performance.now()");
  const marks = JSON.parse(await ev("JSON.stringify(window.__tourMarks || {})"));
  const raf = JSON.parse(await ev("JSON.stringify(window.__raf || [])"));
  if (!NOCAST) await send("Page.stopScreencast");
  await sleep(300);

  /* ---- write the frames, and a video at real speed --------------------- */
  const base = frames.length ? frames[0].ts : 0;
  const list = [];
  frames.forEach((f, i) => {
    const name = "f" + String(i).padStart(5, "0") + ".jpg";
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, "base64"));
    list.push({ name, at: (f.ts - base) * 1000, bytes: f.data.length, data: f.data });
  });
  const concat = list.map((f, i) => {
    const next = list[i + 1] ? list[i + 1].at : f.at + 33;
    return `file '${f.name}'\nduration ${((next - f.at) / 1000).toFixed(4)}`;
  }).join("\n") + `\nfile '${list[list.length - 1]?.name}'\n`;
  fs.writeFileSync(path.join(OUT, "frames.txt"), concat);
  const mp4 = path.join(OUT, "refresh.mp4");
  const enc = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
    "-i", path.join(OUT, "frames.txt"), "-fps_mode", "vfr", "-pix_fmt", "yuv420p",
    "-c:v", "libx264", "-crf", "20", mp4], { encoding: "utf8" });

  /* ---- what stopped moving --------------------------------------------- */
  const gaps = [];
  for (let i = 1; i < list.length; i++) {
    const g = list[i].at - list[i - 1].at;
    if (g > 100) gaps.push({ at: list[i - 1].at, ms: g, frame: list[i - 1].name });
  }
  const repeats = [];
  let runStart = 0;
  for (let i = 1; i <= list.length; i++) {
    const same = i < list.length && list[i].data === list[i - 1].data;
    if (!same) {
      const span = list[i - 1].at - list[runStart].at;
      if (span > 150 && i - 1 > runStart) {
        repeats.push({ at: list[runStart].at, ms: span, n: i - runStart, frame: list[runStart].name });
      }
      runStart = i;
    }
  }

  const span = list.length ? list[list.length - 1].at - list[0].at : 0;
  console.log("\n  REFRESH, WATCHED — " + URL + "   " + VW + "x" + VH + (WARM ? "   warm cache" : "   COLD cache (a hard refresh)"));
  console.log("  " + list.length + " presented frames over " + (span / 1000).toFixed(1) + "s"
    + (enc.status === 0 ? "   video: " + mp4 : "   ffmpeg failed: " + (enc.stderr || "").trim().slice(0, 200)));
  console.log("  timeline (ms from the first presented frame; page clock offsets by ~" + Math.round(list[0]?.at ?? 0) + "):");
  console.log("    load screen lifted   " + (liftAt === null ? "never" : Math.round(liftAt)));
  console.log("    hero watched until   " + Math.round(heroWatchEnd) + "   (nothing scrolled before this)");
  console.log("    scrolling from       " + Math.round(scrollFrom) + " to " + Math.round(endAt) + "   runway top at y=" + top);
  if (marks.firstFrame) console.log("    scene first frame    " + Math.round(marks.firstFrame) + "   settled " + Math.round(marks.settled ?? marks.deferredEnvDone ?? marks.firstFrame));

  /*
   * GAPS COME FROM rAF, not from the screencast.
   *
   * The screencast's own gaps were 8.8 presented frames per second over the
   * hero and 25 during the scroll; the same build, watched through rAF in a
   * --nocast run, was 46 and 58 with no gap over 100ms anywhere. Almost all
   * of that "stutter" was the JPEG encode and the pipe ack. A harness whose
   * observer is the largest thing it measures has no business quoting a
   * frame rate, so the pixels answer "what was on screen" and the page's own
   * clock answers "when".
   */
  const rgaps = [];
  for (let i = 1; i < raf.length; i++) {
    const g = raf[i] - raf[i - 1];
    if (g > 40) rgaps.push({ at: raf[i - 1], ms: g });
  }
  console.log("\n  GAPS — a frame took over 40ms, from the page's rAF clock" + (NOCAST ? "" : "   (SCREENCAST ON: inflated)"));
  if (!rgaps.length) console.log("    none");
  for (const g of rgaps.sort((a, b) => b.ms - a.ms).slice(0, 14)) {
    const where = g.at < (liftAt ?? 0) ? "behind the load screen"
      : g.at < heroWatchEnd ? "hero, after the lift" : "scrolling into the tour";
    console.log("    " + Math.round(g.ms).toString().padStart(6) + "ms at " + Math.round(g.at).toString().padStart(6) + "ms   " + where);
  }
  if (!NOCAST) {
    console.log("\n  SCREENCAST GAPS — over 100ms with no presented frame (instrument included)");
    if (!gaps.length) console.log("    none");
    for (const g of gaps.sort((a, b) => b.ms - a.ms).slice(0, 8)) {
      console.log("    " + Math.round(g.ms).toString().padStart(6) + "ms starting at " + Math.round(g.at).toString().padStart(6) + "ms   " + g.frame);
    }
  }

  console.log("\n  FROZEN PICTURE — consecutive frames byte-identical for over 150ms");
  if (!repeats.length) console.log("    none");
  for (const r of repeats.sort((a, b) => b.ms - a.ms).slice(0, 12)) {
    console.log("    " + Math.round(r.ms).toString().padStart(6) + "ms over " + String(r.n).padStart(4) + " frames, from " + Math.round(r.at).toString().padStart(6) + "ms   " + r.frame);
  }

  /* Frame cadence in the stretch the visitor is actually watching motion:
     after the lift, and during the scroll. Reported as counts and worst
     case, never a mean — a mean over a long smooth stretch hides exactly the
     events being hunted. */
  const seg = (a, b, label) => {
    const f = raf.filter((x) => x >= a && x <= b);
    if (f.length < 2) { console.log("    " + label.padEnd(28) + "no frames"); return; }
    let worst = 0, worstAt = 0, over50 = 0, over100 = 0;
    for (let i = 1; i < f.length; i++) {
      const g = f[i] - f[i - 1];
      if (g > worst) { worst = g; worstAt = f[i - 1]; }
      if (g > 50) over50++;
      if (g > 100) over100++;
    }
    console.log("    " + label.padEnd(28) + String(f.length).padStart(4) + " frames, " +
      (f.length / ((b - a) / 1000)).toFixed(1).padStart(5) + "/s, worst " + Math.round(worst) + "ms at " +
      Math.round(worstAt) + "ms, " + over50 + " over 50ms, " + over100 + " over 100ms");
  };
  console.log("\n  CADENCE BY SEGMENT — from the PAGE's own rAF clock, not the screencast");
  seg(0, liftAt ?? 0, "behind the load screen");
  seg(liftAt ?? 0, heroWatchEnd, "hero, after the lift");
  seg(scrollFrom, endAt, "scrolling into the tour");

  ws.close(); ch.kill();
  process.exit(0);
})();
