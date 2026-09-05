/**
 * Ground measurement for the floating hamburger, scoped to the BUTTON'S RECT.
 *
 * build/header-ground.js measured a full-width 72px band and found 151 of 209
 * frames with no working ink in either direction — a geometric result: a band
 * spanning the whole frame crosses bright and dark regions simultaneously, so
 * there is nothing to invert to.
 *
 * The header is gone. What is left is a 48px square in one corner, which
 * crosses one region, not the whole frame. This re-runs the same measurement
 * scoped to that square to find out whether the corner is easier — and by how
 * much.
 *
 * Conservative by construction:
 *   - the WORST pixel anywhere in the button's box is reported, not the mean
 *     and not the pixels the stroke happens to cover, because the SVG rotates
 *     -45deg while open and the stroke sweeps the box.
 *   - blur is not modelled. Blur only pulls local extremes toward the mean, so
 *     a tint that passes without it passes with it.
 *
 * Threshold: the icon is a graphical object with an accessible name supplied by
 * aria-label, so WCAG 1.4.11 Non-text Contrast governs at 3:1, not 4.5:1.
 * Both are reported.
 *
 * Usage: node build/hamburger-ground.js <frames-dir>
 */
const { decodePNG, L, ratio } = require("./scrim-lab");
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
if (!DIR) { console.error("usage: node build/hamburger-ground.js <frames-dir>"); process.exit(1); }

const DUR = 2510 / 48;
const FPS = 4;
const SRC_W = 1920, SRC_H = 1080, FRAME_W = 960;

/** The button, in viewport pixels: 48px square inset from the top-right. */
const SIZE = 48, INSET = 20;

/* 390x844 stands in for mobile: saferide-hero-mobile.mp4 is a 720p re-encode
   of the same film, so the frames are the same content; only the object-cover
   mapping differs, and that is what is being modelled. */
const VIEWPORTS = [[1440, 900], [1920, 1080], [390, 844]];

const WHITE = [252, 251, 248];   // --paper
const INK   = [3, 9, 23];

function mapper(VW, VH) {
  const s = Math.max(VW / SRC_W, VH / SRC_H);
  const offX = (SRC_W * s - VW) / 2, offY = (SRC_H * s - VH) / 2;
  const k = FRAME_W / SRC_W;
  return (x, y) => [((x + offX) / s) * k, ((y + offY) / s) * k];
}

const cache = {};
const frame = (i) => {
  const f = path.join(DIR, `f${String(i).padStart(4, "0")}.png`);
  if (!(i in cache)) cache[i] = fs.existsSync(f) ? decodePNG(fs.readFileSync(f)) : null;
  return cache[i];
};

/**
 * Worst contrast for `text` anywhere in a rect, optionally under a flat tint
 * of `tint` at `alpha`. alpha 0 is the bare video.
 */
function worst(img, VW, VH, text, rect, tint = [3, 3, 2], alpha = 0) {
  const map = mapper(VW, VH);
  const tl = L(...text);
  let w = Infinity;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const [fx, fy] = map(x, y);
      const px = Math.min(img.w - 1, Math.max(0, Math.round(fx)));
      const py = Math.min(img.h - 1, Math.max(0, Math.round(fy)));
      const o = py * img.w * img.ch + px * img.ch;
      const r = tint[0] * alpha + img.px[o]     * (1 - alpha);
      const g = tint[1] * alpha + img.px[o + 1] * (1 - alpha);
      const b = tint[2] * alpha + img.px[o + 2] * (1 - alpha);
      const c = ratio(tl, L(r, g, b));
      if (c < w) w = c;
    }
  }
  return w;
}

const rectFor = (VW) => ({ x: VW - INSET - SIZE, y: INSET, w: SIZE, h: SIZE });

const frames = [];
for (let i = 0; i * (1 / FPS) <= DUR; i++) {
  const img = frame(i);
  if (img) frames.push({ i, t: i / FPS, img });
}

console.log(`\n  ${frames.length} frames, ${SIZE}px button inset ${INSET}px from the top-right corner`);
console.log(`  viewports: ${VIEWPORTS.map(([w, h]) => `${w}x${h}`).join(", ")}\n`);

/* ---- 1. bare, no treatment ------------------------------------------- */
let wWhite = Infinity, wInk = Infinity, badWhite3 = 0, badWhite45 = 0, badEither3 = 0;
const worstFrames = [];
for (const f of frames) {
  let cw = Infinity, ci = Infinity;
  for (const [VW, VH] of VIEWPORTS) {
    const r = rectFor(VW);
    cw = Math.min(cw, worst(f.img, VW, VH, WHITE, r));
    ci = Math.min(ci, worst(f.img, VW, VH, INK, r));
  }
  if (cw < 3) badWhite3++;
  if (cw < 4.5) badWhite45++;
  if (Math.max(cw, ci) < 3) badEither3++;
  wWhite = Math.min(wWhite, cw); wInk = Math.min(wInk, ci);
  worstFrames.push({ t: +f.t.toFixed(2), white: +cw.toFixed(2), ink: +ci.toFixed(2) });
}
console.log("  BARE STROKE, worst pixel in the button box, across the whole film");
console.log(`    white  (#fcfbf8) : worst ${wWhite.toFixed(2)}:1   frames under 3:1 ${badWhite3}/${frames.length}   under 4.5:1 ${badWhite45}/${frames.length}`);
console.log(`    ink    (#030917) : worst ${wInk.toFixed(2)}:1`);
console.log(`    neither ink clears 3:1 : ${badEither3}/${frames.length}   <- compare 151/209 for the full-width band`);
const w10 = [...worstFrames].sort((a, b) => a.white - b.white).slice(0, 8);
console.log("    worst frames for white: " + w10.map((f) => `${f.t}s(${f.white})`).join("  "));

/* ---- 2. a local dark plate ------------------------------------------- */
console.log("\n  A LOCAL DARK TINT under the white stroke (same --surface-dark as the header used)");
console.log("    alpha   worst   frames <3:1   frames <4.5:1");
for (const a of [0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6]) {
  let w = Infinity, b3 = 0, b45 = 0;
  for (const f of frames) {
    let c = Infinity;
    for (const [VW, VH] of VIEWPORTS) c = Math.min(c, worst(f.img, VW, VH, WHITE, rectFor(VW), [3, 3, 2], a));
    if (c < 3) b3++;
    if (c < 4.5) b45++;
    w = Math.min(w, c);
  }
  console.log(`    ${a.toFixed(2)}    ${w.toFixed(2)}:1`.padEnd(20) + `${String(b3).padEnd(14)}${b45}`);
}

/* ---- 3. the alternative that does not depend on the video at all ------ */
const halo = ratio(L(...WHITE), L(3, 3, 2));
console.log(`\n  A DARK HALO on the stroke itself (a wider #030302 stroke painted under the`);
console.log(`  white one) puts a known colour immediately adjacent to the ink, so the`);
console.log(`  video never enters the ratio: ${halo.toFixed(2)}:1, every frame, every viewport.`);
console.log("");

/* ------------------------------------------------------------------ *
 * 4. The halo, sized exactly.
 *
 * A wider dark stroke painted UNDER the white one. Its alpha is flat and
 * known, so the colour immediately adjacent to the white ink is
 *   alpha * #030302 + (1 - alpha) * whatever is behind
 * which is precisely the sweep in section 2 — the same arithmetic, now
 * describing a 3px collar rather than a 48px plate.
 * ------------------------------------------------------------------ */
console.log("  THE HALO, sized: white stroke on a dark collar of alpha a, over the film");
console.log("    alpha   worst   frames <3:1   frames <4.5:1");
for (const a of [0.55, 0.6, 0.62, 0.65, 0.7]) {
  let w = Infinity, b3 = 0, b45 = 0;
  for (const f of frames) {
    let c = Infinity;
    for (const [VW, VH] of VIEWPORTS) c = Math.min(c, worst(f.img, VW, VH, WHITE, rectFor(VW), [3, 3, 2], a));
    if (c < 3) b3++;
    if (c < 4.5) b45++;
    w = Math.min(w, c);
  }
  console.log(`    ${a.toFixed(2)}    ${w.toFixed(2)}:1`.padEnd(20) + `${String(b3).padEnd(14)}${b45}`);
}

/* ------------------------------------------------------------------ *
 * 5. THE GROUND THE FILM MEASUREMENT CANNOT SEE.
 *
 * The button is fixed and always visible, so it also floats over the flat
 * content sections below the hero. Those are not video; they are known
 * tokens, and the arithmetic is exact.
 * ------------------------------------------------------------------ */
const PAPER = [253, 248, 240];   // --paper, the light section ground
const CARD  = [255, 255, 255];   // --card
const DARK  = [3, 3, 2];         // --surface-dark, the dark section ground
const over = (a, bg) => [0, 1, 2].map((i) => DARK[i] * a + bg[i] * (1 - a));

console.log("\n  BELOW THE HERO the ground is a flat token, not film:");
console.log("    ground        bare white   white on a 0.62 collar   collar vs ground");
for (const [name, bg] of [["--paper", PAPER], ["--card", CARD], ["--surface-dark", DARK]]) {
  const bare = ratio(L(...WHITE), L(...bg));
  const collar = over(0.62, bg);
  const onCollar = ratio(L(...WHITE), L(...collar));
  const collarVsBg = ratio(L(...collar), L(...bg));
  console.log(
    `    ${name.padEnd(14)}${(bare.toFixed(2) + ":1").padEnd(13)}${(onCollar.toFixed(2) + ":1").padEnd(24)}${collarVsBg.toFixed(2)}:1`,
  );
}
console.log("");
