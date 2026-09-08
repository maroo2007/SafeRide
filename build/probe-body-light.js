/**
 * Is the phone's BODY dark, and is the deferred environment why?
 *
 * The body — metal frame, glass, lens housing — is lit almost entirely by
 * scene.environment. That environment is now built AFTER the first frame, so
 * there is a window in which the phone is drawn with no environment at all.
 * If that window is long, or if something holds the pre-environment state,
 * the body would read exactly as "flat and dark".
 *
 * This measures rather than adjusts:
 *
 *   1. the body's colour at the first frame, before the deferred build
 *   2. the same pixels after it lands, and the size of the gap
 *   3. the same pixels with PMREM built SYNCHRONOUSLY, which is the
 *      reference the deferral is supposed to be identical to
 *
 * The sample is the metal edge between the phone's projected box and the
 * screen's — the frame, not the screen. The screen is unlit by design and
 * would drag any body measurement toward its own value.
 *
 * Usage: node build/probe-body-light.js <profile> <out>
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { decodePNG } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=9811", "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9811/json/list")).find((x) => x.type === "page"); } catch {}
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

  /* The metal edge: inside the phone's box, outside the screen's. */
  const sampleFrame = async (tag) => {
    const d = JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
    const cx = await ev(`Math.round(document.querySelector('#parent-app canvas').getBoundingClientRect().x)`);
    const cy = await ev(`Math.round(document.querySelector('#parent-app canvas').getBoundingClientRect().y)`);
    const png = Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64");
    fs.writeFileSync(path.join(OUT, `body-${tag}.png`), png);
    const img = decodePNG(png);
    const pr = d.phoneRect, sr = d.screenRect;
    /*
     * FIND THE SILHOUETTE, do not trust the box.
     *
     * phoneRect is the projected bounding box of a LEANING, rotated model, so
     * its corners are empty page. Scanning from the box's left edge at
     * mid-height sampled the paper ground — rgb(253, 248, 240), the exact
     * value of --paper — and reported the body as "identical" in every
     * condition because it was never looking at the body.
     *
     * So each row is scanned inward until the pixel stops being the ground,
     * and the metal edge is the run from there to the screen's edge.
     */
    const GROUND = [253, 248, 240];
    const isGround = (o) =>
      Math.abs(img.px[o] - GROUND[0]) <= 6 &&
      Math.abs(img.px[o + 1] - GROUND[1]) <= 6 &&
      Math.abs(img.px[o + 2] - GROUND[2]) <= 6;
    let r = 0, g = 0, b = 0, n = 0, mx = 0;
    const y0 = cy + pr.y + Math.round(pr.h * 0.30);
    const y1 = cy + pr.y + Math.round(pr.h * 0.70);
    for (let y = y0; y < y1; y++) {
      if (y < 0 || y >= img.h) continue;
      let x = cx + pr.x;
      const limit = Math.min(img.w - 1, cx + sr.x + Math.round(sr.w * 0.10));
      while (x < limit && isGround((y * img.w + x) * img.ch)) x++;
      /* The metal edge is thin. Take the first 10px of solid phone. */
      for (let k = 0; k < 10 && x + k < limit; k++) {
        const o = (y * img.w + x + k) * img.ch;
        if (isGround(o)) break;
        r += img.px[o]; g += img.px[o + 1]; b += img.px[o + 2]; n++;
        mx = Math.max(mx, img.px[o], img.px[o + 1], img.px[o + 2]);
      }
    }
    return n ? { rgb: [r / n, g / n, b / n].map(Math.round), n, brightest: mx } : null;
  };

  const run = async (query, label) => {
    await send("Page.navigate", { url: "http://localhost:3100/?" + query });
    await sleep(6000);
    const top = await ev(`(() => {
      const rw = document.querySelector('#parent-app [data-tour-runway]');
      if (!rw) throw new Error('no [data-tour-runway]');
      return Math.round(rw.getBoundingClientRect().top + scrollY);
    })()`);
    await ev(`(async()=>{scrollTo(0,${top});await new Promise(r=>setTimeout(r,300));return 1})()`);
    const RUNTOP = top;

    /* Catch the frame BEFORE the deferred build lands. Poll fast. */
    let atFirst = null, marks = null;
    for (let i = 0; i < 400; i++) {
      const m = JSON.parse(await ev("JSON.stringify(window.__tourMarks || {})"));
      if (m.firstFrame && !atFirst) {
        atFirst = await sampleFrame(`${label}-first`);
        marks = m;
        if (m.deferredEnvDone) break;      // already landed; gap unmeasurable
      }
      if (atFirst && (await ev("!!(window.__tourMarks && window.__tourMarks.deferredEnvDone)"))) break;
      if (atFirst && label !== "defer") break;
      await sleep(60);
    }
    await sleep(1500);
    const settled = await sampleFrame(`${label}-settled`);
    /* Also mid-transition, where the body turns and the frame catches most
       of whatever light there is. Chapter 1 at rest is the pose where the
       environment does LEAST — 0.40% of pixels against 6.36% edge-on — so
       measuring only there would exonerate the environment by construction. */
    await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
      scrollTo(0,${'${RUNTOP}'}+Math.round((rw.offsetHeight-innerHeight)*0.125));
      await new Promise(r=>setTimeout(r,900));return 1})()`);
    const mid = await sampleFrame(`${label}-mid`);
    const m2 = JSON.parse(await ev("JSON.stringify(window.__tourMarks || {})"));
    return { atFirst, settled, mid, marks, m2 };
  };

  console.log(`\n  PHONE BODY — the metal edge, not the screen, ${VW}x${VH}\n`);

  const def = await run("descentUse=1.0", "defer");
  const syn = await run("envMode=pmrem&descentUse=1.0", "pmrem");
  const non = await run("envMode=none&descentUse=1.0", "none");

  const show = (label, s) => s
    ? `rgb(${s.rgb.join(", ")})  brightest ${s.brightest}  over ${s.n}px`
    : `${label}: no sample`;

  console.log(`   DEFERRED (shipping)`);
  console.log(`     at first frame        ${show("first", def.atFirst)}`);
  console.log(`     after env landed      ${show("settled", def.settled)}`);
  if (def.m2.firstFrame && def.m2.deferredEnvDone) {
    console.log(`     gap                   ${Math.round(def.m2.deferredEnvDone - def.m2.firstFrame)}ms with no environment`);
  }
  console.log(`\n   SYNCHRONOUS PMREM (reference)`);
  console.log(`     at first frame        ${show("first", syn.atFirst)}`);
  console.log(`     settled               ${show("settled", syn.settled)}`);

  if (def.atFirst && def.settled) {
    const d1 = def.settled.rgb.map((v, i) => v - def.atFirst.rgb[i]);
    console.log(`\n   deferred: settled - first frame   [${d1.join(", ")}]   worst ${Math.max(...d1.map(Math.abs))}`);
  }
  console.log(`
   NO ENVIRONMENT AT ALL (control)`);
  console.log(`     settled               ${show("settled", non.settled)}`);
  console.log(`
   MID-TRANSITION, body turned`);
  console.log(`     deferred              ${show("mid", def.mid)}`);
  console.log(`     synchronous           ${show("mid", syn.mid)}`);
  console.log(`     none                  ${show("mid", non.mid)}`);
  if (non.settled && syn.settled) {
    const d3 = syn.settled.rgb.map((v, i) => v - non.settled.rgb[i]);
    console.log(`
   at rest:  with env - without env   [${d3.join(", ")}]   worst ${Math.max(...d3.map(Math.abs))}`);
  }
  if (non.mid && syn.mid) {
    const d4 = syn.mid.rgb.map((v, i) => v - non.mid.rgb[i]);
    console.log(`   mid:      with env - without env   [${d4.join(", ")}]   worst ${Math.max(...d4.map(Math.abs))}`);
  }
  if (def.settled && syn.settled) {
    const d2 = def.settled.rgb.map((v, i) => v - syn.settled.rgb[i]);
    console.log(`   deferred settled - synchronous    [${d2.join(", ")}]   worst ${Math.max(...d2.map(Math.abs))}`);
  }
  console.log("");
  ws.close(); ch.kill();
  process.exit(0);
})();
