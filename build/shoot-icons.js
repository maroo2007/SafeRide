/**
 * Capture the six icon treatments: 36px specimens, resting, hovered, and a
 * MID-ANIMATION filmstrip.
 *
 * The filmstrip does not re-implement the timing. It sets the document's
 * animation playback rate to ZERO before forcing :hover, so the real
 * transitions are created but never advance, then seeks them to a given
 * millisecond through CDP's Animation domain. The frames are the shipping
 * animation, stopped — not inline styles that merely resemble it.
 *
 * The first attempt paused animations from page script AFTER hover; the
 * transitions had already run to completion, and every "mid-draw" frame came
 * out byte-identical to the settled one. Hence assertDistinct below: a
 * filmstrip whose frames are all the same is a broken rig, not a fast
 * animation, and it must fail loudly rather than be reported as evidence.
 *
 * Usage: node build/shoot-icons.js <profile> <outdir> [url]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2], OUT = process.argv[3];
const URL = process.argv[4] || "http://localhost:3000/cta-lab";
const PORT = 9501, VW = 1440, VH = 900;
/** Sampled across the longest budget (360ms) plus one frame past the end. */
const STEPS = [0, 60, 120, 180, 240, 300, 400];

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
  let animIds = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    if (x.method === "Animation.animationStarted" && x.params?.animation?.id)
      animIds.push(x.params.animation.id);
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("CSS.enable"); await send("Animation.enable");
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

  /* Node ids are resolved ONCE per selector. Doing DOM.getDocument on every
     toggle cost enough round-trips that the transitions had already finished
     before the pause landed — which is exactly how the first filmstrip came
     out identical in every frame. */
  const nodeCache = new Map();
  const nodesFor = async (selector) => {
    if (!nodeCache.has(selector)) {
      const doc = await send("DOM.getDocument", { depth: -1 });
      const q = await send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector });
      nodeCache.set(selector, q.result?.nodeIds ?? []);
    }
    return nodeCache.get(selector);
  };
  const setHover = async (selector, on) => {
    const ids = await nodesFor(selector);
    await Promise.all(ids.map((nodeId) =>
      send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: on ? ["hover"] : [] })));
    return ids.length;
  };

  const rectOf = async (sel) => JSON.parse(await ev(
    `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'start'});
      return new Promise(r=>setTimeout(()=>{const b=e.getBoundingClientRect();
        r(JSON.stringify({x:Math.max(0,b.x+scrollX),y:Math.max(0,b.y+scrollY),
                          width:Math.min(${VW},b.width),height:b.height}));},700));})()`));

  /* 0. lift ladder, hover forced */
  let r = await rectOf("#lift-ladder");
  await shot("lift-00-ladder-resting.png", r);
  await setHover("#lift-ladder a", true);
  await sleep(700);
  await shot("lift-01-ladder-hovered.png", r);
  await shot("lift-02-ladder-hovered-zoom2x.png", r, 2);
  await setHover("#lift-ladder a", false);

  /* 1. over footage: resting, hovered */
  r = await rectOf("#route-footage");
  await sleep(600);
  await shot("route-03-footage-resting.png", r);
  const n = await setHover("#route-footage a", true);
  await sleep(900);
  await shot("route-04-footage-hovered.png", r);
  await setHover("#route-footage a", false);
  await sleep(500);

  /* 3. MID-ANIMATION filmstrip — real transitions, paused then seeked */
  const digests = new Map();
  await nodesFor("#route-footage a");          // warm the cache before timing matters
  for (const ms of STEPS) {
    await setHover("#route-footage a", false);
    await sleep(700);                          // let everything unwind to rest
    await setHover("#route-footage a", true);
    // No sleep here: pause on the very next frame, while the transitions are
    // still near zero, then seek. Reading the times back is the proof.
    const state = await ev(`new Promise(res=>requestAnimationFrame(()=>{
      const list = document.getAnimations();
      list.forEach(a=>{ try { a.pause(); a.currentTime = ${ms}; } catch(e){} });
      requestAnimationFrame(()=>res(JSON.stringify({
        n: list.length,
        times: [...new Set(list.map(a=>Math.round(a.currentTime||0)))].slice(0,4),
        playing: list.filter(a=>a.playState==='running').length
      })));
    }))`);
    await sleep(140);
    const name = `route-05-middraw-${String(ms).padStart(3, "0")}ms.png`;
    await shot(name, r);
    digests.set(name, crypto.createHash("sha1")
      .update(fs.readFileSync(path.join(OUT, name))).digest("hex").slice(0, 12));
    console.log(`       seek ${ms}ms -> ${state}`);
  }
  await setHover("#route-footage a", false);

  /* The rig must prove it actually moved something. */
  const uniq = new Set(digests.values());
  console.log("");
  console.log("  filmstrip frame digests:");
  for (const [n2, d] of digests) console.log("    " + n2 + "  " + d);
  if (uniq.size < Math.max(3, STEPS.length - 2)) {
    console.error("");
    console.error("  FILMSTRIP BROKEN: " + digests.size + " frames, only " + uniq.size + " distinct.");
    console.error("  The seek did not take effect — do not report these as mid-animation.");
    process.exitCode = 2;
  } else {
    console.log("");
    console.log("  filmstrip OK: " + uniq.size + "/" + digests.size + " frames distinct");
  }

  /* 3b. a 3x crop of the hovered primary, to check the line and dot up close */
  await setHover("#route-footage a", true);
  await sleep(900);
  await shot("route-04b-footage-hovered-zoom3x.png", r, 3);
  await setHover("#route-footage a", false);

  /* 3c. :active — the press. Forced through the real pseudo-class. */
  const setState = async (selector, classes) => {
    const ids = await nodesFor(selector);
    await Promise.all(ids.map((nodeId) =>
      send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: classes })));
  };
  r = await rectOf("#route-footage");
  await setState("#route-footage a", ["hover", "active"]);
  await sleep(600);
  await shot("route-08-footage-active.png", r);
  await setState("#route-footage a", []);

  /* 4. on paper: resting, hovered */
  r = await rectOf("#route-paper");
  await sleep(500);
  await shot("route-06-paper-resting.png", r);
  await setHover("#route-paper a", true);
  await sleep(900);
  await shot("route-07-paper-hovered.png", r);
  await setHover("#route-paper a", false);
  await setState("#route-paper a", ["hover", "active"]);
  await sleep(600);
  await shot("route-09-paper-active.png", r);
  await setState("#route-paper a", []);
  console.log(`  (forced :hover on ${n} controls)`);

  ws.close(); chrome.kill(); process.exit(0);
})();
