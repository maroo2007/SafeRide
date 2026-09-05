/**
 * Capture and measure the floating hamburger on the real page.
 *
 * build/hamburger-ground.js models the collar arithmetically against extracted
 * film frames. This closes the loop on the rendered result: it crops the
 * button out of live screenshots at several points in the scrub and measures
 * what actually got painted.
 *
 * The statistic: for every INK pixel (the white stroke), find the best
 * contrast available among its non-ink neighbours a few pixels out, then
 * report the WORST of those. In words — "every part of the stroke has at least
 * one strongly contrasting pixel beside it", which is the collar's whole job.
 * Delete the collar and this collapses toward 1.0 over a bright frame, which
 * is the point: run with --no-collar to see it do exactly that.
 *
 * It also answers the placement question by geometry rather than by eye:
 * whether the button's rect intersects the hero copy or the CTAs at any
 * scroll position.
 *
 * Usage: node build/shoot-hamburger.js <profile-dir> <out-dir> [url] [--no-collar]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { decodePNG, L, ratio } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3000/";
const NO_COLLAR = process.argv.includes("--no-collar");
const PORT = 9683;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/**
 * What the browser actually painted, measured off the crop.
 *
 * Identify the ink (the white stroke), build a Chebyshev distance transform
 * from it, and read the colour of the band 1.0 to 2.5 CSS px outside the ink.
 * That band is the collar: the ink is 4.5 CSS px wide and the collar 10.5, so
 * the collar shows 3 CSS px on each side, and the window stops half a pixel
 * short of both edges to stay clear of antialiasing.
 *
 * The first version of this walked a ring around each ink pixel and took the
 * worst result. It reported ~1.7:1 over every ground including plain paper —
 * a single antialiased pixel at a stroke crossing was enough to set the
 * number, so it described the sampling and not the design.
 */
function paintedCollar(img, scale) {
  const N = img.w * img.h;
  const lum = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const o = i * img.ch;
    lum[i] = L(img.px[o], img.px[o + 1], img.px[o + 2]);
  }
  const INK = 0.80;                       // the stroke is #fcfbf8, L ~ 0.96
  const BIG = 1e6;
  const d = new Float64Array(N);
  for (let i = 0; i < N; i++) d[i] = lum[i] >= INK ? 0 : BIG;
  const idx = (x, y) => y * img.w + x;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    let v = d[idx(x, y)];
    if (y > 0) v = Math.min(v, d[idx(x, y - 1)] + 1);
    if (x > 0) v = Math.min(v, d[idx(x - 1, y)] + 1);
    if (x > 0 && y > 0) v = Math.min(v, d[idx(x - 1, y - 1)] + 1);
    if (x < img.w - 1 && y > 0) v = Math.min(v, d[idx(x + 1, y - 1)] + 1);
    d[idx(x, y)] = v;
  }
  for (let y = img.h - 1; y >= 0; y--) for (let x = img.w - 1; x >= 0; x--) {
    let v = d[idx(x, y)];
    if (y < img.h - 1) v = Math.min(v, d[idx(x, y + 1)] + 1);
    if (x < img.w - 1) v = Math.min(v, d[idx(x + 1, y)] + 1);
    if (x < img.w - 1 && y < img.h - 1) v = Math.min(v, d[idx(x + 1, y + 1)] + 1);
    if (x > 0 && y < img.h - 1) v = Math.min(v, d[idx(x - 1, y + 1)] + 1);
    d[idx(x, y)] = v;
  }
  /*
   * The window is Chebyshev, which understates Euclidean distance by up to
   * root 2 on a diagonal. At hi = 2.5 CSS px a diagonal pixel is really 3.5 px
   * out — past the collar's 3 px, into the background — and that is what made
   * the "lightest band px" column read 1.32:1 over plain paper while the
   * median read 11.88:1. 1.8 * root 2 = 2.55, still inside the collar.
   */
  const lo = 1.0 * scale, hi = 1.8 * scale;
  const inkL = [], bandL = [];
  for (let i = 0; i < N; i++) {
    if (d[i] === 0) inkL.push(lum[i]);
    else if (d[i] >= lo && d[i] <= hi) bandL.push(lum[i]);   // the collar
  }
  if (!inkL.length || !bandL.length) return null;
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const ink = med(inkL);
  const band = med(bandL);
  const lightest = bandL[bandL.length - 1];
  return {
    ink, band,
    median: ratio(ink, band),
    lightest: ratio(ink, lightest),
    n: bandL.length,
  };
}

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

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000);

  if (NO_COLLAR) {
    await ev(`(()=>{const st=document.createElement('style');
      st.textContent='button svg path:nth-child(1),button svg path:nth-child(2){display:none!important}';
      document.head.appendChild(st);return 1})()`);
    await sleep(300);
  }

  /* Full-page shot plus a tight crop of the button, in PAGE coords. */
  const shoot = async (name, pad = 26) => {
    const box = await ev(`(()=>{const b=document.querySelector('button[aria-controls="site-menu"]').getBoundingClientRect();
      return JSON.stringify({x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height})})()`);
    const b = JSON.parse(box);
    const clip = { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, scale: 3 };
    const r = await send("Page.captureScreenshot", { format: "png", clip });
    const buf = Buffer.from(r.result.data, "base64");
    const file = path.join(OUT, name);
    fs.writeFileSync(file, buf);
    const m = paintedCollar(decodePNG(buf), clip.scale);
    console.log(m
      ? `  ${name.padEnd(30)} ink vs collar as painted: median ${m.median.toFixed(2)}:1   lightest band px ${m.lightest.toFixed(2)}:1`
      /* Not "no stroke": nothing BUT stroke. Every pixel in the crop cleared
         the ink threshold, so there is no band to compare against — which is
         what a white stroke on a white frame with no collar looks like from
         the outside. Only the --no-collar control reaches this. */
      : `  ${name.padEnd(30)} stroke is indistinguishable from its ground`);
    return m;
  };
  const full = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
  };

  const at = async (p) => {
    await ev(`(async()=>{const rw=document.querySelector('section[aria-labelledby="hero-headline"]');
      const max=rw.getBoundingClientRect().height-innerHeight; scrollTo(0,Math.round(max*${p}));
      await new Promise(r=>setTimeout(r,2200)); return 1;})()`);
  };

  console.log(`\n  ${NO_COLLAR ? "COLLAR DISABLED" : "as shipped"} — ${VW}x${VH}\n`);

  await ev("scrollTo(0,0);1"); await sleep(1500);
  await shoot("hb-1-idle.png");
  await full("hb-full-idle.png");

  for (const [p, name] of [[0.20, "hb-2-whiteout.png"], [0.40, "hb-3-mid.png"], [0.63, "hb-4-map.png"], [0.85, "hb-5-late.png"]]) {
    await at(p);
    await shoot(name);
  }

  /* Below the hero: flat --paper, where a bare white stroke is 1.02:1. */
  await ev(`(async()=>{document.querySelector('#features').scrollIntoView();
    await new Promise(r=>setTimeout(r,1600));return 1})()`);
  await shoot("hb-6-over-paper.png");
  await full("hb-full-over-paper.png");

  /* ---- placement: does it hit anything? ------------------------------- */
  console.log("\n  collision check — button rect against the hero copy and the CTAs\n");
  const report = await ev(`(async()=>{
    const rw=document.querySelector('section[aria-labelledby="hero-headline"]');
    const max=rw.getBoundingClientRect().height-innerHeight;
    const hit=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
    const named=()=>{
      const out=[];
      const h1=document.querySelector('#hero-headline'); if(h1) out.push(['headline',h1]);
      const eyebrow=document.querySelector('.label-mono'); if(eyebrow) out.push(['eyebrow',eyebrow]);
      document.querySelectorAll('a,button').forEach(el=>{
        const t=(el.textContent||'').trim();
        if(/Explore Platform|Our Story/i.test(t)) out.push(['cta: '+t,el]);
      });
      return out;
    };
    const rows=[];
    for(const p of [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1]){
      scrollTo(0,Math.round(max*p));
      await new Promise(r=>setTimeout(r,260));
      const btn=document.querySelector('button[aria-controls="site-menu"]').getBoundingClientRect();
      const clashes=[];let gap=1e9;
      for(const [name,el] of named()){
        const r=el.getBoundingClientRect();
        if(r.width===0&&r.height===0) continue;
        if(hit(btn,r)) clashes.push(name);
        else {
          const dx=Math.max(r.left-btn.right,btn.left-r.right,0);
          const dy=Math.max(r.top-btn.bottom,btn.top-r.bottom,0);
          gap=Math.min(gap,Math.round(Math.hypot(dx,dy)));
        }
      }
      rows.push({p,btn:[Math.round(btn.left),Math.round(btn.top),Math.round(btn.width),Math.round(btn.height)],clashes,gap});
    }
    return JSON.stringify(rows);
  })()`);
  for (const r of JSON.parse(report)) {
    console.log(`    progress ${String(r.p).padEnd(5)} button ${JSON.stringify(r.btn).padEnd(24)} ` +
      (r.clashes.length ? `OVERLAPS ${r.clashes.join(", ")}` : `clear, nearest ${r.gap}px`));
  }

  /* ---- menu open ------------------------------------------------------ */
  await ev("scrollTo(0,0);1"); await sleep(1200);
  await ev(`(async()=>{document.querySelector('button[aria-controls="site-menu"]').click();
    await new Promise(r=>setTimeout(r,1800));return 1})()`);
  await full("hb-full-menu-open.png");
  await shoot("hb-7-open-x.png");

  const state = await ev(`JSON.stringify({
    expanded:document.querySelector('button[aria-controls="site-menu"]').getAttribute('aria-expanded'),
    label:document.querySelector('button[aria-controls="site-menu"]').getAttribute('aria-label'),
    role:document.querySelector('#site-menu').getAttribute('role'),
    modal:document.querySelector('#site-menu').getAttribute('aria-modal'),
    focused:document.activeElement && document.activeElement.textContent.trim().slice(0,24),
    scrollY:Math.round(scrollY)
  })`);
  console.log("\n  menu open state: " + state);

  /*
   * Scroll must not move while the menu is open (§2.3).
   *
   * window.scrollBy() is the wrong probe: Lenis intercepts INPUT, so a
   * programmatic scroll moves the page whether it is stopped or not. That
   * first version reported 0 -> 600 and looked like a failure of the lock.
   * A CDP mouseWheel is a trusted input event and takes the path a real user
   * takes. The closed case is measured too, or "it did not move" would be
   * indistinguishable from a page that cannot scroll at all.
   */
  const wheel = async () => {
    const before = await ev("Math.round(scrollY)");
    for (let i = 0; i < 6; i++) {
      /* Centre of the viewport, not a fixed 700x500: at 390 wide that point is
         off-screen, the event misses every listener, and the page scrolls on
         the compositor as if nothing were stopping it. That reported the lock
         as broken on mobile when the probe was what missed. */
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Math.round(VW / 2), y: Math.round(VH / 2), deltaX: 0, deltaY: 200, pointerType: "mouse" });
      await sleep(120);
    }
    await sleep(900);
    const after = await ev("Math.round(scrollY)");
    return { before, after, moved: after - before };
  };
  const openLock = await wheel();
  console.log(`  scroll lock, menu OPEN   : ${openLock.before} -> ${openLock.after}  (moved ${openLock.moved}px)`);
  await ev(`(async()=>{document.querySelector('button[aria-controls="site-menu"]').click();
    await new Promise(r=>setTimeout(r,1400));return 1})()`);
  const closedLock = await wheel();
  console.log(`  same wheel, menu CLOSED  : ${closedLock.before} -> ${closedLock.after}  (moved ${closedLock.moved}px)`);
  const returned = await ev("document.activeElement===document.querySelector('button[aria-controls=\"site-menu\"]')");
  console.log("  focus returned to the toggle on close: " + returned);

  /* The focus ring, on the ground where --accent-warm alone would fail. */
  await ev(`(async()=>{document.querySelector('#features').scrollIntoView();
    await new Promise(r=>setTimeout(r,1200));return 1})()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await ev("document.querySelector('button[aria-controls=\"site-menu\"]').focus();1");
  await sleep(400);
  await shoot("hb-8-focus-ring-on-paper.png", 34);

  /* ---- the morph, caught half way ------------------------------------ *
   * The claim under test is that the collar tracks the ink THROUGH the
   * transition, not only at its two ends. A control that is legible at rest
   * and invisible half way through its own animation is not legible.
   *
   * Two things had to change to see it. Pausing the transitions with
   * getAnimations() and seeking to 50% did not hold for the 250ms the capture
   * takes — the shot came back as a finished X. And toggling the menu puts the
   * overlay behind the icon, so the interesting ground (the film) is covered
   * before the morph is half done. So: stretch --dur-state for the capture and
   * drive data-open directly, leaving the menu shut. Same CSS, same geometry,
   * a slower clock and the film still behind it.
   */
  await ev("scrollTo(0,0);1"); await sleep(1400);
  await ev(`(()=>{const st=document.createElement('style');st.id='slowmo';
    st.textContent=':root{--dur-state:6000ms}';document.head.appendChild(st);
    const b=document.querySelector('button[aria-controls="site-menu"]');
    if(b.getAttribute('aria-expanded')==='true')b.click();
    return 1})()`);
  await sleep(900);
  await ev(`document.querySelector('button[aria-controls="site-menu"]').setAttribute('data-open','true');1`);
  /* 500ms of a 6000ms morph, not 3000. --ease-out is cubic-bezier(.16,1,.3,1),
     which is almost done by the half-way point in TIME: at 3000ms the shot
     came back at 44 of 45 degrees, which is a picture of the end state. */
  await sleep(500);
  const midState = await ev(`(()=>{const p=document.querySelectorAll('button[aria-controls="site-menu"] svg path');
    const cs=getComputedStyle(p[2]);
    return JSON.stringify({dashArray:cs.strokeDasharray,dashOffset:cs.strokeDashoffset,
      transform:getComputedStyle(document.querySelector('button[aria-controls="site-menu"] svg')).transform})})()`);
  console.log("  mid-morph, half way: " + midState);
  await shoot("hb-9-morph-mid.png");
  await ev(`(()=>{document.getElementById('slowmo').remove();
    document.querySelector('button[aria-controls="site-menu"]').setAttribute('data-open','false');return 1})()`);
  await sleep(500);

  /* ---- reduced motion: instant, not faster ---------------------------- */
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: URL });
  await sleep(7000);
  /* One frame after the click, not zero: React has to commit before the
     effect that opens the menu runs. Reading in the same task reported
     display:none and looked like the menu never opened. One frame is still
     far inside any animation — the point is that there is nothing to wait
     for, not that it is quick. */
  const rm = await ev(`(async()=>{const b=document.querySelector('button[aria-controls="site-menu"]');
    b.click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const w=document.querySelector('#site-menu');
    return JSON.stringify({
      gsapTweens:(window.gsap&&window.gsap.globalTimeline.getChildren(true,true,false).length),
      cssAnimations:document.getAnimations().length,
      display:getComputedStyle(w).display,
      overlayOpacity:getComputedStyle(document.querySelector('#site-menu > div')).opacity,
      iconTransition:getComputedStyle(document.querySelector('button[aria-controls="site-menu"] svg')).transitionDuration});
  })()`);
  console.log("  reduced motion, immediately after the click: " + rm);
  await shoot("hb-10-reduced-instant.png");
  await full("hb-full-reduced-open.png");

  ws.close(); ch.kill(); process.exit(0);
})();
