/**
 * Settle the parallax GEOMETRY by measurement, before touching the motion.
 *
 * yPercent is a percentage of each layer's OWN height, so a layer's rendered
 * height IS its travel. Nothing about that can be settled by reading the
 * timeline — it has to be measured against the box the layers actually get.
 *
 * What this reports:
 *   - the scrub length, which start "0% 0%" -> end "100% 0%" makes equal to
 *     the trigger box's own height
 *   - each layer's rendered size, and its travel in px and in viewport heights
 *   - whether the section's ground is opaque everywhere the layers are not,
 *     sampled from the rendered pixels rather than from the CSS. This is the
 *     navbar's defect: the panel's rect was right and its paint was not.
 *   - the exact intrinsic size each asset needs to cover its travel
 *
 * Usage: node build/measure-parallax.js <profile-dir> <out-dir> [url] [--w=] [--h=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { decodePNG, L, ratio } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3000/";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9692);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!ok) fails.push(name);
};

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
  const shotBuf = async () => Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64");

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000);

  console.log(`\n  PARALLAX GEOMETRY — ${URL} at ${VW}x${VH}\n`);

  /* Where does the section start, and how long is the scrub? */
  const geo = JSON.parse(await ev(`(() => {
    const box = document.querySelector('[data-parallax-layers]');
    const sec = box.closest('section');
    const r = (el) => { const b = el.getBoundingClientRect();
      return { top: Math.round(b.top + scrollY), h: Math.round(b.height), w: Math.round(b.width) }; };
    return JSON.stringify({ box: r(box), section: r(sec), docH: document.documentElement.scrollHeight, vh: innerHeight });
  })()`));
  console.log(`  section starts at y=${geo.section.top}, ${geo.section.w}x${geo.section.h}`);
  console.log(`  trigger box ${geo.box.w}x${geo.box.h} at y=${geo.box.top}`);
  console.log(`  scrub length = the box's own height = ${geo.box.h}px (${(geo.box.h / geo.vh).toFixed(2)} viewports)\n`);

  /* Sample the scrub. start 0% 0% -> end 100% 0%: scrollY from box.top to box.top + box.h. */
  const at = async (p) => {
    const y = Math.round(geo.box.top + geo.box.h * p);
    await ev(`(async()=>{scrollTo(0,${y});await new Promise(r=>setTimeout(r,700));return 1})()`);
  };

  const readLayers = async () => JSON.parse(await ev(`(() => {
    const box = document.querySelector('[data-parallax-layers]');
    const out = [];
    for (const key of ['1','2','3','4']) {
      const el = box.querySelector('[data-parallax-layer="' + key + '"]');
      if (!el) continue;
      const b = el.getBoundingClientRect();
      const bb = box.getBoundingClientRect();
      const m = /matrix\\(([^)]+)\\)/.exec(getComputedStyle(el).transform);
      const ty = m ? Math.round(Number(m[1].split(',')[5]) * 10) / 10 : 0;
      out.push({ key, w: Math.round(b.width), h: Math.round(b.height),
        top: Math.round(b.top - bb.top), bottom: Math.round(b.bottom - bb.top), ty });
    }
    return JSON.stringify(out);
  })()`));

  await at(0); const start = await readLayers();
  const startBuf = await shotBuf(); fs.writeFileSync(path.join(OUT, "px-0-start.png"), startBuf);
  await at(0.5); const mid = await readLayers();
  fs.writeFileSync(path.join(OUT, "px-1-mid.png"), await shotBuf());
  await at(1); const end = await readLayers();
  const endBuf = await shotBuf(); fs.writeFileSync(path.join(OUT, "px-2-end.png"), endBuf);

  console.log("  LAYER TRAVEL — yPercent is a share of the layer's OWN height\n");
  console.log("   layer  rendered      yPercent  travel      = share of a viewport");
  const Y = { "1": 70, "2": 55, "3": 40, "4": 10 };
  const needed = {};
  for (const l of start) {
    const e = end.find((x) => x.key === l.key);
    const travel = Math.round((e.ty - l.ty) * 10) / 10;
    console.log(`   ${l.key}      ${String(l.w).padStart(4)}x${String(l.h).padStart(4)}    ${String(Y[l.key]).padStart(3)}%      ${String(travel).padStart(6)}px    ${(travel / VH).toFixed(2)} vh`);
    needed[l.key] = { rendered: { w: l.w, h: l.h }, travel };
  }

  /* Where each layer sits at the end. Ground showing above a layer is the
     design, not a defect — the layers are art ON the section's ground. What
     would be a defect is the PAGE showing, which the stacking probe covers. */
  console.log("\n  COVERAGE at the end of the scrub (box is " + geo.box.h + "px tall)\n");
  for (const l of end) {
    if (l.key === "3") continue;
    const covers = l.top <= 0 && l.bottom >= geo.box.h;
    console.log(`   layer ${l.key}: spans ${l.top} -> ${l.bottom} of the box   ${covers ? "fills it" : `ground above it for ${Math.max(0, l.top)}px`}`);
  }

  /*
   * The ground, from pixels. Sample a column down the section and confirm no
   * pixel is the page background showing through — this is the check the
   * navbar needed and did not have.
   */
  /*
   * The ground, from pixels — and sampled where the section is ON SCREEN.
   *
   * The first version of this sampled between the section's top and
   * top + height in SCREEN coordinates, at a scroll position where the section
   * had already left the viewport. It measured 13 rows at the very bottom of
   * the frame, found the paper the fade resolves into, and passed. 360 samples
   * of the wrong 13 rows is the same class of error as the navbar's rect check.
   *
   * What matters: in the band above the fade, is every pixel the section's own
   * dark ground or its art — never the page showing through? --paper is
   * luminance 0.90; --surface-dark is 0.001. So anything bright up there is
   * the page, not us.
   */
  /*
   * THE GROUND, MEASURED AS STACKING RATHER THAN AS BRIGHTNESS.
   *
   * Three versions of this asked "is anything up there brighter than --paper?"
   * and each found something legitimately bright that is not the page showing
   * through: the fade resolving into paper (because the first version sampled
   * rows that were off screen), the title at #fcfbf8, and then the hamburger,
   * which is fixed and floats over this section too. Adding a fourth exclusion
   * would have been chasing the reading instead of fixing the question.
   *
   * The question is whether the section's own ground is painted under every
   * point of its content. elementsFromPoint answers exactly that: it returns
   * the stack at a point, and .parallax has to be in it. A colour heuristic
   * cannot distinguish "the ground is missing" from "something white is
   * legitimately on top of the ground".
   */
  const groundProbe = async (label) => {
    const r = JSON.parse(await ev(`(() => {
      const box = document.querySelector('[data-parallax-layers]');
      const root = document.querySelector('[data-parallax-root]');
      const b = box.getBoundingClientRect();
      const top = Math.max(0, Math.ceil(b.top)), bottom = Math.min(innerHeight, Math.floor(b.bottom));
      if (bottom - top < 100) return JSON.stringify({ skipped: bottom - top });
      let sampled = 0, grounded = 0; const misses = [];
      for (let y = top + 4; y < bottom - 4; y += 12) {
        for (let x = 8; x < innerWidth - 8; x += 24) {
          sampled++;
          const stack = document.elementsFromPoint(x, y);
          if (stack.includes(root)) grounded++;
          else if (misses.length < 5) misses.push(x + ',' + y + ' -> ' + stack.slice(0, 2).map((e) => e.tagName + '.' + String(e.className).slice(0, 18)).join(' | '));
        }
      }
      return JSON.stringify({ sampled, grounded, misses, top, bottom });
    })()`));
    if (r.skipped !== undefined) { console.log(`   ${label}: SKIPPED — only ${r.skipped}px on screen`); return null; }
    console.log(`   ${label}: rows ${r.top}-${r.bottom}, ${r.grounded}/${r.sampled} points have the section's ground beneath them` +
      (r.misses.length ? `
      misses: ${r.misses.join("  ")}` : ""));
    return r;
  };
  console.log("\n  GROUND, as stacking\n");
  await at(0); const g0 = await groundProbe("scrub 0.00");
  await at(0.35); const g1 = await groundProbe("scrub 0.35");
  await at(0.7); const g2 = await groundProbe("scrub 0.70");
  const probes = [g0, g1, g2].filter(Boolean);
  check("the probe sampled a real grid, not a sliver",
    probes.length >= 2 && probes.every((p) => p.sampled > 1000), probes.map((p) => p.sampled).join(", "));
  check("the section's own ground is under every point of its content",
    probes.every((p) => p.grounded === p.sampled),
    probes.map((p) => `${p.grounded}/${p.sampled}`).join(", "));

  /*
   * What the real assets have to be.
   *
   * NOT derived from full coverage — that was considered and rejected (see the
   * module CSS): it is a fixed point at H = box / (1 - yPercent), which makes
   * layer 1 a 1440x3000 wallpaper. The layers are art on the section's ground.
   *
   * Each layer is `height: <N>svh; width: 100%; object-fit: cover`, so the
   * browser crops the asset to that box. The deliverable therefore needs
   * enough resolution never to upscale at the widest and tallest viewport we
   * care about, and its composition has to survive a centre crop.
   */
  const SVH = { "1": 0.40, "2": 0.46, "4": 0.60 };
  const MAXW = 2560, MAXH = 1440;
  console.log("\n  ASSET SPEC\n");
  console.log(`   measured at ${VW}x${VH}; heights are svh fractions so they scale with the viewport\n`);
  console.log("   layer   height   rendered here   aspect here   deliver at 2560x1440");
  for (const key of ["1", "2", "4"]) {
    const n = needed[key];
    if (!n) continue;
    const tall = Math.round(SVH[key] * MAXH);
    console.log(`   ${key}       ${(SVH[key] * 100).toFixed(0)}svh    ${String(n.rendered.w)}x${String(n.rendered.h).padEnd(5)}     ` +
      `${(n.rendered.w / n.rendered.h).toFixed(2)}:1        ${MAXW}x${tall}  (${(MAXW / tall).toFixed(2)}:1)`);
  }
  console.log("\n   object-fit: cover crops to the box, so the aspect above is a guide, not a");
  console.log("   contract. Keep the subject vertically centred and expect the sides to be");
  console.log("   cropped on narrower viewports. §3.6: under 300 KB each, under 800 KB total.");

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  geometry measured\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
