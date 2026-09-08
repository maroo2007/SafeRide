/**
 * Shrink the phone GLB by attacking where its bytes actually are.
 *
 * Measured first, rather than reaching for Draco because "compress the model"
 * usually means geometry:
 *
 *   total            7.76 MB
 *   embedded images  5.17 MB   (67%)
 *   geometry + rest  2.54 MB   (51,520 triangles)
 *
 * So geometry compression attacks the smaller half. The images are the lever,
 * and two of the four are indefensible:
 *
 *   #0  2048x2048 PNG, 4.24 MB  — the NORMAL MAP for metalframe.002, on a
 *                                 phone that renders 414 px tall
 *   #1  1080x2314 PNG, 0.83 MB  — screen.001's baseColor and emissive. We
 *                                 replace that material outright with an
 *                                 unlit MeshBasicMaterial carrying our own
 *                                 texture (spec §4a), so this ships, decodes
 *                                 and uploads to never be looked at.
 *
 * Image indices are NOT renumbered. #1 is replaced with a 1x1 pixel rather
 * than deleted, so textures, materials and every other index stay exactly as
 * the file has them. Deleting it would mean rewriting three cross-referenced
 * arrays to save 70 bytes.
 *
 * Usage: node build/shrink-glb.js <in.glb> <out.glb> <tmpdir> [--normal=512]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const IN = process.argv[2], OUT = process.argv[3], TMP = process.argv[4];
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : d; };
const NORMAL_PX = +arg("normal", 512);

fs.mkdirSync(TMP, { recursive: true });

const buf = fs.readFileSync(IN);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
const binOffset = 20 + jsonLen + 8;
const binLen = buf.readUInt32LE(20 + jsonLen);
const bin = buf.slice(binOffset, binOffset + binLen);

const views = json.bufferViews;
const slice = (i) => bin.slice(views[i].byteOffset || 0, (views[i].byteOffset || 0) + views[i].byteLength);

/* ---- new bytes for the two images worth changing --------------------- */
const replacement = new Map();

const src0 = path.join(TMP, "img0.png"), dst0 = path.join(TMP, "img0-small.png");
fs.writeFileSync(src0, slice(json.images[0].bufferView));
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", src0, "-vf", `scale=${NORMAL_PX}:${NORMAL_PX}:flags=lanczos`, dst0]);
replacement.set(0, fs.readFileSync(dst0));

const px = path.join(TMP, "pixel.png");
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=white:s=1x1", "-frames:v", "1", px]);
replacement.set(1, fs.readFileSync(px));

/* ---- repack the BIN, rewriting every offset -------------------------- */
const imageView = new Map();
json.images.forEach((im, i) => { if (im.bufferView !== undefined) imageView.set(im.bufferView, i); });

const parts = [];
let offset = 0;
views.forEach((v, vi) => {
  const imgIdx = imageView.get(vi);
  const data = replacement.has(imgIdx) ? replacement.get(imgIdx) : slice(vi);
  v.byteOffset = offset;
  v.byteLength = data.length;
  parts.push(data);
  offset += data.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
});
const newBin = Buffer.concat(parts);
json.buffers[0].byteLength = newBin.length;

const newJson = Buffer.from(JSON.stringify(json), "utf8");
const jsonPad = (4 - (newJson.length % 4)) % 4;
const jsonChunk = Buffer.concat([newJson, Buffer.alloc(jsonPad, 0x20)]);

const header = Buffer.alloc(12);
header.write("glTF", 0, "ascii");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + newBin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([header, jh, jsonChunk, bh, newBin]));

const before = buf.length, after = fs.statSync(OUT).size;
console.log(`\n  ${path.basename(IN)}  ${(before / 1048576).toFixed(2)} MB`);
console.log(`  normal map 2048 -> ${NORMAL_PX}px   ${(slice(json.images[0].bufferView).length / 1048576).toFixed(2)} MB -> ${(replacement.get(0).length / 1024).toFixed(0)} KB`);
console.log(`  screen texture -> 1x1 (replaced at runtime)  ${(849913 / 1024).toFixed(0)} KB -> ${replacement.get(1).length} B`);
console.log(`  ${path.basename(OUT)}  ${(after / 1048576).toFixed(2)} MB   ${(100 - (after / before) * 100).toFixed(1)}% smaller\n`);
