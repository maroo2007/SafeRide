# SafeRide — Open Items

Items requiring a decision, real data, or work deferred past the current phase.

---

## Blocking content gaps — must resolve before launch

### 1. Placeholder stats (`0+`) — two sections
The source site at https://safe-ridee.vercel.app/ renders `0+` for every stat.
Per spec §4.2 and §12, these either get real numbers or the sections are removed.
**Do not ship placeholder zeros.**

Stats Band (§4.2) — needs real figures:
- Partner Schools
- Protected Students
- Smart Buses
- Journey Safety (%)

Coverage section (§4.7) — needs real figures:
- Smart Buses
- Students Protected
- System Uptime (%)

**Owner: client.** Blocked until real numbers supplied.

### 2. Dead social links
Footer social icons all point to `href="#"` on the source site (§4.13, §12: no dead links).
Either supply real profile URLs or the icons are removed.

**Owner: client.** Default if unanswered: remove the icons.

---

## Engineering follow-ups

### 3. Contact form email delivery
Form posts to `/api/contact` with React Hook Form + Zod validation (§4.11).
Route logs the payload only — no real email service wired.
Needs a provider (Resend / SendGrid / SES) plus `CONTACT_TO_EMAIL` env var.

### 4. Safari AND Firefox scrub behaviour — UNVERIFIED

**Safari:** `-g 2` / `-g 3` non-keyframe seeking is **untested on Safari**. No macOS
machine or BrowserStack account available; Safari does not exist on Windows. Safari is
historically the weakest browser at non-keyframe seeking, so this is the highest
residual risk in the video pipeline.

**Firefox: VERIFIED.** This paragraph previously said Firefox was not installed and all
measurements were Blink-only. That was already false when written — Firefox 155 was
installed during the encode phase and the Gecko seek numbers are in the table below,
captured via the result sink in `build/serve.js` (`build/results.jsonl`,
`build/results_run1.jsonl`). Leaving the contradiction in place later misled me into
proposing a reinstall. Only **Safari** remains unverified.

What the Gecko run does NOT cover: sticky pinning under Lenis, the scrub binding under
Lenis, and `backdrop-filter`. Those are rendering behaviours, not seek timing, and they
matter from the navbar onward.

Mitigation already built, so the untested risk costs nothing:
Safari is served the conservative **`-g 1` all-intra H.264** build via `<source>`
selection. This build also measured the *fastest* seeking of every variant
(p50 27.1ms), so it is both the safe choice and the best-performing one — it is
simply the largest at 96.1 MB.

If scrub stutters on macOS/iOS despite this, the all-intra H.264 build is already
the Safari default and no further change is needed.

Exposure is narrower than it first appears: iOS Safari falls back to the 720p
mobile variant below 768px and does not scrub at all, so this is **desktop Safari
on macOS only**.

### 5. Parallax layer images not yet produced
`§3.2` requires three owned layer images:
- `public/images/parallax/layer-1.webp` (back, yPercent 70)
- `public/images/parallax/layer-2.webp` (mid, yPercent 55)
- `public/images/parallax/layer-4.webp` (front, yPercent 10)

The original component ships `cdn.21st.dev` Osmo mountain demo assets which
**must not ship** (§12). Solid-colour placeholders in the interim, matched to the
video's palette. Layer 3 is title text, not an image.

### 6. Arabic translation deferred
Site is bilingual (EN / العربية) per §2.2-F and §4.3 item 9. Phase 1 ships the
language toggle and RTL-capable layout; actual Arabic copy is deferred.
No machine-translated Arabic to ship — needs a human translator.

---

## Environment

### 7. `C:/` is a git repository rooted at drive level
`C:/` is a **Flutter SDK clone** (`origin https://github.com/flutter/flutter.git`,
branch `stable`) with ~209 modified/deleted entries in its working tree.

This project is isolated from it by its own `.git` at `C:\projects\saferide`
(git's nearest-`.git` rule), so git operations here never touch the Flutter clone.

Needs cleanup, **unrelated to this project.** Not investigated per instruction.

---

## Video pipeline — resolved, recorded for provenance

Source `saferide-hero-source.mp4` is **24fps content in a 30fps container**
(1569 frames, 1192 unique; exactly 24 unique frames per second).

Locked encode recipe:
```
mpdecimate,fps=24,minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=256
```

Two findings worth preserving:

- **`search_param=256` is mandatory.** The default of 32px is far too small for the
  fast camera dive at ~43s; at the default, the New Cairo / Nasr City / 5th of
  October billboards smear into illegible text. Not caused by scene cuts —
  `scd_threshold` tuning produced byte-identical output, and splitting at the
  detected cuts did not help either.

- **Never use `mpdecimate,setpts=N/24/TB`.** It deletes the two intentional holds
  (orange frame 9.667–11.067s, white-out 32.633–34.000s) and shortens the video
  to 49.67s, breaking two of the six match-cut anchors. `mpdecimate,fps=24`
  preserves both holds and the full 52.30s duration.

**Duration must be 52.30s on every downstream build. Assert it.**


---

## Video pipeline — measured results

All scrub builds assert **2510 frames / 52.291667s**. Keyframes verified exact:
`-g 1` = 2510, `-g 2` = 1255, `-g 3` = 837.

Seek latency, fully buffered, 40 deterministic random seeks per engine:

| build | size | Chrome p50 / p95 | Firefox p50 / p95 |
|---|---|---|---|
| H.264 `-g 1` all-intra | 96.1 MB | 27.1 / 48.6 ms | **5-8 / 10-11 ms** |
| VP9 `-g 3` | 53.6 MB | 34.7 / 47.1 ms | 8-14 / 31-33 ms |
| H.264 `-g 3` | 58.4 MB | 37.6 / 62.6 ms | 15-22 / 25 ms |
| AV1 `-g 3` | 37.3 MB | **89.4 / 123.2 ms** | 37-38 / 63 ms |

**AV1 rejected** — slowest in both engines despite the smallest file.

**Firefox does not materially diverge from Chrome.** It is ~2-3x faster on every
variant and changes no decision. One apparent outlier in run 1 (H.264 `-g 3`
max 325ms) did not reproduce in run 2 (max 26ms) and was a cold-start artifact.

### Network
- Idle loop on Fast 3G: first frame 405ms, playing 565ms, buffered 1.88s.
- **Scrub time-to-fully-buffered on Regular 4G: VP9 109.8s, H.264 `-g 3` 119.6s.**

110s is above the 90s threshold at which CLAMPED mode was said to need to feel
"genuinely good rather than merely acceptable". A 4G user sits in CLAMPED for
roughly a minute and a half. Budget real design attention for the buffer-edge
hold in Phase 2.

### Runtime mode selection (approved design)
FULL SCRUB / CLAMPED SCRUB / NO SCRUB, chosen from **measured** throughput on the
scrub file request, not `navigator.connection.effectiveType`. `saveData` forces
NO SCRUB. Mode may only upgrade, never downgrade mid-session.

---

## CLAMPED is the primary experience, not a fallback — design it first

At 109.8s time-to-fully-buffered on Regular 4G, a mobile visitor spends
essentially their whole session in CLAMPED. It is not a transitional state they
pass through. For most Egyptian mobile visitors — and school administrators in
Cairo on 4G are the primary audience — **CLAMPED is the experience.**

**Therefore, in Phase 2, build CLAMPED before FULL.** If CLAMPED feels good, FULL
is a bonus for desktop-on-broadband. If FULL is built first and CLAMPED treated as
the degraded path, the majority experience becomes the broken-feeling one.

Requirements for CLAMPED:

- **The buffer-edge hold must read as intentional.** Ease into the last available
  frame; never hard-stop. A held frame that settles looks deliberate; one that
  snaps looks stalled.
- **Overlay copy and CTAs stay fully live and on-schedule** regardless of where the
  video is. The text carries the hero; the video decorates it. **Never gate a CTA's
  appearance on video progress.**
- **No spinner, no progress bar, no "loading" language.** The user should never
  learn that something didn't finish.
- **The unlock as buffering advances must be invisible** — the video simply starts
  following the scroll again.

---

## Phase 1 — deviations from the spec, for your call

Three places where the spec's stated stack no longer matches reality. All are
cheap to reverse; none is blocking.

### Next.js 16, not 15
Spec 6 says "Next.js 15 (App Router)". `create-next-app@latest` now installs
**16.3.4** (React 19.2.8). Built and typechecked clean. Reversible with
`pnpm add next@15 eslint-config-next@15` if you want the spec version pinned.

### `lenis`, not `@studio-freight/lenis`
Spec 1.4, 3.1 and 6 all say `@studio-freight/lenis`. That package is
**deprecated and frozen at 1.0.42**; npm redirects to `lenis`. Installed
`lenis@1.3.26`. This is a rename, not a fork.

### Visual identity now comes from ui-ux-pro-max, not the old site

Per direction: the previous site's theme is discarded. **Only its copy is
reused.** The design system is now sourced from the skill:

| layer | source | value |
|---|---|---|
| Pattern | Trust and Authority + Conversion | proof-led, WCAG AAA, "accent for CTA only" |
| Palette | Trust navy + premium gold | `#0f172a` / `#a16207` on `#f8fafc` |
| Type | SaaS Boutique | Calistoga display + Inter body + JetBrains Mono labels |
| Dark | Modern Dark (Cinema) | layered near-black `#050506`, 16px radius, expo easing |

Two deliberate departures from the skill's raw output:

- **Its indigo accent (`#5E6AD2`) is not used.** Spec 12 bans indigo, and the
  pattern's own anti-patterns list rules out AI purple/pink.
- **Its returned colour row (`#DC2626` red / `#2563EB` blue) is not used
  either.** It contradicted the same result's stated colour strategy
  ("Navy/Grey corporate. Trust blue. Accent for CTA only") and read as a
  generic alert palette. The Banking/Legal "trust navy + premium gold" row
  matches the strategy line and the product.

**Why gold specifically:** the hero video is warm amber on near-black for its
full 52 seconds and cannot be re-graded. A gold accent makes the film read as
an intensified brand note. A blue- or red-accented system would leave the
centrepiece looking like it belonged to a different site.

The whole palette passes AA as text on both page and card, in both themes,
with no adjustment needed — unlike the previous orange, which failed at 2.47:1.

### Also found: Privacy Policy and Terms of Service are dead links
Spec 4.13 flags only the social icons. In fact the live footer has **6** links
with `href="#"` — the 4 social icons *plus* **Privacy Policy** and **Terms of
Service**. Those two need real pages, not just a URL; they are legal documents.
Spec 12 says no dead links ship.

---

## KNOWN ASSET ISSUE — the film's orange is off-brand

**Do not "fix" this by moving a token.** The mismatch is known, accepted and
temporary. `--accent` stays `#FB8A00`.

The shipped app is canonical: it is in parents' hands, and changing it would mean
the app, the app stores, and anything already printed. The film is unpublished
marketing collateral, so the film moves.

### Measured deltas

Sampled by full-image pixel scan (`build/palette-scan.py`), pixel counts shown.

| | hue | sat | light | luma |
|---|---|---|---|---|
| film `#B9551A` | 22° | 75% | 41% | 43 |
| app `#FB8A00` | 33° | 100% | 49% | 99 |
| **delta** | **+11°** | **+25pt** | +8pt | **2.3x brighter** |

Not a grading artifact: the film has full dynamic range (white-out reaches
`#FDFDFD` luma 250, wordmark ground `#030302` luma 0). The flat orange hold
matches the lit bus stripe, and a flat fill has no lighting excuse.

### Elements needing the warm shift

| element | timestamp | sampled | pixels |
|---|---|---|---|
| bus stripe | 13.0s / 15.0s | `#BB561B` / `#BD5B25` | 9,717 / 31,921 |
| painted SAFERIDE mark | 13.0s / 14.0s | `#BB551B` / `#B75319` | 8,312 / 5,395 |
| bus stripe, early clip | 4.0s | `#B75719` | 887 |
| **solid orange hold** | **16.75s** | **`#BA5A26`** | 53,953 (20.8%) |

### Cost and timing

The re-grade is a colour pass on the master, which means **re-running the whole
interpolation and encode ladder** (~55 min interpolation + the full variant set).
Not worth blocking on. Do it **before launch, not before Phase 2**.

**Until then the video on screen will not match the site's accent.** That is
expected. Anyone who "notices the bug" should be pointed at this entry.

---

## Open question for the brief: the hero copy has no readable plateau

Spec §1.6 gives the hero copy fade as progress `0.00 -> 0.12`. Implemented
literally (`fadeOutFrom: 0`), the copy begins dissolving on the **first pixel
of scroll** — there is no point after load where it sits at full strength for
a beat.

Measured worst-case contrast for the headline through that window, with the
scrim held (see `HERO.scrimHoldTo`):

| progress | copy opacity | headline worst |
|---|---|---|
| 0.00 | 1.00 | 7.28:1 |
| 0.01 | 0.92 | 6.38:1 |
| 0.02 | 0.83 | 5.75:1 |
| 0.03 | 0.75 | 4.65:1 |
| 0.04 | 0.67 | 4.20:1 |
| 0.06 | 0.50 | 3.00:1 |

7.28:1 exists only at exactly progress 0. By 90px of scroll the headline is
already under 4.5:1, purely because it is dissolving.

The spec text does not say whether the fade must *start* at 0 or merely
*finish* by 0.12. **Not changed unilaterally — it is a reading of the brief.**
A hold of `fadeOutFrom: 0.03` would give the headline roughly 135px of scroll
at full strength before it goes, and costs nothing else.

## Known-good scrim geometry — do not "simplify" these

Two shipped defects came from the same mistake in different clothes: a gradient
that has not reached its transparent stop by the end of its box gets cut off
square, and that square is a visible hard edge.

- `CAPTION_SCRIM` must be rendered against the **viewport**, not the
  `max-w-6xl` content column. Inside the column its left edge is at
  `(W-1152)/2`, not a screen edge, and the ellipse is sliced there.
- `HERO_SCRIM`'s last stop is at 90% because the gradient line at 98° still has
  ~4-5% alpha at the right edge if it runs to 96%.

Both are covered by tests in `__tests__/video-scrub.test.ts` §2b, which check
the alpha along every viewport edge rather than trusting the CSS by eye.

---

## Runway: 600vh -> 1200vh

Changed in `lib/video-scrub.ts` (`RUNWAY_VH`), consumed by the hero. Verified
in-browser: runway 10800px at a 900px viewport, scrollable span 9900px.

| | 600vh | 1200vh |
|---|---|---|
| scrollable span | 500vh | 1100vh |
| film seconds per 100vh | 10.458 | **4.754** |
| scrub rate vs real time | 7.5x | **3.41x** |
| FULL_RATIO threshold | 8.0 | **3.91x** |

**`SCRUB_RATE` is now derived, not typed in.** It was calibrated at 600vh.
Left at 7.5 after doubling the runway, `pickMode` would have demanded roughly
twice the throughput the scrub actually needs and parked visitors in CLAMPED
who could have had FULL. The threshold drop from 8.0x to 3.91x is the single
biggest behavioural consequence of this change, and it is a good one.

### Frame timing: unchanged

The runway maps scroll to PROGRESS; progress maps to film time by
`t = progress x duration`. Neither touches the encode. Duration is still
2510/48 = 52.2917s.

### Captions: same frames, more scrolling

Scheduled in progress, so a longer runway changes how far you scroll to reach
a caption, never which frame it lands on. Verified in-browser at 1440x900:

| caption | film time | scroll at 600vh | scroll at 1200vh |
|---|---|---|---|
| boarding | 11.1-17.0s | 508px | 1117px |
| alerts | 22.0-32.6s | 912px | 2007px |
| coverage | 34.0-43.0s | 775px | 1704px |
| hero copy fade | 0.00-0.12 progress | 540px | **1188px** |

The hero-copy fade doubling materially improves the open question logged above:
the copy still has no full-opacity plateau, but a reader now spends 1188px of
scrolling inside the fade rather than 540px.

### One thing the in-browser check surfaced

At progress 1.0 the film read 42.47s rather than 52.29s, and at progress 0.6502
it read 33.93s rather than 34.0s. That is `clampToBuffer` working: the playhead
was held at the buffered edge. It is also the clearest demonstration of why
captions run on progress and never on `currentTime` — the caption still lands
at the right scroll position while the film itself is running behind.

---

## Phase 2 close-out

### Resolved this pass

**Hero copy plateau.** `fadeOutFrom` 0 -> 0.03. Spec 1.6 says the fade
finishes by 0.12, not that it starts at 0. Measured across the whole plateau,
both viewports, copy at full opacity throughout:

| progress | headline | eyebrow |
|---|---|---|
| 0.000 | 7.28:1 | 11.51:1 |
| 0.010 | 7.19:1 | 11.66:1 |
| 0.020 | 6.72:1 | 10.96:1 |
| 0.030 | 6.74:1 | 10.24:1 |
| **worst anywhere on the plateau** | **6.72:1** | **10.24:1** |

297px of scrolling at a 900px viewport. `scrimHoldTo` moved 0.06 -> 0.075 with
it: the copy now passes half opacity at 0.075, and the scrim must still be at
full strength there or the ground brightens while the ink weakens.

**The `.dark` class on the hero — a real bug, now fixed.** The hero styled its
dark surface with `bg-surface-dark`, a background utility, and never carried
`dark`. So `--accent-edge: transparent` and the dark `--accent-lift` — both
written specifically for this surface — had **never once executed on it**. The
CTA wore a `#b9551a` ring over footage for the entire project, which is the
exact thing the token exists to prevent.

Verified after the fix: `borderColor: rgba(0, 0, 0, 0)`, `--accent-edge:
transparent`, `box-shadow: rgba(0,0,0,.3) 0 2px 6px`.

Re-measured on the REAL hero over footage, worst of 12 frames in the visible
window. The earlier table was taken on /cta-lab, which never carried `dark`,
so it described a state that no longer exists:

| | label | boundary |
|---|---|---|
| primary | **8.58:1** (was 8.28) | **6.38:1** |
| secondary | 10.47:1 | 5.02:1 |

The token comment claimed "on #030302 the fill is already 8.58:1 so the
boundary is unnecessary". With the ring gone, the boundary is now the fill
against the footage itself: 6.38:1, comfortably over 1.4.11's 3:1. The claim
holds, and is now measured on the surface it was written for.

Guarded by a three-link test (hero carries `dark`; `.dark` neutralises the
edge; `.accent-fill` reads the token rather than a literal). Each link proved
by breaking it.

### NOT done in Phase 2 — carried forward

1. **The idle-loop -> scrub handoff is not built.** `saferide-hero-idle.mp4`
   is `<link rel=preload>`-ed in layout.tsx but no component ever plays it;
   the hero sources only the scrub and mobile files. So today that preload
   costs 336 KB of bandwidth for a file nothing uses — worse than not having
   it. Either wire the handoff or drop the preload.
2. **GSAP ScrollTrigger is not used by the hero.** Spec Phase 2 lists "the
   ScrollTrigger binding". The hero binds the playhead with native scroll plus
   rAF instead, which is deliberate — ScrollTrigger's scrub smoothing fights
   `clampToBuffer` for control of the playhead. `registerGsap()` IS wired via
   lib/lenis.ts, so the single-registration guarantee holds for Phases 3 and 4.
   Flagged as a deviation rather than presented as the spec's approach.
3. **Safari and Firefox remain UNVERIFIED** (entry 4 above). All scrub
   measurements in this project are Chrome/Blink only.

### Idle-loop handoff — built, but the 405ms claim is still unverified

The handoff works (spec 1.4.1-2): the idle file plays immediately, the scrub
file's sources are withheld until the idle has painted, and the first scroll
input hands over once the scrub has a decodable frame.

Measured on Fast 3G (204 KB/s, 562ms RTT) against the **dev server**:

| | value |
|---|---|
| time to first decoded idle frame | 8984 ms |
| idle buffered at handoff | 2.0 s (readyState 4) |
| scrub buffered at handoff | 1.1 s (readyState 3) |

The ordering is right — the idle wins the race, which is the entire point of
withholding the scrub's sources. But **8984 ms is not the production number
and must not be quoted as one.** A Next dev server sends unminified bundles
with no compression and no CDN, so on a throttled connection the time is
dominated by JavaScript, not by the 336 KB video. The spec's 405 ms figure
needs `next build && next start` to confirm or refute. Until then it is
UNVERIFIED.

---

## The 405ms claim does not hold. Measured against a production build.

`next build && next start` on :3100, Chrome, cache disabled, Fast 3G emulated
at the 204 KB/s / 562ms RTT profile this project measured.

### Full page, cold load

| | production |
|---|---|
| hero markup present | 2313 ms |
| **IDLE first decoded frame** | **5534 ms** |
| SCRUB first decoded frame | 7706 ms |
| unthrottled, idle first frame | 1371 ms |

### Each file fetched ALONE, nothing competing

| file | first decoded frame |
|---|---|
| `saferide-hero-idle.mp4` (336 KB) | **822 ms** |
| `saferide-hero-scrub.webm` | 2085 ms |
| `saferide-hero-scrub.mp4` | 1263 ms |

### Verdict

**CORRECTION to an earlier claim in this file.** I first wrote that 405 ms was
"arithmetically impossible" because 405 ms buys ~83 KB at 204 KB/s while the
file is 336 KB. That reasoning is wrong, and I am retracting it: `readyState 2`
needs only the first frames, measured here as 0.22 s of buffered video, so a
first frame from ~80 KB is entirely plausible.

The two numbers are not in conflict — they measure different things. 405 ms
came from `build/serve-throttled.js` timing the video fetch on an already-open
connection. 822 ms is the same file through the production build with the
cache explicitly disabled, so it pays a cold connection. Under a 562 ms RTT a
cold fetch cannot return a first frame in 405 ms; a warm one can.

**What actually matters is neither.** A real visitor pays the full cold page
load: **5534 ms** to first idle frame in production on Fast 3G. That is the
number to quote.

**The split is still worth keeping, but for a smaller reason than the spec
gave.** Head to head, the idle file shows film **1263 ms** sooner than the
webm scrub (which is what Chrome selects) and 441 ms sooner than the mp4. In
the real page the gap measures 2172 ms, though part of that is our own design
withholding the scrub's sources until the idle paints.

So: roughly **one to two seconds** sooner to first frame, not an order of
magnitude. Worth the 336 KB. The "405 ms instead of 15 stalls" framing should
not be repeated.

### Dev overlay — absent in production, confirmed

| | production (:3100) | dev (:3000) |
|---|---|---|
| dev overlay elements | `[]` | `nextjs-portal` |
| react-refresh / HMR scripts | none | none in DOM |
| custom elements | `next-route-announcer` only | `nextjs-portal`, `next-route-announcer` |

`next-route-announcer` is the visually-hidden accessibility live region, not
the overlay. This closes the cyan/green line question with evidence: those
lines were the dev overlay's, and it does not exist in a production build.

### Gecko: the navbar-relevant behaviours, checked against the production build

The earlier Gecko run covered **seek timing on the encoded files** and nothing
else. It said nothing about the three things the navbar sits on. Those are now
checked separately, on Firefox 155 against `next start` on :3100, via the same
result sink (`build/gecko-check.html`, copied into `public/` to run).

| check | Gecko result |
|---|---|
| runway height | 6720px at a 560px viewport = **1200vh** |
| sticky pin under Lenis | scrolled 0 → 616 → 1848 → 3696; sticky `top` **0 at every point** |
| scrub binding under Lenis | t = 2.61 / 7.84 / 15.69 against expected 2.61 / 7.84 / 15.69 — **exact** |
| idle → scrub handoff | fired; idle opacity 0, scrub opacity 1 |
| `backdrop-filter` | supported **unprefixed**; `-webkit-backdrop-filter` is NOT supported |
| Lenis | `lenis` class present on `<html>` |

Nothing Gecko-specific needs changing.

**The first run of this check was a false negative and the fault was mine.**
It reported the sticky pin holding and the scrub never advancing. Both were
artefacts of the iframe never scrolling: `w.scrollTo` alone had no effect, so
"sticky top stayed 0" and "playhead stayed 0" were the same non-event. Adding
`scrollingElement.scrollTop` fixed it. A check that cannot distinguish "passed"
from "never ran" is not a check — the harness now records scrollY alongside
every reading.
