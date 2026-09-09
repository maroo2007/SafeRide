/**
 * Screenshots at a real viewport size, by section id or absolute scroll.
 *
 * The browser pane scales its captures to fit the panel, which is the wrong
 * instrument for judging whether 16px body copy is legible over a photograph.
 * This writes full-resolution PNGs.
 *
 * Usage:
 *   node build/shoot.js <profile> <outdir> --at=features,pricing --w=1440
 *   node build/shoot.js <profile> <outdir> --y=1200,2400,3600
 *   ...--stack=0,0.25,0.5,0.75,1   fractions through #features' own runway
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
const BASE = arg("url", "http://localhost:3100/");
const PORT = +arg("port", 9600);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const AT = arg("at", "").split(",").filter(Boolean);
const YS = arg("y", "").split(",").filter(Boolean);
const STACK = arg("stack", "").split(",").filter(Boolean);
const REDUCED = process.argv.includes("--reduced");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
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
  if (!t) throw new Error("shoot: no debugger target");
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (f) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, f), Buffer.from(r.result.data, "base64"));
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 768 });
  if (REDUCED) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: BASE });
  /* Wait for the loader and SAY SO if it never goes. A capture taken through
     a full-screen loader is a photograph of the loader, and it looks exactly
     like a page that failed to render. */
  let lifted = false;
  for (let i = 0; i < 200; i++) {
    lifted = (await ev("document.querySelector('[data-load-screen]') === null")) === true;
    if (lifted) break;
    await sleep(400);
  }
  if (!lifted) {
    console.log("\n  ABORT — the load screen never lifted; nothing to photograph\n");
    ws.close(); ch.kill(); process.exit(1);
  }
  await sleep(2200);

  const go = async (y, name) => {
    await ev(`(async()=>{scrollTo(0,${Math.max(0, Math.round(y))});await new Promise(r=>setTimeout(r,700));return 1})()`);
    await shot(name + ".png");
    /* What was actually on screen when the shutter fired. A capture that
       silently contains the loader looks like a broken page. */
    const state = await ev("(document.querySelector('[data-load-screen]') ? 'LOADER-STILL-UP' : 'clear')"
      + " + ' topEl=' + (document.elementFromPoint(innerWidth/2, innerHeight/2) || {}).className");
    console.log("   " + name.padEnd(26) + " y=" + String(Math.round(await ev("scrollY"))).padEnd(6) + " " + state);
  };

  console.log("\n  SHOOT — " + VW + "x" + VH + (REDUCED ? "  (reduced motion)" : ""));
  for (const sec of AT) {
    const y = await ev(`(() => { const e = document.getElementById('${sec}');
      return e ? Math.round(e.getBoundingClientRect().top + scrollY) + 8 : -1; })()`);
    if (y < 0) { console.log("   no #" + sec); continue; }
    await go(y, sec);
  }
  for (const y of YS) await go(+y, "y" + y);
  if (STACK.length) {
    const box = JSON.parse(await ev(`(() => { const e = document.querySelector('.stack');
      if (!e) return 'null';
      return JSON.stringify({ top: Math.round(e.getBoundingClientRect().top + scrollY), h: e.offsetHeight }); })()`));
    if (box) {
      for (const f of STACK) {
        const runway = box.h - VH;
        await go(box.top + runway * parseFloat(f), "stack-" + String(f).replace(".", "_"));
      }
    } else console.log("   no .stack on the page");
  }
  console.log("  " + OUT + "\n");
  ws.close(); ch.kill();
  process.exit(0);
})();
