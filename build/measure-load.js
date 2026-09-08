/**
 * What is slow on a cold load, and is it WAIT or JANK?
 *
 * The stage table in measure-tour-load.js covers network and parse. It cannot
 * tell you whether the page was unresponsive, and "it lags" is as often a
 * blocked main thread as a slow fetch.
 *
 * Two disciplines carried over from the last diagnosis, both of which were
 * learned the hard way:
 *
 *  1. NETWORK DOMAIN OFF. With it enabled Chrome buffers every response body
 *     for getResponseBody and pushes it over the DevTools pipe. That turned an
 *     8 MB fetch curl does in 0.24s into 13.7s ON A BLANK PAGE, and the first
 *     version of this diagnosis attributed all of it to the model. It is
 *     enabled here only long enough to clear the cache, then disabled — and
 *     the effective transfer rate is REPORTED at the end so "the ceiling is
 *     gone" is a measurement rather than a claim.
 *
 *  2. COLD IS ENFORCED. A fresh profile plus an explicit cache clear. A warm
 *     read reported as cold sends you after the wrong bottleneck.
 *
 * Long tasks are collected by an observer installed before any page script
 * runs, so nothing during startup is missed. Blocking time is reported over an
 * explicitly stated window rather than quoted as "TBT", which implies a
 * Lighthouse methodology this is not running.
 *
 * Usage: node build/measure-load.js <profile> [url] [--noscroll]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const URL = (process.argv[3] && !process.argv[3].startsWith("--")) ? process.argv[3] : "http://localhost:3100/";
const VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));
const ms = (v) => (v === null || v === undefined || Number.isNaN(v) ? "     -" : v.toFixed(0).padStart(6));

(async () => {
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=9781", "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9781/json/list")).find((x) => x.type === "page"); } catch {}
  }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

  /* Cold, then OUT of the way. */
  await send("Network.enable");
  await send("Network.clearBrowserCache");
  await send("Network.disable");

  /* Observers installed before any page script runs. */
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__long = [];
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            window.__long.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch (e) { window.__longUnsupported = String(e); }
      /* Responsiveness, sampled: how late does a 0ms timer actually fire?
         A blocked main thread shows up here as delay even when no single task
         crosses the 50ms longtask threshold. */
      /* When the load screen actually leaves the DOM — time to interactive
         as the visitor experiences it, not as a synthetic metric. */
      /*
       * POLLED, not observed. addScriptToEvaluateOnNewDocument runs before
       * document.documentElement exists, so observe() never attached and the
       * probe reported null for an element that was plainly in the SSR
       * markup. An observer also cannot report what was already there.
       */
      window.__loadScreenGone = null;
      window.__loadScreenSeen = false;
      (function pollLS() {
        const el = document.querySelector('[data-load-screen]');
        if (el) window.__loadScreenSeen = true;
        if (!el && window.__loadScreenSeen && window.__loadScreenGone === null) {
          window.__loadScreenGone = +performance.now().toFixed(1);
          return;
        }
        if (performance.now() < 40000) setTimeout(pollLS, 40);
      })();
      window.__lag = [];
      (function probe() {
        const t0 = performance.now();
        setTimeout(() => {
          window.__lag.push(+(performance.now() - t0).toFixed(1));
          if (performance.now() < 40000) probe();
        }, 0);
      })();
    `,
  });

  await send("Page.navigate", { url: URL });
  await sleep(6000);

  if (!process.argv.includes("--noscroll")) {
    const top = await ev(`(() => {
      const rw = document.querySelector('#parent-app [data-tour-runway]');
      if (!rw) throw new Error('no [data-tour-runway]');
      return Math.round(rw.getBoundingClientRect().top + scrollY);
    })()`);
    await ev(`(async()=>{scrollTo(0,${top});await new Promise(r=>setTimeout(r,300));return 1})()`);
  }

  for (let i = 0; i < 120; i++) {
    if (await ev("!!(window.__tourMarks && window.__tourMarks.firstFrame)")) break;
    await sleep(500);
  }

  const out = JSON.parse(await ev(`(() => {
    const marks = window.__tourMarks || {};
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, +p.startTime.toFixed(1)]));
    const res = performance.getEntriesByType('resource')
      .filter(e => /\\.glb$|\\.webp$|\\.mp4$|\\.webm$|\\.js$/.test(e.name))
      .map(e => ({ name: e.name.split('/').pop().slice(0, 34), start: +e.startTime.toFixed(1),
                   dur: +e.duration.toFixed(1), size: e.encodedBodySize || e.transferSize || 0 }))
      .sort((a, b) => b.dur - a.dur).slice(0, 10);
    const long = window.__long || [];
    const lag = window.__lag || [];
    return JSON.stringify({
      marks, gate: window.__tourGateAt ?? null,
      domContentLoaded: +(nav.domContentLoadedEventEnd || 0).toFixed(1),
      loadEvent: +(nav.loadEventEnd || 0).toFixed(1),
      paint, res, long, lag,
      loadScreenGone: window.__loadScreenGone ?? null,
      longUnsupported: window.__longUnsupported || null,
    });
  })()`));

  const firstFrame = out.marks.firstFrame ?? null;
  /*
   * The window ends when the scene is FULLY settled, not at the first frame.
   *
   * Deferring the environment moved a ~2s block to just after the first
   * frame — and a window that stops at the first frame would have excluded
   * it, reporting a large improvement in blocking time that was really just
   * work pushed outside the measurement. Moving a cost is worth doing; hiding
   * it from your own instrument is not.
   */
  const settled = out.marks.deferredEnvDone ?? firstFrame;
  const window0 = 0, window1 = (settled ?? 30000) + 200;
  const inWindow = out.long.filter((l) => l.start >= window0 && l.start <= window1);
  const blocking = inWindow.reduce((s, l) => s + Math.max(0, l.dur - 50), 0);
  const lagSorted = [...out.lag].sort((a, b) => a - b);
  const pct = (q) => (lagSorted.length ? lagSorted[Math.min(lagSorted.length - 1, Math.floor(lagSorted.length * q))] : null);

  console.log(`\n  COLD LOAD — Network domain OFF, cache cleared, ${VW}x${VH}\n`);
  console.log("   stage                                        at (ms)");
  console.log(`   first paint                                 ${ms(out.paint["first-paint"])}`);
  console.log(`   first contentful paint                      ${ms(out.paint["first-contentful-paint"])}`);
  console.log(`   DOMContentLoaded                            ${ms(out.domContentLoaded)}`);
  console.log(`   load                                        ${ms(out.loadEvent)}`);
  console.log(`   tour gate opened                            ${ms(out.gate)}`);
  console.log(`   three imported                              ${ms(out.marks.threeImported)}`);
  console.log(`   renderer created                            ${ms(out.marks.rendererMade)}`);
  console.log(`     context warm-up (one 2x2 frame)             ${ms(out.marks.warmDone)}   (took ${ms(out.marks.warmDone - out.marks.warmStart)}ms)`);
  console.log(`     RoomEnvironment scene built                 ${ms(out.marks.roomBuilt)}   (took ${ms(out.marks.roomBuilt - out.marks.pmremStart)}ms)`);
  console.log(`     cube render (${"" + (out.marks.cubeRendered !== undefined ? "small target" : "n/a")})              ${ms(out.marks.cubeRendered)}   (took ${ms(out.marks.cubeRendered - out.marks.roomBuilt)}ms)`);
  console.log(`     PMREM shader COMPILE                        ${ms(out.marks.shadersCompiled)}   (took ${ms(out.marks.shadersCompiled - out.marks.cubeRendered)}ms)`);
  console.log(`     PMREM prefilter passes                      ${ms(out.marks.pmremDone)}   (took ${ms(out.marks.pmremDone - out.marks.shadersCompiled)}ms)`);
  console.log(`   GLB fetch started                           ${ms(out.marks.glbStart)}`);
  console.log(`   GLB ready                                   ${ms(out.marks.glbDone)}`);
  console.log(`   textures ready                              ${ms(out.marks.texDone)}`);
  console.log(`   scene assembled, about to render            ${ms(out.marks.beforeFirstRender)}`);
  console.log(`   first frame with the phone                  ${ms(firstFrame)}   (first render took ${ms(firstFrame - out.marks.beforeFirstRender)}ms)`);
  if (out.marks.deferredEnvDone !== undefined) {
    console.log(`   deferred environment built                  ${ms(out.marks.deferredEnvDone)}   (took ${ms(out.marks.deferredEnvDone - out.marks.deferredEnvStart)}ms, AFTER the phone was visible)`);
  }
  console.log(`   gate -> phone on screen                     ${ms(firstFrame - out.gate)}`);
  console.log(`   load screen lifted                          ${ms(out.loadScreenGone)}`);
  console.log(`   TIME TO INTERACTIVE (screen gone)           ${ms(out.loadScreenGone)}`);
  console.log(`   TIME TO PHONE READY                         ${ms(firstFrame)}`);

  console.log(`\n   slowest resources`);
  for (const r of out.res) {
    const mb = r.size / 1048576;
    console.log(`     ${r.name.padEnd(36)} ${mb.toFixed(2).padStart(6)} MB  started ${ms(r.start)}  took ${ms(r.dur)}  ${(mb / (r.dur / 1000)).toFixed(1)} MB/s`);
  }

  console.log(`\n   MAIN THREAD, window 0 - ${Math.round(window1)}ms`);
  if (out.longUnsupported) console.log(`     longtask observer unavailable: ${out.longUnsupported}`);
  console.log(`     long tasks over 50ms:      ${inWindow.length}`);
  console.log(`     total blocking time:       ${blocking.toFixed(0)}ms  (sum of each task's time beyond 50ms)`);
  const worst = [...inWindow].sort((a, b) => b.dur - a.dur);
  for (const w of worst) console.log(`       ${w.dur.toFixed(0)}ms at ${w.start.toFixed(0)}ms`);
  /*
   * The verdict is COUNT-BASED, not percentile-based.
   *
   * The first version read p95 and printed "stayed responsive" on a load
   * containing two multi-second freezes: two bad samples out of 826 cannot
   * reach the 95th percentile. A percentile over a long quiet series is
   * exactly the wrong summary for rare severe stalls — what a visitor
   * notices is the freeze, not the median.
   */
  const froze = lagSorted.filter((v) => v > 100);
  console.log(`     timer lag p50 / p95 / max: ${pct(0.5)} / ${pct(0.95)} / ${lagSorted[lagSorted.length - 1]} ms  over ${lagSorted.length} samples`);
  console.log(`     samples over 100ms:        ${froze.length}${froze.length ? "  (" + froze.map((v) => v.toFixed(0) + "ms").join(", ") + ")" : ""}`);
  console.log(`     -> the page ${froze.length === 0 ? "stayed responsive" : `FROZE ${froze.length} time(s), worst ${lagSorted[lagSorted.length - 1].toFixed(0)}ms`} while loading\n`);

  ws.close(); ch.kill();
  process.exit(0);
})();
