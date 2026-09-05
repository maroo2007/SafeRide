# SafeRide — marketing site

Scroll-scrubbed video hero (pear.no technique) plus conventional content sections.

- **Content source of truth:** https://safe-ridee.vercel.app/
- **Build spec:** `SafeRide_Build_Spec.md`
- **Open items:** `TODO.md`

---

## Design system

Sourced from the `ui-ux-pro-max` skill. The previous site's theme is **not**
used; only its copy is reused.

- **Pattern** — Trust and Authority + Conversion. Proof-led, WCAG AAA,
  colour strategy "navy/grey corporate, accent for CTA only".
- **Palette** — trust navy `#0f172a` + premium gold `#a16207` on `#f8fafc`.
- **Type** — Calistoga (display) + Inter (body) + JetBrains Mono (labels),
  the "SaaS Boutique" pairing. Calistoga ships one weight by design.
- **Dark** — Modern Dark (Cinema): layered near-blacks, never pure `#000000`,
  16px radius, expo-out easing.

**Gold is the CTA colour and nothing else.** Using it for general emphasis
destroys the one signal that drives conversion. There should be exactly one
gold control per screen.

Contrast is enforced by `__tests__/tokens.contrast.test.ts`, which parses the
real `globals.css` rather than a copy of the palette.

## Local development

```bash
pnpm install
pnpm dev
```

> Phase 1 (scaffold) not started yet. The video pipeline below is complete.

---

## Video pipeline

### Source

`saferide-hero-source.mp4` — 1920×1080, **24fps content in a 30fps container**
(1569 frames, 1192 unique; exactly 24 unique frames per second), 52.30s,
H.264 Main, 19.7 Mb/s, 124.3 MiB, with an AAC track that is stripped.

The 30fps container reading is misleading. Encoding at 30fps, or interpolating
from 30fps, both interpolate *between duplicate frames* and gain nothing.

### Locked recipe

```
mpdecimate,fps=24,minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=256
```

Three things here are load-bearing. Changing any of them silently breaks output:

1. **`search_param=256`** — the default is 32px, far too small for the fast camera
   dive at ~43s. At the default, the New Cairo / Nasr City / 5th of October
   billboards smear into illegible text. Not caused by scene cuts: `scd_threshold`
   tuning produced byte-identical output, and splitting at the detected cuts did
   not help either. It is purely motion search range.

2. **`fps=24`, never `setpts=N/24/TB`** — `setpts` deletes the two intentional
   holds (orange frame 9.667–11.067s, white-out 32.633–34.000s) and shortens the
   video to 49.67s, breaking two of the six match-cut anchors.

3. **48fps, not 60** — 24→48 is an exact 2×, so every synthesized frame is a true
   temporal midpoint. 24→60 requires 1/3 and 2/3 placements and smears on-screen
   text. Text integrity outranks nominal smoothness.

### Building

```bash
# 1. lossless intermediate (~55 min, ~690 MB, never shipped)
ffmpeg -i saferide-hero-source.mp4 -an \
  -vf "mpdecimate,fps=24,minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=256" \
  -c:v ffv1 -level 3 -coder 1 -context 1 -g 1 -slices 24 -slicecrc 1 \
  -pix_fmt yuv420p build/intermediate_48fps.mkv

# 2. minterpolate truncates the tail (it needs a following frame to interpolate
#    toward), so pad back to exactly 2510 frames. Lossless, no re-interpolation.
ffmpeg -i build/intermediate_48fps.mkv -an \
  -vf "tpad=stop_mode=clone:stop_duration=0.2" -frames:v 2510 \
  -c:v ffv1 -level 3 -coder 1 -context 1 -g 1 -slices 24 -slicecrc 1 \
  -pix_fmt yuv420p build/intermediate_48fps_fixed.mkv

# 3. derive all shipped variants from the fixed intermediate (fast, no re-interp)
```

### Duration invariant

**Every scrub build must be 2510 frames / 52.291667s.** Assert it.

`52.300 × 48 = 2510.4`, which is not an integer, so 52.300s is **not representable**
at constant 48fps. 2510 frames (52.291667s) is the nearest representable value,
8ms under. Do not "fix" a failing build by moving this number.

### Verifying every-frame keyframes

The command in spec §1.3 is wrong and will fail every correct all-intra encode:

```bash
# WRONG - under-counts by exactly one
ffprobe ... -show_entries frame=key_frame -of csv=p=0 f.mp4 | grep -c "^1$"
```

ffprobe appends an SEI note to frame 0's line
(`1,H.26[45] User Data Unregistered SEI message`), which never matches `^1$`.
Match the first CSV field instead:

```bash
ffprobe -v error -select_streams v:0 -show_frames \
  -show_entries frame=key_frame -of csv=p=0 f.mp4 | awk -F, '$1==1' | wc -l
```

---

## Shipped assets

| file | codec | size | role |
|---|---|---|---|
| `saferide-hero-scrub.webm` | VP9 `-g 3` | 53.6 MB | primary scrub |
| `saferide-hero-scrub.mp4` | H.264 `-g 3` | 58.4 MB | scrub fallback |
| `saferide-hero-scrub-safari.mp4` | H.264 `-g 1` all-intra | 96.1 MB | Safari (conservative + fastest-seeking) |
| `saferide-hero-idle.mp4` | H.264 | 336 KB | 2s idle loop, LCP-critical |
| `saferide-hero-mobile.mp4` | H.264 720p | 7.8 MB | mobile background, does not scrub |
| `hero-poster.jpg` | — | 109 KB | first frame, load fallback |
| `hero-poster-final.jpg` | — | 52 KB | wordmark, reduced-motion still |

### Measured seek latency (fully buffered)

40 deterministic random seeks, identical sequence per engine.

| build | Chrome p50 / p95 | Firefox p50 / p95 |
|---|---|---|
| H.264 `-g 1` all-intra | 27.1 / 48.6 ms | **5–8 / 10–11 ms** |
| VP9 `-g 3` | 34.7 / 47.1 ms | 8–14 / 31–33 ms |
| H.264 `-g 3` | 37.6 / 62.6 ms | 15–22 / 25 ms |
| AV1 `-g 3` | **89.4 / 123.2 ms** | 37–38 / 63 ms |

**AV1 is rejected despite being the smallest file (37.3 MB).** It is the slowest
variant in *both* engines — ~2.4× slower than H.264 `-g 3` on Blink. At 89ms
median that is over five frames at 60Hz, which is perceptible lag on a playhead
bound to scroll position. The 21 MB saving is not worth it.

Firefox is roughly 2–3× faster than Chrome on every variant and changes no decision.

**WebKit/Safari remains untested** — no macOS machine available. It is served the
all-intra `-g 1` build, which is both the conservative choice and the
fastest-seeking one, so the untested risk costs nothing. See `TODO.md`.

### Network behaviour

Measured against a server-side token-bucket throttle (verified 94–99% accurate,
byte-integrity checked).

- **Idle loop first frame, Fast 3G (204 KB/s, 562ms RTT):** 405ms alone on a
  warm connection, 822ms alone cold, 5534ms in a full cold production page
  load. Cold and alone the scrub sources are 2085ms (webm) and 1263ms (mp4),
  so the split buys 1263ms against the source Chrome selects.
  The loop is a separate 336 KB file — reading it from the 53 MB scrub file instead
  gives 15 stalls and 11.1s to buffer. Sizing is deliberate: ≤400 KB is the threshold
  for the download to complete within one 2s playthrough at 200 KB/s.
- **Scrub file, time-to-fully-buffered on Regular 4G (500 KB/s):**
  **VP9 109.8s, H.264 `-g 3` 119.6s.**

A scrub advances ~7.5× real-time while 4G buffers at ~0.7× real-time, so a cold
scrub can never outrun a partial buffer. The hero therefore selects one of three
modes at runtime — FULL SCRUB, CLAMPED SCRUB, NO SCRUB — measuring actual
throughput rather than trusting `navigator.connection.effectiveType`. Mode may
only upgrade, never downgrade mid-session. See `TODO.md`.

---

## Test harness

`build/` holds the video verification tooling. Not part of the shipped site.

```bash
node build/serve.js 8787                  # static + HTTP Range + /results sink
node build/serve-throttled.js 8788 200 562  # Fast 3G
node build/serve-throttled.js 8789 500 20   # Regular 4G
```

- `scrub-test.html` — interactive harness, telemetry via `requestVideoFrameCallback`
  (real frame presentation, not rAF)
- `autotest.html` — self-running; POSTs results to `/results` so browsers that
  cannot be driven remotely can still report

Two bugs in the throttle server, both of which produced confidently wrong readings
before being fixed, are documented in comments in `serve-throttled.js`: truncating
responses via a buffer cap, and an unbounded token bucket that banked credit while
idle. Read those before trusting or modifying it.

---

## Deployment

Vercel. Not configured yet.
