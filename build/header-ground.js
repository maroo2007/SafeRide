/**
 * Derive the navbar's light/dark schedule from the film, by measurement.
 *
 * Spec 2.3 says to sample "approximate brightness at known progress ranges
 * (they're predictable from the clip breakdown)". We can do better than
 * approximate: the frames are extracted and build/scrim-lab.js already
 * composites and measures a rect honouring object-cover.
 *
 * The header band is the top ~72px of the viewport, full width. What decides
 * the ink is not the band's mean — a header that is legible on average and
 * invisible over one bright corner is not legible. So this reports the worst
 * case for BOTH inks at every frame, and the schedule is built from that.
 *
 * Usage: node build/header-ground.js <frames-dir>
 */
const { decodePNG, L, ratio } = require("./scrim-lab");
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
const DUR = 2510 / 48;
const FPS = 4;
const SRC_W = 1920, SRC_H = 1080, FRAME_W = 960;

/** Header band, in viewport pixels. */
const BAND = { x: 0, y: 0, h: 72 };
const VIEWPORTS = [[1440, 900], [1920, 1080]];

const INK = [3, 9, 23];       // dark ink
const PAPER = [252, 251, 248]; // light ink

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

/** Worst-case contrast for a given ink across the whole band. */
function worstFor(img, VW, VH, text) {
  const map = mapper(VW, VH);
  const tl = L(...text);
  let worst = Infinity;
  for (let y = BAND.y; y < BAND.y + BAND.h; y += 3) {
    for (let x = 0; x < VW; x += 6) {
      const [fx, fy] = map(x, y);
      const px = Math.min(img.w - 1, Math.max(0, Math.round(fx)));
      const py = Math.min(img.h - 1, Math.max(0, Math.round(fy)));
      const o = py * img.w * img.ch + px * img.ch;
      const c = ratio(tl, L(img.px[o], img.px[o + 1], img.px[o + 2]));
      if (c < worst) worst = c;
    }
  }
  return worst;
}

const rows = [];
for (let i = 0; i * (1 / FPS) <= DUR; i++) {
  const img = frame(i);
  if (!img) continue;
  const t = i / FPS;
  let ink = Infinity, paper = Infinity;
  for (const [VW, VH] of VIEWPORTS) {
    ink = Math.min(ink, worstFor(img, VW, VH, INK));
    paper = Math.min(paper, worstFor(img, VW, VH, PAPER));
  }
  rows.push({ t: +t.toFixed(2), p: +(t / DUR).toFixed(4), ink: +ink.toFixed(2), paper: +paper.toFixed(2) });
}

console.log("\n  header band, top 72px, worst pixel across both viewports\n");
console.log("   progress   t      dark ink   paper ink   better    either >= 4.5?");
for (const r of rows) {
  if (Math.round(r.t * FPS) % 4 !== 0) continue;   // print one row per second
  const better = r.ink >= r.paper ? "ink" : "paper";
  const best = Math.max(r.ink, r.paper);
  console.log(
    `   ${r.p.toFixed(3).padEnd(10)} ${String(r.t).padEnd(6)} ${String(r.ink).padEnd(10)} ${String(r.paper).padEnd(11)} ${better.padEnd(9)} ${best >= 4.5 ? "yes" : "NO  <-- neither ink works"}`,
  );
}

const fails = rows.filter((r) => Math.max(r.ink, r.paper) < 4.5);
console.log(`\n  frames where NEITHER ink clears 4.5:1 : ${fails.length} of ${rows.length}`);
if (fails.length) {
  console.log("    " + fails.slice(0, 14).map((f) => `${f.t}s(${Math.max(f.ink, f.paper).toFixed(1)})`).join("  "));
}

/* Build the switch schedule: contiguous runs where one ink is better. */
const runs = [];
for (const r of rows) {
  const want = r.ink >= r.paper ? "ink" : "paper";
  const last = runs[runs.length - 1];
  if (last && last.want === want) { last.to = r.p; last.worst = Math.min(last.worst, Math.max(r.ink, r.paper)); }
  else runs.push({ want, from: r.p, to: r.p, worst: Math.max(r.ink, r.paper) });
}
console.log("\n  raw runs (before merging short ones):", runs.length);
const MIN = 0.02;
const merged = [];
for (const run of runs) {
  const last = merged[merged.length - 1];
  if (last && (run.to - run.from < MIN)) { last.to = run.to; last.worst = Math.min(last.worst, run.worst); }
  else if (last && last.want === run.want) { last.to = run.to; last.worst = Math.min(last.worst, run.worst); }
  else merged.push({ ...run });
}
console.log("  merged schedule (runs shorter than 0.02 progress absorbed):\n");
for (const m of merged) {
  console.log(`    ${m.from.toFixed(3)} -> ${m.to.toFixed(3)}   ${m.want.padEnd(6)}  worst in run ${m.worst.toFixed(2)}:1`);
}

/* ------------------------------------------------------------------ *
 * A tinted surface instead. Blur is deliberately NOT modelled: it only
 * reduces local extremes, so a tint that passes without it passes with
 * it. Conservative by construction.
 * ------------------------------------------------------------------ */
const DARK = [3, 3, 2];
function worstWithTint(img, VW, VH, text, alpha) {
  const map = mapper(VW, VH);
  const tl = L(...text);
  let worst = Infinity;
  for (let y = BAND.y; y < BAND.y + BAND.h; y += 3) {
    for (let x = 0; x < VW; x += 6) {
      const [fx, fy] = map(x, y);
      const px = Math.min(img.w - 1, Math.max(0, Math.round(fx)));
      const py = Math.min(img.h - 1, Math.max(0, Math.round(fy)));
      const o = py * img.w * img.ch + px * img.ch;
      const r = DARK[0] * alpha + img.px[o] * (1 - alpha);
      const g = DARK[1] * alpha + img.px[o + 1] * (1 - alpha);
      const b = DARK[2] * alpha + img.px[o + 2] * (1 - alpha);
      const c = ratio(tl, L(r, g, b));
      if (c < worst) worst = c;
    }
  }
  return worst;
}

console.log("");
console.log("  A DARK TINT under PAPER ink, worst frame in the whole film:");
console.log("");
console.log("    alpha   worst contrast   frames under 4.5");
for (const a of [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7]) {
  let worst = Infinity, bad = 0;
  for (let i = 0; i * (1 / FPS) <= DUR; i++) {
    const img = frame(i); if (!img) continue;
    let w = Infinity;
    for (const [VW, VH] of VIEWPORTS) w = Math.min(w, worstWithTint(img, VW, VH, PAPER, a));
    if (w < 4.5) bad++;
    worst = Math.min(worst, w);
  }
  console.log(`    ${a.toFixed(2)}    ${worst.toFixed(2)}:1`.padEnd(28) + `${bad}`);
}
console.log("");
