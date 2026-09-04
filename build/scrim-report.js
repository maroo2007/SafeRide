/**
 * Drive the scrim lab: first VALIDATE it against the numbers the real browser
 * produced, then use it to settle the caption question and design the hero
 * scrim. A model that has not been checked against the rendered page is just a
 * second guess.
 */
const { linearAlpha, radialAlpha, evaluate } = require("./scrim-lab");

const DIR = process.argv[2];
const DUR = 2510 / 48;

/* Rects measured from the live page (getBoundingClientRect). */
const RECT = {
  1440: {
    heroBlock: { x: 168, y: 314, w: 768, h: 176 },
    headline:  { x: 168, y: 346, w: 768, h: 144 },
    eyebrow:   { x: 168, y: 314, w: 768, h: 12 },
    caption:   { x: 184, y: 748, w: 398, h: 56 },
  },
  1920: {
    heroBlock: { x: 408, y: 404, w: 768, h: 176 },
    headline:  { x: 408, y: 436, w: 768, h: 144 },
    eyebrow:   { x: 408, y: 404, w: 768, h: 12 },
    caption:   { x: 424, y: 928, w: 398, h: 56 },
  },
};
const VH = { 1440: 900, 1920: 1080 };

const WHITE = [252, 251, 248];   // #fcfbf8
const CREAM = [250, 230, 183];   // --accent-warm
const INK   = [3, 9, 23];        // --ink

/* ---- scrim definitions ---------------------------------------------- */
const SURFACE_DARK = [3, 3, 2];
const SURFACE_LIGHT = [253, 248, 240];

/** What is in the component right now. */
const CURRENT_HERO = {
  rgb: SURFACE_DARK,
  alphaAt: (x, y, W, H) => linearAlpha(105, [[0, .72], [.34, .45], [.58, .16], [.78, 0]], x, y, W, H),
};
const CURRENT_CAPTION = {
  rgb: SURFACE_LIGHT,
  alphaAt: (x, y, W, H) => {
    const boxTop = H * 0.54, boxH = H * 0.46;         // inset-x-0 bottom-0 h-[46%]
    if (y < boxTop) return 0;
    return radialAlpha(80, 120, 14, 100, [[0, .92], [.30, .66], [.55, .22], [.76, 0]], x, y - boxTop, W, boxH);
  },
};

const row = (label, r) =>
  console.log(
    "  " + label.padEnd(42) +
    (r ? `min ${r.min.toFixed(2)}  p05 ${r.p05.toFixed(2)}  med ${r.median.toFixed(2)}   worst ground rgb(${r.worstGround.slice(0,3).join(",")})` : "no data")
  );

const run = (o) => evaluate({ dir: DIR, ...o });

console.log("\n=== 1. VALIDATION — lab vs the browser's own composited pixels ===");
console.log("  (browser measured: headline 2.63:1 @p0, 2.24:1 @p0.05, eyebrow 8.88 / 5.77)");
for (const [p, t] of [[0, 0], [0.05, 0.05 * DUR]]) {
  row(`headline @p${p} (current scrim)`, run({ from: t, to: t, rect: RECT[1440].headline, text: WHITE, scrims: [CURRENT_HERO], VW: 1440, VH: 900 }));
  row(`eyebrow  @p${p} (current scrim)`, run({ from: t, to: t, rect: RECT[1440].eyebrow, text: CREAM, scrims: [CURRENT_HERO], VW: 1440, VH: 900 }));
}

console.log("\n=== 2. HERO block, progress 0 -> 0.12 (video 0 -> 6.27s), 1440x900 ===");
row("headline  NO scrim", run({ from: 0, to: 0.12 * DUR, rect: RECT[1440].headline, text: WHITE, scrims: [], VW: 1440, VH: 900 }));
row("headline  current scrim", run({ from: 0, to: 0.12 * DUR, rect: RECT[1440].headline, text: WHITE, scrims: [CURRENT_HERO], VW: 1440, VH: 900 }));
row("eyebrow   NO scrim", run({ from: 0, to: 0.12 * DUR, rect: RECT[1440].eyebrow, text: CREAM, scrims: [], VW: 1440, VH: 900 }));
row("eyebrow   current scrim", run({ from: 0, to: 0.12 * DUR, rect: RECT[1440].eyebrow, text: CREAM, scrims: [CURRENT_HERO], VW: 1440, VH: 900 }));

console.log("\n=== 3. CAPTIONS at their REAL rects (settles the earlier sampling) ===");
const CAPS = [
  { id: "boarding  11.1-17.0s", from: 11.1, to: 17.0, scrim: true },
  { id: "alerts    22.0-32.6s", from: 22.0, to: 32.6, scrim: false },
  { id: "coverage  35.0-43.0s", from: 35.0, to: 43.0, scrim: false },
];
for (const c of CAPS) {
  row(`${c.id}  dark ink, no scrim`, run({ from: c.from, to: c.to, rect: RECT[1440].caption, text: INK, scrims: [], VW: 1440, VH: 900 }));
  row(`${c.id}  white,    no scrim`, run({ from: c.from, to: c.to, rect: RECT[1440].caption, text: WHITE, scrims: [], VW: 1440, VH: 900 }));
  row(`${c.id}  dark ink + cream scrim`, run({ from: c.from, to: c.to, rect: RECT[1440].caption, text: INK, scrims: [CURRENT_CAPTION], VW: 1440, VH: 900 }));
}

console.log("\n=== 4. HERO scrim candidates (headline, 0->0.12, 1440x900) ===");
const CANDIDATES = {
  "A 105deg current":
    CURRENT_HERO,
  "B 100deg, reach 0 at 92%":
    { rgb: SURFACE_DARK, alphaAt: (x,y,W,H) => linearAlpha(100, [[0,.78],[.30,.62],[.55,.40],[.75,.16],[.92,0]], x,y,W,H) },
  "C 96deg deeper, 0 at 95%":
    { rgb: SURFACE_DARK, alphaAt: (x,y,W,H) => linearAlpha(96, [[0,.86],[.30,.72],[.55,.50],[.78,.22],[.95,0]], x,y,W,H) },
  "D 96deg + soft bottom lift":
    { rgb: SURFACE_DARK, alphaAt: (x,y,W,H) => Math.max(
        linearAlpha(96, [[0,.80],[.32,.64],[.58,.40],[.80,.14],[.96,0]], x,y,W,H),
        linearAlpha(0,  [[0,0],[.55,0],[1,.34]], x,y,W,H)) },
};
for (const [name, s] of Object.entries(CANDIDATES)) {
  row(`${name}  headline`, run({ from: 0, to: 0.12 * DUR, rect: RECT[1440].headline, text: WHITE, scrims: [s], VW: 1440, VH: 900 }));
  row(`${name}  eyebrow `, run({ from: 0, to: 0.12 * DUR, rect: RECT[1440].eyebrow,  text: CREAM, scrims: [s], VW: 1440, VH: 900 }));
}

console.log("\n=== 5. Same candidates at 1920x1080 (less crop, more bright frame visible) ===");
for (const [name, s] of Object.entries(CANDIDATES)) {
  row(`${name}  headline`, run({ from: 0, to: 0.12 * DUR, rect: RECT[1920].headline, text: WHITE, scrims: [s], VW: 1920, VH: 1080 }));
}
console.log("");
