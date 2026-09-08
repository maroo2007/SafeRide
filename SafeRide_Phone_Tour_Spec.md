# SafeRide — Phone Tour Section

> Build spec for the 3D phone tour. This section replaces five Platform
> cards and sits immediately after Platform.
>
> Everything in "Model Facts" was measured, not estimated. Do not re-derive
> it and do not change it.
>
> **AMENDED 2026-09-07**, after the §10 review. Every correction is marked
> **AMENDED** inline with the reason. Where this document previously said
> something that would not work, the old text is struck rather than deleted,
> so the decision is legible and nobody reinstates it.

---

## 0. The URL to judge on

**`http://localhost:3100/` — a PRODUCTION build, started like this:**

```
npx next build
npx next start -p 3100
```

Nothing in this spec is measured or judged on a dev server. `next dev` runs
unminified, recompiles on demand, and does not reflect committed defaults
until it rebuilds — which is how several changes were reported as unfixed
after they had been set, committed and verified.

Every figure in this document was taken from that URL on a production build.
`?knee=`, `?crossFraction=`, `?restFraction=`, `?descentUse=`, `?exposure=`,
`?fov=`, `?maxPhonePx=`, `?margin=`, `?runway=` and `?envMode=` override the
shipped defaults there without a rebuild, and `window.__phoneTour.debug()`
reads back what is actually applied — as distinct from what was requested.
`?margin=` accepts 0, which the others reject, because a run that asks
"does the clipping guard actually catch a clip?" needs it.

---

## 1. Placement and what changes

**New section, immediately after Platform (§4.3), before The Journey (§4.4).**

### 1.1 Platform drops to five cards

Five features are shown in the phone screens, so their cards come out. What
remains has no screenshot behind it and the card is the only place it exists.

**Cards that STAY:**

| Card | Copy (verbatim, unchanged) |
|---|---|
| AI Incident Detection | Computer vision watches every trip for unsafe behavior and flags it in seconds, before it becomes an incident report. |
| Predictive Maintenance | SafeRide flags buses that are due for service based on usage patterns, not just a calendar reminder. |
| AI Reports | Attendance, safety, and fleet reports generate themselves, with plain-language explanations behind every number. |
| Multi-language Support | A full English and Arabic experience for every role, switching instantly without reloading. |
| Dark & Light Mode | A carefully redesigned dark mode, not an inverted one, so the platform stays legible any hour. |

**Cards that are REMOVED** (now carried by the tour):
Live GPS Tracking · Parent Notifications · Face Recognition Attendance ·
Emergency Response · Driver Performance Analytics

Keep the "Watching live right now" pulse indicator on AI Incident Detection.

### 1.2 The Platform subhead is now wrong

It currently reads *"Ten systems working together so nothing about a child's
commute is left to chance."* With five cards that number is false.

**Do not silently leave it.** ~~Five systems working quietly in the
background~~ **AMENDED** — "working together" is the idea that justified the
grid in the first place, so it stays:

> Five systems working together in the background, so nothing about a child's
> commute is left to chance.

A stale count is exactly the kind of thing that survives to launch.

**The string "Ten systems" appears in FOUR places, not one:**
`app/page.tsx`, `app/type/fraunces/page.tsx`, `app/type/synonym/page.tsx`,
and `SafeRide_Build_Spec.md` §4.3. Fix all four in one pass and grep for the
string afterwards to confirm zero remain. A document that contradicts itself
already cost this project a round trip once.

**Copy rule conflict, resolved.** The build spec §12 says all copy is
verbatim from the live site; this section edits it. The resolution belongs in
the build spec and has been added there: copy is verbatim **except where a
factual claim has become false, in which case it is corrected and the change
is flagged.** A wrong number is worse than an edited sentence.

---

## 2. Section content

**Eyebrow:** THE PARENT APP
**Heading:** What a parent actually sees
**Subhead:** Three screens, every school morning.

**AMENDED — id and navigation.** `id="parent-app"`. **No new nav entry:** six
links is the ceiling the navbar was built to, and this is part of the product
story rather than a destination.

### Chapter 1 — phone RIGHT, text LEFT

**Screen:** `public/models/screens/screen_01_home.png`
**Heading:** The whole morning, on one screen
**Body:** Open SafeRide and the answer is already there: where the bus is,
which stop it has reached, who is aboard, who is still waiting, and how many
minutes until arrival.
**Bullets:**
- Live trip status with stop-by-stop progress
- On-bus, boarding and absent counts at a glance
- Every child listed with their current status
- One tap to report an issue straight to the school admin

### Chapter 2 — phone LEFT, text RIGHT

**Screen:** `public/models/screens/screen_02_tracking.png`
**Heading:** The route, as it happens
**Body:** The bus on a real map with an accurate ETA, the driver one tap
away, and a timeline that fills in as the morning happens.
**Bullets:**
- Live position with distance and time remaining, updated against traffic
- Face recognition confirms each boarding — the count is verified, not guessed
- Call or message the driver without leaving the screen
- Every driver carries a performance rating built from braking, speed and fatigue signals

### Chapter 3 — phone RIGHT, text LEFT

**Screen:** `public/models/screens/screen_03_cameras.png`
**Heading:** See inside, whenever it matters
**Body:** Three cameras — front, rear and door — encrypted and restricted to
verified guardians. Most parents look once and never need to again.
**Bullets:**
- Front driver cam, rear seats and door area, simultaneously
- Live timestamps on every feed
- Guardian-only access, per bus
- One-tap emergency reaches the school, the parents and the operator at once

---

## 3. Asset paths

```
public/models/
  iphone_16_saferide_max.glb            8.1 MB   the model

public/models/screens/
  screen_01_home.png                    1080 x 2314
  screen_02_tracking.png                1080 x 2314
  screen_03_cameras.png                 1080 x 2314
```

All three screen textures already carry the bezel and the iPhone status bar.
Do not add either in code.

**AMENDED — `screen_03_cameras.png` IS NOT COMMITTED.** See §9. It is listed
in `.gitignore` by name, with the reason, because git history is permanent
and replacing the texture later would not remove the photographs from it.

Chapter 3 builds against `screen_03_placeholder.png`, a solid-colour
1080 x 2314 file at the same path. The mechanic does not care what the image
is. The real texture is tracked from the moment it is rebuilt.

---

## 4. Model facts — measured, do not re-derive

| | |
|---|---|
| screen mesh | index **10**, name `Cube.014_screen.001_0` |
| screen material | `screen.001` |
| swap target | `baseColorTexture` on that material |
| texture size | 1080 x 2314 (aspect 0.4667) |
| material setup | emissive-driven: `baseColorFactor` black, `emissiveTexture` = screen, `KHR_materials_emissive_strength` **2.0** |
| UVs | exactly affine, rebuilt. Max deviation 0.0001 texels |
| screen depth | recessed 0.004 on **local X** to clear a coplanar glass layer |
| thin axis | **X** |
| node rotation | local Z maps to world Y, so the phone's long axis is **world Y** |
| bezel | 26 px, corner radius 163 px, baked into the textures |
| Dynamic Island | x 386..679, depth 126 px in texture space |

### 4a. The material setup is SUPERSEDED — measured 2026-09-07

The pinning above solved the wrong problem. It kept an emissive surface
bright enough to survive ACES; the fix is not to survive ACES but to leave
it. A display is not a lit surface.

**Ships instead:**

```ts
new THREE.MeshBasicMaterial({
  map: screenTexture,        // sRGB, flipY false
  color: SCREEN_TINT,        // 0xffffff reproduces the source exactly
  toneMapped: false,
  side: screenMat.side,      // CARRIED OVER — see below
})
```

No lighting term, so `scene.environment` cannot reach it. No emissive path,
so `KHR_materials_emissive_strength` stops mattering. `toneMapped: false`
keeps it out of ACES entirely.

Measured against the source PNGs, worst channel, production build, mean over
7200 samples of the display at each chapter's rest point:

| setup | ch 1 | ch 2 | ch 3 |
|---|---|---|---|
| emissive, strength 2.0, as pinned above | 93 | — | — |
| unlit, `toneMapped: false` | **4** | **1** | **5** |

Chapter 1's orange Current Trip card, sampled as a feature rather than as a
mean, is `rgb(254, 151, 0)` rendered against `rgb(254, 151, 0)` in the
source. Exact.

**`side` must be carried over from the parsed material, not defaulted.**
Constructing a material from scratch discards every flag GLTFLoader set from
the file. This display plane's winding faces INTO the phone and the glTF
marks it `doubleSided`; `MeshBasicMaterial` defaults to `FrontSide`, so the
plane is back-face culled and NOTHING IS DRAWN — at any rotation, front or
back. That build renders a blank cream phone and passes every settings-level
assertion: tone mapping ACES, output sRGB, all three textures uploaded, the
right texture bound. It is the reason §8's guard now reads pixels.

**Dimming** is done with `SCREEN_TINT`, never by editing a texture, and the
same value applies to all three chapters. Measured against the source, worst
channel, on the chapter 1 card: `0xffffff` 5, `0xf0f0f0` 14, `0xe6e6e6` 24.
The guard multiplies the source by the declared tint before comparing, so a
deliberate dim is not read as a failure to reproduce.

**Facing.** The screen mesh is a single flat surface — 112 triangles, 99.9%
of the area on one normal — but that normal points inward, so the face
normal alone aims the BACK of the phone at the camera. The sense comes from
the body: both geometry centres in world space, and the vector from the
model's centre to the screen's centre points out through the display.

**Do not touch the UVs.** They were rebuilt because the shipped model warped
by 1393 texels, which bent every straight line in the UI.

---

## 5. The mechanic

Reference: **flowty.co** — four frames attached separately.

### 5.1 Per chapter

**REINSTATED 2026-09-08.** The removal below was correct only while the text
held one side. Both alternate now, so they are never in the same half.

The phone alternates **right, left, right**. The text takes the **opposite**
side each chapter — left, right, left. `Chapter.side` is the phone's side and
is the single source for both.

The collision that ruled alternation out is avoided by *timing*, not by
geometry: the horizontal travel happens entirely inside the text fade's dead
zone (§5.2b), so the phone is never crossing while anything is legible.

**Layout constraint, measured.** The text column must shrink with the
viewport. At 46ch fixed (478px) against a phone bbox of ~262px centred at
0.75W, the two overlap below about **873px** of viewport width — 79px of
overlap at 768px, on a correct build. Shipping `w-[min(46ch,38vw)]`.

---

**Superseded text, kept because the reasoning still applies if the text is
ever pinned again:**

The phone holds the **right** side for all three chapters. The text holds the
**left** side for all three chapters. Neither crosses.

The alternation was not dropped for taste. Once the text is pinned to one
side (§5.5a), a phone that alternates lands **on top of** the text at
chapter 2. The only alternation that avoids the collision is an oscillation
inside the free half, which reads as a stumble part-way down rather than a
traverse — and it reverses the diagonal mid-descent, which is the one thing
that actively fights the vertical motion §5.2a introduces.

Left for the text because chapter 1 was already phone-right/text-left, and
because a left-anchored column is where the eye returns in LTR reading.

`Chapter.side` is **removed**. It described the alternation, it drives
nothing in the stacked fallback, and a field that no longer describes
anything is a field that will be believed later.

### 5.2 The transition

On scroll from one chapter to the next, three things happen together:

1. **The phone rotates 360 degrees about ITS OWN long axis.**
   Front → edge-on → back → edge-on → front.

   **AMENDED — ~~about world Y~~ was wrong and would have produced a tumble.**
   The phone leans 8–12 degrees off vertical (§5.4). Spinning a leaned object
   about world Y sweeps a cone: at 180 degrees it leans the opposite way, and
   the lean visibly precesses through the turn.

   **Lean a container, spin the child inside it.** The lean is applied to a
   parent `Group`; the rotation is applied to the model inside it. The lean
   then stays constant relative to the viewer, it reads as a spin, and the
   screen-normal calculation in §5.3 stays stable instead of moving with the
   turn.
2. ~~**The phone travels across** to the opposite side.~~
   **SUPERSEDED by §5.2a.** The phone travels **downward**, not across.
3. ~~**The text block crosses the other way**~~ **SUPERSEDED by §5.5a.**
   The text does not move. Its content swaps in place.

Rotation and travel are driven **directly by scroll position** — continuous,
never snapping. Stop mid-scroll and the phone sits mid-turn, mid-descent.

Two chapter transitions means **2 × 360 degrees** of total rotation across
the section.

**AMENDED — scroll length and pinning, previously unspecified.**

| | |
|---|---|
| section runway | **400vh** — was 300vh, see §5.2a |
| phone | **pinned sticky** for the section's duration |
| mapping | 2 × 360 degrees **linear** across the scrolled span |

The scrolled span is `runway − viewport` = 300vh, so each 360-degree
transition takes 150vh — one and a half screen-heights per chapter change.
Rest points fall at progress 0, 0.5 and 1.

**The runway is selected by `data-tour-runway`, never by matching its
inline height.** Both harnesses previously did
`querySelector('[style*="300vh"]') || section`, so changing this number made
them silently measure the section instead and go on printing plausible
figures. The selector now throws when it finds nothing.

The hero's runway is the precedent: its scrub rate is DERIVED from
`RUNWAY_VH` rather than typed in, so a runway change cannot leave the rate
stale. Do the same here — degrees-per-pixel comes from the runway constant,
never from a literal.

### 5.2a The descent — replaces the horizontal traverse

The phone moves **down** through the pinned viewport as scroll advances, on
the same progress value that drives the rotation. One source of truth: there
is no second timeline and no second easing.

**Why the rest scale had to change.** At 1440×900 the canvas is 900 px and
the phone was sized `min(620, h × 0.62)` = 558 px. Fully contained, that
leaves 900 − 558 = **342 px** of vertical travel, edge to edge with no inset
— against the **720 px per transition** of horizontal travel it replaces.
Less than half the motion, so it reads as a drift rather than a descent.

**AMENDS §7.1.** The 620 px cap stays; the viewport fraction drops from 0.62
to **0.46**. At 1440×900 that is a 414 px phone and about 486 px of usable
travel. 620 was set when the phone needed no vertical room, and it still
governs tall viewports.

**Runway rates**, which is what actually chose 400vh rather than taste:

| runway | scrolled span | rotation | descent |
|---|---|---|---|
| 300vh | 1800 px | 0.40°/px | 0.27 px/px |
| **400vh** | **2700 px** | **0.27°/px** | **0.18 px/px** |
| 500vh | 3600 px | 0.20°/px | 0.13 px/px |

At 300vh an ordinary scroll turns the phone a full 360° in under a second.
500vh is legible but spends five screens on three states. 400vh gives each
transition one and a half viewport heights.

Degrees-per-pixel and pixels-per-pixel both derive from the runway constant.
Neither is typed in.

### 5.2b The crossing window — derived, never typed

Horizontal and vertical come off the same scroll progress on **different
curves**. On one curve the phone travels diagonally and crosses the text's
band while still moving sideways, which is the collision §5.1 was originally
ruled out for.

    DEAD0       = asin(1 / FADE_KNEE) / pi     = 0.108   (knee 3.0)
    CROSS_START = DEAD0                         = 0.108
    CROSS_END   = DEAD0 + (1 - 2*DEAD0) * 0.60  = 0.578

**Tuned 2026-09-08, and one option refused.** The crossing read as a snap, so
the dead zone was widened (knee 2.2 -> 3.0) and the crossing given more of it
(0.35 -> 0.60): 297px -> 533px, 1.8x slower.

A wider option was measured and REFUSED. Knee 4.0 at fraction 0.80 gives
729px of crossing, but the fade that buys it is too steep:

| option | at rest | after 1 wheel notch | after 2 | notches to invisible |
|---|---|---|---|---|
| knee 2.2 | 1.00 | 0.49 | 0.04 | 3 |
| **knee 3.0** | 1.00 | **0.35** | 0.00 | 2 |
| knee 4.0 | 1.00 | **0.13** | 0.00 | 2 |

One notch to 0.13 is a flicker, not a shorter dwell — arrive at a chapter,
nudge the wheel to settle, and the bullets are gone. Measured with trusted
wheel events at Chrome's 100px notch; a trackpad scrolls finer and would feel
smoother, but the mouse-wheel case is the one that breaks and the common one
on this viewport.

**Widening the dead zone SPENDS READING TIME** and that cost is stated with
the benefit, never alone. Per transition, legible scroll at opacity > 0:
410px at knee 2.2, 296px at 3.0, 228px at 4.0.

Ease-out on the horizontal, linear on the vertical.

**Both edges are derived from `FADE_KNEE`, and `FADE_KNEE` lives in exactly
one module.** The 40% completion figure is not special — the crossing is
invisible because no text is on screen while it happens. Typing 40% beside a
fade curve that owns the real constraint is the SCRUB_RATE mistake: move
either constant and the other silently stops protecting anything.

Starting the crossing at 0 instead was measured by breaking it: **236px of
overlap at p=0.067, with the text at 0.11 opacity.**

**The guard is the relationship, not the number.** "If the phone's vertical
band overlaps the text's, the horizontal is complete" cannot hold and is not
what protects anything — the text is vertically centred and the phone
descends through the centre, so those bands overlap by design and the guard
would fail on a correct build. What holds is: *the phone never overlaps text
anyone can see*, sampled at 151 positions.

### 5.3 The screen swap

**Swap the texture while the BACK faces the camera.** For roughly half the
rotation the screen is not visible, so the change is invisible. No
crossfade, no second plane, no blend shader.

Compute the swap point from **the actual screen normal relative to the
camera**, not from a hardcoded rotation range. The phone carries a lean
(§5.4), which shifts where "facing away" falls.

Verify the swap lands mid-back, not a frame early or late. A guard that
checks "the texture changed" passes on a build that swaps at the wrong
moment — assert the screen normal is pointing away at the instant it
changes.

**AMENDED — two things that will break this in practice.**

- **Upload all three textures at mount** (`renderer.initTexture`). A
  1080 x 2314 texture uploaded on first use costs a frame, and it costs it at
  exactly the moment §5.3 wants to be invisible.
- **The swap is EDGE-triggered, not level-triggered.** Computed from the
  normal every frame, scrubbing back and forth across the threshold swaps
  repeatedly. Fire on the crossing, once, and remember which chapter is
  currently bound.

### 5.4 The lean

The phone carries a **slight lean, 8–12 degrees off vertical**. Dead upright
reads as a diagram; leaning reads as an object. This is in the reference and
it matters more than it sounds.

**AMENDED:** the lean lives on the PARENT container, not on the model. See
§5.2 — leaning the thing that also spins is what causes the precession.

### 5.5 Text crossfade

Timed to the back-facing window so the screen swap and the text change land
together. Old chapter out, new chapter in.

**Text is real DOM, not in the 3D scene.** It must stay selectable and
readable to screen readers.

**AMENDED — a crossfade alone is the hero's CTA bug again.** Opacity-0 text
is still focusable, still selectable, and still read aloud; during a
crossfade BOTH chapters are in the accessibility tree at once. The outgoing
block carries **`inert` and `aria-hidden="true"`**, not opacity alone.

Guard it the way the hero was guarded: **call `.focus()` on something inside
the outgoing block and read `document.activeElement`.** Reading `tabIndex`
passes on the broken build.

### 5.5a Fade in place — supersedes the crossing

The text panel **holds one position and does not travel.** Sticky within the
section, releasing cleanly at both boundaries. Outgoing fades out, incoming
fades in at the same coordinates. No horizontal component at all.

**The horizontal offset was doing separation work that is now gone.** With
both blocks occupying the same pixels, the only thing keeping two chapters
off each other is the fade's dead zone: `vis = max(0, 1 − |sin(πt)| × 2.2)`
reaches zero at t ≈ 0.15 and stays there until t ≈ 0.85, while the chapter
index flips at t = 0.5. That dead zone is now **guarded directly** — at no
scroll position may two chapter blocks both exceed 2% opacity — because a
guard on the fade's *inputs* would pass on a build where the curve is right
and the blocks overlap anyway.

**Sticky must be guarded by outcome, in viewport coordinates.** The three
blocks are absolutely positioned inside the pin, so their rects are
identical to each other by construction, at any scroll position, whether or
not the pin works. The guard therefore:

1. reads the active block's rect **in viewport coordinates** at two
   different scroll positions inside the runway, and requires them equal;
2. requires the phone's rect to have **moved vertically** between the same
   two positions — otherwise a build where nothing moves at all passes;
3. requires the block to be **unpinned above and below** the runway —
   otherwise `position: fixed` passes every other assertion.

---

## 6. Implementation

- **Native scroll + rAF**, same approach as the hero. **No ScrollTrigger.**
- `registerGsap()` remains the single registration point if GSAP is needed
  at all.
- One Lenis instance, from the existing app-root provider. Do not create
  another.
- Three.js scene mounts lazily when the section approaches the viewport, and
  unmounts when it leaves. It must not run while the hero video is playing.

**AMENDED — the following were implied, unstated, and each one silently
invalidates something the spec relies on.**

### 6.1 Library

**Vanilla `three` only.** Not React Three Fiber: a reconciler is a large
dependency for one section, and nothing in this scene is driven by React
state. `three` is dynamically imported so it never enters the bundle a
mobile visitor downloads.

The GLB needs no decoder plumbing — checked: no Draco, no meshopt, no KTX2,
`extensionsRequired` is empty. `GLTFLoader` alone.

### 6.2 Renderer setup — required, not optional

| | |
|---|---|
| tone mapping | `ACESFilmicToneMapping` |
| output | `outputColorSpace = SRGBColorSpace` |
| screen textures | `colorSpace = SRGBColorSpace` |

§4 tuned `emissiveStrength: 2.0` against a black base *to survive ACES*. Ship
without ACES and that tuning is not merely unused, it is wrong — the screen
blows out. Getting the colour space wrong washes every screenshot.

### 6.3 Environment — procedural, no asset

The GLB has **no lights and no cameras**, and its materials include
`KHR_materials_clearcoat`, `KHR_materials_specular` and
`KHR_materials_transmission` (`glass.002`). Those render flat or black with
no environment.

**Use three's `RoomEnvironment` through `PMREMGenerator`.** Procedural,
nothing to download, and it is the neutral studio light this needs. **Do not
add an HDRI file.** If it looks wrong, say so before reaching for one.

### 6.4 Transmission is switched off

`glass.002` sits behind the screen and contributes nothing visible from the
front, but `KHR_materials_transmission` costs three.js a **full extra render
pass every frame**.

**Set `transmissionFactor = 0` on that material at load.** Measure frame
timing with and without and report both: if it costs nothing it stays, for
honesty; if it costs a frame it goes.

### 6.4a The environment: PMREM is unavoidable, so it is DEFERRED

Measured on an AMD Radeon Vega 8 over ANGLE/D3D11 — a real GPU, confirmed by
reading `UNMASKED_RENDERER_WEBGL`, not a software rasteriser. The prefilter
cost **2588 ms** and was the largest single block on the critical path.

**Do not re-propose these. Each was measured and rejected:**

| attempt | result |
|---|---|
| `sigma` 0 instead of 0.04 | 2588 → 2571 ms. No effect. |
| 64 px source cubemap instead of 256 | 2571 → 2263 ms, plus 400 ms to render the cube. Net worse. |
| `compileCubemapShader()` first | the compile is **4 ms**. Not the cost. |
| warm the context with a 2×2 frame first | **24 ms**. Not the cost. |

**Resolution cannot help, and the reason matters:** `PMREMGenerator`'s output
size is fixed regardless of what it prefilters FROM. Shrinking the source
changes the input, not the passes.

**It cannot be skipped either.** Assigning a raw `WebGLCubeRenderTarget`
texture to `scene.environment` renders **pixel-identically across 1,293,661
pixels** — three prefilters it lazily on first use. The cost does not
disappear, it relocates into the first render, where it is *worse*: 3978 ms
against 1579 ms.

**So the only lever is WHEN.** Built from a `requestAnimationFrame` callback
after the first frame, the main thread issues the commands and returns; the
GPU works behind it. The 3457 ms build registers as **no long task at all**.
That is a better outcome than any reduction would have produced — the cost is
converted, not moved.

It lands where the environment matters least: chapter 1 at rest differs by
0.40% of pixels without it, while the edge-on mid-transition frames differ by
6.36%. The visitor cannot reach an edge-on frame without scrolling.

Every fetch also starts before the prefilter rather than after it. They were
strictly sequential and nothing required that order.

    gate -> phone on screen    5728 ms -> 2330 ms
    worst freeze               3301 ms -> 1101 ms
    total blocking             6725 ms -> 1421 ms

**The floor, stated rather than hidden.** The remaining 1101 ms is one task
from GLB-ready to first frame: parse tail, scene assembly, texture upload,
first render — of which the render alone is 663 ms. Going below ~200 ms would
need GLTF parsing off the main thread, which three's loader does not support
wholesale. 2330 ms is where this lands.

**Instrument note.** The blocking window originally ended at the first frame,
which after deferral EXCLUDED the very work that had been moved — it would
have reported improvement partly by measuring less. It now runs to a settled
scene. Fifth instrument correction in this phase, alongside the p95
responsiveness verdict and the oversized landmark box.

### 6.5 One rAF loop

Join the existing `gsap.ticker`, which already drives Lenis. A third
independent loop would make §7.4's numbers measure contention we created.

### 6.6 When the GLB is fetched

**Not while the hero is on screen.** The scrub file is 53.6 MB and takes
**109.8 s to fully buffer on Regular 4G** — roughly 488 KB/s. An 8.1 MB GLB
is ~17 s of that pipe, and fetched concurrently it does not merely add 17 s,
it lengthens CLAMPED, which is the majority experience for this audience.

Trigger the load on the **same IntersectionObserver threshold-0 condition
that pauses the hero video** — the hero fully out of view. Nothing before
that.

---

## 7. Constraints

### 7.1 No zoom on chapters 2 and 3

Their sources were 487 px and 706 px wide, upscaled 2.22× and 1.53×. They
will mush under magnification. Chapter 1 can zoom to about 1.8× if wanted;
2 and 3 stay at rest scale.

**AMENDED — "no zoom" is necessary but not sufficient, because rest scale was
never specified.** A phone rendered large enough on a wide display mushes
chapter 2 without anyone zooming.

**The phone renders at most 620 CSS px tall at any viewport.** Against
2314 px of texture that is a 3.7× downsample, safely above chapter 2's 487 px
source. Assert it.

**AMENDED AGAIN 2026-09-08. The 620 px cap is now the binding constraint,
and the fraction beneath it is inert.**

`min(620, h × f)` clamps at a 900 px viewport for any f above ~0.689, so
0.689, 0.70 and 0.80 all produce the same **620 px** phone. The fraction is
set to 0.80 so the cap is visibly what is in control.

**Chapter 2 is not what limits this, and the number is worth recording so it
is not re-litigated.** Its 487 px source is stretched to 1080 in the texture;
at a 620 px phone it renders 289 px wide, still downsampling 1.68×. Upsampling
would not begin until a **1043 px** phone — far beyond any value under
discussion.

**What binds is descent room**, and it fails before mushing does. Measured
with `descentUse` at 1.0:

| cap | phone | downsample | descent | verdict |
|---|---|---|---|---|
| **620 px** | 620 px | 3.73× | **280 px** | passes |
| 700 px | 700 px | 3.31× | 200 px | **FAILS** the descent floor (270 px) |

So 620 is the ceiling — not because the screens mush, but because the phone
eats the room it needs to travel through.

**AMENDED AGAIN 2026-09-08, and the table above is wrong in a way that
matters. `620 px` was never the height of anything on screen.**

The layout solved the camera distance from the model's world AABB measured at
the raw glTF orientation — which on this export is EDGE-ON, thin axis across
the view. Turned front-on the phone presents its 77 mm width to the 10° lean,
and the lean folds that width into the height: +13 mm on a 163 mm phone.
Perspective adds more, because at fov 35 the near half of a spinning phone is
about 10% closer than the far half, and more again at the ends of the descent
where the whole box is off-axis and shears.

Measured on the shipped build at 1440 × 900:

| | value |
|---|---|
| the layout solved for | 620 px |
| the phone drew, at the centre | **652 px** |
| the phone drew, at its worst pose | **664 px** |
| its projected box, worst case | 710 px |

The descent then handed out every "remaining" pixel on the strength of the
620. The phone was **39 px off the top at chapter 1 and 39 px off the bottom
at chapter 3**, cut at 12 of 202 scroll positions. The bottom-right corner
goes first, because the phone leans.

**The cap is now on the projected box, and the box is swept.** Both the size
and the placement are solved against the projected corners of the model's own
box across the FULL rotation and the full descent, by binary search rather
than arithmetic — there is no closed form that survives the perspective shear.
`MAX_PHONE_PX = 693` is chosen to leave the phone **exactly the size it
already was**: this section's ceiling was approved from captures, and those
captures showed a 652 px phone whatever the constant claimed. It caps the box
rather than the silhouette because a rounded phone does not fill its own
corners — the drawn phone is about 4% shorter than the number, conservative in
the safe direction, and measuring the silhouette would mean reading pixels
back off the GPU on every resize.

**`EDGE_MARGIN_PX = 12`.** The descent is solved to use every pixel the frame
has left, so without a margin the phone ends flush against the boundary and
"does not clip" and "is cut off by one pixel" are the same build.

**The horizontal is clamped by moving the phone IN, never by shrinking it.**
At 800 × 900 the side offset drops from 0.25 to 0.224 and the phone is
untouched. A narrow viewport is a placement problem.

**What this costs: the descent falls from a reported 280 px to 195 px, and
almost none of that was ever visible.** 78 px of the old 280 happened outside
the frame; fully-visible travel went from about 202 px to 195 px.

**§8's descent floor moves from 0.30 × viewport to 0.18, and the reason is
arithmetic rather than convenience.** A 693 px box in a 900 px frame with two
12 px margins leaves 195 px and no more, so ANY floor above ~0.21 is now
unsatisfiable at this phone size and could only be met by shrinking the phone.
It is paired with the assertion that cannot be gamed — the descent uses EVERY
pixel of room the frame has left — so a build that quietly gives up travel
fails even when its absolute number looks comfortable.

### 7.1a The load screen holds for the scene (desktop)

The load screen waits for the hero AND for the tour scene to have nothing left
to block on: model parsed, textures uploaded, shaders compiled, environment
prefiltered, and a frame lit by that environment presented. The hero plays
behind it. Below 768 px and on reduced motion no scene is built at all, so it
waits only for the hero — asserted as a network fact, not a look.

Caps: **2500 ms** on the hero-only path, **8000 ms** on desktop. Past the cap
the screen drops and the placeholder covers the tour. A load screen that
outstays the thing it covers is the failure mode it exists to prevent.

**The environment is built BEFORE `renderer.compile`, and that ordering is
worth about two seconds.** Assigning `scene.environment` invalidates every
material that can see it, so a compile that ran before the assignment compiles
the no-envMap variant and the next render compiles the whole set again. The
deferred build did exactly that, and the second compile is most of what the
environment's measured cost was made of:

| | cost |
|---|---|
| room → cube render | 342 ms |
| PMREM prefilter | 2096 ms |
| re-render with the environment | **2120 ms** ← the second compile |

Only the first two are the environment. Deferring was right when the phone had
to appear as early as possible; it is wrong once a load screen holds until the
scene has settled, because there is no value in an early frame that is missing
its reflections and will pay for them a second later. End to end this took the
lift from 9.6 s to 6.4 s and the worst freeze from 4.6 s to 2.6 s.

### 7.1b The tour does not render while it is off screen

The ticker ran in full from the moment the scene was ready — a full-viewport
WebGL frame of a reflective phone on every rAF, the whole time the visitor is
eight screens above watching the hero. It was invisible to every instrument
the project had: no long task, no failed assertion, just a page that was
measurably less smooth at 1440 than the same page at 390, where no WebGL
context exists at all.

| after the lift | frames/s | worst frame |
|---|---|---|
| 390 px, no WebGL anywhere | 59.1 | 34 ms |
| 1440 px, before | ~46 | 100–119 ms |
| 1440 px, after | 58.2 | 50 ms |

Two separate mechanisms, and they are not interchangeable. Skipping the whole
ticker when the runway is out of view saves the per-frame layout read and the
opacity writes. Skipping `setProgress` when progress has not changed is what
stops the wasted rendering — progress is pinned at 0 or 1 whenever the section
is off screen, so it covers that case too.

**The opacity writes must NOT be skipped with the render.** Changing chapter
re-renders those blocks and React restores their inline `opacity: active ? 1 :
0`; the per-frame write is what lays the fade curve over the top of it.
Skipping both left the incoming chapter at full opacity at exactly the moment
the phone crosses. Two guards caught it.

### 7.2 Mobile

**Below 768 px this is not a 3D scene.** Static screenshot, text beneath,
stacked vertically, one block per chapter. No Three.js, no model download.

Our audience is on 4G phones already carrying the hero video. A 8.1 MB model
plus a WebGL context on top of that is not acceptable.

**AMENDED — the fallback as written had the same problem it exists to avoid.**
"Static screenshot" meant the three 1080 x 2314 PNGs: **3.12 MiB**, 38% of the
model, for the same user on the same connection.

**Purpose-cut mobile assets: 540 px wide JPEG at q82**, served through
`next/image` with explicit `sizes`. Report the real byte counts once cut.

### 7.3 Reduced motion

`prefers-reduced-motion: reduce` removes the rotation and the travel
entirely. Chapters become a plain stacked list, same as mobile.

**Not slower — none.** Do not build the timeline at all for these users.

### 7.3a No WebGL, and context loss

**AMENDED — previously unlisted.** If WebGL is unavailable, or the context is
lost after mount, the section falls back to the same stacked list as mobile.

Guard it by **forcing context loss** (`WEBGL_lose_context`) and asserting the
fallback renders — not by checking that a `try/catch` exists.

### 7.4 Performance

Measure on the **production build**, with the hero video present. Report
frame timing during an active scroll through the section, p50 and p95.

If it drops frames, say so with numbers rather than tuning durations.

---

## 8. Guards

Apply the no-op test to every guard: **ask what a total no-op would report.**
If a no-op passes, the guard measures nothing.

Specifically:

- **Swap timing** — assert the screen normal faces away at the instant the
  texture changes. "The texture changed" passes on a broken build.
- **Side alternation** — assert the phone's x position is on opposite sides
  at chapters 1 and 2. "The phone moved" passes on a build that moves it
  nowhere useful.
- **Text sync** — assert the text content matches the screen texture at
  every chapter rest point. Desync is the failure mode nobody sees in a
  static screenshot.
- **Reduced motion** — assert **no** rAF loop and **no** WebGL context are
  created at all. Counting frames passes on a build that runs the loop and
  discards the output.
- **Mobile** — assert the GLB is never fetched below 768 px. A network
  assertion, not a render assertion.

**AMENDED — added:**

- **Fetch timing** — assert the GLB is not requested while the hero is on
  screen, on desktop too. Same network assertion, different condition.
- **Text a11y** — call `.focus()` on a control inside the outgoing chapter
  and assert `document.activeElement` did not move there. Reading `tabIndex`
  or `aria-hidden` passes on a build that only changed opacity.
- **Rest scale** — assert the phone's rendered height is ≤ 620 CSS px at
  1440 x 900 and at 1920 x 1080.

**AMENDED 2026-09-08 — rest scale as written above measured the request, not
the result.** `phoneHeightPx` was the height the layout ASKED for; the phone
on screen was 652 px and clipping at both ends, and the check passed on every
run. It now reads the projected box. Added with it:

- **Nothing touches the canvas edge** — sample the outermost row and column of
  the drawing buffer at 121 real scroll positions across the whole section.
  The renderer is `alpha: true` and draws nothing but the phone, so a non-zero
  alpha at an edge pixel IS the phone being cut. Geometry cannot be trusted
  here: it inherits whatever the layout believes about the phone's size, which
  is the belief that was wrong. NO-OP DEFENCE: a scene that draws nothing has
  a perfectly clear edge, so every sample also reads the middle scanline and
  an empty interior is a failure. Proved by `?maxPhonePx=8` — an 8 px phone
  reported "all four edges clear" and FAILED.
- **The descent uses every pixel of room the frame has left** — pairs with the
  lowered floor. Proved by `?descentUse=1.3`, which drives the phone past the
  fit: the edge check failed at 2 of 121 positions while "the descent is a
  real distance" still passed, which is why both exist.
- **No render while off screen** — count frames drawn. `0` in a second at the
  top of the page, `> 0` once the section is in view. Proved by removing the
  progress check: 60 wasted frames per second.
- **The load screen's contract** (`build/verify-loadscreen.js`) — held until
  the scene settled; every long task over 150 ms finished behind it; no frame
  over 100 ms after the lift, with a frame count so "no gaps" cannot pass on a
  dead page; mobile does not wait for a scene it never builds (network
  assertion plus a time); and the cap fires with the model request HELD OPEN
  rather than failed, since a failed request takes the error path and declares
  ready at once.

**One of these could not be proved, and it is recorded rather than dressed
up.** "The screen held until the scene had settled" is a contract check, not
evidence: with the environment built before the first render, `settled`
resolves one frame after `createScene` returns, so a build that skips
`settled` entirely lifts ~20 ms earlier and passes. It could not be made to
fail even in the deferred mode, where there is a 5 s gap — because the
deferred work is one unbroken task, and a task that would freeze the page also
blocks the rAF chain that performs the lift. The cover stays up through its
own worst moment whether or not anything asked it to.
- **Context loss** — force it and assert the fallback renders.
- **Colour pipeline** — assert `toneMapping`, `outputColorSpace` and the
  screen texture's `colorSpace` are the three values in §6.2. These are the
  settings §4's material tuning depends on, and nothing on screen says
  plainly which one is wrong when they are not set.

Prove each by breaking the thing it guards and watching it fail before
restoring.

---

## 9. Content note, not blocking

The camera-feed imagery in `screen_03_cameras.png` is AI-generated. There is
no licensing question and there are no real children in it. The texture is
tracked and ships.

**One thing to log for later, not a build issue:** the feeds show bright
yellow American school buses, which contradict the cream-and-orange fleet in
the hero film and everywhere else on the site. Flagged for regeneration.

---

## 10. Before building

Report what breaks that this spec has not listed.

Captures at each meaningful step, per the standing rule. Production build
for any timing claim.
