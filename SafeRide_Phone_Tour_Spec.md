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

The phone sits on one side, the text block on the other. **Sides alternate:
right, left, right.**

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
2. **The phone travels across** to the opposite side.
3. **The text block crosses the other way** and its content swaps.

Rotation and travel are driven **directly by scroll position** — continuous,
never snapping. Stop mid-scroll and the phone sits mid-turn, mid-cross.

Two chapter transitions means **2 × 360 degrees** of total rotation across
the section.

**AMENDED — scroll length and pinning, previously unspecified.**

| | |
|---|---|
| section runway | **300vh** |
| phone | **pinned sticky** for the section's duration |
| mapping | 2 × 360 degrees **linear** across the scrolled span |

The scrolled span is `runway − viewport` = 200vh, so each 360-degree
transition takes 100vh — about one screen-height of scrolling per chapter
change. Rest points fall at progress 0, 0.5 and 1.

The hero's runway is the precedent: its scrub rate is DERIVED from
`RUNWAY_VH` rather than typed in, so a runway change cannot leave the rate
stale. Do the same here — degrees-per-pixel comes from the runway constant,
never from a literal.

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
