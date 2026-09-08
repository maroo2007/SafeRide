/** Pixel difference between two captures, over the phone only. */
const { decodePNG } = require("./scrim-lab");
const fs = require("fs");
const a = decodePNG(fs.readFileSync(process.argv[2]));
const b = decodePNG(fs.readFileSync(process.argv[3]));
if (a.w !== b.w || a.h !== b.h) { console.log("  size mismatch"); process.exit(1); }
/*
 * Full frame by default. Cropping to the phone's chapter-1 position would
 * miss the mid-transition frames entirely — and those are the ones where the
 * metal frame is edge-on and a normal map actually shows. Diffing only the
 * front-on view would under-test the exact thing being changed.
 */
const x0 = 0, x1 = a.w - 1, y0 = 0, y1 = a.h - 1;
let worst = 0, sum = 0, n = 0, over8 = 0;
for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
  const o = (y * a.w + x) * a.ch;
  const d = Math.max(Math.abs(a.px[o] - b.px[o]), Math.abs(a.px[o+1] - b.px[o+1]), Math.abs(a.px[o+2] - b.px[o+2]));
  if (d > worst) worst = d;
  if (d > 8) over8++;
  sum += d; n++;
}
console.log(`  ${process.argv[4] || ""}  mean ${(sum / n).toFixed(2)}  worst ${worst}  pixels over 8 units: ${over8} of ${n} (${(over8 / n * 100).toFixed(2)}%)`);
