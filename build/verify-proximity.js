/**
 * Verify VariableProximity against its five constraints, in a real browser.
 *
 *   1. Under prefers-reduced-motion, NO listener is attached at all. Proved by
 *      wrapping addEventListener before the page's own script runs and
 *      recording every registration, rather than by reading the source.
 *   2. The accessible name is the full sentence.
 *   3. The text is selectable and copies ONCE.
 *   4. Weight response does not reflow the headline.
 *   5. Frame timing during an ACTIVE SCRUB, effect idle vs effect working.
 *
 * Usage: node build/verify-proximity.js <profile> [url]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2];
const URL = process.argv[3] || "http://localhost:3000/";
const PORT = 9591;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/** Records every window listener registered, before any app code runs. */
const SPY = `
(() => {
  window.__listeners = [];
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (this === window || this === document) {
      // Record enough of the handler to tell OUR listener from Lenis's and
      // Next's. A bare count cannot: the page registers pointermove either way.
      var src = "";
      try { src = String(fn).slice(0, 200); } catch (e) {}
      window.__listeners.push({ type: type, mine: src.indexOf("pointerRef") >= 0 });
    }
    return add.call(this, type, fn, opts);
  };
  window.__rafCount = 0;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) { window.__rafCount++; return raf.call(window, cb); };
})();`;

async function session(reduced) {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT + (reduced ? 1 : 0)}`, `--user-data-dir=${PROFILE}-${reduced ? "rm" : "n"}`,
    "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500);
    try { t = (await get(`http://127.0.0.1:${PORT + (reduced ? 1 : 0)}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SPY });
  await send("Page.navigate", { url: URL });
  await sleep(9000);
  return { ev, close: () => { ws.close(); chrome.kill(); } };
}

(async () => {
  /* ---- 1. reduced motion: no listener, no rAF from the effect ---- */
  const rm = await session(true);
  console.log("\n=== 1. prefers-reduced-motion: reduce ===");
  console.log(await rm.ev(`(() => {
    const h1 = document.getElementById('hero-headline');
    const counts = {};
    window.__listeners.forEach(l => counts[l.type] = (counts[l.type] || 0) + 1);
    const mine = window.__listeners.filter(l => l.mine);
    return JSON.stringify({
      listenersFromThisComponent: mine.length,
      mineTypes: mine.map(l => l.type),
      pointermoveTotalOnPage: counts.pointermove || 0,
      headlineChildSpans: h1.querySelectorAll('span span').length,
      headlineIsPlainText: h1.querySelector('span')?.children.length === 0,
      accessibleText: h1.textContent.trim(),
    }, null, 1);
  })()`));
  rm.close();
  await sleep(1200);

  /* ---- 2-5. normal motion ---- */
  const n = await session(false);
  console.log("\n=== 2. normal: listeners, name, selection, reflow ===");
  console.log(await n.ev(`(() => {
    const h1 = document.getElementById('hero-headline');
    const counts = {};
    window.__listeners.forEach(l => counts[l.type] = (counts[l.type] || 0) + 1);
    const mine = window.__listeners.filter(l => l.mine);
    const letters = h1.querySelectorAll('span[style*="nowrap"] > span');
    // Selection: select the whole headline and read what would be copied.
    const range = document.createRange();
    range.selectNodeContents(h1);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const copied = sel.toString().replace(/\\s+/g, ' ').trim();
    sel.removeAllRanges();
    const expected = h1.querySelector('.sr-only').textContent.trim();
    // Reflow: force every letter to the near weight and compare the box.
    const before = h1.getBoundingClientRect();
    letters.forEach(el => el.style.fontVariationSettings = '"opsz" 144, "wght" 900');
    const after = h1.getBoundingClientRect();
    letters.forEach(el => el.style.fontVariationSettings = '"opsz" 144, "wght" 800');
    return JSON.stringify({
      listenersFromThisComponent: mine.length,
      mineTypes: mine.map(l => l.type),
      letterCount: letters.length,
      accessibleName: expected,
      selectionCopies: copied,
      selectionMatchesOnce: copied === expected,
      heightRest: +before.height.toFixed(1),
      heightAllNear: +after.height.toFixed(1),
      reflows: before.height !== after.height,
      widthRest: +before.width.toFixed(1),
      widthAllNear: +after.width.toFixed(1),
    }, null, 1);
  })()`));
  /* ---- frame timing during an ACTIVE SCRUB ---- */
  const timing = async (movePointer) => n.ev(`(async () => {
    scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 900));
    const h1 = document.getElementById('hero-headline');
    const box = h1.getBoundingClientRect();
    const runway = document.querySelector('section[aria-labelledby="hero-headline"]');
    const max = runway.getBoundingClientRect().height - innerHeight;
    const deltas = [];
    let last = performance.now(), y = 0, i = 0;
    await new Promise(done => {
      const step = (now) => {
        deltas.push(now - last); last = now;
        // Drive the scrub: ~9 px per frame keeps the playhead moving.
        y = Math.min(max, y + 9); scrollTo(0, y);
        if (${movePointer}) {
          // Sweep the cursor across the headline while the scrub runs.
          const x = box.left + (i % 60) / 60 * box.width;
          const yy = box.top + box.height / 2;
          window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: yy, bubbles: true }));
        }
        i++;
        if (i < 180) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    deltas.shift();
    const sorted = [...deltas].sort((a, b) => a - b);
    const pct = q => sorted[Math.floor(sorted.length * q)];
    return JSON.stringify({
      mean: +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2),
      median: +pct(0.5).toFixed(2),
      p95: +pct(0.95).toFixed(2),
      over16_7: deltas.filter(d => d > 16.7).length,
      over33: deltas.filter(d => d > 33).length,
    });
  })()`);

  console.log("");
  console.log("=== 3. frame timing during an ACTIVE SCRUB (180 frames, 3 runs each) ===");
  const runs = async (move) => {
    const out = [];
    for (let k = 0; k < 3; k++) out.push(JSON.parse(await timing(move)));
    const avg = (f) => +(out.reduce((a, b) => a + b[f], 0) / out.length).toFixed(2);
    return { mean: avg("mean"), median: avg("median"), p95: avg("p95"),
             over16_7: avg("over16_7"), over33: avg("over33") };
  };
  const idle = await runs(false);
  const working = await runs(true);
  console.log("  effect idle    ", JSON.stringify(idle));
  console.log("  effect working ", JSON.stringify(working));
  console.log("  delta          ", JSON.stringify({
    meanMs: +(working.mean - idle.mean).toFixed(2),
    framesOver33: +(working.over33 - idle.over33).toFixed(2),
  }));
  n.close();
  console.log("");
  process.exit(0);
})();
