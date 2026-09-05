/**
 * Diagnose scrub lag: how far behind the scroll does the playhead run?
 *
 * The hero drives the playhead from scroll PROGRESS, clamped to the buffered
 * edge and eased at that edge. So a playhead that trails the scroll can be any
 * of three different things, and they need different answers:
 *
 *   1. the buffer  — clampToBuffer is holding it deliberately. Not lag.
 *   2. the binding — rAF reads scrollY and writes currentTime a frame later.
 *   3. the decoder — currentTime is set but the frame has not been painted.
 *
 * This separates them. Every frame it records scrollY, the progress that
 * implies, the film time that progress implies, the playhead's actual
 * currentTime, the buffered edge, and readyState. Lag is reported both raw and
 * with buffer-limited frames excluded, because a scrub that is waiting on
 * bytes is not a scrub that is badly bound.
 *
 * Input is trusted CDP mouseWheel, not window.scrollTo: Lenis intercepts
 * input, and a programmatic scroll takes a different path through it.
 *
 * Usage: node build/measure-scrub-lag.js <profile-dir> <out-dir> [url] [--headed]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const HEADED = process.argv.includes("--headed");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9694);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const RECORDER = `(() => {
  const sec = document.querySelector('section[aria-labelledby="hero-headline"]');
  const vids = [...document.querySelectorAll('video')];
  const scrub = vids.find((v) => /scrub/.test(v.currentSrc || '')) || vids[vids.length - 1];
  const DUR = 2510 / 48;
  const edge = (v) => { const b = v.buffered; return b && b.length ? b.end(b.length - 1) : 0; };
  window.__S = [];
  const t0 = performance.now();
  let last = t0;
  const tick = () => {
    const now = performance.now();
    const max = sec.getBoundingClientRect().height - innerHeight;
    const p = Math.min(1, Math.max(0, scrollY / max));
    window.__S.push({
      t: Math.round(now - t0),
      dt: Math.round((now - last) * 100) / 100,
      y: Math.round(scrollY),
      p: Math.round(p * 100000) / 100000,
      want: Math.round(p * DUR * 1000) / 1000,
      have: Math.round(scrub.currentTime * 1000) / 1000,
      edge: Math.round(edge(scrub) * 100) / 100,
      rs: scrub.readyState,
    });
    last = now;
    if (now - t0 < 9000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return JSON.stringify({ src: scrub.currentSrc, runway: Math.round(sec.getBoundingClientRect().height) });
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const flags = ["--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${P}`, `--window-size=${VW},${VH}`, "about:blank"];
  if (!HEADED) flags.unshift("--headless=new", "--disable-gpu");
  const ch = spawn(CHROME, flags, { stdio: "ignore" });

  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500); try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(12000);

  /* Let the scrub file buffer, so the buffer is not the thing being measured. */
  await ev(`(async()=>{scrollTo(0,600);await new Promise(r=>setTimeout(r,6000));scrollTo(0,0);
    await new Promise(r=>setTimeout(r,2500));return 1})()`);

  const info = JSON.parse(await ev(RECORDER));
  console.log(`\n  SCRUB LAG — ${URL} at ${VW}x${VH}${HEADED ? " (headed)" : ""}`);
  console.log(`  runway ${info.runway}px, source ${String(info.src).split("/").pop()}\n`);

  /* Trusted wheel, a sustained scrub down the runway. */
  for (let i = 0; i < 40; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Math.round(VW / 2), y: Math.round(VH / 2), deltaX: 0, deltaY: 220, pointerType: "mouse" });
    await sleep(90);
  }
  await sleep(3000);

  const S = JSON.parse(await ev("JSON.stringify(window.__S)"));
  fs.writeFileSync(path.join(OUT, "scrub.json"), JSON.stringify(S, null, 1));

  const moving = S.filter((s, i) => i > 0 && Math.abs(s.y - S[i - 1].y) > 0);
  const lag = (s) => s.want - s.have;
  const bufferLimited = (s) => s.want > s.edge - 0.05;
  const free = moving.filter((s) => !bufferLimited(s));
  const held = moving.filter(bufferLimited);

  const stats = (arr, f) => {
    if (!arr.length) return null;
    const v = arr.map(f).sort((a, b) => a - b);
    return { p50: v[Math.floor(v.length * 0.5)], p95: v[Math.floor(v.length * 0.95)], max: v[v.length - 1], n: v.length };
  };

  console.log(`  frames recorded ${S.length}, of which ${moving.length} while the page was moving`);
  console.log(`  buffered edge reached ${Math.max(...S.map((s) => s.edge)).toFixed(1)}s of ${(2510 / 48).toFixed(1)}s\n`);

  const all = stats(moving, (s) => Math.abs(lag(s)));
  const freeS = stats(free, (s) => Math.abs(lag(s)));
  const heldS = stats(held, (s) => Math.abs(lag(s)));
  const secPerPx = (2510 / 48) / (info.runway - VH);
  const fmt = (x) => x === null ? "n/a" : `p50 ${x.p50.toFixed(3)}s  p95 ${x.p95.toFixed(3)}s  max ${x.max.toFixed(3)}s   (${x.n} frames)`;
  console.log(`  LAG, playhead behind the scroll's implied film time`);
  console.log(`    all moving frames        ${fmt(all)}`);
  console.log(`    buffer NOT limiting      ${fmt(freeS)}`);
  console.log(`    buffer limiting (clamp)  ${fmt(heldS)}`);
  if (freeS) {
    console.log(`\n    ${freeS.p50.toFixed(3)}s of film = ${Math.round(freeS.p50 / secPerPx)}px of scroll at this runway`);
    console.log(`    ${freeS.p95.toFixed(3)}s of film = ${Math.round(freeS.p95 / secPerPx)}px of scroll`);
  }

  /* How long does the playhead take to settle after input stops? */
  const lastMove = moving.length ? moving[moving.length - 1].t : 0;
  const after = S.filter((s) => s.t > lastMove);
  const settled = after.find((s) => Math.abs(lag(s)) < 0.02);
  console.log(`\n  SETTLE after the last scroll frame (t=${lastMove}ms): ` +
    (settled ? `${settled.t - lastMove}ms to within 0.02s of target` : `never got within 0.02s (final lag ${after.length ? Math.abs(lag(after[after.length - 1])).toFixed(3) : "?"}s)`));

  const fi = moving.map((s) => s.dt).sort((a, b) => a - b);
  console.log(`  frame intervals while scrubbing: p50 ${fi[Math.floor(fi.length * 0.5)]}ms  p95 ${fi[Math.floor(fi.length * 0.95)]}ms  max ${fi[fi.length - 1]}ms`);
  console.log(`  frames over 32ms: ${fi.filter((d) => d > 32).length} of ${fi.length}\n`);

  ws.close(); ch.kill(); process.exit(0);
})();
