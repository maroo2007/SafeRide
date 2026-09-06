# SafeRide — Open Items

Items requiring a decision, real data, or work deferred past the current phase.

---

## Blocking content gaps — must resolve before launch

### 1. ~~Placeholder stats (`0+`)~~ — RESOLVED 2026-09-06: both stat sets are CUT

No real figures exist, so nothing ships rather than zeros. **This is a
decision, not a block** — do not wait on it and do not invent numbers.

- **§4.2 Stats Band — the whole section is cut.** It is nothing but the four
  stats (Partner Schools, Protected Students, Smart Buses, Journey Safety), so
  removing them removes the section.
- **§4.7 Coverage — only the three-stat row is cut** (Smart Buses, Students
  Protected, System Uptime). The section stays: its fourteen-city list is not
  blocked on data, it is the `#coverage` target the navbar links to, and it is
  scheduled into phase 5b.

Reading noted: the instruction was "cut both sections", and §4.7 is not only
stats. Cutting it wholesale would delete the fourteen cities that the same
message scheduled into 5b, so the stats came out and the section stayed. Say
if that is the wrong call.

If real data arrives, §4.2 comes back and §4.7 regains its row. Until then
their absence is more credible than their presence — placeholder zeros are
what undermined the original site.

### 2. ~~Dead social links~~ — RESOLVED 2026-09-06: all six links removed

Not repointed. Removed. The four social icons come out entirely, and so do
**Privacy Policy** and **Terms of Service** — a link to an empty page is worse
than no link.

See entry 8 for the legal documents, which are launch-blocking in their own
right and are not solved by having removed the links to them.

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

### 5. ~~Parallax layer images~~ — REMOVED with Section 3

Struck, not pending. No assets are needed and none should be produced. See
"Section 3 removed" below.

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


### 9. Remove the "Interaction states" scaffolding before launch

`app/page.tsx` still renders a Phase 1 design-system block — button variants
and token swatches. It keeps the token system visible while sections are built
on top of it and it must not ship. Delete it once §4's sections are in.

### 8. Privacy Policy and Terms of Service — LAUNCH-BLOCKING

Not a nice-to-have and not a Phase 5 task. **SafeRide handles children's
biometric data** — face recognition attendance, §4.3 item 3 — so a privacy
policy and terms of service are a legal requirement, not a footer convention.

They need real pages with real legal content, written or reviewed by someone
qualified. Removing the dead links (entry 2) stops us shipping links to empty
pages; it does not make the documents unnecessary.

**Blocks public launch. Does not block any build phase.**

**Owner: client.**
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
- **Idle loop first decoded frame, Chrome, Fast 3G (204 KB/s, 562ms RTT):**
  405ms fetched alone on a warm connection; 822ms alone cold with cache
  disabled; 5534ms as part of a full cold production page load. For
  comparison, cold and alone: `saferide-hero-scrub.webm` 2085ms,
  `saferide-hero-scrub.mp4` 1263ms. The split is justified by the idle
  showing film 1263ms sooner than the webm source Chrome selects.
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
Service**.

**Resolved as far as the footer goes** (entry 2: all six removed). **Not
resolved as a launch requirement** — see entry 8.

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

### Idle-loop handoff — built; timings verified against a production build

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
dominated by JavaScript, not by the 336 KB video. Superseded by the
production measurements below.

---

## Idle-loop timings, measured against a production build

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

**Warm versus cold connection is the explanation, not an error in either
number.** 405ms was the file fetched alone over an already-open connection
(`build/serve-throttled.js`). 822ms is the same file alone through the
production build with the cache explicitly disabled, so it pays a fresh
connection. Under a 562ms RTT a cold fetch cannot return a first frame in
405ms; a warm one can.

An earlier revision of this entry called 405ms "arithmetically impossible"
because it buys ~83 KB against a 336 KB file. That reasoning was wrong and is
withdrawn: `readyState 2` needs only the first frames — 0.22s of buffered
video here — so a first frame from ~80 KB is plausible.

**What actually matters is neither.** A real visitor pays the full cold page
load: **5534 ms** to first idle frame in production on Fast 3G. That is the
number to quote.

**The split is still worth keeping, but for a smaller reason than the spec
gave.** Head to head, the idle file shows film **1263 ms** sooner than the
webm scrub (which is what Chrome selects) and 441 ms sooner than the mp4. In
the real page the gap measures 2172 ms, though part of that is our own design
withholding the scrub's sources until the idle paints.

So: roughly **one to two seconds** sooner to first frame, not an order of
magnitude. Worth the 336 KB. Quote the condition with the number: the split
buys 1263 ms against the webm source, and a first-time visitor waits 5534 ms
for film on Fast 3G.

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

---

## Navbar ground change: §2.3's preferred option cannot work. Measured.

> **SUPERSEDED IN PART, same day.** The header bar this section sizes a tint
> for was removed on instruction; there is no header and no 0.60 surface in
> the shipped page. The colour-inversion finding below still stands and is why
> inversion must not be re-proposed. The tint table is now the reference point
> for what replaced it, not a description of what ships — see **The header is
> gone** below.

Spec 2.3 offers scroll-progress-aware colour inversion as **preferred**, with a
blurred surface as the simpler fallback. Measured across all 209 frames of the
film at 4 fps, worst pixel in the top 72px band, both target viewports:

**151 of 209 frames have NO ink that clears 4.5:1.** Not dark, not light.

| progress | dark ink | paper ink | best available |
|---|---|---|---|
| 0.000 | 4.41 | 2.55 | 4.41 |
| 0.115 | 1.05 | 1.22 | 1.22 |
| 0.363 | 1.00 | 1.06 | 1.06 |
| 0.574 | 1.00 | 1.05 | 1.05 |
| 0.784 | 1.00 | 1.39 | 1.39 |

The reason is structural, not incidental: a full-width band across the top of
the frame crosses bright and dark regions **simultaneously** in most frames —
dark studio ceiling beside a lit bus roof, dark map beside a glowing node. A
single ink cannot serve both ends of the same band, so there is nothing to
invert *to*. The best merged run in the whole film bottoms out at 3.00:1.

The spec warns "do not ship a header that becomes unreadable during the
white-out at clip 4". The white-out is not the problem; 72% of the film is.

### The surface, sized by measurement

A dark tint of `--surface-dark` under paper ink, blur deliberately NOT modelled
because blur only reduces local extremes — a tint that passes without it passes
with it:

| tint alpha | worst frame | frames under 4.5 |
|---|---|---|
| 0.30 | 2.03:1 | 173 |
| 0.50 | 3.79:1 | 72 |
| **0.55** | **4.52:1** | **0** |
| 0.60 | 5.44:1 | 0 |
| 0.70 | 8.01:1 | 0 |

**0.55 was the floor; 0.60 shipped for about an hour.** 4.52:1 clears by 0.02, and bare-minimum
margins have already bitten twice in this project. `backdrop-filter: blur()`
goes on top of the tint for the glass read, unprefixed only — Gecko does not
support `-webkit-backdrop-filter`.

### Also: the component's CSS block is not in the spec

§2.1's TSX is complete and its fence closes at line 635. But §2.2 C says "the
component's CSS block ships with `--color-primary: #6366f1`" and instructs me
not to paste it — and **that block does not appear anywhere in the file.** No
`<style>`, no CSS, no styling for any of the ~25 classes the component depends
on. §2.2 C's instruction (map their variables onto SafeRide tokens) makes
writing it ourselves the intended end state anyway, but the structural geometry
— panel reveal, overlay layering, link-mask sizing — is being inferred from the
class names and the GSAP code, not copied. Flagged so it is not mistaken for a
faithful port. **This cost something concrete** — see "The panel had no ground
of its own" below.


---

## The header is gone; the trigger is a floating hamburger

On instruction: no fixed bar, no logo, no Menu/Close text button. The language
toggle and Log In moved inside the overlay panel. The trigger is the Uiverse
hamburger (JulanDeAlb) — two SVG paths morphing to an X on `stroke-dasharray`
plus a -45deg rotation — fixed top-right at 48px, above the overlay because it
is also the close control.

### The corner is easier than the band, and still not safe

The prediction going in was that a 48px square crossing one region rather than
the whole frame "should be far easier — you may find a small local tint or a
soft shadow is enough, or nothing at all". Two of those three are right.

Re-measured with `build/hamburger-ground.js`, 209 frames, worst pixel anywhere
in the button's box, at 1440x900 / 1920x1080 / 390x844:

| | full-width 72px band | 48px corner |
|---|---|---|
| frames where NEITHER ink clears 3:1 | 151 / 209 | **58 / 209** |
| bare white stroke, worst frame | — | **1.00:1** |
| bare white stroke, frames under 3:1 | — | **146 / 209** |

So: much easier, and **nothing at all is not an option** — a bare white stroke
misses WCAG 1.4.11's 3:1 on 70% of the film.

### What ships: a collar, not a plate

A 48px tint plate works (0.45 alpha clears 3:1 on every frame) but it is a
header by another name, and it has to be big enough to cover wherever the
stroke sweeps as the icon rotates. A collar — the same two paths painted
underneath at `stroke-width: 7` against the ink's `3`, in `rgba(3,3,2,.62)` —
**cannot miss, because it travels with the ink**, and it is the same idea as
the soft shadow, made exact: the colour immediately adjacent to the white is
known, and the film reaches it only through 38% transmission.

| ground | modelled | as painted (`build/shoot-hamburger.js`) |
|---|---|---|
| worst frame of the film | 5.86:1 | 5.96:1 |
| white-out | — | 6.01:1 |
| `--paper`, the sections below the hero | 6.05:1 | 5.91:1 |
| over the open panel | 19.94:1 | 19.51:1 |
| half way through the morph | — | 12.31:1 |

Model and paint agree within 0.15 across five grounds. 0 frames under 4.5:1, so
this clears the text threshold, not merely 1.4.11's 3:1.

### The case the film measurement could not see

The trigger is fixed and always visible, so it also floats over the content
sections below the hero, where the ground is `--paper` and a bare white stroke
is **1.02:1**. No amount of measuring the film would have found that. The
collar covers it (5.91:1 as painted), and the focus ring carries the same
collar for the same reason — `--ring` resolves to `--accent-warm`, which is
about 1.2:1 on paper on its own.

### Placement

48px at a 20px inset (14px under 640px). Checked by geometry at 11 scroll
positions at both 1440x900 and 390x844: no intersection with the headline, the
eyebrow, or either CTA at any of them; nearest approach 662px on desktop and
182px on mobile. The hero copy is left-aligned and vertically centred, so the
top-right corner is empty at every scroll position.

### Timing

600ms went to `--dur-state` (260ms). That is the project's token for a control
reporting its own state, and it is also why the morph needs no reduced-motion
rule of its own: globals.css zeroes every `--dur-*` under
`prefers-reduced-motion`. Confirmed in-browser — five transitions, all 260ms,
and `transition-duration: 1e-05s` under emulated reduced motion.

The icon now finishes well before the panel (GSAP defaults to 0.7s). That is
deliberate: the button reports its own state immediately and the panel arrives
after. If it reads as a desync, the fix is a longer icon morph, not a shorter
panel.

---

## Open: the scroll lock does not cover reduced-motion visitors

§2.3's scroll lock is `lenis.stop()`, and it is verified working — trusted
CDP wheel input moves the page 0px with the menu open and 1200px with it
closed, at both 1440x900 and 390x844.

But `getLenis()` returns `null` under `prefers-reduced-motion`, by design
(spec 12: reduced motion means no smooth scroll at all). So for those visitors
`stopScroll()` is a no-op and **the page scrolls behind the open overlay**.

Not shipped as a fix because every option has a cost the brief did not ask me
to spend:

- `overflow: hidden` on `<html>` removes the scrollbar, which widens the page
  by its width and shifts content behind a 72%-opaque overlay.
- The same plus a `padding-right` compensation fixes flow content but not
  fixed-position elements, which reposition against the wider viewport.
- `scrollbar-gutter: stable` site-wide removes the shift entirely and is
  probably the right long-term answer, but it reserves the gutter on every
  page at every time, which is a visual decision beyond this change.

The video does not scrub under reduced motion (the hero shows a still), so the
consequence is a modal that can be scrolled behind, not a broken hero.

**Recommendation:** `scrollbar-gutter: stable` on `<html>` plus
`overflow: hidden` while any modal is open, added to `stopScroll`/`startScroll`
so future modals inherit it. Wants a yes before it goes in.


---

## The panel had no ground of its own — the clearest cost of inferring CSS

The open animation looked broken: an orange slab with no content, "Features"
apparently outside the panel over the video and clipped mid-word, the other
five links missing.

The rects were never wrong. Sampled every frame with `build/diagnose-menu.js`:
**0 of 123 frames had a link outside the panel's rect**, and all six ended
inside it, unmasked, at opacity 1. The links were animating in the right
coordinate space the whole time.

What was wrong is that **the panel's rect is not the panel's paint.**
`.menuContent` had no background, so the only opaque thing in it was the three
`.backdropLayer` elements sliding in from the right. The links start at +0.35s;
the last layer does not land until 0.24 + 0.575 = **0.815s**. For 465ms the
copy was painted over whatever the layers had not reached — bare film at the
panel's left edge, and the transient orange beside it. Measured at 400ms:
layers at x = 946 / 1052 / 1207, panel's left edge at 880, first link at 920.

**The timeline could not have told me this.** A background that never animates
leaves no trace in the GSAP numbers, and the GSAP numbers were the only
specification of the layout available. This is the sharpest example so far of
what "inferred, not ported" costs: the inference reproduces everything that
moves and nothing that stands still.

### Fixed by giving the panel a ground and making it the thing that slides

`.menuContent` carries `--surface-dark`; the three layers are a tonal sweep
over it rather than the ground itself. And the panel animates
`xPercent: 101 -> 0` instead of being `set` to 0, so its ground arrives with
it and its content cannot outrun it. That also makes open and close symmetric
— close has always been a slide (`xPercent: 120`).

### The guard, and why the obvious one would have passed

`build/diagnose-menu.js` checks three things every frame and exits non-zero:
containment, **ground** (is anything opaque behind this link), and the end
state (unmasked, opacity 1). Run against the broken build it reports
`17/123 frames with a link over bare film — 359ms of copy over film`; against
the fix, `0/129`.

Two no-op findings on the guard itself:

- A check of "the menu opened" passes on the broken build. It did open.
- The first version of the ground check counted the ambient-shapes container
  as a backdrop layer. That container is full-width from the first frame, so
  every link always looked covered and **the check could never fail**. It
  reported "over bare video: none" on the build that is 465ms over bare video.

### Performance: measured, and it does not need tuning

Production build (`next build && next start` on :3100), Chrome **headed on a
real GPU** — headless rasterises in software here and is not a fair clock; its
baseline for a still page is 18.4ms p50 with a 30.5ms p95.

| | p50 | p95 | max | frames > 32ms |
|---|---|---|---|---|
| baseline, menu shut, video playing | 16.6ms | 17.2ms | 19.3ms | 0 |
| during the open | 16.6ms | 22-28ms | 54-61ms | **1-2** |

60fps median. The one or two long frames sit at t = 51-68ms and t = 123-149ms,
reproducibly. Removing the ambient shapes does not move them; removing the
video does not move them. They are the cost of the panel's first paint —
`display: none` to block, layer creation, React's commit and GSAP's first
write, all in one frame.

So the jank was the look of the defect, not a frame budget problem. **No
durations were changed.**


---

## The first link entered differently, and the tween was innocent

"Features" looked settled while the other five were still rising. It was not a
stagger problem and not a target-set problem.

Measured per frame with `build/diagnose-links.js`, decomposing each link's
computed transform matrix rather than reading the tween config:

| idx | label | travel | starts | ends | duration |
|---|---|---|---|---|---|
| 0 | Features | 90.72px | 326ms | 809ms | 483ms |
| 1 | AI Platform | 90.72px | 381ms | 871ms | 490ms |
| 2 | Coverage | 90.72px | 417ms | 903ms | 486ms |
| 3 | Pricing | 90.72px | 448ms | 961ms | 513ms |
| 4 | FAQ | 90.72px | 521ms | 1026ms | 505ms |
| 5 | Contact | 90.72px | 574ms | 1072ms | 498ms |

Identical travel, identical duration, a clean ~50ms stagger in DOM order. The
selector resolved to exactly six elements in DOM order; no `:first-child` rule
exists in the module; no link carried `data-menu-fade` (it is on the footer
div); every link had the same inline from-state.

### What it actually was: focus scrolled the row

**An `overflow: hidden` box is still programmatically scrollable, and
`.focus()` scrolls every ancestor to reveal its target.** §2.4's focus-into-
the-panel moves focus to the first link, which at that moment is translated
140% below its own 65px row. The browser did the only thing it could: it
scrolled that row down 50px to bring the link into view.

`rowScroll` for Features went to 50px at **t=78ms** — the focus call — and held
until 785ms, when the shrinking transform no longer left enough scrollable
overflow to sustain it. The visible position of a link is its transform minus
its row's scroll:

| t | transform | rowScroll | visible offset |
|---|---|---|---|
| 78ms | 90.7px | 50 | **40.7px** (others: 90.7px, fully hidden) |
| 362ms | 81.2px | 50 | 31.2px |
| 487ms | 43.4px | 50 | **-6.6px** — past its resting line |
| 550ms | 29.7px | 43 | **-13.3px** |
| 903ms | 0 | 0 | 0 |

So Features was half-revealed before it began moving, then carried 13px above
where it lands, then dropped back as the scroll clamped. Which is exactly
"already settled while the others are still rising".

Fixed with `focus({ preventScroll: true })` on all three focus calls — the
entry, the trap's Tab handling, and the return to the toggle. Nothing here
needs scrolling into view; the panel is on screen already.

### The guard, and what a plausible one would have missed

`build/diagnose-links.js` asserts five things and exits non-zero: rows never
scrolled, equal travel, equal duration, stagger in DOM order, and no link
crossing its resting line. Run against the broken build:

```
rows never scrolled            FAIL
equal travel                   PASS  (90.72px)
equal duration                 PASS  (spread 22ms)
stagger in DOM order           PASS
no link overshoots its slot    FAIL  (worst -14.3px, Features at t=565ms)
```

**Three of the five pass on the broken build**, including every check anyone
would think to write about a stagger. The tween was correct; a guard on the
tween proves nothing. The two that fail are the ones that look at what the
element ended up doing rather than at what it was told to do.


---

## Phase 3 close-out

Every claim below was checked in a browser against `next build && next start`
on :3100 — `node build/verify-phase3.js <profile> <out>`, which exits non-zero
and prints 32 PASS/FAIL lines. Three specialised rigs sit under it:
`build/hamburger-ground.js` (contrast against the film),
`build/shoot-hamburger.js` (contrast as painted, collision, morph),
`build/diagnose-menu.js` (panel ground, containment, frame timing) and
`build/diagnose-links.js` (per-link entrance).

| item | evidence |
|---|---|
| §2.4 aria-expanded / aria-controls / state-reflecting label | "Close menu" while open, "Open menu" after Escape |
| §2.4 role="dialog" + aria-modal | present while open, absent when shut |
| §2.4 focus trap | 12 real Tab presses, 9 distinct stops, 0 escapes |
| §2.4 focus return | `document.activeElement === toggle` after Escape |
| §2.4 reduced motion instant | one frame after the click: panel and link both `matrix(1,0,0,1,0,0)`, icon transition 1e-05s |
| §2.3 Lenis stop | trusted CDP wheel: 0px open, 1200px shut |
| hamburger contrast | 5.96:1 worst frame as painted, 5.91:1 over `--paper`, 19.51:1 over the panel |
| §2.2 F utilities in the panel | both inside the panel rect, 44px targets, toggle changes state and label |
| §2.2 A/B six shapes, brand tones | six ids, 9 distinct fills, none indigo |
| §2.2 C no `--color-primary` block | resolves to `#030917`, and the navbar does not redeclare it |
| §2.2 D "click me" | absent from the rendered DOM |
| §2.2 E logo | 0 `<header>` elements, 0 logo images |

### Two things the close-out found, which the phase would otherwise have shipped

**The ambient shapes painted nothing.** `.bgShape` is `opacity: 0;
visibility: hidden` at rest and `.active` restored only the visibility, so the
container stayed at opacity 0 while GSAP faithfully animated its children to
opacity 1 inside it. Every guard passed — six shapes present, visibility
visible, children at opacity 1, all fills brand tones — because every guard
asked about the children or the source. Caught by diffing the panel hovered
against not-hovered.

**And the first version of that diff passed too.** The hovered link's own
background band is 57/255 on this ground and sits inside the panel, so the
diff reported "perceptible" on a build whose shapes were 0. Excluding the
hovered row leaves the shape: 0/255 before the fix, 75/255 after.

Third instance in this phase of the same shape of error: a check that looks
adjacent to the thing rather than at it.

### Frame timing: nothing left to tune

Production build, headed Chrome on a real GPU (headless rasterises in software
here and reports 18.4ms p50 for a still page, so it is not a fair clock).

| | p50 | p95 | long frames (>32ms) |
|---|---|---|---|
| baseline, menu shut, video playing | 16.6-16.7ms | 16.9-18.1ms | 0 |
| animated open, 3 runs | 16.6-16.7ms | 20.3-21.7ms | 1, 2, 2 — at t≈39-56ms and t≈148-184ms |
| **reduced-motion open, no tween at all** | 16.7ms | 16.9-17.5ms | 0, 2, 1 — **at t≈37ms (twice) and t≈120ms** |

The reduced-motion row is the attribution: with **no animation whatsoever**,
the same spikes appear at the same moments. They are the panel's first paint —
`display: none` to block, layer creation, React's commit — not the tween.
Median is a clean 60fps either way.

The original "glitchy and laggy" is accounted for by the two defects, not by a
frame budget: content painted over bare film for 465ms, and the first link
half-revealed then snapping 13px back into place.

### focus(), audited

Three call sites in the entire application, all in the navbar, all now
`{ preventScroll: true }`: focus into the panel, the trap's Tab handling, and
the return to the toggle. No `scrollIntoView`, no `autoFocus`, no programmatic
`scrollTo`/`scrollBy` in shipped source. `__tests__/focus-scroll.test.ts`
makes it codebase-wide rather than navbar-local, because any focusable inside
a masked or transformed container has the same problem and the next one should
not have to rediscover it. An explicit `{ preventScroll: false }` still passes
— that is a decision, and it reads as one.


---

## Section 3 removed

The post-video parallax transition is **struck, not deferred.** Removed on
instruction after the ground and geometry had been built and measured against
solid-colour placeholders.

Gone: `components/ui/parallax-scrolling.tsx`, its CSS module, the three
placeholder images, `build/measure-parallax.js`, and the mount in
`app/page.tsx`. `parallax`, `Osmo`, `cdn.21st.dev` and `data-parallax-layer`
return **zero hits** in `app`, `components`, `lib`, `__tests__` and `public`,
with no commented-out remnants. Four prose references in unrelated files
(globals.css, layout.tsx, the Lenis provider, lib/gsap.ts) were rewritten
rather than left pointing at something that no longer exists.

**Nothing depended on it.** No preload was ever built for the layers
(`app/layout.tsx` preloads only the hero's idle loop), no height was reserved,
and no scroll arithmetic accounted for it — the hero's runway is computed from
`RUNWAY_VH` alone and the content sections follow in normal flow.

**What it was doing that still needs an answer:** it bridged the film's last
frame into the light content sections. Without it the pin releases from dark
ink straight into `--paper`. Captured rather than assumed — see the capture
sent with this pass.


---

## The film's last frame was unreachable, from the day clampToBuffer shipped

`clampToBuffer` computed `hardLimit = edge - SAFETY_MARGIN`, and `edge` cannot
exceed `duration`, so the ceiling was `duration - 0.35` permanently. The 2.5s
knee then took more on top: with the whole file buffered it returned **51.346**
for a target of 52.292, and the browser sat at **51.337 forever**, readyState 4,
53 MB in memory.

The wordmark resolving — what the entire 52-second sequence is choreographed
toward — had never been shown. Not in a capture, not in a test, not once.

### The fix, and the trap inside it

`SAFETY_MARGIN` keeps the playhead behind the *download* edge. When the file is
complete there is nothing to be safe from, so the margin does not apply.

**Raising `hardLimit` to `duration` is not enough on its own.** The knee only
asymptotes toward the limit: `t = over / (KNEE * KNEE_SPAN)` reaches 1 at
`over = 7.5s`, which needs `target >= duration + 5`. With `hardLimit = duration`
it returns **51.55** — better, still not the last frame. **A guard asserting
`hardLimit === duration` would have passed on that.** So when the file is
complete the knee does not apply either: the end of the film is not an edge to
decelerate into, it is the end.

### Guarded by outcome, and proved three ways

`__tests__/video-scrub.test.ts` §1a. Each break was applied, confirmed to have
landed, and the failure observed:

| break | caught by |
|---|---|
| fix reverted entirely | "returns the target exactly once the whole file is buffered" |
| **half-fix: hardLimit raised, knee left in** | same guard — which is the point |
| margin lifted everywhere, not only at the end | "changes NOTHING while the file is still downloading", plus both existing mid-scrub guards |

**Mid-scrub is bit-identical.** The property test re-derives the pre-fix
function and compares across the whole (edge, target) space where
`edge < duration`: **43,000+ pairs, largest difference 0.000e+0**. A 1,083,656-
pair sweep at finer resolution gave the same answer.

### And in the browser, which is what was actually asked for

`node build/measure-scrub-lag.js` now asserts the outcome and exits non-zero:

| | before | after |
|---|---|---|
| playhead at progress 1.0 | 51.337s | **52.292s of 52.292s, short by 0s** |
| settle after input stops | never within 0.02s | **826ms** |
| binding lag, buffer not limiting | p50 0.524s / 99px | p50 0.532s / 101px — unchanged, and accepted |

### One process note

The first attempt at these guards was never written to disk — the tool call
carrying it died on a transient outage, and I read the unchanged "45 passed" as
"the guards do not catch it" rather than "the guards do not exist". The break
harness now diffs the file and aborts with `ABORT — the break did not take` if
the mutation did not land, because a green run after a no-op edit means nothing.


---

## Phase 5a — the section ground, settled before any content

Built first, per the navbar lesson: the menu panel shipped with a correct rect
and no paint because the ground was never decided separately from the thing
standing on it. Eleven sections is that trap eleven times.

### There are two tones, not four, and the reason is measured

The obvious rhythm is to alternate light grounds. It does not exist:

| | contrast |
|---|---|
| `--background` (paper) -> `--card` (#ffffff) | **1.057:1** |
| `--background` -> `--muted` (warm-100) | 1.104:1 |
| `--background` -> a `--border` hairline (warm-200) | 1.29:1 |
| `--background` -> `--surface-dark` | **19.51:1** |

At 1.06:1 a card-toned band is not a band, it is the same page with a different
token name — any separation it appears to have comes entirely from a border
doing the work, which is a line pretending to be a ground. So `paper` and
`dark`, and rhythm comes from vertical space and the occasional dark section,
both of which are real.

Verified as rendered on the production build (`node build/verify-sections.js`):

| section | ground | heading | eyebrow |
|---|---|---|---|
| Platform | rgb(253,248,240) | 18.82:1 | 8.70:1 |
| The Journey | rgb(253,248,240) | 18.82:1 | 8.70:1 |
| Intelligence Layer | rgb(3,3,2) | 19.94:1 | 8.93:1 |

Neighbours: Platform -> Journey is 1.00:1 of ground and **337px** between their
content; Journey -> Intelligence is **19.51:1**. Both separable, by different
mechanisms, which is the point.

### Guards, each proved by breaking it

| break | caught by |
|---|---|
| the paper tone inherits the page instead of declaring a ground | "every section declares an opaque ground of its own" — and the headings drop to **1.06:1** |
| `bg-surface-dark` without the `dark` class | "resolves the dark token scope" — and the heading measures **1.04:1**, which is the hero's CTA bug exactly |
| vertical rhythm collapsed to `py-2` | "adjacent sections are separable by ground or by space" |

The `dark` class is load-bearing, not cosmetic: without it `--ring` stays
`#030917` and every accent token stays on its light value.


---

## --card and --popover named a colour they were not

Following the 1.06:1 finding: `--card` was `#ffffff` on light and `#0c0b09` on
dark. Against their own grounds those measure **1.057:1** and **1.049:1**. The
token looked like a separate surface in the palette and was the same surface on
screen; every card that appeared to work was a border doing the job.

`--popover` had exactly the same problem and was found by the guard written for
`--card`, one line below it.

**The two themes are not symmetric, and the tokens now say so.**

| | value | vs its ground |
|---|---|---|
| light `--card` / `--popover` | `var(--paper)` — the ground itself | 1.00:1, on purpose |
| dark `--card` / `--popover` | `#24211b` | **1.29:1**, a real panel |

On light there is nothing lighter than white, so a raised fill is unavailable
and **elevation is border + shadow**. On dark you can go lighter, so a real
surface exists — which is one more reason the Intelligence Layer takes the dark
beat: its live-example panel needs a focal treatment that paper cannot give it.

`--muted` is deliberately out of scope. It is a tint for de-emphasis, not a
thing drawn on top of the page, and 1.104:1 is a legitimate faint wash. The
rule is about tokens claiming to be a separate GROUND.

Guarded in `__tests__/tokens.contrast.test.ts`, proved three ways: light card
back to `#ffffff`, dark card back to `#0c0b09`, and dark card lightened until
it cannot hold its own text.

---

## Phase 5a content — three sections, three shapes

The reader meets Platform and then, a screen later, Intelligence. Both are
title-plus-sentence content. Built naively they are the same section twice.

They are doing different jobs, so they have different shapes:

- **Platform (§4.3)** is an inventory — ten things, none more important, the
  reader's job is to scan. A grid of equals; the structure IS the argument.
- **The Journey (§4.4)** is a sequence. First and last are both "Home" because
  the loop closes, and a grid would throw that away. An ordered list on a rule,
  numbers visible, the line stopping at the last marker rather than trailing
  off the end of the journey.
- **Intelligence Layer (§4.5)** is an argument with a centre of gravity. The
  live-example panel is the evidence for "AI assists, it never overwhelms", so
  it gets the weight; the six capabilities are a two-column definition list on
  the section's own ground, no borders, subordinate by construction. Six more
  cards here would have flattened the panel into another tile.

### The live indicator nearly shipped invisible

The first version used `text-accent-edge` and `bg-accent-edge`. Neither
resolves: **`--color-accent-edge` is not in the `@theme` bridge**, so the dot
had no background at all and the label fell back to inherited ink. It looked
almost right in the capture.

`--accent-edge` would have been the wrong token even bridged — it is
`transparent` under `.dark`, so an indicator built on it disappears the moment
the card sits on a dark ground. It ships on `--route-mark`, the project's
legible accent ink: **7.94:1 on paper** against the 4.5:1 a 12px label needs.

It does not pulse. Spec 12's reduced-motion rule is "no motion, not less
motion", and an indefinitely animating dot is the sort of thing that collects
an exemption it has not earned.

### The guard that now catches that whole class

`build/verify-sections.js` measured only the heading and eyebrow. It walked
straight past the dot. It now measures **every text run and every indicator
against the nearest PAINTED ancestor** — not against the section ground, which
would be wrong for anything inside the Intelligence panel.

71 pieces of ink on the production build, worst per section: Platform 7.94:1
(the dot), Journey 8.70:1, Intelligence 6.95:1. Reverting the indicator to the
unresolved tokens reports `live dot 0:1 < 3`.

One rig bug worth recording: the new block's regex was written `\(` inside a
JS template literal, which the template swallows, so the page received
`/rgba?(([^)]+))/` and every contrast came back `null`. A report full of nulls
that still says FAIL is luckier than it deserves to be — it could as easily
have been a report full of nulls that compared as passing.
