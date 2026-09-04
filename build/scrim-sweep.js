/**
 * Second pass: find the WEAKEST scrim that clears 4.5:1 at every pixel, for
 * every frame the copy is on screen, at both viewports.
 *
 * "Weakest that passes" is the criterion on purpose. A scrim exists to make
 * text readable; every unit of alpha beyond that is footage the visitor paid
 * to load and cannot see.
 */
const { linearAlpha, radialAlpha, evaluate } = require("./scrim-lab");

const DIR = process.argv[2];
const DUR = 2510 / 48;
const DARK = [3, 3, 2], LIGHT = [253, 248, 240];
const WHITE = [252, 251, 248], CREAM = [250, 230, 183], INK = [3, 9, 23];

/* Copy block is left-anchored inside a centred max-w-6xl (1152px) with px-6. */
const blockX = (VW) => Math.round((VW - 1152) / 2) + 24;

/** Hero rects for a candidate copy-block width. */
function heroRects(VW, VH, blockW) {
  const x = blockX(VW);
  // Headline height grows as the block narrows: 72px type, ~1.05 leading.
  const lines = blockW >= 700 ? 2 : 3;
  const h = lines * 76;
  const top = Math.round(VH / 2 - (h + 40) / 2);
  return {
    eyebrow: { x, y: top, w: blockW, h: 12 },
    headline: { x, y: top + 32, w: blockW, h },
  };
}

const capRect = (VW, VH) => ({ x: Math.round((VW - 1152) / 2) + 40, y: VH - 152, w: 398, h: 56 });

/* ---- candidate generators ------------------------------------------- */
const heroScrim = (deg, stops) => ({ rgb: DARK, alphaAt: (x, y, W, H) => linearAlpha(deg, stops, x, y, W, H) });

const capScrim = (hPct, rx, ry, stops) => ({
  rgb: LIGHT,
  alphaAt: (x, y, W, H) => {
    const boxTop = H * (1 - hPct), boxH = H * hPct;
    if (y < boxTop) return 0;
    return radialAlpha(rx, ry, 14, 100, stops, x, y - boxTop, W, boxH);
  },
});

const fmt = (r) => r ? `min ${r.min.toFixed(2)}  p05 ${r.p05.toFixed(2)}  med ${r.median.toFixed(2)}` : "n/a";
const mark = (r, need) => (r && r.min >= need ? "  PASS" : "  fail");

console.log("\n### HERO — narrower copy block + gradient, worst pixel over 0->0.12 ###");
const HERO_CANDS = {
  "H1  105deg current, block 768":
    { s: heroScrim(105, [[0,.72],[.34,.45],[.58,.16],[.78,0]]), w: 768 },
  "H2  96deg deep,     block 768":
    { s: heroScrim(96, [[0,.86],[.30,.72],[.55,.50],[.78,.22],[.95,0]]), w: 768 },
  "H3  100deg,         block 576":
    { s: heroScrim(100, [[0,.78],[.30,.62],[.55,.40],[.75,.16],[.92,0]]), w: 576 },
  "H4  98deg moderate, block 576":
    { s: heroScrim(98, [[0,.82],[.34,.68],[.60,.42],[.82,.15],[.96,0]]), w: 576 },
  "H5  98deg lighter,  block 576":
    { s: heroScrim(98, [[0,.74],[.34,.60],[.60,.36],[.82,.12],[.96,0]]), w: 576 },
  "H6  94deg,          block 640":
    { s: heroScrim(94, [[0,.80],[.34,.66],[.60,.44],[.84,.16],[.98,0]]), w: 640 },
};
for (const [name, c] of Object.entries(HERO_CANDS)) {
  for (const VW of [1440, 1920]) {
    const VH = VW === 1440 ? 900 : 1080;
    const R = heroRects(VW, VH, c.w);
    const hl = evaluate({ dir: DIR, from: 0, to: 0.12 * DUR, rect: R.headline, text: WHITE, scrims: [c.s], VW, VH });
    const eb = evaluate({ dir: DIR, from: 0, to: 0.12 * DUR, rect: R.eyebrow, text: CREAM, scrims: [c.s], VW, VH });
    console.log(`  ${name} @${VW}`.padEnd(40) + `headline ${fmt(hl)}${mark(hl, 4.5)}   eyebrow ${fmt(eb)}${mark(eb, 4.5)}`);
  }
}

console.log("\n### CAPTIONS — one treatment for all three, dark ink on a cream scrim ###");
const CAP_CANDS = {
  "C1  current 46% 80/120 .92/.66/.22/0@76":
    capScrim(0.46, 80, 120, [[0,.92],[.30,.66],[.55,.22],[.76,0]]),
  "C2  46% 85/150 wide plateau":
    capScrim(0.46, 85, 150, [[0,.96],[.42,.88],[.62,.42],[.80,0]]),
  "C3  52% 90/155 wide plateau":
    capScrim(0.52, 90, 155, [[0,.97],[.46,.90],[.66,.40],[.82,0]]),
  "C4  52% 90/155 slightly lighter":
    capScrim(0.52, 90, 155, [[0,.94],[.46,.84],[.66,.36],[.82,0]]),
};
const CAPS = [["boarding", 11.1, 17.0], ["alerts", 22.0, 32.6], ["coverage", 35.0, 43.0]];
for (const [name, s] of Object.entries(CAP_CANDS)) {
  for (const [id, from, to] of CAPS) {
    const out = [];
    for (const VW of [1440, 1920]) {
      const VH = VW === 1440 ? 900 : 1080;
      const r = evaluate({ dir: DIR, from, to, rect: capRect(VW, VH), text: INK, scrims: [s], VW, VH });
      out.push(`@${VW} ${fmt(r)}${mark(r, 4.5)}`);
    }
    console.log(`  ${name} / ${id}`.padEnd(48) + out.join("   "));
  }
}

/* Does the caption scrim actually reach zero before the box edges? If it does
   not, there is a visible straight line — the exact defect being fixed. */
console.log("\n### EDGE CHECK — alpha remaining at the scrim box's own top edge ###");
for (const [name, s] of Object.entries(CAP_CANDS)) {
  for (const VW of [1440, 1920]) {
    const VH = VW === 1440 ? 900 : 1080;
    const hPct = name.includes("52%") ? 0.52 : 0.46;
    const topY = Math.ceil(VH * (1 - hPct)) + 1;
    let worst = 0, worstX = 0;
    for (let x = 0; x <= VW; x += 4) {
      const a = s.alphaAt(x, topY, VW, VH);
      if (a > worst) { worst = a; worstX = x; }
    }
    console.log(`  ${name} @${VW}`.padEnd(48) + `max alpha on top edge ${worst.toFixed(4)} at x=${worstX}` + (worst < 0.004 ? "   invisible" : "   VISIBLE LINE"));
  }
}
console.log("");
