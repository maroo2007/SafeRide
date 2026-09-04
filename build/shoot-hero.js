/**
 * Capture the hero at real viewports and real scroll positions.
 *
 * Headless Chrome's --screenshot cannot scroll, so this drives the page over
 * the DevTools protocol instead: set the viewport, scroll to an exact progress,
 * wait for the video to actually present a frame, then capture.
 *
 * Chrome profiles are written to the scratchpad, never inside the project —
 * Turbopack watches the tree and panics on a locked profile DB.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2];
const OUT = process.argv[3];
const URL = process.argv[4] || "http://localhost:3000/";
const PORT = 9222;

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
];
// 0.27 is not in the requested set but is the only place the caption scrim is
// at full opacity: at 0.2 it is 32% through its fade-in, so the thing being
// judged is barely on screen at any of the four.
const POSITIONS = [0, 0.2, 0.27, 0.5, 0.7];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    "--window-size=1920,1080", "about:blank",
  ], { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try { const list = await get(`http://127.0.0.1:${PORT}/json/list`); target = list.find((t) => t.type === "page"); } catch {}
  }
  if (!target) { console.error("could not reach Chrome"); chrome.kill(); process.exit(1); }

  const WebSocket = require("ws");
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on("open", r));
  let id = 0;
  const pending = new Map();
  ws.on("message", (m) => {
    const msg = JSON.parse(m.toString());
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await send("Page.enable");
  await send("Runtime.enable");

  for (const vp of VIEWPORTS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false,
    });
    await send("Page.navigate", { url: URL });
    await sleep(6500); // fonts + video metadata + first frames

    for (const p of POSITIONS) {
      const expr = `(async () => {
        const runway = document.querySelector('section[aria-labelledby="hero-headline"]');
        const max = runway.getBoundingClientRect().height - window.innerHeight;
        window.scrollTo(0, Math.round(max * ${p}));
        await new Promise(r => setTimeout(r, 900));
        const v = document.querySelector('video');
        return JSON.stringify({ t: v ? +v.currentTime.toFixed(2) : null, y: Math.round(window.scrollY) });
      })()`;
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      await sleep(500);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      const name = `hero-${vp.w}x${vp.h}-p${String(p).replace(".", "_")}.png`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.result.data, "base64"));
      console.log(`  ${name}  ${r.result?.result?.value ?? JSON.stringify(r).slice(0,300)}`);
    }
  }

  ws.close();
  chrome.kill();
  process.exit(0);
})();
