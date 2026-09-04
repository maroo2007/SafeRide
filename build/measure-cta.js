/**
 * Measure the CTA variants as actually composited.
 *
 * backdrop-filter is not modelled here, it is RENDERED. Blur is difficult to
 * approximate honestly (it changes the local extremes, which is exactly what
 * decides whether a label reads), so this hides the label, screenshots the
 * page, and samples the pixels the label sits on. Same method that was
 * validated against the hero to within 1%.
 *
 * Usage: node build/measure-cta.js <profile-dir> [url]
 */
const { spawn } = require("child_process");
const http = require("http");
const { decodePNG, L, ratio } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2];
const URL = process.argv[3] || "http://localhost:3000/cta-lab";
const PORT = 9481;
const VW = 1440, VH = 900;
/** Hero copy is visible over progress 0 -> 0.12, i.e. video 0 -> 6.27s. */
const FRAMES = Array.from({ length: 26 }, (_, i) => +(i * 0.251).toFixed(3));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/** Percentile of the direction that fights the text hardest. */
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

/** Strongest boundary contrast the border achieves against what is outside it. */
function edgeContrast(img, r) {
  const midY = Math.round(r.y + r.h / 2);
  const read = (x) => { const o = midY * img.w * img.ch + x * img.ch; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
  let best = 0, at = null;
  // border sits within ~2px of the rounded edge; probe a few columns either side
  for (const dx of [0, 1, 2]) {
    const inner = read(Math.round(r.x) + dx);
    const outer = read(Math.max(0, Math.round(r.x) - 3 - dx));
    const c = ratio(L(...inner), L(...outer));
    if (c > best) { best = c; at = { inner, outer }; }
  }
  return { c: best, ...at };
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
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (!r.result || !r.result.result || r.result.result.value === undefined) throw new Error(JSON.stringify(r).slice(0, 500));
    return r.result.result.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(8000);

  const shoot = async () => decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  /* ---------------- paper ---------------- */
  const paperInfo = JSON.parse(await evaluate(`(async () => {
    document.getElementById('on-paper').scrollIntoView({block:'start'});
    await new Promise(r=>setTimeout(r,700));
    const out=[];
    document.querySelectorAll('#on-paper [data-pair]').forEach(p=>{
      p.querySelectorAll('a').forEach((a,i)=>{
        const r=a.getBoundingClientRect(); const cs=getComputedStyle(a);
        out.push({key:p.dataset.pair+(i?'/secondary':'/primary'), x:r.x,y:r.y,w:r.width,h:r.height,
                  color:cs.color, border:cs.borderTopColor});
      });
    });
    document.querySelectorAll('#on-paper a > span').forEach(e=>e.style.visibility='hidden');
    document.querySelectorAll('#on-paper a > svg').forEach(e=>e.style.visibility='hidden');
    return JSON.stringify(out);
  })()`));
  await sleep(400);
  const paperImg = await shoot();

  console.log("\n=== ON PAPER (#FDF8F0) — label ground and boundary ===");
  console.log("  variant".padEnd(26) + "label".padEnd(20) + "ground".padEnd(20) + "label CR".padEnd(11) + "edge CR   verdict");
  const seen = new Set();
  for (const b of paperInfo) {
    const fill = b.key.split("-")[0];
    if (seen.has(fill + b.key.split("/")[1])) continue;      // one row per fill+role
    seen.add(fill + b.key.split("/")[1]);
    const g = groundStats(paperImg, b, 6); if (!g) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(b.color);
    const text = [+m[1], +m[2], +m[3]];
    const isLight = L(...text) > 0.4;
    const ground = isLight ? g.light : g.dark;
    const cr = ratio(L(...text), L(...ground));
    const e = edgeContrast(paperImg, b);
    const v = cr >= 4.5 ? (e.c >= 3 ? "PASS" : "label ok / EDGE FAILS") : "LABEL FAILS";
    console.log("  " + b.key.replace("-", " ").padEnd(24) + `rgb(${text})`.padEnd(20)
      + `rgb(${ground})`.padEnd(20) + `${cr.toFixed(2)}:1`.padEnd(11) + `${e.c.toFixed(2)}:1`.padEnd(10) + v);
  }

  /* ---------------- over footage ---------------- */
  const footInfo = JSON.parse(await evaluate(`(async () => {
    document.querySelectorAll('#on-paper a > span, #on-paper a > svg').forEach(e=>e.style.visibility='');
    document.getElementById('over-footage').scrollIntoView({block:'start'});
    await new Promise(r=>setTimeout(r,700));
    const out=[];
    document.querySelectorAll('#over-footage [data-pair]').forEach(p=>{
      p.querySelectorAll('a').forEach((a,i)=>{
        const r=a.getBoundingClientRect(); const cs=getComputedStyle(a);
        out.push({key:p.dataset.pair+(i?'/secondary':'/primary'), x:r.x,y:r.y,w:r.width,h:r.height, color:cs.color});
      });
    });
    document.querySelectorAll('#over-footage a > span, #over-footage a > svg').forEach(e=>e.style.visibility='hidden');
    return JSON.stringify(out);
  })()`));

  const worst = new Map();
  for (const ft of FRAMES) {
    await evaluate(`(async () => { const v=document.getElementById('lab-video');
      v.currentTime=${ft};
      await new Promise(r=>{ let done=false; const f=()=>{if(!done){done=true;r();}};
        v.addEventListener('seeked',f,{once:true}); setTimeout(f,900); });
      await new Promise(r=>setTimeout(r,120)); return 'ok'; })()`);
    const img = await shoot();
    for (const b of footInfo) {
      const g = groundStats(img, b, 6); if (!g) continue;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(b.color);
      const text = [+m[1], +m[2], +m[3]];
      const isLight = L(...text) > 0.4;
      const ground = isLight ? g.light : g.dark;
      const cr = ratio(L(...text), L(...ground));
      const e = edgeContrast(img, b);
      const prev = worst.get(b.key);
      if (!prev || cr < prev.cr) worst.set(b.key, { ...(prev || {}), cr, ground, text, t: ft });
      const cur = worst.get(b.key);
      if (cur.edge === undefined || e.c < cur.edge) { cur.edge = e.c; cur.edgeT = ft; }
    }
  }

  console.log("\n=== OVER FOOTAGE — worst frame in the hero's visible window (video 0-6.27s) ===");
  console.log("  variant".padEnd(26) + "label".padEnd(20) + "worst ground".padEnd(20) + "label CR".padEnd(11) + "edge CR".padEnd(10) + "at t    verdict");
  const seen2 = new Set();
  for (const [key, w] of worst) {
    const fill = key.split("-")[0], role = key.split("/")[1];
    if (seen2.has(fill + role)) continue;
    seen2.add(fill + role);
    const labelOk = w.cr >= 4.5, edgeOk = w.edge >= 3;
    const v = labelOk && edgeOk ? "PASS" : !labelOk ? "LABEL FAILS" : "label ok / EDGE FAILS";
    console.log("  " + key.replace("-", " ").padEnd(24) + `rgb(${w.text})`.padEnd(20)
      + `rgb(${w.ground})`.padEnd(20) + `${w.cr.toFixed(2)}:1`.padEnd(11)
      + `${w.edge.toFixed(2)}:1`.padEnd(10) + `${w.t}s`.padEnd(8) + v);
  }
  console.log("");
  ws.close(); chrome.kill(); process.exit(0);
})();
