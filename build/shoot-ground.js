/**
 * Platform and Pricing, over the moving ground, at several ground strengths.
 *
 * The question this exists to answer is not a number — verify-background.js
 * already has the numbers. It is whether the copy is COMFORTABLE, which is a
 * judgement and needs a picture at the real size. The browser pane scales its
 * screenshots down to fit, which is exactly the wrong thing when the question
 * is whether 16px body copy is readable over a drifting ribbon.
 *
 * The video is paused and seeked to a fixed time, so the only difference
 * between two captures is the strength and not which frame happened to be up.
 *
 * Usage: node build/shoot-ground.js <profile> <out> [--strengths=1,0.55,0.4] [--t=5.2]
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
const STRENGTHS = arg("strengths", "1,0.55,0.4").split(",");
const AT = arg("t", "5.21");
const PORT = +arg("port", 9790);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const SECTIONS = arg("sections", "features,pricing").split(",");

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
  if (!t) throw new Error("shoot-ground: no debugger target");
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
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE });

  for (let i = 0; i < 120; i++) {
    if (await ev("!!document.querySelector('.bg-video-film')")) break;
    await sleep(500);
  }
  /* The film has to be DECODED before it is worth photographing; an element
     that exists is not a picture. */
  const ready = await ev(`(async () => {
    const v = document.querySelector('.bg-video-film');
    if (!v) return false;
    for (let i = 0; i < 120 && !(v.readyState >= 2 && isFinite(v.duration)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return v.readyState >= 2;
  })()`);
  if (!ready) { console.log("\n  ABORT — the video never decoded; nothing to judge\n"); ws.close(); ch.kill(); process.exit(1); }

  /* One fixed frame for every capture, so strength is the only variable. */
  await ev(`(async () => {
    const v = document.querySelector('.bg-video-film');
    v.pause();
    await new Promise((res) => { const d = () => { v.removeEventListener('seeked', d); res(); }; v.addEventListener('seeked', d); v.currentTime = ${AT}; });
    return v.currentTime;
  })()`);

  console.log("\n  GROUND CAPTURES — " + VW + "x" + VH + ", video held at t=" + AT + "s\n");
  for (const sName of SECTIONS) {
    for (const st of STRENGTHS) {
      await ev(`document.querySelectorAll('.bg-video').forEach((e)=>e.style.setProperty('--ground-strength','${st}'));1`);
      const applied = await ev("getComputedStyle(document.querySelector('.bg-video')).opacity");
      if (Math.abs(parseFloat(applied) - parseFloat(st)) > 0.001) {
        throw new Error("shoot-ground: strength " + st + " did not apply (computed " + applied + ")");
      }
      const y = await ev(`(async()=>{const e=document.getElementById('${sName}');if(!e)return -1;
        scrollTo(0, Math.round(e.getBoundingClientRect().top+scrollY)+8);
        await new Promise(r=>setTimeout(r,700)); return Math.round(scrollY);})()`);
      if (y < 0) { console.log("   no #" + sName); continue; }
      const f = sName + "-s" + st + ".png";
      await shot(f);
      console.log("   " + f.padEnd(26) + " at y=" + y + ", opacity " + applied);
    }
  }
  console.log("\n  " + OUT + "\n");
  ws.close(); ch.kill();
  process.exit(0);
})();
