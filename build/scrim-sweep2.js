/**
 * Third pass. Sweep 1 showed the two constraints pull against each other:
 * a scrim strong enough for 4.5:1 stopped reaching zero before its own box
 * edge, which IS the hard-edged rectangle.
 *
 * The fix is geometric, not chemical: give the gradient a box big enough to
 * fade out in. Anchored to the full viewport, the left and bottom edges are
 * screen edges (nothing to see) and the ellipse reaches zero far inside the
 * top and right. Then find the LOWEST alpha that still clears 4.5:1.
 */
const { linearAlpha, radialAlpha, evaluate } = require("./scrim-lab");

const DIR = process.argv[2];
const DUR = 2510 / 48;
const DARK = [3, 3, 2], LIGHT = [253, 248, 240];
const WHITE = [252, 251, 248], CREAM = [250, 230, 183], INK = [3, 9, 23];
const CAPS = [["boarding", 11.1, 17.0], ["alerts", 22.0, 32.6], ["coverage", 35.0, 43.0]];

const capRect = (VW, VH) => ({ x: Math.round((VW - 1152) / 2) + 40, y: VH - 152, w: 398, h: 56 });
const fmt = (r) => r ? `min ${r.min.toFixed(2)}  p05 ${r.p05.toFixed(2)}` : "n/a";
const ok = (r, n = 4.5) => (r && r.min >= n ? "PASS" : "fail");

/* Full-viewport box: no box edge of its own to betray it. */
const capScrim = (peak, plateau, stops) => ({
  rgb: LIGHT,
  alphaAt: (x, y, W, H) => radialAlpha(75, 42, 14, 100, stops, x, y, W, H),
  peak, plateau,
});

console.log("\n### CAPTION scrim — full-viewport ellipse, lowest alpha that passes ###");
const CAP = {
  "K1 plateau .50": capScrim(0, 0, [[0,.56],[.58,.50],[.76,.26],[.94,0]]),
  "K2 plateau .58": capScrim(0, 0, [[0,.64],[.58,.58],[.76,.30],[.94,0]]),
  "K3 plateau .66": capScrim(0, 0, [[0,.72],[.58,.66],[.76,.34],[.94,0]]),
  "K4 plateau .74": capScrim(0, 0, [[0,.80],[.58,.74],[.76,.38],[.94,0]]),
};
for (const [name, s] of Object.entries(CAP)) {
  for (const [id, from, to] of CAPS) {
    const out = [];
    for (const VW of [1440, 1920]) {
      const VH = VW === 1440 ? 900 : 1080;
      const r = evaluate({ dir: DIR, from, to, rect: capRect(VW, VH), text: INK, scrims: [s], VW, VH });
      out.push(`@${VW} ${fmt(r)} ${ok(r)}`);
    }
    console.log(`  ${name} / ${id}`.padEnd(32) + out.join("   "));
  }
}

console.log("\n### EDGE CHECK — alpha anywhere on the viewport's top and right edges ###");
for (const [name, s] of Object.entries(CAP)) {
  for (const VW of [1440, 1920]) {
    const VH = VW === 1440 ? 900 : 1080;
    let worst = 0, where = "";
    for (let x = 0; x <= VW; x += 4) { const a = s.alphaAt(x, 0, VW, VH); if (a > worst) { worst = a; where = `top x=${x}`; } }
    for (let y = 0; y <= VH; y += 4) { const a = s.alphaAt(VW, y, VW, VH); if (a > worst) { worst = a; where = `right y=${y}`; } }
    console.log(`  ${name} @${VW}`.padEnd(32) + `max alpha ${worst.toFixed(4)} (${where || "none"})` + (worst < 0.004 ? "   invisible" : "   VISIBLE LINE"));
  }
}

console.log("\n### HERO — block 576, gradient strength ladder ###");
const blockX = (VW) => Math.round((VW - 1152) / 2) + 24;
const heroRects = (VW, VH, blockW, lines) => {
  const x = blockX(VW), h = lines * 76, top = Math.round(VH / 2 - (h + 40) / 2);
  return { eyebrow: { x, y: top, w: blockW, h: 12 }, headline: { x, y: top + 32, w: blockW, h } };
};
const heroScrim = (deg, stops) => ({ rgb: DARK, alphaAt: (x, y, W, H) => linearAlpha(deg, stops, x, y, W, H) });
const HERO = {
  "G1 98deg .82/.68/.42/.15": heroScrim(98, [[0,.82],[.34,.68],[.60,.42],[.82,.15],[.96,0]]),
  "G2 98deg .86/.72/.48/.18": heroScrim(98, [[0,.86],[.34,.72],[.60,.48],[.82,.18],[.96,0]]),
  "G3 96deg .88/.76/.52/.20": heroScrim(96, [[0,.88],[.34,.76],[.60,.52],[.82,.20],[.97,0]]),
  "G4 96deg .90/.80/.58/.24": heroScrim(96, [[0,.90],[.34,.80],[.60,.58],[.82,.24],[.97,0]]),
};
for (const [name, s] of Object.entries(HERO)) {
  for (const VW of [1440, 1920]) {
    const VH = VW === 1440 ? 900 : 1080;
    const R = heroRects(VW, VH, 576, 3);
    const hl = evaluate({ dir: DIR, from: 0, to: 0.12 * DUR, rect: R.headline, text: WHITE, scrims: [s], VW, VH });
    const eb = evaluate({ dir: DIR, from: 0, to: 0.12 * DUR, rect: R.eyebrow, text: CREAM, scrims: [s], VW, VH });
    console.log(`  ${name} @${VW}`.padEnd(32) + `headline ${fmt(hl)} ${ok(hl)}   eyebrow ${fmt(eb)} ${ok(eb)}`);
  }
}

console.log("\n### HERO EDGE CHECK — gradient must reach zero before the right edge ###");
for (const [name, s] of Object.entries(HERO)) {
  for (const VW of [1440, 1920]) {
    const VH = VW === 1440 ? 900 : 1080;
    let worst = 0;
    for (let y = 0; y <= VH; y += 4) worst = Math.max(worst, s.alphaAt(VW, y, VW, VH));
    console.log(`  ${name} @${VW}`.padEnd(32) + `max alpha on right edge ${worst.toFixed(4)}` + (worst < 0.004 ? "   invisible" : "   VISIBLE"));
  }
}
console.log("");
