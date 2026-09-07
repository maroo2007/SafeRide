/**
 * Why are the phone screens washed out? Rendered pixel against source pixel.
 *
 * Reports the three settings that have to hold together (texture colour space,
 * renderer output + tone mapping, and what the material ACTUALLY holds after
 * GLTFLoader has parsed it) and then measures the thing that matters: the
 * orange "Current Trip" card as rendered, against the same card in
 * screen_01_home.png.
 *
 * The landmark is found the same way in both images — the most orange pixel,
 * then the mean of its neighbourhood — so no UV projection is needed and the
 * comparison is like for like. If the render is washed out the card is still
 * the most orange thing in it; it is just a paler orange, which is exactly the
 * number this prints.
 *
 * Usage: node build/diagnose-screen-colour.js <profile-dir> <out-dir> [url]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { decodePNG } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9707);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/** Orangeness: strong red, weak blue, green in between. */
const orangeness = (r, g, b) => r - b - Math.abs(r - g * 1.55) * 0.5;

/**
 * Find the most orange spot and return the mean colour of its neighbourhood.
 * `bounds` limits the search, in image pixels.
 */
function orangeLandmark(img, bounds, radius) {
  const { x0, y0, x1, y1 } = bounds;
  let best = -Infinity, bx = 0, by = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const o = (y * img.w + x) * img.ch;
      const s = orangeness(img.px[o], img.px[o + 1], img.px[o + 2]);
      if (s > best) { best = s; bx = x; by = y; }
    }
  }
  /*
   * The sample radius has to be scaled to the CARD, not to the image. The
   * first version used 1% of the image's short side: 10px inside a source card
   * ~900px wide, and 9px inside a rendered card ~100px wide. The second box
   * spilled onto the white UI around the card, and averaging white into orange
   * lifts blue hardest — which produced a 118-unit "wash" that was partly the
   * measurement. Same error as the ambient-shape diff: the neighbour got into
   * the number.
   */
  /*
   * Average the CARD, not the box. A square around the best pixel straddles
   * the card's edge, and the white UI beyond it lifts blue hardest — which is
   * indistinguishable from a wash. Only pixels that are themselves orange
   * count, by the same rule in both images, so the comparison stays like for
   * like.
   */
  const R = radius;
  const floor = best * 0.6;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = by - R; y <= by + R; y++) {
    for (let x = bx - R; x <= bx + R; x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const o = (y * img.w + x) * img.ch;
      if (orangeness(img.px[o], img.px[o + 1], img.px[o + 2]) < floor) continue;
      r += img.px[o]; g += img.px[o + 1]; b += img.px[o + 2]; n++;
    }
  }
  return { x: bx, y: by, score: Math.round(best), rgb: [r / n, g / n, b / n].map((v) => Math.round(v)), samples: n };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  /* ---- the source, for comparison -------------------------------------- */
  const srcBuf = fs.readFileSync("public/models/screens/screen_01_home.png");
  const src = decodePNG(srcBuf);
  /* The Current Trip card sits in the upper third, inside the bezel. */
  const SRC_R = 10;
  const srcMark = orangeLandmark(src, {
    x0: Math.round(src.w * 0.08), y0: Math.round(src.h * 0.08),
    x1: Math.round(src.w * 0.92), y1: Math.round(src.h * 0.32),
  }, SRC_R);
  console.log(`\n  SOURCE  screen_01_home.png ${src.w}x${src.h}`);
  console.log(`    most orange at ${srcMark.x},${srcMark.y}  mean rgb(${srcMark.rgb.join(", ")})  over ${srcMark.samples}px`);

  /* ---- the render ------------------------------------------------------- */
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
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

  const geo = JSON.parse(await ev(`(() => {
    const s = document.querySelector('#parent-app');
    const runway = s.querySelector('[style*="300vh"]') || s;
    const r = runway.getBoundingClientRect();
    return JSON.stringify({ top: Math.round(r.top + scrollY), h: Math.round(r.height), vh: innerHeight });
  })()`));
  const at = async (p) => {
    const span = geo.h - geo.vh;
    await ev(`(async()=>{scrollTo(0,${Math.round(geo.top + span * p)});await new Promise(r=>setTimeout(r,900));return 1})()`);
  };
  await at(0);
  for (let i = 0; i < 40; i++) {
    if (await ev("!!window.__phoneTour")) break;
    await sleep(500);
  }
  await at(0); await sleep(1200);

  const d = JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
  console.log(`\n  RENDERER`);
  console.log(`    outputColorSpace     ${d.outputColorSpace}`);
  console.log(`    toneMapping          ${d.toneMapping}`);
  console.log(`    toneMappingExposure  ${d.toneMappingExposure}`);
  console.log(`\n  TEXTURES`);
  console.log(`    colorSpace, all three  ${JSON.stringify(d.textureColorSpaces)}`);
  console.log(`\n  MATERIAL, as GLTFLoader left it`);
  console.log(`    color (baseColorFactor)  ${JSON.stringify(d.material.color)}`);
  console.log(`    emissive                 ${JSON.stringify(d.material.emissive)}`);
  console.log(`    emissiveIntensity        ${d.material.emissiveIntensity}`);
  console.log(`    toneMapped               ${d.material.toneMapped}`);
  console.log(`    map.colorSpace           ${d.material.mapColorSpace}`);
  console.log(`    emissiveMap.colorSpace   ${d.material.emissiveMapColorSpace}`);
  console.log(`    map === emissiveMap      ${d.material.mapIsEmissiveMap}`);
  console.log(`    map.flipY                ${d.material.mapFlipY}`);

  /*
   * Crop to the SCREEN, not to the phone, and not to a guessed half of the
   * canvas. The scene projects the screen mesh's bounding box for us.
   *
   * The previous version searched the right-hand half of the canvas for the
   * most orange pixel. When the screen showed no orange at all, the search
   * still returned something — the titanium frame, rgb(158, 142, 127),
   * orangeness score 0 — and the harness reported the FRAME's distance from
   * the source card as "95 units of wash". Third time this project a check has
   * looked adjacent to the thing instead of at it, so this one refuses to
   * report a delta it cannot justify.
   */
  const box = JSON.parse(await ev(`(() => {
    const c = document.querySelector('#parent-app canvas');
    const b = c.getBoundingClientRect();
    return JSON.stringify({ x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height });
  })()`));
  const rect = d.screenRect;
  console.log(`
  SCREEN RECT  ${rect.w}x${rect.h} px, projected from the mesh (canvas ${Math.round(box.w)}x${Math.round(box.h)})`);

  const clipOf = (r) => ({ x: box.x + r.x, y: box.y + r.y, width: r.w, height: r.h, scale: 1 });
  const shotFull = Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64");
  fs.writeFileSync(path.join(OUT, "render-chapter1.png"), shotFull);
  const shot = Buffer.from((await send("Page.captureScreenshot", { format: "png", clip: clipOf(rect) })).result.data, "base64");
  fs.writeFileSync(path.join(OUT, "screen-only-chapter1.png"), shot);
  const img = decodePNG(shot);

  /* One texture pixel is (rendered screen height / texture height) screen
     pixels. Keep the sample the same size ON THE CARD in both images. */
  const scale = img.h / src.h;
  const RENDER_R = Math.max(1, Math.round(SRC_R * scale));
  console.log(`    sample radius: source ${SRC_R}px, render ${RENDER_R}px  (screen ${img.h}px tall vs ${src.h}px of texture)`);

  /* Same fraction of the screen the source search used, so it is like for like. */
  const rendMark = orangeLandmark(img, {
    x0: Math.round(img.w * 0.08), y0: Math.round(img.h * 0.08),
    x1: Math.round(img.w * 0.92), y1: Math.round(img.h * 0.32),
  }, RENDER_R);
  console.log(`
  RENDERED  chapter 1, at rest`);
  console.log(`    most orange at ${rendMark.x},${rendMark.y}  mean rgb(${rendMark.rgb.join(", ")})  over ${rendMark.samples}px`);
  console.log(`    orangeness  source ${srcMark.score}   rendered ${rendMark.score}`);

  /*
   * The no-op test, applied to the harness itself: if the screen were black,
   * or turned away, or drawing no texture at all, would this still print a
   * delta? It would, and it did. So the score has to clear a bar first.
   */
  const FOUND = rendMark.score >= srcMark.score * 0.35;
  if (!FOUND) {
    console.log(`
  NO CARD FOUND. Best orangeness in the screen rect is ${rendMark.score}, against ${srcMark.score} in the source.`);
    console.log(`  The orange card is not being drawn. A delta computed from this pixel would`);
    console.log(`  describe whatever else happened to be there. Not reporting one.`);
    console.log(`  Look at ${path.join(OUT, "screen-only-chapter1.png")}.`);
  } else {
    const delta = rendMark.rgb.map((v, i) => v - srcMark.rgb[i]);
    const worst = Math.max(...delta.map(Math.abs));
    console.log(`
  DELTA  rendered - source = [${delta.join(", ")}]   worst channel ${worst} units`);
    console.log(`  ${worst <= 8 ? "within 8" : "OUT BY " + worst} of the source`);
  }

  /* ---- tint sweep ------------------------------------------------------ */
  if (await ev("!!window.__screenLab")) {
    console.log(`
  TINT SWEEP — material colour, never the texture
`);
    console.log(`    tint       rendered rgb              worst delta`);
    for (const hex of [0xffffff, 0xf0f0f0, 0xe6e6e6]) {
      await ev(`window.__screenLab.tint(${hex});1`);
      await sleep(500);
      /* Full frame, cropped in Node. Page.captureScreenshot's clip returned a
         view of the phone's BACK while an unclipped shot at the same instant
         showed the FRONT, so clip is not trusted here. The saved file is the
         whole frame, which is also what is worth looking at to choose a tint. */
      const b2 = Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64");
      const im = decodePNG(b2);
      const vb = JSON.parse(await ev(`(() => { const b = document.querySelector('#parent-app canvas').getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y) }); })()`));
      const rx = vb.x + rect.x, ry = vb.y + rect.y;
      const mk = orangeLandmark(im, {
        x0: Math.round(rx + rect.w * 0.08), y0: Math.round(ry + rect.h * 0.08),
        x1: Math.round(rx + rect.w * 0.92), y1: Math.round(ry + rect.h * 0.32),
      }, RENDER_R);
      const w = Math.max(...mk.rgb.map((v, i) => Math.abs(v - srcMark.rgb[i])));
      fs.writeFileSync(path.join(OUT, `tint-0x${hex.toString(16)}.png`), b2);
      console.log(`    0x${hex.toString(16).padEnd(9)} rgb(${mk.rgb.join(", ")})`.padEnd(48) + `${w}`);
    }
    await ev(`window.__screenLab.tint(0xffffff);1`);
  }
  console.log("");

  ws.close(); ch.kill(); process.exit(0);
})();
