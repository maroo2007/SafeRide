/**
 * WAS THE REVEAL ACTUALLY PRESENTED SMOOTHLY?
 *
 * rAF timestamps are the wrong instrument and this project has now been
 * caught by that twice. rAF says when the PAGE ran its callback; it cannot
 * see a frame the compositor failed to present, which is exactly what a
 * stutter is. The hero looked like 58.2fps on rAF while the picture froze.
 *
 * So this reads the compositor's own record, through the trace categories
 * DevTools itself uses:
 *
 *   DrawFrame        a frame was presented
 *   DroppedFrame     a frame was not
 *   Commit / RasterTask / GPUTask   what it cost to make one
 *
 * and it reports the intervals between presented frames across the reveal
 * window, plus anything expensive sharing that window — shader compilation,
 * raster, GPU work — because if the reveal is competing with a compile then
 * no easing curve fixes it and the answer is to move one of them.
 *
 * Usage: node build/measure-reveal.js <profile> [--reveal=900] [--hold=0] [--port=]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const REVEAL = arg("reveal", "");
const HOLD = arg("hold", "");
const PORT = +arg("port", 9981);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const MODE = arg("revealMode", "");
const qs = [
  REVEAL ? "reveal=" + REVEAL : null,
  HOLD !== "" ? "hold=" + HOLD : null,
  MODE ? "revealMode=" + MODE : null,
].filter(Boolean).join("&");
const URL = "http://localhost:3100/" + (qs ? "?" + qs : "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + PORT + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("measure-reveal: no debugger target");
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 30 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const events = [];
  let complete = false;
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Tracing.dataCollected") events.push(...x.params.value);
    if (x.method === "Tracing.tracingComplete") complete = true;
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Network.enable"); await send("Network.clearBrowserCache"); await send("Network.disable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__ph = []; let last = null;
      window.__paint = null;
      (function tick() {
        const el = document.querySelector('[data-load-screen]');
        const p = el ? (el.dataset.phase || '?') : 'gone';
        if (p !== last) { window.__ph.push({ p: p, at: +performance.now().toFixed(1) }); last = p; }
        if (el && el.dataset.reveal) window.__revealMode = el.dataset.reveal;
        /*
         * WHICH SURFACE IS ACTUALLY DOING THE REVEAL.
         *
         * The variant is chosen by a data attribute; the work is done by CSS
         * keyed off it. Those can disagree - a build whose stylesheet predates
         * the clip rules would still set the attribute, and this harness would
         * then report the mask variant twice and call it a comparison. So take
         * the computed values at phase open and let the report show them.
         */
        if (el && el.dataset.phase === 'open' && !window.__paint) {
          const snap = function () {
            const e = document.querySelector('[data-load-screen]');
            if (!e) return null;
            const clip = e.querySelector('.loader-clip');
            const cover = e.querySelector('.loader-cover');
            const hive = e.querySelector('.loader-hive');
            const cs = clip ? getComputedStyle(clip) : null;
            return {
              mode: e.dataset.reveal || '?',
              clipDisplay: cs ? cs.display : 'no element',
              clipPath: cs ? (cs.clipPath || 'none').slice(0, 34) : 'no element',
              coverDisplay: cover ? getComputedStyle(cover).display : 'no element',
              cover: cover ? getComputedStyle(cover).transform : 'no element',
              hive: hive ? getComputedStyle(hive).transform : 'no element'
            };
          };
          window.__paint = snap();
          /* A SECOND sample, mid-reveal. Which surface is moving is the whole
             difference between the variants, and one sample cannot show
             movement - the first frame of every variant looks alike. */
          setTimeout(function () { window.__paint2 = snap(); }, 250);
        }
        if (performance.now() < 60000) requestAnimationFrame(tick);
      })();
    `,
  });

  await send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "disabled-by-default-devtools.timeline.frame",
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "gpu",
      ],
    },
  });
  await send("Page.navigate", { url: URL });

  for (let i = 0; i < 600; i++) {
    const p = await ev("(() => { const el = document.querySelector('[data-load-screen]'); return el ? (el.dataset.phase || '?') : 'gone'; })()");
    if (p === "gone" && i > 4) break;
    await sleep(50);
  }
  await sleep(800);
  const ph = JSON.parse(await ev("JSON.stringify(window.__ph || [])"));
  /* Read the mode off the ELEMENT, not off the flag we passed. A query param
     that never reaches the DOM would otherwise be reported as a comparison of
     two things that were the same thing. */
  const appliedMode = await ev("window.__revealMode || 'unknown'");
  const paint = JSON.parse(await ev("JSON.stringify(window.__paint)"));
  const paint2 = JSON.parse(await ev("JSON.stringify(window.__paint2 || null)"));
  /* performance.now() and trace timestamps share no origin; navigationStart in
     trace time is the bridge. Taken from the page rather than guessed. */
  const originDelta = await ev("performance.timeOrigin");
  await send("Tracing.end");
  for (let i = 0; i < 100 && !complete; i++) await sleep(100);

  const li = ph.findIndex((x) => x.p === "loading");
  const phz = li >= 0 ? ph.slice(li) : ph;
  const at = (p) => { const e = phz.find((x) => x.p === p); return e ? e.at : null; };

  /* Trace ts is microseconds on a monotonic clock. Anchor it by matching the
     trace's own navigationStart against the page's timeOrigin. */
  const navEv = events.find((e) => e.name === "navigationStart" || (e.name === "NavigationStart"));
  /* reduce, not Math.min(...arr): a trace is 60-90k events and the spread
     blows the call stack. One run died that way. */
  const traceNav = navEv ? navEv.ts
    : events.reduce((m, e) => (e.ts > 0 && e.ts < m ? e.ts : m), Infinity);
  const toPage = (ts) => (ts - traceNav) / 1000;

  const frames = events.filter((e) => e.name === "DrawFrame").map((e) => toPage(e.ts)).sort((a, b) => a - b);
  const dropped = events.filter((e) => e.name === "DroppedFrame").map((e) => toPage(e.ts)).sort((a, b) => a - b);

  console.log("\n  REVEAL, PRESENTED FRAMES — " + URL);
  console.log("  reveal path actually used: " + appliedMode);
  if (!paint) {
    console.log("  ABORT — never saw phase open, so nothing was measured");
    ws.close(); ch.kill(); process.exit(1);
  }
  if (!paint2) {
    console.log("  ABORT — no mid-reveal sample; cannot show which surface moved\n");
    ws.close(); ch.kill(); process.exit(1);
  }
  console.log("  clip layer   display=" + paint.clipDisplay + "  path " + paint.clipPath
    + (paint.clipPath !== paint2.clipPath ? "  MOVED" : "  still"));
  console.log("  cover        display=" + paint.coverDisplay + "  transform " + paint.cover
    + (paint.cover !== paint2.cover ? "  MOVED" : "  still"));
  console.log("  hive (mask)  transform " + paint.hive
    + (paint.hive !== paint2.hive ? "  MOVED" : "  still"));

  /*
   * THE VARIANT HAS TO BE VISIBLE IN THE PIXELS, NOT IN THE ATTRIBUTE.
   *
   * Each mode names exactly one surface that must be moving, and the other
   * two must not. Without this a stylesheet that predates a mode would still
   * set the attribute, produce a perfectly plausible frame rate, and be
   * reported as that mode - three runs of the same thing under three names.
   */
  const moved = {
    clip: paint.clipPath !== paint2.clipPath && paint.clipDisplay !== "none",
    layer: paint.cover !== paint2.cover && paint.coverDisplay !== "none",
    mask: paint.hive !== paint2.hive && paint.coverDisplay !== "none",
  };
  const want = MODE || "mask";
  if (!moved[want]) {
    console.log("  ABORT — asked for " + want + ", but its surface never moved. Not a comparison.\n");
    ws.close(); ch.kill(); process.exit(1);
  }
  for (const other of Object.keys(moved)) {
    if (other !== want && moved[other]) {
      console.log("  ABORT — asked for " + want + ", but " + other + " moved too. Two reveals at once.\n");
      ws.close(); ch.kill(); process.exit(1);
    }
  }
  console.log("  phases: " + phz.map((x) => x.p + "@" + Math.round(x.at)).join(" -> "));
  console.log("  trace: " + events.length + " events, " + frames.length + " DrawFrame, " + dropped.length + " DroppedFrame total");

  const window0 = at("open"), window1 = at("gone");
  if (window0 === null || window1 === null) {
    console.log("\n  could not locate the reveal window in the phase log\n");
    ws.close(); ch.kill(); process.exit(1);
  }
  const inWin = frames.filter((f) => f >= window0 - 20 && f <= window1 + 20);
  const dropWin = dropped.filter((f) => f >= window0 - 20 && f <= window1 + 20);
  /*
   * WHERE the stall is, not just how big.
   *
   * A median of 18ms with one 510ms gap is not a slow animation, it is a
   * smooth animation with a freeze in it, and the freeze's position names the
   * cause: at the start it is the layer being built, at the end it is what
   * happens when the overlay is removed. Averaged into a frame rate the
   * difference disappears, which is how this got chased for two rounds.
   */
  const gapAt = [];
  for (let i = 1; i < inWin.length; i++) {
    gapAt.push({ ms: inWin[i] - inWin[i - 1], from: inWin[i - 1] - window0 });
  }
  const gaps = gapAt.map((g) => g.ms).sort((a, b) => a - b);
  const worstGaps = gapAt.slice().sort((a, b) => b.ms - a.ms).slice(0, 3);
  const span = window1 - window0;

  console.log("\n  THE REVEAL WINDOW  (" + Math.round(window0) + "ms -> " + Math.round(window1) + "ms, " + Math.round(span) + "ms)");
  console.log("    frames PRESENTED     " + inWin.length + "   (" + (inWin.length / (span / 1000)).toFixed(1) + "/s)");
  console.log("    frames DROPPED       " + dropWin.length);
  if (gaps.length) {
    console.log("    interval median      " + gaps[gaps.length >> 1].toFixed(1) + "ms");
    console.log("    interval worst       " + gaps[gaps.length - 1].toFixed(1) + "ms");
    console.log("    over 20ms            " + gaps.filter((g) => g > 20).length + " of " + gaps.length);
    console.log("    over 32ms            " + gaps.filter((g) => g > 32).length + " of " + gaps.length);
    console.log("    worst gaps           " + worstGaps.map((g) =>
      g.ms.toFixed(0) + "ms starting " + g.from.toFixed(0) + "ms into the " + Math.round(span) + "ms reveal").join("\n                         "));
  }

  /*
   * THE CEILING, taken from the same run.
   *
   * A reveal presenting 24 frames a second is only bad news if this harness
   * can present more than that. Headless Chrome has no display and no vsync,
   * and the machine is sharing a GPU with the user's own browser, so the
   * number that matters is not 60 - it is whatever THIS page manages with no
   * loader on it at all.
   *
   * So: an equal-length window taken after the overlay is gone, same page,
   * same run, same second. The hero video is playing in both, which is the
   * point; the only difference is the reveal.
   */
  const ctl0 = window1 + 200, ctl1 = ctl0 + span;
  const ctlFrames = frames.filter((f) => f >= ctl0 && f <= ctl1);
  const ctlDropped = dropped.filter((f) => f >= ctl0 && f <= ctl1);
  const ctlGaps = [];
  for (let i = 1; i < ctlFrames.length; i++) ctlGaps.push(ctlFrames[i] - ctlFrames[i - 1]);
  ctlGaps.sort((a, b) => a - b);
  console.log("\n  THE SAME PAGE WITH NO LOADER ON IT  (" + Math.round(ctl0) + "ms -> "
    + Math.round(ctl1) + "ms, the same " + Math.round(span) + "ms)");
  console.log("    frames PRESENTED     " + ctlFrames.length
    + "   (" + (ctlFrames.length / (span / 1000)).toFixed(1) + "/s)");
  console.log("    frames DROPPED       " + ctlDropped.length);
  if (ctlGaps.length) {
    console.log("    interval median      " + ctlGaps[ctlGaps.length >> 1].toFixed(1) + "ms");
    console.log("    interval worst       " + ctlGaps[ctlGaps.length - 1].toFixed(1) + "ms");
  }

  /*
   * WHAT THE MECHANISM COSTS, which is not the same question as how many
   * frames came out.
   *
   * Presented-frame counts on this machine swing by a factor of two between
   * identical runs - a headless compositor with the user's own Chrome sharing
   * the GPU is a noisy instrument, and two variants a few frames apart cannot
   * be separated by it. Raster time inside the reveal window can: it is the
   * work the variant itself creates, and it does not care whether the
   * scheduler was generous that second.
   *
   * This is the number that says whether the reveal re-rasterises per frame or
   * hands a finished layer to the compositor.
   */
  const RASTER = /^(RasterTask|RendererRasterWorker|Rasterize|PaintOp)/;
  const inWindow = (e) => {
    const a = toPage(e.ts);
    return a + (e.dur || 0) / 1000 >= window0 && a <= window1;
  };
  const rasterEv = events.filter((e) => e.dur && RASTER.test(e.name) && inWindow(e));
  const rasterMs = rasterEv.reduce((s, e) => s + e.dur / 1000, 0);
  const gpuEv = events.filter((e) => e.dur && e.name === "GPUTask" && inWindow(e));
  const gpuMs = gpuEv.reduce((s, e) => s + e.dur / 1000, 0);
  console.log("    raster in window     " + rasterMs.toFixed(1) + "ms over " + rasterEv.length + " tasks");
  console.log("    GPU in window        " + gpuMs.toFixed(1) + "ms over " + gpuEv.length + " tasks");

  /* What else was running. If the reveal shares its window with a compile or
     a big raster, the animation is not the problem and easing will not fix
     it — that is the question this section exists to answer. */
  const COSTLY = /Compile|Raster|GPUTask|Paint|UpdateLayerTree|CompositeLayers|Layout|EvaluateScript|FunctionCall|Decode/;
  const busy = events
    .filter((e) => e.dur && e.dur > 3000 && COSTLY.test(e.name))
    .map((e) => ({ name: e.name, at: toPage(e.ts), ms: e.dur / 1000 }))
    .filter((e) => e.at + e.ms >= window0 - 200 && e.at <= window1)
    .sort((a, b) => b.ms - a.ms);
  console.log("\n  WHAT ELSE WAS RUNNING in the reveal window (and the 200ms before it)");
  if (!busy.length) console.log("    nothing over 3ms — the reveal had the frame to itself");
  for (const b of busy.slice(0, 12)) {
    console.log("    " + b.ms.toFixed(1).padStart(7) + "ms  " + b.name + "  at " + Math.round(b.at) + "ms"
      + (b.at < window0 ? "   (before the reveal)" : ""));
  }
  console.log("");
  ws.close(); ch.kill();
  process.exit(0);
})();
