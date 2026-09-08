/**
 * Crossing speed and phone size, as ONE decision.
 *
 * They are coupled: a bigger phone has a wider projected box, which tightens
 * the no-overlap constraint that the crossing window exists to satisfy. And
 * widening the fade's dead zone to buy crossing time SPENDS READING TIME —
 * the dead zone is by definition the interval where no text is legible. So
 * every option reports both, measured off the live page rather than derived
 * from the constants, because the constants are what is being questioned.
 *
 * Usage: node build/tune-report.js <profile> <out> [--w=1440]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/* Crossing options: dead-zone width (knee) paired with how much of it is used. */
const CROSSINGS = [
  { name: "current", knee: 2.2, crossFraction: 0.35 },
  { name: "wider",   knee: 3.0, crossFraction: 0.60 },
  { name: "widest",  knee: 4.0, crossFraction: 0.80 },
];
const SIZES = [0.46, 0.53, 0.60];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=9801", "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9801/json/list")).find((x) => x.type === "page"); } catch {}
  }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

  const load = async (query) => {
    await send("Page.navigate", { url: "http://localhost:3100/?" + query });
    await sleep(7000);
    const top = await ev(`(() => {
      const rw = document.querySelector('#parent-app [data-tour-runway]');
      if (!rw) throw new Error('no [data-tour-runway]');
      return Math.round(rw.getBoundingClientRect().top + scrollY);
    })()`);
    await ev(`(async()=>{scrollTo(0,${top});await new Promise(r=>setTimeout(r,700));return 1})()`);
    for (let i = 0; i < 60; i++) { if (await ev("!!window.__phoneTour")) break; await sleep(500); }
    await sleep(600);
    return top;
  };

  /*
   * Sample the FIRST transition densely and read both curves off the page:
   * where the phone is horizontally, and how opaque the active text is.
   */
  const sweep = async (top) => JSON.parse(await ev(`(async () => {
    const rw = document.querySelector('#parent-app [data-tour-runway]');
    const span = rw.offsetHeight - innerHeight;
    const out = [];
    for (let i = 0; i <= 200; i++) {
      const p = (i / 200) * 0.5;            /* one transition */
      scrollTo(0, ${top} + Math.round(span * p));
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const d = window.__phoneTour.debug();
      const el = document.querySelector('#parent-app [data-chapter][data-active="true"]');
      out.push({ local: i / 200, x: +d.phoneCentreXPx.toFixed(1),
        o: +(parseFloat(getComputedStyle(el).opacity) || 0).toFixed(3) });
    }
    return JSON.stringify({ span, out });
  })()`));

  const shot = async (n) => fs.writeFileSync(path.join(OUT, n),
    Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  console.log(`\n  CROSSING AND SIZE — measured off the page, ${VW}x${VH}\n`);
  console.log("   option    knee  frac    crossing            legible (o>0)      legible (o>0.5)");

  for (const c of CROSSINGS) {
    const top = await load(`knee=${c.knee}&crossFraction=${c.crossFraction}`);
    const { span, out } = await sweep(top);
    const transitionPx = span * 0.5;
    const moving = out.filter((s, i) => i > 0 && Math.abs(s.x - out[i - 1].x) > 0.5);
    const crossFrom = moving.length ? moving[0].local : 0;
    const crossTo = moving.length ? moving[moving.length - 1].local : 0;
    const crossSpan = crossTo - crossFrom;
    const vis0 = out.filter((s) => s.o > 0.001).length / out.length;
    const vis50 = out.filter((s) => s.o > 0.5).length / out.length;
    console.log(
      `   ${c.name.padEnd(9)} ${String(c.knee).padStart(4)} ${String(c.crossFraction).padStart(5)}` +
      `   ${(crossSpan * 100).toFixed(1).padStart(5)}% = ${Math.round(crossSpan * transitionPx).toString().padStart(4)}px` +
      `   ${(vis0 * 100).toFixed(1).padStart(5)}% = ${Math.round(vis0 * transitionPx).toString().padStart(4)}px` +
      `   ${(vis50 * 100).toFixed(1).padStart(5)}% = ${Math.round(vis50 * transitionPx).toString().padStart(4)}px`,
    );
    /* The crossing midpoint, which is what "too fast" is a complaint about. */
    const mid = crossFrom + crossSpan / 2;
    await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
      scrollTo(0,${top}+Math.round((rw.offsetHeight-innerHeight)*${mid * 0.5}));
      await new Promise(r=>setTimeout(r,800));return 1})()`);
    await shot(`cross-${c.name}.png`);
  }

  console.log("\n   size   phone px   downsample   descent px   text w   phone box   gap");
  for (const rf of SIZES) {
    const top = await load(`restFraction=${rf}`);
    const geo = JSON.parse(await ev(`(() => {
      const d = window.__phoneTour.debug();
      const el = document.querySelector('#parent-app [data-chapter][data-active="true"]');
      const r = el.getBoundingClientRect();
      const c = document.querySelector('#parent-app canvas').getBoundingClientRect();
      return JSON.stringify({ h: d.phoneHeightPx, box: d.phoneRect,
        text: { l: Math.round(r.left), r: Math.round(r.right) }, cx: c.x });
    })()`));
    /* Descent: phone centre at both ends of the section. */
    const ys = [];
    for (const p of [0, 1]) {
      await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
        scrollTo(0,${top}+Math.round((rw.offsetHeight-innerHeight)*${p}));
        await new Promise(r=>setTimeout(r,700));return 1})()`);
      ys.push(await ev("window.__phoneTour.debug().phoneCentreYPx"));
    }
    const phoneL = geo.cx + geo.box.x;
    const gap = Math.round(phoneL - geo.text.r);
    console.log(
      `   ${rf.toFixed(2)}    ${Math.round(geo.h).toString().padStart(6)}px` +
      `   ${(2314 / geo.h).toFixed(2).padStart(6)}x` +
      `   ${Math.round(ys[1] - ys[0]).toString().padStart(8)}px` +
      `   ${(geo.text.r - geo.text.l).toString().padStart(5)}px` +
      `   ${Math.round(geo.box.w).toString().padStart(7)}px` +
      `   ${String(gap).padStart(4)}px${gap <= 0 ? "  OVERLAP" : ""}`,
    );
    await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
      scrollTo(0,${top}+Math.round((rw.offsetHeight-innerHeight)*0.5));
      await new Promise(r=>setTimeout(r,900));return 1})()`);
    await shot(`size-${rf}-chapter2.png`);
  }
  console.log("");
  ws.close(); ch.kill();
  process.exit(0);
})();
