/**
 * Measure every CTA candidate in every state, INCLUDING mid-transition.
 *
 * A button that passes at rest and fails halfway through its hover is a fail,
 * and endpoint measurement cannot see that. This forces the real :hover, pauses
 * the real transitions and seeks them to a given millisecond, then hides the
 * label and samples the pixels it sits on — the same method validated against
 * the hero to within 1%.
 *
 * Usage: node build/measure-states.js <profile> [url]
 */
const { spawn } = require("child_process");
const http = require("http");
const { decodePNG, L, ratio } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2];
const URL = process.argv[3] || "http://localhost:3000/cta-lab";
const PORT = 9541, VW = 1440, VH = 900;
/** The hover transitions run 300ms; sample the whole sweep plus the endpoints. */
const SEEKS = [0, 75, 150, 225, 300];
/** Video frames across the hero's visible window, for the footage pass. */
const FRAMES = [0, 1.004, 2.008, 3.263, 4.518, 6.024];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

function groundStats(img, r, inset) {
  const px = [];
  const x0 = Math.round(r.x + inset), x1 = Math.round(r.x + r.w - inset);
  const y0 = Math.round(r.y + inset), y1 = Math.round(r.y + r.h - inset);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = y * img.w * img.ch + x * img.ch;
    px.push([img.px[o], img.px[o + 1], img.px[o + 2]]);
  }
  if (!px.length) return null;
  px.sort((a, b) => L(...a) - L(...b));
  return { dark: px[Math.floor(px.length * 0.05)], light: px[Math.floor(px.length * 0.95)] };
}

function edgeContrast(img, r) {
  const midY = Math.round(r.y + r.h / 2);
  const read = (x) => { const o = midY * img.w * img.ch + x * img.ch; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
  let best = 0;
  for (const dx of [0, 1, 2]) {
    const c = ratio(L(...read(Math.round(r.x) + dx)), L(...read(Math.max(0, Math.round(r.x) - 3 - dx))));
    if (c > best) best = c;
  }
  return best;
}

(async () => {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--window-size=${VW},${VH}`, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500);
    try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("CSS.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(8000);

  const shoot = async () => decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  const nodeCache = new Map();
  const nodesFor = async (sel) => {
    if (!nodeCache.has(sel)) {
      const doc = await send("DOM.getDocument", { depth: -1 });
      const q = await send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector: sel });
      nodeCache.set(sel, q.result?.nodeIds ?? []);
    }
    return nodeCache.get(sel);
  };
  const setState = async (sel, classes) => {
    const ids = await nodesFor(sel);
    await Promise.all(ids.map((nodeId) => send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: classes })));
  };

  /** One reading: force a state, freeze it, sample the label's ground. */
  async function readState(section, rowId, classes, seekMs) {
    await setState(`${section} [data-row="${rowId}"] a`, []);
    await sleep(420);
    if (classes.length) {
      await setState(`${section} [data-row="${rowId}"] a`, classes);
      if (seekMs !== null) {
        await ev(`new Promise(res=>requestAnimationFrame(()=>{
          document.getAnimations().forEach(a=>{try{a.pause();a.currentTime=${seekMs};}catch(e){}});
          requestAnimationFrame(()=>res(1));
        }))`);
      } else {
        await sleep(600);
      }
    }
    const info = JSON.parse(await ev(`(()=>{
      const row=document.querySelector('${section} [data-row="${rowId}"]');
      const out=[...row.querySelectorAll('a')].map((a,i)=>{
        const lab=a.querySelector('span > span');
        const r=a.getBoundingClientRect();
        return {role:i?'secondary':'primary', color:getComputedStyle(lab).color,
                x:r.x,y:r.y,w:r.width,h:r.height};});
      /* ONLY the label. Hiding every span also hid the expanding fill,
         the ripple and the shine, so the ground was sampled off a button
         with its effects stripped and read as the base fill. */
      row.querySelectorAll('a [data-label], a svg').forEach(e=>e.style.visibility='hidden');
      return JSON.stringify(out);
    })()`));
    await sleep(120);
    const img = await shoot();
    await ev(`document.querySelectorAll('${section} a [data-label], ${section} a svg').forEach(e=>e.style.visibility='')`);
    return info.map((b) => {
      const g = groundStats(img, b, 7);
      if (!g) return null;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(b.color);
      const text = [+m[1], +m[2], +m[3]];
      const ground = L(...text) > 0.4 ? g.light : g.dark;
      return { role: b.role, text, ground, cr: ratio(L(...text), L(...ground)), edge: edgeContrast(img, b) };
    }).filter(Boolean);
  }

  const rows = ["B1", "R2a", "R2b"];
  const verdict = (cr, edge) => (cr >= 4.5 ? (edge >= 3 ? "PASS" : "EDGE FAILS") : "LABEL FAILS");

  for (const [section, name] of [["#route-paper", "ON PAPER (#FDF8F0)"], ["#route-footage", "OVER FOOTAGE (worst of 6 frames in the hero window)"]]) {
    console.log(`\n=== ${name} ===`);
    console.log("  candidate  state".padEnd(30) + "label".padEnd(18) + "ground".padEnd(18) + "label CR".padEnd(11) + "edge".padEnd(9) + "verdict");
    await ev(`document.querySelector('${section}').scrollIntoView({block:'start'}); 1`);
    await sleep(700);

    const frames = section === "#route-footage" ? FRAMES : [null];
    for (const rowId of rows) {
      const states = [["rest", [], null], ...SEEKS.map((ms) => [`hover ${ms}ms`, ["hover"], ms]), ["active", ["hover", "active"], null]];
      for (const [label, classes, seekMs] of states) {
        // Worst reading across the sampled video frames.
        let worst = null;
        for (const ft of frames) {
          if (ft !== null) {
            await ev(`(async()=>{const v=document.getElementById('lab-video');v.currentTime=${ft};
              await new Promise(r=>{let d=false;const f=()=>{if(!d){d=true;r();}};
                v.addEventListener('seeked',f,{once:true});setTimeout(f,800);});return 1;})()`);
          }
          const res = await readState(section, rowId, classes, seekMs);
          for (const b of res) {
            const k = b.role;
            if (!worst || !worst[k] || b.cr < worst[k].cr) worst = { ...(worst || {}), [k]: b };
          }
        }
        for (const role of ["primary", "secondary"]) {
          const b = worst?.[role];
          if (!b) continue;
          console.log(`  ${rowId} ${role === "primary" ? "P" : "S"}  ${label}`.padEnd(30)
            + `rgb(${b.text})`.padEnd(18) + `rgb(${b.ground})`.padEnd(18)
            + `${b.cr.toFixed(2)}:1`.padEnd(11) + `${b.edge.toFixed(2)}`.padEnd(9) + verdict(b.cr, b.edge));
        }
      }
    }
  }
  console.log("");
  ws.close(); chrome.kill(); process.exit(0);
})();
