/**
 * Score every rung of the encode ladder against the lossless master.
 *
 * VMAF, not PSNR. PSNR ranks a slightly blurrier encode above a sharper one
 * with more grain, which is the opposite of what a viewer says — and this film
 * is exactly that kind of content: smooth interpolated frames over a slow
 * camera move.
 *
 * Scored on a SUBSET of frames, stated rather than hidden: VMAF on 2510 frames
 * of 1080p against an FFV1 master is hours per rung. Every rung is scored on
 * the same evenly-spaced sample, so the comparison between rungs is like for
 * like even though the absolute figure is an estimate.
 *
 * Usage: node build/score-ladder.js <ladder-dir> [--every=24]
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? +a.split("=")[1] : d; };
const EVERY = arg("every", 24);
const MASTER = "build/intermediate_48fps_fixed.mkv";
/*
 * The file that shipped was never in git — all video is gitignored — so it
 * could not be restored after deletion. It is REGENERATED here from the same
 * recipe that produced it (build/encode_codecs.sh: VP9 crf 31, -g 3,
 * -keyint_min 3), so the baseline in this table is the real comparison and
 * not a remembered number.
 */
const SHIPPED = process.env.BASELINE || "";

const score = (file) => {
  /*
   * RELATIVE log path, deliberately. An absolute Windows path carries a
   * drive-letter colon, and ffmpeg's lavfi parser reads ":" as an option
   * separator — every score in the first run failed for that reason, and my
   * error truncation at 60 characters hid the message that said so.
   */
  const log = "vmaf-" + path.basename(file).replace(/[^A-Za-z0-9.-]/g, "_") + ".json";
  try {
    execFileSync("ffmpeg", [
      "-v", "error",
      "-i", file,
      "-i", MASTER,
      "-lavfi",
      `[0:v]select='not(mod(n\\,${EVERY}))',setpts=N/FRAME_RATE/TB,scale=1920:1080:flags=bicubic,format=yuv420p[dist];` +
      `[1:v]select='not(mod(n\\,${EVERY}))',setpts=N/FRAME_RATE/TB,format=yuv420p[ref];` +
      `[dist][ref]libvmaf=log_fmt=json:log_path=${log.replace(/\\/g, "/")}:n_threads=4`,
      "-f", "null", "-",
    ], { stdio: ["ignore", "ignore", "pipe"], timeout: 20 * 60 * 1000 });
    const j = JSON.parse(fs.readFileSync(log, "utf8"));
    /*
     * WHERE the minimum falls, not just its value. A mean of 99.5 with a poor
     * minimum can mean one shot falls apart while the average carries it —
     * and it matters enormously whether that shot is a busy frame nobody
     * studies or a match-cut anchor: the white-out, the orange hold, the
     * wordmark. Sampled frame n maps back to source frame n*EVERY.
     */
    let worst = { vmaf: Infinity, frameNum: 0 };
    for (const f of j.frames) {
      const v = f.metrics.vmaf;
      if (v < worst.vmaf) worst = { vmaf: v, frameNum: f.frameNum };
    }
    return {
      mean: +j.pooled_metrics.vmaf.mean.toFixed(2),
      low: +j.pooled_metrics.vmaf.min.toFixed(2),
      lowAt: +((worst.frameNum * EVERY) / 48).toFixed(2),
    };
  } catch (e) {
    /* NOT truncated. The first run of this reported every rung as failed and
       cut the reason off at 60 characters — the message that would have said
       "drive-letter colon parsed as an option separator" was in the part
       thrown away. A guard that reports "broken" without reporting how is
       barely better than no guard. */
    return { mean: null, low: null, err: String(e.stderr || e.message || e) };
  }
};

const files = fs.readdirSync(DIR).filter((f) => /\.(mp4|webm)$/.test(f)).sort();
const rows = [];

if (SHIPPED && fs.existsSync(SHIPPED)) {
  const s = score(SHIPPED);
  rows.push({ name: "SHIPPED all-intra vp9", mb: fs.statSync(SHIPPED).size / 1048576, ...s });
}
for (const f of files) {
  const p = path.join(DIR, f);
  rows.push({ name: f, mb: fs.statSync(p).size / 1048576, ...score(p) });
}

console.log(`\n  ENCODE LADDER — VMAF against the FFV1 master, every ${EVERY}th frame\n`);
console.log("   encode                          size      VMAF mean   VMAF low   worst at    vs 53.6 MB");
for (const r of rows) {
  const cut = ((1 - r.mb / 53.59) * 100);
  console.log(
    `   ${r.name.padEnd(30)} ${r.mb.toFixed(2).padStart(6)} MB  ` +
    `${String(r.mean ?? "-").padStart(9)}  ${String(r.low ?? "-").padStart(9)}` +
    `${r.lowAt !== undefined ? " @" + String(r.lowAt).padStart(6) + "s" : "         "}   ${(cut >= 0 ? "-" : "+") + Math.abs(cut).toFixed(0) + "%"}`,
  );
  if (r.err) console.log("      " + r.err.replace(/\r?\n/g, "\n      "));
}
console.log("");
