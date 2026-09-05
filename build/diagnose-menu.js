/**
 * A guard for the menu's open animation, run in a real browser.
 *
 * "The menu opened" is true of a broken open — it was true of the build that
 * painted the links over bare film for 465ms. So this checks three things
 * every frame, not that it opened:
 *
 *   1. CONTAINMENT — every link's rect is inside the panel's rect.
 *   2. GROUND — every link has something opaque behind it. A link can be
 *      inside the panel's rect and still be drawn over the video, because the
 *      panel's rect is not the same thing as the panel's paint. This is the
 *      check the first version did not have, and the defect it did not catch.
 *   3. END STATE — every link is fully visible: not clipped by its own
 *      entrance mask, opacity 1, no residual transform.
 *
 * Then it captures the open at several points on a 10x-slowed clock, and
 * reports frame intervals during the animation.
 *
 * Exits non-zero if any check fails, so it can be run as a guard rather than
 * read as a report.
 *
 * Usage: node build/diagnose-menu.js <profile-dir> <out-dir> [url] [--w=] [--h=] [--gpu]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3000/";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const GPU = process.argv.includes("--gpu");
const HEADED = process.argv.includes("--headed");
const VW = arg("w", 1440), VH = arg("h", 900);
const PORT = arg("port", 9685);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/*
 * Shared page-side helpers.
 *
 * `layers` filters to the three .backdropLayer divs by excluding the ambient
 * shapes container, which is also a div. The first version of this did not,
 * and the shapes container is full-width from the start — so every link
 * always looked covered and the ground check could never fail. A guard that
 * cannot fail is not a guard.
 */
const HELPERS = `
  const q = (s) => document.querySelector(s);
  const panelEl = () => q('#site-menu nav[aria-label="Site"]');
  const wrapperEl = () => q('#site-menu ul') && q('#site-menu ul').parentElement;
  const linkEls = () => [...document.querySelectorAll('#site-menu ul a')];
  const layerEls = () => {
    const p = panelEl(); if (!p) return [];
    return [...p.firstElementChild.children].filter(
      (e) => e.tagName === 'DIV' && e.querySelector('svg') === null);
  };
  const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const covers = (outer, inner) => outer && inner &&
    inner.x >= outer.x - 1 && inner.y >= outer.y - 1 &&
    inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;
  const opaquePanel = () => {
    const p = panelEl(); if (!p) return false;
    const bg = getComputedStyle(p).backgroundColor;
    const m = /rgba?\\(([^)]+)\\)/.exec(bg);
    if (!m) return false;
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return parts.length < 4 || parts[3] >= 0.999;
  };
`;

const RECORDER = `(() => {
${HELPERS}
  window.__samples = [];
  const t0 = performance.now();
  let last = t0;
  const tick = () => {
    const now = performance.now();
    const w = wrapperEl(), p = R(panelEl()), ls = layerEls().map(R), op = opaquePanel();
    window.__samples.push({
      t: Math.round(now - t0),
      dt: Math.round((now - last) * 100) / 100,
      panel: p,
      panelOpaque: op,
      wrapper: R(w),
      wrapperScroll: w ? Math.round(w.scrollTop) : null,
      layers: ls,
      links: linkEls().map((el) => ({
        label: el.textContent.trim().slice(0, 12),
        rect: R(el),
        li: R(el.closest('li')),
        opacity: getComputedStyle(el).opacity,
        /* Ground: the panel's own paint, or a layer that covers this link. */
        onGround: (op && covers(p, R(el))) || ls.some((l) => covers(l, R(el))),
      })),
      pageScroll: Math.round(window.scrollY),
    });
    last = now;
    if (now - t0 < 2600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 1;
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  /*
   * --headed opens a real window on a real GPU. Headless Chrome rasterises in
   * software here, and the baseline proves that is not a fair clock: a static
   * page with one video should hold 16.7ms and it measures 18.4 with a p95 of
   * 30.5. Frame timing claims are made from the headed run; the headless one
   * is only good for comparing two builds against each other.
   */
  const flags = ["--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${P}`, `--window-size=${VW},${VH}`, "about:blank"];
  if (!HEADED) {
    flags.unshift("--headless=new");
    if (!GPU) flags.unshift("--disable-gpu");
    else flags.unshift("--use-angle=swiftshader", "--enable-gpu-rasterization");
  }
  const ch = spawn(CHROME, flags, { stdio: "ignore" });

  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500); try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000);
  await ev("scrollTo(0,0);1"); await sleep(1200);

  /* Experiments, to attribute the two long frames at the start of the open. */
  if (process.argv.includes("--no-shapes")) {
    await ev(`(()=>{const st=document.createElement('style');
      st.textContent='#site-menu nav > div:first-child > div:last-child{display:none!important}';
      document.head.appendChild(st);return 1})()`);
  }
  if (process.argv.includes("--no-video")) {
    await ev(`(()=>{document.querySelectorAll('video').forEach(v=>{v.pause();v.remove()});return 1})()`);
  }
  await sleep(400);

  /*
   * BASELINE FIRST. Frame intervals during the open mean nothing without the
   * cost of the page standing still: the hero video is decoding behind the
   * overlay the whole time, and it is a candidate for the jank on its own.
   */
  const baseline = JSON.parse(await ev(`(async()=>{
    const d=[];let last=performance.now();const t0=last;
    await new Promise((res)=>{const tick=()=>{const n=performance.now();
      d.push(Math.round((n-last)*100)/100);last=n;
      if(n-t0<1500)requestAnimationFrame(tick);else res();};requestAnimationFrame(tick);});
    return JSON.stringify(d.slice(1));})()`));
  const bs = [...baseline].sort((a, b) => a - b);
  const bp = (q) => bs[Math.min(bs.length - 1, Math.floor(bs.length * q))];
  console.log(`  BASELINE, menu shut, video playing (${bs.length} frames): p50 ${bp(0.5)}ms  p95 ${bp(0.95)}ms  max ${bs[bs.length - 1]}ms
`);

  await ev(RECORDER);
  await ev(`document.querySelector('button[aria-controls="site-menu"]').click();1`);
  await sleep(3200);
  const samples = JSON.parse(await ev("JSON.stringify(window.__samples)"));
  fs.writeFileSync(path.join(OUT, `samples-${VW}x${VH}.json`), JSON.stringify(samples, null, 1));

  const fails = [];
  console.log(`\n  ${VW}x${VH}${GPU ? " (gpu)" : ""} — ${samples.length} frames over ${samples[samples.length - 1].t}ms`);
  console.log(`  ${URL}\n`);

  const inside = (a, b) => a && b && a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;

  /* 1. containment */
  const outFrames = samples.filter((s) => s.links.some((l) => !inside(l.rect, s.panel)));
  console.log(`  1. every link inside the panel's rect      ${outFrames.length === 0 ? "PASS" : "FAIL"}   ${outFrames.length}/${samples.length} frames with a link outside`);
  if (outFrames.length) {
    fails.push("containment");
    const f = outFrames[0], l = f.links.find((x) => !inside(x.rect, f.panel));
    console.log(`       first at t=${f.t}ms: "${l.label}" ${JSON.stringify(l.rect)} vs panel ${JSON.stringify(f.panel)}`);
  }

  /* 2. ground */
  const bare = samples.filter((s) => s.links.some((l) => !l.onGround));
  console.log(`  2. every link has opaque ground behind it  ${bare.length === 0 ? "PASS" : "FAIL"}   ${bare.length}/${samples.length} frames with a link over bare film`);
  if (bare.length) {
    fails.push("ground");
    const f = bare[0], l = f.links.find((x) => !x.onGround);
    console.log(`       first at t=${f.t}ms: "${l.label}" ${JSON.stringify(l.rect)}`);
    console.log(`       panel ${JSON.stringify(f.panel)} opaque=${f.panelOpaque}  layers at x = [${f.layers.map((x) => x.x).join(", ")}]`);
    console.log(`       last  at t=${bare[bare.length - 1].t}ms  — ${bare[bare.length - 1].t - f.t}ms of copy over film`);
  }

  /* 3. end state */
  const last = samples[samples.length - 1];
  const notVisible = last.links.filter((l) => !inside(l.rect, l.li) || +l.opacity < 0.999);
  console.log(`  3. every link fully revealed at the end    ${notVisible.length === 0 ? "PASS" : "FAIL"}`);
  for (const l of last.links) {
    console.log(`       ${l.label.padEnd(12)} ${JSON.stringify(l.rect)}  in panel ${inside(l.rect, last.panel)}  unmasked ${inside(l.rect, l.li)}  opacity ${l.opacity}`);
  }
  if (notVisible.length) fails.push("end state");

  /* frame timing */
  const during = samples.filter((s) => s.t > 30 && s.t < 1400).map((s) => s.dt).sort((a, b) => a - b);
  const pct = (p) => during[Math.min(during.length - 1, Math.floor(during.length * p))];
  console.log(`\n  frame intervals during the open (${during.length} frames): p50 ${pct(0.5)}ms  p95 ${pct(0.95)}ms  max ${during[during.length - 1]}ms`);
  console.log(`  frames longer than 32ms: ${during.filter((d) => d > 32).length}`);
  /* WHERE the long frames are, not just how many. A cluster at t~0 is the
     panel's first paint; a cluster at the end is clearProps writing back. */
  const longs = samples.filter((s) => s.t > 30 && s.t < 1500 && s.dt > 32);
  if (longs.length) console.log(`    at t = ${longs.map((s) => `${s.t}ms(${s.dt})`).join("  ")}`);

  /* ---- pictures, on a slowed clock ------------------------------------ */
  console.log("");
  for (const ms of [150, 300, 450, 600, 800, 1100, 1500]) {
    await ev(`(async()=>{const b=document.querySelector('button[aria-controls="site-menu"]');
      if(b.getAttribute('aria-expanded')==='true'){b.click();await new Promise(r=>setTimeout(r,1300));}
      scrollTo(0,0); return 1})()`);
    await sleep(400);
    await ev(`(()=>{window.__t0=performance.now();
      document.querySelector('button[aria-controls="site-menu"]').click();return 1})()`);
    await sleep(ms);
    const st = JSON.parse(await ev(`(()=>{
${HELPERS}
      const p=R(panelEl()), ls=layerEls().map(R), op=opaquePanel();
      const links=linkEls().map((el)=>({label:el.textContent.trim().slice(0,10),rect:R(el),
        onGround:(op&&covers(p,R(el)))||ls.some((l)=>covers(l,R(el)))}));
      return JSON.stringify({elapsed:Math.round(performance.now()-window.__t0),panel:p,panelOpaque:op,
        layers:ls.map((l)=>l.x),bare:links.filter((l)=>!l.onGround).map((l)=>l.label)});
    })()`));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `open-${String(ms).padStart(4, "0")}ms.png`), Buffer.from(shot.result.data, "base64"));
    console.log(`   t~${String(st.elapsed).padStart(4)}ms  panel x=${String(st.panel.x).padStart(4)} opaque=${st.panelOpaque}  layer xs=[${st.layers.join(", ")}]  over film: ${st.bare.length ? st.bare.join(",") : "none"}`);
  }

  console.log(fails.length ? `\n  FAILED: ${fails.join(", ")}\n` : "\n  all checks pass\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
