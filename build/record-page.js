/**
 * A recording of the finished page, top to bottom.
 *
 * Screencast frames during a scripted scroll, encoded to a real video. Not a
 * tall screenshot: a tall clip cannot show the hero playing, the tour
 * rotating, or the ground drifting, and those are most of what there is to
 * judge. Not a contact sheet either — that is the right tool for asking
 * whether a 900ms animation stutters, and the wrong one for asking whether a
 * fifteen-thousand-pixel page reads.
 *
 * The scroll is driven at a fixed rate from inside the page rather than by
 * scrollTo in a loop from outside, so it is smooth and the same length every
 * time, and Lenis is left to do its own easing.
 *
 * Usage: node build/record-page.js <profile> <out.mp4> [--w=1440] [--h=900] [--secs=45]
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const BASE = arg("url", "http://localhost:3100/");
const PORT = +arg("port", 9690);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const SECS = +arg("secs", 45);
const FPS = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saferide-rec-"));
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + PORT + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("record-page: no debugger target");
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 30 });
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
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 768 });
  /* Record from the very first frame: the loader is part of the page. */
  await send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
  await send("Page.navigate", { url: BASE });

  /* Hold on the hero once the loader has gone, so the recording opens on the
     page rather than mid-scroll. */
  for (let i = 0; i < 150; i++) {
    if (await ev("!document.querySelector('[data-load-screen]')")) break;
    await sleep(300);
  }
  await sleep(2500);

  const scrolled = await ev(`(async () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const DUR = ${SECS * 1000};
    const t0 = performance.now();
    return await new Promise((res) => {
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / DUR);
        /* Eased at both ends so the recording does not start and stop with a
           jerk; the middle is linear, which is what makes the page's own
           rhythm readable. */
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        scrollTo(0, Math.round(h * e));
        if (p < 1) requestAnimationFrame(step); else res(Math.round(h));
      };
      step();
    });
  })()`);
  await sleep(1500);
  await send("Page.stopScreencast");
  await sleep(400);

  if (frames.length < 30) {
    console.log("\n  ABORT — only " + frames.length + " frames captured; nothing worth encoding\n");
    ws.close(); ch.kill(); process.exit(1);
  }
  frames.forEach((f, i) =>
    fs.writeFileSync(path.join(tmp, "f" + String(i).padStart(5, "0") + ".jpg"), Buffer.from(f.data, "base64")));

  const span = (frames[frames.length - 1].ts - frames[0].ts);
  /* The screencast delivers frames when the page presents them, not on a
     clock, so the real rate is measured and handed to ffmpeg rather than
     assumed — otherwise a 60s recording plays back at half speed. */
  const realFps = Math.max(5, Math.min(60, frames.length / span));
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error",
    "-framerate", realFps.toFixed(3), "-i", path.join(tmp, "f%05d.jpg"),
    "-vf", "fps=" + FPS + ",format=yuv420p", "-c:v", "libx264", "-crf", "23", "-preset", "medium",
    "-movflags", "+faststart", OUT], { encoding: "utf8" });
  if (r.status !== 0) { console.log(r.stderr); process.exit(1); }

  console.log("\n  RECORDING — " + VW + "x" + VH);
  console.log("    " + frames.length + " frames over " + span.toFixed(1) + "s of page time ("
    + realFps.toFixed(1) + "/s captured), scrolled " + scrolled + "px");
  console.log("    " + OUT + "  (" + (fs.statSync(OUT).size / 1048576).toFixed(2) + " MB)\n");
  fs.rmSync(tmp, { recursive: true, force: true });
  ws.close(); ch.kill();
  process.exit(0);
})();
