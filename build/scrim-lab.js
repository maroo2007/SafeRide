/**
 * Scrim lab.
 *
 * Sampling the film alone answers "how bright is the footage". It does NOT
 * answer "will this text read", because the scrim is a gradient: its alpha
 * varies across the very box the text occupies. Averaging that away is what
 * produced the wrong 7.54:1 prediction for the headline.
 *
 * So this composites a CANDIDATE scrim over real frames, per pixel, at the
 * exact viewport rect the text occupies, and reports the worst case over the
 * whole window a line of copy is on screen. A caption sits for its entire
 * segment, so the worst frame governs — not the mean.
 *
 * Usage: node build/scrim-lab.js <frames-dir>
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SRC_W = 1920, SRC_H = 1080;
const FRAME_W = 960, FRAME_H = 540;      // extracted at half resolution
const FPS = 4;                            // extraction rate

/* ---------- PNG ---------- */
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0, v = line[x];
      let val;
      if (f === 0) val = v; else if (f === 1) val = v + a; else if (f === 2) val = v + b;
      else if (f === 3) val = v + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
             val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = val & 0xff;
    }
  }
  return { w, h, ch, px: out };
}

/* ---------- colour ---------- */
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/* ---------- object-cover mapping ---------- */
/** Viewport pixel -> extracted-frame pixel, honouring object-cover cropping. */
function makeMapper(VW, VH) {
  const scale = Math.max(VW / SRC_W, VH / SRC_H);
  const dispW = SRC_W * scale, dispH = SRC_H * scale;
  const offX = (dispW - VW) / 2, offY = (dispH - VH) / 2;   // cropped away each side
  const k = FRAME_W / SRC_W;
  return (vx, vy) => [ ((vx + offX) / scale) * k, ((vy + offY) / scale) * k ];
}

/* ---------- gradients ---------- */
function stopsAt(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, a0] = stops[i - 1], [p1, a1] = stops[i];
      return a0 + (a1 - a0) * ((t - p0) / (p1 - p0));
    }
  }
  return last[1];
}

/** CSS linear-gradient(<deg>, ...) alpha at a point inside a W x H box. */
function linearAlpha(deg, stops, x, y, W, H) {
  const A = (deg * Math.PI) / 180;
  const dx = Math.sin(A), dy = -Math.cos(A);          // screen coords, y down
  const len = Math.abs(W * dx) + Math.abs(H * dy);
  const t = 0.5 + ((x - W / 2) * dx + (y - H / 2) * dy) / len;
  return stopsAt(stops, t);
}

/** CSS radial-gradient(<rx%> <ry%> at <cx%> <cy%>, ...) alpha inside a W x H box. */
function radialAlpha(rxPct, ryPct, cxPct, cyPct, stops, x, y, W, H) {
  const cx = (cxPct / 100) * W, cy = (cyPct / 100) * H;
  const rx = (rxPct / 100) * W, ry = (ryPct / 100) * H;
  const t = Math.hypot((x - cx) / rx, (y - cy) / ry);
  return stopsAt(stops, t);
}

/* ---------- evaluation ---------- */
/**
 * @param scrims  layers applied in order, each { rgb, alphaAt(vx,vy,VW,VH) }
 * @returns worst-case contrast over the window (5th percentile of the hard
 *          direction, i.e. the 5% of pixels that fight the text hardest)
 */
function evaluate({ dir, from, to, rect, text, scrims, VW, VH, step = 2 }) {
  const map = makeMapper(VW, VH);
  const textL = L(text[0], text[1], text[2]);
  const contrasts = [];
  const grounds = [];
  const i0 = Math.round(from * FPS), i1 = Math.round(to * FPS);
  for (let i = i0; i <= i1; i++) {
    const f = path.join(dir, `f${String(i).padStart(4, "0")}.png`);
    if (!fs.existsSync(f)) continue;
    const img = decodePNG(fs.readFileSync(f));
    for (let vy = rect.y; vy < rect.y + rect.h; vy += step) {
      for (let vx = rect.x; vx < rect.x + rect.w; vx += step) {
        const [fx, fy] = map(vx, vy);
        const px = Math.min(img.w - 1, Math.max(0, Math.round(fx)));
        const py = Math.min(img.h - 1, Math.max(0, Math.round(fy)));
        const o = py * img.w * img.ch + px * img.ch;
        let r = img.px[o], g = img.px[o + 1], b = img.px[o + 2];
        for (const s of scrims) {
          const a = s.alphaAt(vx, vy, VW, VH);
          if (a <= 0) continue;
          r = s.rgb[0] * a + r * (1 - a);
          g = s.rgb[1] * a + g * (1 - a);
          b = s.rgb[2] * a + b * (1 - a);
        }
        const c = ratio(textL, L(r, g, b));
        contrasts.push(c);
        grounds.push([Math.round(r), Math.round(g), Math.round(b), c]);
      }
    }
  }
  if (!contrasts.length) return null;
  contrasts.sort((a, b) => a - b);
  grounds.sort((a, b) => a[3] - b[3]);
  const p = (q) => contrasts[Math.min(contrasts.length - 1, Math.floor(contrasts.length * q))];
  return { min: contrasts[0], p05: p(0.05), median: p(0.5), worstGround: grounds[Math.floor(grounds.length * 0.05)], n: contrasts.length };
}

module.exports = { decodePNG, L, ratio, makeMapper, linearAlpha, radialAlpha, evaluate, FPS };
