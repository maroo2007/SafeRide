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

**Firefox:** also **untested** — Firefox is not installed on this machine. Only Chrome
and Edge are present, and Edge is Chromium/Blink, the same media stack as Chrome, so it
is not independent coverage. All scrub measurements reported are **Chrome/Blink only**.
Firefox uses its own (Gecko) media stack and could differ. Installing Firefox would
close this gap cheaply and is worth doing before launch.

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
