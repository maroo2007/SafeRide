/**
 * IS THE MOVING GROUND AFFORDABLE AT 390?
 *
 * The brief says to measure rather than to be cautious, so this scrolls the
 * whole page at 390x844 twice — once with the video attached and once without
 * — and reads the compositor's own record of what was PRESENTED.
 *
 * DrawFrame and DroppedFrame, not requestAnimationFrame. rAF says when the
 * page ran a callback; it cannot see a frame the compositor failed to
 * present, which is exactly what the cost of a second video decode would look
 * like. This project has been caught by that instrument twice.
 *
 * The two runs differ only in ?bgvideo=on|off, so the video is the only
 * variable — same build, same scroll, same machine, back to back.
 *
 * Usage: node build/measure-mobile-ground.js <profile> [--port=] [--w=390] [--h=844]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const BASE = arg("url", "http://localhost:3100/");
const PORT0 = +arg("port", 9840);
const VW = +arg("w", 390), VH = +arg("h", 844);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

async function run(mode, port) {
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + port, "--user-data-dir=" + P + "-" + mode,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + port + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("measure-mobile-ground: no target on " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 30 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const events = []; let complete = false;
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Tracing.dataCollected") events.push(...x.params.value);
    if (x.method === "Tracing.tracingComplete") complete = true;
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: BASE + "?bgvideo=" + mode });

  /* Settle first: the loader, the hero and the tour all finish before the
     scroll starts, so what is measured is the page in its steady state and
     not its start-up. */
  for (let i = 0; i < 120; i++) {
    if (await ev("!document.querySelector('[data-load-screen]')")) break;
    await sleep(500);
  }
  await sleep(2500);
  const hasVideo = await ev("!!document.querySelector('.bg-video-film')");

  await send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: { includedCategories: ["disabled-by-default-devtools.timeline.frame", "devtools.timeline", "gpu"] },
  });

  /* One scroll of the whole page at a fixed rate, so both runs cover the same
     ground in the same time. */
  const scrolled = await ev(`(async () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const t0 = performance.now();
    const DUR = 12000;
    return await new Promise((res) => {
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / DUR);
        scrollTo(0, Math.round(h * p));
        if (p < 1) requestAnimationFrame(step); else res(Math.round(performance.now() - t0));
      };
      step();
    });
  })()`);

  await send("Tracing.end");
  for (let i = 0; i < 120 && !complete; i++) await sleep(100);

  const drawn = events.filter((e) => e.name === "DrawFrame").length;
  const dropped = events.filter((e) => e.name === "DroppedFrame").length;
  const gpuMs = events.filter((e) => e.dur && e.name === "GPUTask").reduce((s, e) => s + e.dur / 1000, 0);
  const decodeMs = events.filter((e) => e.dur && /Decode/.test(e.name)).reduce((s, e) => s + e.dur / 1000, 0);
  ws.close(); ch.kill();
  return { mode, hasVideo, scrolled, drawn, dropped, gpuMs, decodeMs };
}

(async () => {
  console.log("\n  THE MOVING GROUND AT " + VW + "x" + VH + " — presented frames across one full scroll\n");
  const off = await run("off", PORT0);
  const on = await run("on", PORT0 + 1);

  /* The forced run has to have actually attached a video, or this is two
     measurements of the same page reported as a comparison. */
  if (on.hasVideo !== true || off.hasVideo !== false) {
    console.log("  ABORT — the override did not take: with-video run hasVideo=" + on.hasVideo
      + ", without-video run hasVideo=" + off.hasVideo + "\n");
    process.exit(1);
  }

  for (const r of [off, on]) {
    console.log("   " + (r.mode === "on" ? "WITH the video   " : "WITHOUT the video")
      + "  presented " + String(r.drawn).padStart(4)
      + "   dropped " + String(r.dropped).padStart(4)
      + "   (" + (r.drawn / (r.scrolled / 1000)).toFixed(1).padStart(5) + "/s over " + r.scrolled + "ms)"
      + "   GPU " + r.gpuMs.toFixed(0).padStart(5) + "ms   decode " + r.decodeMs.toFixed(0).padStart(5) + "ms");
  }
  const lost = off.drawn ? (1 - on.drawn / off.drawn) * 100 : 0;
  const dropDelta = on.dropped - off.dropped;
  console.log("\n   the video costs " + lost.toFixed(1) + "% of presented frames and "
    + (dropDelta >= 0 ? "+" : "") + dropDelta + " dropped frames\n");
  process.exit(0);
})();
