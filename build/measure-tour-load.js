/**
 * Where does the time go before the phone appears? (Spec §6.6 diagnosis.)
 *
 * MEASURES ONLY. The scene carries marks, not behaviour changes, so this runs
 * against the shipped load order and reports which stage dominates. "The model
 * is slow" has four candidate causes — the gate, the network, the parse, the
 * GPU upload — and three of them would be untouched by a fix aimed at the
 * fourth.
 *
 * Cold cache is ENFORCED, not assumed: a fresh profile alone still serves from
 * the HTTP cache on a second run in the same profile directory, and a warm
 * read reported as cold sends you after the wrong bottleneck.
 *
 * Usage: node build/measure-tour-load.js <profile> [url] [--warm]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const URL = (process.argv[3] && !process.argv[3].startsWith("--")) ? process.argv[3] : "http://localhost:3100/";
const WARM = process.argv.includes("--warm");
/* --noscrub blocks the hero's 56 MB scrub file. Not a proposed fix — a
   control, to separate "the GLB is big" from "the GLB is starved". The same
   file downloads in 0.24s standalone and 24.9s inside the page. */
const NOSCRUB = process.argv.includes("--noscrub");
const VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const ms = (v) => (v === null || v === undefined ? "     -" : (v >= 0 ? v.toFixed(0).padStart(6) : "     -"));

(async () => {
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=9731", "--user-data-dir=" + P, "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9731/json/list")).find((x) => x.type === "page"); } catch {}
  }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const net = { started: new Map(), finished: new Map() };
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Network.requestWillBeSent") net.started.set(x.params.requestId, { url: x.params.request.url, at: x.params.timestamp });
    if (x.method === "Network.loadingFinished") net.finished.set(x.params.requestId, { at: x.params.timestamp, bytes: x.params.encodedDataLength });
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (!WARM) {
    await send("Network.clearBrowserCache");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
  }

  if (NOSCRUB) await send("Network.setBlockedURLs", { urls: ["*saferide-hero-scrub*"] });
  await send("Page.navigate", { url: URL });
  await sleep(6000);

  /* Open the gate the way a visitor does: scroll past the hero. */
  const geo = JSON.parse(await ev(`(() => {
    const s = document.querySelector('#parent-app');
    const rw = s.querySelector('[data-tour-runway]');
    if (!rw) throw new Error('no [data-tour-runway]');
    return JSON.stringify({ top: Math.round(rw.getBoundingClientRect().top + scrollY) });
  })()`));
  const scrollAt = await ev("performance.now()");
  await ev(`(async()=>{scrollTo(0,${geo.top});await new Promise(r=>setTimeout(r,300));return 1})()`);

  for (let i = 0; i < 120; i++) {
    if (await ev("!!(window.__tourMarks && window.__tourMarks.firstFrame)")) break;
    await sleep(500);
  }
  const marks = JSON.parse(await ev("JSON.stringify(window.__tourMarks || {})"));
  const gateAt = await ev("window.__tourGateAt ?? null");

  const res = JSON.parse(await ev(`(() => JSON.stringify(
    performance.getEntriesByType('resource')
      .filter((e) => /\\.glb$|screens\\/.*\\.png$|hero-idle|hero-scrub/.test(e.name))
      .map((e) => ({ name: e.name.split('/').pop(), start: +e.startTime.toFixed(1),
                     dur: +e.duration.toFixed(1), size: e.encodedBodySize,
                     ttfb: +(e.responseStart - e.startTime).toFixed(1) }))))()`));

  const glb = res.find((r) => r.name.endsWith(".glb"));
  const pngs = res.filter((r) => r.name.endsWith(".webp"));
  const pngSpan = pngs.length
    ? Math.max(...pngs.map((p) => p.start + p.dur)) - Math.min(...pngs.map((p) => p.start))
    : null;

  console.log(`\n  TIME TO FIRST PHONE FRAME — ${WARM ? "WARM" : "COLD"} cache, production, ${VW}x${VH}\n`);
  console.log("   stage                                          at (ms)   took (ms)");
  console.log(`   navigation start                              ${ms(0)}`);
  console.log(`   scrolled to the section                       ${ms(scrollAt)}`);
  console.log(`   gate opened, start() called                   ${ms(gateAt)}   ${ms(gateAt !== null ? gateAt - scrollAt : null)}  (waiting for the hero to leave)`);
  console.log(`   createScene entered, three imported           ${ms(marks.createScene)}   ${ms(gateAt !== null ? marks.createScene - gateAt : null)}`);
  console.log(`   GLB fetch started                             ${ms(marks.glbStart)}   ${ms(marks.glbStart - marks.createScene)}`);
  if (glb) {
    console.log(`     download  ${(glb.size / 1048576).toFixed(2)} MB, ttfb ${glb.ttfb.toFixed(0)}ms      ${ms(glb.start)}   ${ms(glb.dur)}`);
    console.log(`     parse (loadAsync total minus download)                 ${ms(marks.glbDone - marks.glbStart - glb.dur)}`);
  }
  console.log(`   GLB ready                                     ${ms(marks.glbDone)}   ${ms(marks.glbDone - marks.glbStart)}`);
  console.log(`   textures started                              ${ms(marks.texStart)}`);
  for (const p of pngs) {
    console.log(`     ${p.name.padEnd(22)} ${(p.size / 1048576).toFixed(2)} MB      ${ms(p.start)}   ${ms(p.dur)}`);
  }
  console.log(`     fetch+decode wall time for all three                   ${ms(pngSpan)}`);
  console.log(`     initTexture, GPU upload of all three                   ${ms(marks.uploadMs)}`);
  console.log(`   textures ready                                ${ms(marks.texDone)}   ${ms(marks.texDone - marks.texStart)}`);
  console.log(`   first rendered frame with the phone           ${ms(marks.firstFrame)}   ${ms(marks.firstFrame - marks.texDone)}`);

  const felt = marks.firstFrame - scrollAt;
  console.log(`\n   FROM NAVIGATION START:      ${marks.firstFrame ? marks.firstFrame.toFixed(0) : "?"} ms`);
  console.log(`   FROM REACHING THE SECTION:  ${felt.toFixed(0)} ms   <- what a visitor waits, staring at empty space\n`);

  const hero = res.filter((r) => /hero/.test(r.name));
  if (hero.length) {
    console.log("   the hero, for the competition question");
    for (const h of hero) console.log(`     ${h.name.padEnd(28)} ${(h.size / 1048576).toFixed(2)} MB  started ${ms(h.start)}  took ${ms(h.dur)}`);
  }
  console.log("");
  ws.close(); ch.kill();
  process.exit(0);
})();
