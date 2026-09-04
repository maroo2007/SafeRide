/**
 * Capture the CTA variants: resting and hovered, over footage and on paper.
 *
 * Hover is forced through CSS.forcePseudoState rather than by adding a
 * `.hovered` class. A duplicate class would be a second code path, and the
 * screenshot would prove that path works rather than the one that ships.
 *
 * Usage: node build/shoot-cta.js <profile> <outdir> [url]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2], OUT = process.argv[3];
const URL = process.argv[4] || "http://localhost:3000/cta-lab";
const PORT = 9491, VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--window-size=${VW},${VH}`, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500);
    try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("CSS.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(8000);

  const shot = async (name, clip, dsf = 1) => {
    if (dsf !== 1) await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: dsf, mobile: false });
    const r = await send("Page.captureScreenshot", clip ? { format: "png", clip: { ...clip, scale: dsf } } : { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    if (dsf !== 1) await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
    console.log("  " + name);
  };

  /** Force :hover on every CTA inside a section — the real pseudo-class. */
  const setHover = async (selector, on) => {
    const doc = await send("DOM.getDocument", { depth: -1 });
    const root = doc.result.root.nodeId;
    const q = await send("DOM.querySelectorAll", { nodeId: root, selector });
    for (const nodeId of q.result?.nodeIds ?? []) {
      await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: on ? ["hover"] : [] });
    }
    return (q.result?.nodeIds ?? []).length;
  };

  const rectOf = async (sel) => JSON.parse(await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'start'});
      return new Promise(r=>setTimeout(()=>{const b=e.getBoundingClientRect();
        /* captureScreenshot clips in PAGE coordinates, not viewport ones. */
        r(JSON.stringify({x:Math.max(0,b.x+scrollX),y:Math.max(0,b.y+scrollY),
                          width:Math.min(${VW},b.width),height:b.height}));},700));})()`));

  /* 1. checkmark at ACTUAL 36px, then magnified for inspection */
  let r = await rectOf("#stroke-test");
  await shot("cta-01-checkmark-36px-actual.png", r);
  await shot("cta-02-checkmark-36px-zoom3x.png", r, 3);

  /* 2. over footage — resting, then hovered */
  r = await rectOf("#over-footage");
  await sleep(600);
  await shot("cta-03-footage-resting.png", r);
  const n = await setHover("#over-footage a", true);
  await sleep(900);            // let the 290ms choreography settle
  await shot("cta-04-footage-hovered.png", r);
  await setHover("#over-footage a", false);
  console.log(`  (forced :hover on ${n} controls over footage)`);

  /* 3. on paper — resting, then hovered */
  r = await rectOf("#on-paper");
  await sleep(500);
  await shot("cta-05-paper-resting.png", r);
  await setHover("#on-paper a", true);
  await sleep(900);
  await shot("cta-06-paper-hovered.png", r);
  await setHover("#on-paper a", false);

  ws.close(); chrome.kill(); process.exit(0);
})();
