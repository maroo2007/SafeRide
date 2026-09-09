/**
 * Watch the loader through all three phases, densely.
 *
 * A screencast rather than polled screenshots. The first version polled
 * `Page.captureScreenshot` in a loop and managed one frame per ~300ms, which
 * caught the 1.26s reveal exactly twice — enough to know it happened and not
 * enough to see it, let alone to diff the handoff.
 *
 * The phase is logged INSIDE the page on every animation frame and correlated
 * by timestamp afterwards, so each captured frame is attributed to a phase
 * rather than guessed at from its appearance.
 *
 * Usage: node build/shoot-loader.js <profile> <out> [--reveal=900] [--reduced] [--port=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const REVEAL = arg("reveal", "");
const REDUCED = process.argv.includes("--reduced");
const PORT = +arg("port", 9881);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const URL = "http://localhost:3100/" + (REVEAL ? "?reveal=" + REVEAL : "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const PROBE = `
(() => {
  window.__phases = [];
  let last = null;
  (function tick() {
    const el = document.querySelector('[data-load-screen]');
    const p = el ? (el.dataset.phase || '?') : 'gone';
    if (p !== last) { window.__phases.push({ p: p, at: +performance.now().toFixed(1) }); last = p; }
    if (performance.now() < 40000) requestAnimationFrame(tick);
  })();
})();
`;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
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
  if (REDUCED) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Network.enable"); await send("Network.clearBrowserCache"); await send("Network.disable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  await send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await send("Page.navigate", { url: URL });

  /* Run until the loader has been gone for two seconds, or 30s. */
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const ph = JSON.parse(await ev("JSON.stringify(window.__phases || [])"));
    const g = ph.find((x) => x.p === "gone" && x.at > 500);
    if (g && (await ev("performance.now()")) > g.at + 2000) break;
    await sleep(250);
  }
  const phases = JSON.parse(await ev("JSON.stringify(window.__phases || [])"));
  const navStart = await ev("performance.timeOrigin");
  await send("Page.stopScreencast");
  await sleep(200);

  /* Screencast metadata timestamps are seconds since the unix epoch; the
     page's phase log is performance.now(). Line them up through timeOrigin. */
  const list = frames.map((f) => ({ at: f.ts * 1000 - navStart, data: f.data }))
    .filter((f) => f.at > -500);
  const phaseAt = (ms) => {
    let p = "pre";
    for (const x of phases) if (x.at <= ms) p = x.p;
    return p;
  };
  const counts = {};
  list.forEach((f, i) => {
    const p = phaseAt(f.at);
    counts[p] = (counts[p] || 0) + 1;
    fs.writeFileSync(path.join(OUT, String(i).padStart(3, "0") + "-" + p + "-" + Math.round(f.at) + "ms.png"),
      Buffer.from(f.data, "base64"));
  });

  console.log("\n  LOADER — " + URL + (REDUCED ? "   reduced motion" : "") + "   " + VW + "x" + VH);
  console.log("  phase transitions (ms from navigation):");
  for (const x of phases) console.log("    " + String(Math.round(x.at)).padStart(7) + "  " + x.p);
  console.log("  frames captured per phase:");
  for (const p of Object.keys(counts)) console.log("    " + p.padEnd(9) + " " + counts[p]);
  console.log("  -> " + OUT + "\n");
  ws.close(); ch.kill();
  process.exit(0);
})();
