/**
 * The loader's contract (build spec §4, guard table §5).
 *
 * ── The check that matters most ───────────────────────────────────────────
 *
 * THE HONEYCOMB MUST ACTUALLY PUNCH. This build shipped, briefly, as a plain
 * black rectangle: every phase fired on time, the SSR markup was correct, the
 * ARIA was correct, the reveal ran and the element was removed — and the mask
 * punched nothing, because a percentage transform with `transform-box:
 * view-box` computes the right matrix inside <defs> and paints no hole. Every
 * structural check passed on it.
 *
 * So the first assertion here is a PIXEL one: during phase 1, the middle of
 * the screen must contain both the dark ground and the plate showing through
 * holes. Nothing about phases, timings or markup can substitute for it.
 *
 * ── The handoff (§4.3) ────────────────────────────────────────────────────
 *
 * The spec asks for the spinner and the reveal to be pixel-aligned across a
 * swap. This build has no swap — one set of hexagons in one mask from first
 * paint to last frame — so instead of aligning two implementations the guard
 * asserts the stronger property directly: across the plate fade, the DARK
 * COVER's silhouette is unchanged. Only what is inside the holes may differ.
 * A geometry jump of even a pixel fails that.
 *
 * Usage: node build/verify-loader.js <profile> [--reveal=900] [--port=]
 */
const { spawn } = require("child_process");
const http = require("http");
const { decodePNG } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const REVEAL = arg("reveal", "");
const BASE = "http://localhost:3100/";
const VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!ok) fails.push(name);
};

const s2exists = (sess) => sess.ev("!!document.querySelector('[data-load-screen] .loader-hive')");

let portSeq = 0;
async function session({ reduced, stallTour, reveal, hold }) {
  const port = 9901 + (portSeq++);
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + port, "--user-data-dir=" + P + "-" + port,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = JSON.parse(await get("http://127.0.0.1:" + port + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("verify-loader: no debugger target on " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const cast = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Page.screencastFrame") {
      cast.push({ ts: x.params.metadata.timestamp, data: x.params.data });
      ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: x.params.sessionId } }));
    }
    if (x.method === "Fetch.requestPaused") { /* held open on purpose */ }
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async () => decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  /* A stalled model request, not a failed one: a failure takes the tour's
     error path and declares ready at once, which tests nothing about the cap. */
  if (stallTour) await send("Fetch.enable", { patterns: [{ urlPattern: "*.glb" }] });
  if (hold) {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: "Object.defineProperty(Element.prototype,'remove',{value:function(){},writable:true});",
    });
  }
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__ph = []; let last = null;
      (function tick() {
        const el = document.querySelector('[data-load-screen]');
        const p = el ? (el.dataset.phase || '?') : 'gone';
        if (p !== last) { window.__ph.push({ p: p, at: +performance.now().toFixed(1) }); last = p; }
        if (performance.now() < 40000) requestAnimationFrame(tick);
      })();
      window.__raf = [];
      (function r(t) { window.__raf.push(+t.toFixed(1)); if (t < 40000) requestAnimationFrame(r); })(0);
      window.__focusOnRemoved = false;
    `,
  });
  await send("Page.navigate", { url: BASE + (reveal ? "?reveal=" + reveal : "") });
  return { ws, ch, ev, shot, send, cast };
}

/* Is a pixel the dark cover? --surface-dark is #030302, and nothing else on
   the hero is that flat, so a tight threshold is safe. */
/* --surface-dark is #030302, and nothing else on the hero is that flat. */
const COVER_MAX = 16;
const isCover = (img, x, y) => {
  const o = (y * img.w + x) * img.ch;
  return img.px[o] < COVER_MAX && img.px[o + 1] < COVER_MAX && img.px[o + 2] < COVER_MAX;
};

(async () => {
  console.log(`\n  LOADER — ${BASE}   ${VW}x${VH}\n`);

  /* ---- 1. SSR, before any JavaScript ---------------------------------- */
  const html = await get(BASE);
  console.log("   SERVER-RENDERED MARKUP");
  check("the loader is in the initial HTML (no flash of unstyled page)",
    /data-load-screen/.test(html), "");
  check("the honeycomb geometry is server-rendered too",
    (html.match(/<polygon/g) || []).length >= 7,
    `${(html.match(/<polygon/g) || []).length} polygons in the HTML`);
  check("announced to assistive tech: role, live region and a text label",
    /role="status"/.test(html) && /aria-live="polite"/.test(html) && /Loading SafeRide/.test(html));

  /* ---- 2. The happy path: phases, pixels, handoff ---------------------- */
  const s = await session({ reveal: REVEAL });
  console.log("\n   THE THREE PHASES");
  /* Phase 1 pixels, sampled while the spinner is up. */
  await sleep(3000);
  const p1 = await s.shot();
  let cover = 0, lit = 0;
  for (let y = 300; y < 600; y += 2) {
    for (let x = 560; x < 880; x += 2) {
      if (isCover(p1, x, y)) cover++;
      else lit++;
    }
  }
  check("the honeycomb PUNCHES during phase 1 (not a plain black rectangle)",
    cover > 2000 && lit > 200,
    `${cover} cover px and ${lit} lit px in the centre — a solid cover would be ${cover + lit} and 0`);

  /* The handoff: the cover's silhouette either side of the plate fade. */
  /*
   * Poll the PHASE cheaply and screenshot only on a transition. The first
   * version took a screenshot on every poll; each round trip costs ~200ms and
   * the frozen and opening phases last ~200ms each, so it caught one side of
   * the handoff and missed the other every single run.
   */
  let before = null, after = null;
  for (let i = 0; i < 900; i++) {
    const cur = await s.ev("(() => { const el = document.querySelector('[data-load-screen]'); return el ? (el.dataset.phase || '?') : 'gone'; })()");
    if (cur === "gone") break;
    await sleep(40);
  }
  /*
   * Let the in-page probe see the removal before reading its log.
   *
   * This poll and the probe are two different observers. The overlay is now
   * removed from inside a requestAnimationFrame callback (it goes on the
   * frame that proves the aperture covers the viewport), and the probe's own
   * tick for that frame may already have run, so the probe does not record
   * "gone" until the NEXT frame — while this poll, which asks the DOM
   * directly, can see it immediately. Reading the log at that instant
   * reported the phase order as ending at "open" and failed a passing build.
   */
  await sleep(150);
  const raf = JSON.parse(await s.ev("JSON.stringify(window.__raf || [])"));
  const ph = JSON.parse(await s.ev("JSON.stringify(window.__ph || [])"));
  s.ws.close(); s.ch.kill();

  /*
   * Drop anything before the first `loading`. The probe starts sampling
   * before navigation completes, so the series opens with a `gone` for the
   * blank page — which made `at("gone")` return that entry and report the
   * reveal as lasting minus 7826 milliseconds.
   */
  const li = ph.findIndex((x) => x.p === "loading");
  const phz = li >= 0 ? ph.slice(li) : ph;
  const order = phz.map((x) => x.p).filter((p, i, a) => p !== a[i - 1]);
  check("the phases run in order: loading, frozen, opening, open, gone",
    ["loading", "frozen", "opening", "open", "gone"].every((p) => order.includes(p))
      && order.indexOf("frozen") < order.indexOf("opening")
      && order.indexOf("opening") < order.indexOf("open")
      && order.indexOf("open") < order.indexOf("gone"),
    order.join(" -> "));

  const at = (p) => { const e = phz.find((x) => x.p === p); return e ? e.at : null; };
  if (at("frozen") && at("gone")) {
    console.log("      freeze " + Math.round(at("opening") - at("frozen")) + "ms, plate fade "
      + Math.round(at("open") - at("opening")) + "ms, reveal "
      + Math.round(at("gone") - at("open")) + "ms");
  }

  /*
   * THE HANDOFF, DRIVEN RATHER THAN CAUGHT.
   *
   * Three attempts to catch the two frames as they went past all failed, and
   * they failed for a reason no amount of tuning fixes: the frozen and
   * opening phases last about 200ms each, a screenshot round trip costs about
   * the same, and a screencast only emits when the picture CHANGES — so the
   * frozen phase contains a single frame whose timestamp lands ambiguously
   * against the phase log. PNG at full size delivered 11 frames in eight
   * seconds; at half size it delivered 26, and which windows came back empty
   * varied run to run.
   *
   * So the phases are set directly, in a session where the element is never
   * removed, and both screenshots are taken at leisure. This measures exactly
   * the property in question — does the cover's silhouette move between the
   * two phases — and nothing about it depends on timing. That the real
   * sequence produces these phases in this order is a separate check, above,
   * and it passes.
   */
  const hs = await session({ hold: true });
  for (let i = 0; i < 200; i++) {
    if (await s2exists(hs)) break;
    await sleep(50);
  }
  await hs.ev("document.querySelector('[data-load-screen]').dataset.phase = 'frozen'; 1");
  await sleep(400);
  before = await hs.shot();
  await hs.ev("document.querySelector('[data-load-screen]').dataset.phase = 'opening'; 1");
  await sleep(400);
  after = await hs.shot();
  hs.ws.close(); hs.ch.kill();

  if (before && after) {
    let differ = 0, coverPx = 0;
    for (let y = 0; y < Math.min(before.h, after.h); y += 2) {
      for (let x = 0; x < Math.min(before.w, after.w); x += 2) {
        const a = isCover(before, x, y), b = isCover(after, x, y);
        if (a) coverPx++;
        if (a !== b) differ++;
      }
    }
    check("the cover's silhouette does not move across the handoff",
      coverPx > 1000 && differ < coverPx * 0.01,
      `${differ} of ${coverPx} sampled cover pixels changed`);
  } else {
    check("the cover's silhouette does not move across the handoff", false, "could not capture both sides");
  }

  /*
   * rAF CADENCE — AND IT IS NOT A SMOOTHNESS TEST.
   *
   * This counts how often the page RAN a callback, which is not how often the
   * compositor PRESENTED a frame. It has now described a stall as smooth
   * twice in this project: the hero read 58.2fps on rAF while the picture was
   * frozen, and this reveal read 47.7fps with a 34ms worst frame in the run
   * whose trace showed 17 presented against 23 dropped and a 215.9ms gap.
   *
   * It is kept because a collapse here still means something is badly wrong,
   * and it costs nothing. It is labelled for what it measures so that a pass
   * is never read as evidence of smoothness. The real instrument is
   * build/measure-reveal.js, which reads DrawFrame and DroppedFrame out of a
   * trace and compares the reveal against the same page with no loader on it.
   */
  const openAt = at("open"), goneAt = at("gone");
  if (openAt && goneAt) {
    const f = raf.filter((x) => x >= openAt && x <= goneAt);
    let worst = 0, over32 = 0;
    for (let i = 1; i < f.length; i++) {
      const g = f[i] - f[i - 1];
      if (g > worst) worst = g;
      if (g > 32) over32++;
    }
    /*
     * The threshold catches a COLLAPSE, not jitter.
     *
     * It was `worst < 50`, and it began failing intermittently once the page
     * gained a background video — one 50ms callback gap in a 757ms window on a
     * machine sharing a GPU with the user's own browser, on a build whose
     * reveal is otherwise identical run to run. A guard that goes red on the
     * machine being busy teaches people to ignore it.
     *
     * What this instrument can honestly detect is the loop stopping: a
     * callback gap of a fifth of a second, or a reveal that ran almost no
     * callbacks at all. Anything finer needs presented frames, which this
     * cannot see and build/measure-reveal.js can.
     */
    check("the reveal ran callbacks throughout (rAF only — cannot see a dropped frame)",
      f.length > 20 && worst < 200,
      `${f.length} frames over ${Math.round(goneAt - openAt)}ms, ${(f.length / ((goneAt - openAt) / 1000)).toFixed(1)}/s, worst ${Math.round(worst)}ms, ${over32} over 32ms`);
  }

  /* ---- 3. The cap, with the model held open ---------------------------- */
  const cap = await session({ stallTour: true });
  await sleep(14000);
  const capPh = JSON.parse(await cap.ev("JSON.stringify(window.__ph || [])"));
  const tourReady = await cap.ev("document.documentElement.hasAttribute('data-tour-ready')");
  cap.ws.close(); cap.ch.kill();
  const capLi = capPh.findIndex((x) => x.p === "loading");
  const capZ = capLi >= 0 ? capPh.slice(capLi) : capPh;
  const capGone = capZ.find((x) => x.p === "gone");
  console.log("\n   THE CAP, with the model request HELD OPEN");
  check("the scene never became ready, so this tests the cap and not the happy path",
    tourReady === false, `data-tour-ready=${tourReady}`);
  check("the loader lifts anyway, at the 8s cap",
    !!capGone && capGone.at > 7500 && capGone.at < 12000,
    capGone ? `gone at ${Math.round(capGone.at)}ms` : "never lifted");

  /* ---- 4. Reduced motion ---------------------------------------------- */
  const rm = await session({ reduced: true, hold: true });
  /*
   * Sample the pixels while the phase is still `loading`.
   *
   * With `hold` the element is never detached, but the reduced-motion lift
   * still sets phase="out", and that rule sets opacity 0 — so a late sample
   * sees the page through a transparent cover and reads as "the honeycomb is
   * drawn", the exact opposite of the truth. It reported 5584 lit pixels on a
   * build with `display: none` on both the hive and the plate.
   */
  let rmShotEarly = null;
  for (let i = 0; i < 200; i++) {
    const cur = await rm.ev("(() => { const el = document.querySelector('[data-load-screen]'); return el ? (el.dataset.phase || '?') : 'gone'; })()");
    if (cur === "loading") { rmShotEarly = await rm.shot(); break; }
    await sleep(25);
  }
  await sleep(2500);
  const rmState = JSON.parse(await rm.ev(`JSON.stringify({
    hiveDisplay: getComputedStyle(document.querySelector('.loader-hive')).display,
    plateDisplay: getComputedStyle(document.querySelector('.loader-plate')).display,
    cellAnim: getComputedStyle(document.querySelector('.loader-cell')).animationName,
    running: document.getAnimations ? document.getAnimations().length : -1
  })`));
  const rmShot = rmShotEarly;
  rm.ws.close(); rm.ch.kill();
  let rmLit = -1;
  if (rmShot) { rmLit = 0; for (let y = 300; y < 600; y += 4) for (let x = 560; x < 880; x += 4) if (!isCover(rmShot, x, y)) rmLit++; }
  console.log("\n   REDUCED MOTION");
  check("no honeycomb is drawn at all — not a slower one",
    rmState.hiveDisplay === "none" && rmState.plateDisplay === "none" && rmLit === 0,
    `hive ${rmState.hiveDisplay}, plate ${rmState.plateDisplay}, ${rmLit} lit px in the centre`);
  check("no animation is running on the loader",
    rmState.cellAnim === "none", `animation-name: ${rmState.cellAnim}`);

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  all checks pass\n");
  process.exit(fails.length ? 1 : 0);
})();
