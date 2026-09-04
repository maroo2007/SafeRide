#!/usr/bin/env python3
"""
Full-image pixel scan for palette extraction, with pixel-count evidence.

Reads raw RGB straight from ffmpeg (no image libraries needed), buckets colours
to suppress sensor/compression noise, and reports the dominant buckets by pixel
count together with the true mean of the pixels inside each bucket.

Reporting the bucket mean rather than the bucket centre matters: a bucket is a
coarse 16-level grid, so its centre can be several units away from where the
pixels actually sit.

  python palette-scan.py <video> <t> [--dur S] [--crop W:H:X:Y] [--top N]
                                     [--min-sat N] [--min-luma N] [--max-luma N]
"""
import subprocess, sys, argparse
from collections import defaultdict

def frames_rgb(src, t, dur, crop, fps, w=480):
    vf = f"fps={fps}"
    if crop:
        vf += f",crop={crop}"
    vf += f",scale={w}:-2"
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(t), "-t", str(dur), "-i", src,
         "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True).stdout
    return out

def luma(r, g, b):
    def lin(v):
        s = v / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    return (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) * 255

def sat(r, g, b):
    return max(r, g, b) - min(r, g, b)

def scan(buf, step=16, min_sat=0, min_luma=0, max_luma=255):
    buckets = defaultdict(lambda: [0, 0, 0, 0])  # count, rsum, gsum, bsum
    total = 0
    kept = 0
    for i in range(0, len(buf) - 2, 3):
        r, g, b = buf[i], buf[i + 1], buf[i + 2]
        total += 1
        if sat(r, g, b) < min_sat:
            continue
        y = luma(r, g, b)
        if y < min_luma or y > max_luma:
            continue
        kept += 1
        k = (r // step, g // step, b // step)
        e = buckets[k]
        e[0] += 1; e[1] += r; e[2] += g; e[3] += b
    return buckets, total, kept

def report(label, buckets, total, kept, top):
    print(f"\n{label}")
    print(f"  pixels scanned {total:,}   matching filter {kept:,} ({kept/total*100:.1f}%)" if total else "  no pixels")
    if not kept:
        print("  (nothing matched the filter)")
        return []
    rows = sorted(buckets.items(), key=lambda kv: -kv[1][0])[:top]
    print(f"  {'hex':<9} {'rgb':<16} {'pixels':>9} {'% of kept':>10} {'luma':>6}")
    out = []
    for k, (c, rs, gs, bs) in rows:
        r, g, b = round(rs / c), round(gs / c), round(bs / c)
        hexv = f"#{r:02X}{g:02X}{b:02X}"
        print(f"  {hexv:<9} rgb({r:3d},{g:3d},{b:3d}) {c:9,} {c/kept*100:9.1f}% {luma(r,g,b):6.0f}")
        out.append((hexv, (r, g, b), c, c / kept * 100))
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("t", type=float)
    ap.add_argument("--dur", type=float, default=0.1)
    ap.add_argument("--fps", type=float, default=4)
    ap.add_argument("--crop", default=None)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--step", type=int, default=16)
    ap.add_argument("--min-sat", type=int, default=0)
    ap.add_argument("--min-luma", type=float, default=0)
    ap.add_argument("--max-luma", type=float, default=255)
    ap.add_argument("--label", default=None)
    a = ap.parse_args()
    buf = frames_rgb(a.src, a.t, a.dur, a.crop, a.fps)
    bk, tot, kept = scan(buf, a.step, a.min_sat, a.min_luma, a.max_luma)
    report(a.label or f"t={a.t}s dur={a.dur}s crop={a.crop or 'full frame'}", bk, tot, kept, a.top)
