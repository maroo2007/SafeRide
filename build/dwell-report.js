/**
 * How much scrolling does it take to lose the copy?
 *
 * "Legible scroll distance" is the honest unit here, not seconds: the visitor
 * controls the clock, and if they stop scrolling the text stays. What decides
 * whether a chapter "appears and fades before someone finishes the bullets"
 * is how far a NORMAL scroll gesture moves them through the fade.
 *
 * So this dispatches real wheel events through CDP — trusted input, the same
 * path a mouse takes — and reads the opacity after each notch. A synthetic
 * scrollTo would measure a distance nobody actually scrolls in one motion.
 *
 * Usage: node build/dwell-report.js <profile> <out> [--w=1440]
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

const OPTIONS = [
  { name: "shipping", knee: 3.0, crossFraction: 0.60 },
  { name: "f=0.75",   knee: 3.0, crossFraction: 0.75 },
  { name: "f=0.85",   knee: 3.0, crossFraction: 0.85 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=9805", "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9805/json/list")).find((x) => x.type === "page"); } catch {}
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
    for (let i = 0; i < 60; i++) { if (await ev("!!window.__phoneTour")) break; await sleep(500); }
    return top;
  };
  const opacity = () => ev(`(() => {
    const el = document.querySelector('#parent-app [data-chapter][data-active="true"]');
    return +(parseFloat(getComputedStyle(el).opacity) || 0).toFixed(3);
  })()`);
  /* Trusted wheel, at the centre of the viewport so it lands on the listener.
     A wheel dispatched at an arbitrary x once missed every listener in this
     project and produced a confidently wrong result. */
  const notch = async (deltaY = 100) => {
    await send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: Math.round(VW / 2), y: Math.round(VH / 2),
      deltaX: 0, deltaY, pointerType: "mouse",
    });
    await sleep(450);
  };

  console.log(`\n  DWELL — how many wheel notches until the copy is gone, ${VW}x${VH}\n`);
  console.log("   option    at rest   after 1   after 2   after 3   after 4   notches to invisible");
  for (const o of OPTIONS) {
    const top = await load(`knee=${o.knee}&crossFraction=${o.crossFraction}&restFraction=0.60`);
    /* Chapter 2's rest point, mid-section: it has a fade on both sides. */
    await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
      scrollTo(0,${top}+Math.round((rw.offsetHeight-innerHeight)*0.5));
      await new Promise(r=>setTimeout(r,900));return 1})()`);
    const seq = [await opacity()];
    let gone = null;
    for (let i = 1; i <= 8; i++) {
      await notch();
      const o2 = await opacity();
      if (i <= 4) seq.push(o2);
      if (gone === null && o2 <= 0.02) gone = i;
    }
    console.log(
      `   ${o.name.padEnd(9)} ${seq.map((v) => v.toFixed(2).padStart(7)).join("   ")}` +
      `   ${gone === null ? "  >8" : String(gone).padStart(5)}`,
    );
  }

  /* ---- the descent, at 0.60, across one transition --------------------- */
  const RF = arg("rf", 0.60);
  const top = await load(`knee=4.0&crossFraction=0.8&restFraction=${RF}`);
  /* The label reports the value ACTUALLY used. It was hardcoded to 0.60 and
     printed that header over a run of 0.53 data — a caption that lies about
     its own measurement is how a comparison gets read backwards. */
  console.log(`\n  DESCENT AT ${RF} — one transition, chapter 1 to chapter 2\n`);
  for (const [label, p] of [["start", 0], ["quarter", 0.125], ["middle", 0.25], ["three-quarter", 0.375], ["end", 0.5]]) {
    await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
      scrollTo(0,${top}+Math.round((rw.offsetHeight-innerHeight)*${p}));
      await new Promise(r=>setTimeout(r,900));return 1})()`);
    const d = JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
    console.log(`   ${label.padEnd(14)} phone centre  x ${Math.round(d.phoneCentreXPx).toString().padStart(5)}  y ${Math.round(d.phoneCentreYPx).toString().padStart(4)}`);
    fs.writeFileSync(path.join(OUT, `descent-${RF}-${label}.png`),
      Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  }
  console.log("");
  ws.close(); ch.kill();
  process.exit(0);
})();
