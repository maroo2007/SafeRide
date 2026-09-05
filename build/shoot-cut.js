/**
 * Photograph the cut: the hero's pin releasing into the first content section.
 *
 * Section 3's parallax was the bridge between the film's last frame and the
 * light content. With it removed, this is what the join actually looks like —
 * captured rather than assumed.
 *
 * Positions are derived from the runway, not typed in: the sticky pin releases
 * when the runway's bottom reaches the viewport bottom, i.e. at
 * scrollY = runwayHeight - innerHeight.
 *
 * Usage: node build/shoot-cut.js <profile-dir> <out-dir> [url] [--w=] [--h=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9696);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${P}`, `--window-size=${VW},${VH}`, "about:blank"], { stdio: "ignore" });

  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500); try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (n) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, n), Buffer.from(r.result.data, "base64"));
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(11000);

  /* Buffer the film so the last frames are actually available to show. */
  await ev(`(async()=>{scrollTo(0,600);await new Promise(r=>setTimeout(r,7000));return 1})()`);

  const geo = JSON.parse(await ev(`(() => {
    const hero = document.querySelector('section[aria-labelledby="hero-headline"]');
    const next = document.querySelector('#features');
    const hb = hero.getBoundingClientRect();
    return JSON.stringify({
      runwayTop: Math.round(hb.top + scrollY), runwayH: Math.round(hb.height),
      release: Math.round(hb.top + scrollY + hb.height - innerHeight),
      nextTop: Math.round(next.getBoundingClientRect().top + scrollY),
      vh: innerHeight,
    });
  })()`));
  console.log(`\n  THE CUT — ${URL} at ${VW}x${VH}`);
  console.log(`  runway ${geo.runwayH}px from y=${geo.runwayTop}; the pin releases at y=${geo.release}`);
  console.log(`  the first content section starts at y=${geo.nextTop}\n`);

  const stops = [
    ["cut-1-before-release.png", geo.release - 400],
    ["cut-2-at-release.png", geo.release],
    ["cut-3-just-after.png", geo.release + 250],
    ["cut-4-content-arriving.png", geo.release + 600],
    ["cut-5-content.png", geo.nextTop],
  ];
  for (const [name, y] of stops) {
    const state = await ev(`(async()=>{scrollTo(0,${Math.max(0, y)});
      await new Promise(r=>setTimeout(r,1800));
      const hero=document.querySelector('section[aria-labelledby="hero-headline"]');
      const sticky=hero.firstElementChild;
      const vids=[...document.querySelectorAll('video')];
      const scrub=vids.find(v=>/scrub/.test(v.currentSrc||''))||vids[vids.length-1];
      return JSON.stringify({y:Math.round(scrollY),
        stickyTop:Math.round(sticky.getBoundingClientRect().top),
        film:Math.round(scrub.currentTime*100)/100,
        pinned:Math.abs(sticky.getBoundingClientRect().top)<2});})()`);
    await shot(name);
    const st = JSON.parse(state);
    console.log(`   ${name.padEnd(30)} y=${String(st.y).padStart(5)}  sticky top=${String(st.stickyTop).padStart(5)}  ${st.pinned ? "PINNED " : "released"}  film ${st.film}s`);
  }

  console.log("");
  ws.close(); ch.kill(); process.exit(0);
})();
