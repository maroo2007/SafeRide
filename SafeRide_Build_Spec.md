# SafeRide — Website Build Spec

> Master build specification for Claude Code. This document defines the full
> build: a scroll-scrubbed video hero using the pear.no technique, followed by
> conventional scrolling content sections.
>
> **Content source of truth:** https://safe-ridee.vercel.app/
> All copy, features, pricing, testimonials, and FAQ content is taken from
> that site. Do not invent new copy.
>
> **Motion/UI source of truth:** the `ui-ux-pro-max` skill
> (https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for all button
> styles, hover states, micro-interactions, and transitions.

---

## 0. Project Context

**SafeRide** is an AI-powered school transportation safety platform operating
in Egypt. It combines live GPS tracking, AI face-recognition attendance,
computer-vision incident detection, emergency response, and fleet management
into one platform serving parents, drivers, and school administrators.

**Tagline:** Because every child deserves a safe ride home.

**Target audience:** School principals and transport administrators (primary
decision makers), parents (emotional advocates), drivers (daily users).

**Conversion goal:** Every section drives toward one action — book a demo /
contact the team.

---

## 1. The Core Technique — Scroll-Scrubbed Video Hero

### 1.1 What We're Building

The reference implementation is **https://pear.no/**. The technique works
like this:

1. On page load, a video plays a short **idle loop** (roughly the first
   2 seconds) on repeat. The user sees continuous ambient motion, not a
   frozen frame.
2. The moment the user scrolls, the loop **releases** and the video's
   playback position becomes **directly bound to scroll position**. Scroll
   down → video advances. Scroll up → video reverses.
3. The video plays through its full duration across a long scroll distance.
   The hero section is `position: sticky` and pinned while the video scrubs.
4. When the video reaches its final frame, the pin releases and the page
   continues into normal scrolling content sections below.

### 1.2 The Video Asset

A single **52-second** video file, assembled from six clips edited together
into one continuous piece. The clips are designed with match-cut transitions
so the whole video reads as one unbroken camera move.

**Clip breakdown (for reference — the video is already assembled):**

| Clip | Content | Transition Out |
|---|---|---|
| 1 & 2 | Brand establish + SafeRide vehicle tracking along the road | Ends on solid orange frame |
| 3 | Orange frame pulls back → child's backpack fabric → child walks to ivory bus with signal-orange stripe → enters door (occlusion) → camera glides along exterior → pushes into circular SafeRide logo decal until orange fills screen | Orange fill |
| 4 | Macro logo → camera pulls back to reveal it's a smartphone screen → live parent tracking UI ("Current Trip", "Bus #20") → slow push into a white UI card until white overwhelms the frame | White-out |
| 5 | White frame → overexposure fades to flat top-down 2D map of Cairo (90° pitch) → 2D ground deforms and lifts into 3D → camera tilts to 60° isometric → five elevated glowing branch roads (New Cairo, Nasr City, Maadi, 6th of October, Heliopolis) | Holds on 3D network |
| 6 | Camera dives and flies along the central arterial route, passing six glowing nodes (Live GPS, AI attendance, Parent alerts, Live cameras, Fleet management, Safety) → branch roads geometrically converge into a single point of light → point expands and resolves into the "SafeRide" wordmark on dark ink background | Final frame |

**The idle loop segment:** the first ~2 seconds of the video, looped on page
load until first scroll input.

### 1.3 Video Encoding Requirements

Scroll-scrubbing requires frame-accurate seeking. A standard web-encoded MP4
will stutter badly. The video must be re-encoded.

#### Frame rate — the highest the source allows

**Frame rate is the single biggest factor in how smooth the scrub feels.**
When a user scrolls, they are stepping through individual frames. At 24fps
the scrub looks choppy and stepped. At 60fps it feels like liquid. This is
the difference between "nice effect" and "how did they do that."

**Rules:**

1. **First, inspect the source file** and report its actual frame rate:
   ```bash
   ffprobe -v error -select_streams v:0 \
     -show_entries stream=r_frame_rate,avg_frame_rate,width,height,duration \
     -of default=noprint_wrappers=1 saferide-hero.mp4
   ```

2. **Never downsample the frame rate.** Encode at the source's native rate
   or higher. If the source is 60fps, the output must be 60fps. If the
   source is 30fps, output 30fps — do not drop to 24.

3. **If the source is 30fps or below, interpolate up to 60fps** using
   ffmpeg's motion interpolation:
   ```bash
   -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
   ```
   This synthesizes intermediate frames. It is slow to encode (expect
   several minutes for 52 seconds) but the scrub smoothness gain is
   substantial. Inspect the result — motion interpolation can produce
   artifacts on fast camera moves or hard cuts. If artifacts appear on any
   of the six clip transitions, fall back to the native frame rate for the
   full video rather than shipping a warped one.

4. **If the source is above 60fps, keep it.** 120fps scrubs beautifully.
   Only cap it if the file size becomes unmanageable.

5. **Target: 60fps minimum for the desktop scrub build.**

#### The encode

```bash
ffmpeg -i saferide-hero.mp4 \
  -c:v libx264 \
  -profile:v high \
  -crf 20 \
  -r 60 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  -an \
  saferide-hero-scrub.mp4
```

Key flags:
- `-r 60` — output frame rate. Raise to match or exceed the source; never
  lower it.
- `-g 1` and `-keyint_min 1` — a keyframe on **every frame**, which is what
  makes scrubbing smooth
- `-sc_threshold 0` — disables scene-change keyframe insertion, so the
  keyframe interval stays exactly 1
- `-an` — strip audio (not needed, and it blocks autoplay policies)
- `-movflags +faststart` — moves the moov atom to the front for streaming

Also produce a **WebM/VP9** variant for browsers that prefer it, and a
**720p mobile variant** (standard encode, normal keyframe interval — mobile
does not scrub, so it does not need every-frame keyframes).

#### Managing file size

Every-frame keyframes at 60fps produce a large file. **Do not solve this by
lowering the frame rate.** Frame rate is what the effect depends on. Solve
it in this order instead:

1. **Raise CRF** — try 22, then 24, then 26. Visual quality degrades
   gracefully; scrub smoothness does not.
2. **Reduce resolution** — 1440×810 often looks identical to 1080p when the
   video is a full-bleed background behind overlay text. Try it before
   touching frame rate.
3. **Trim dead frames** — if any of the six clips have static hold frames,
   shortening them reduces size without touching quality.
4. **Only as an absolute last resort**, drop from 60fps to 30fps — and if
   you do, flag it explicitly in `TODO.md` as a known quality compromise.

Soft target: under 40 MB for the 1080p/60fps desktop build. If it lands
above that, report the actual size and the tradeoffs before proceeding, and
let the user decide rather than silently downgrading the frame rate.

#### Verification

After encoding, confirm the output actually has the intended properties:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate,nb_frames,width,height \
  -of default=noprint_wrappers=1 saferide-hero-scrub.mp4
```

Then verify every-frame keyframes by counting them — the keyframe count
should equal the total frame count:

```bash
ffprobe -v error -select_streams v:0 -show_frames \
  -show_entries frame=key_frame -of csv=p=0 saferide-hero-scrub.mp4 \
  | grep -c "^1$"
```

Report both numbers. If they do not match, the encode is wrong and scrubbing
will stutter.

### 1.4 Implementation

**Libraries:**
- `gsap` + `ScrollTrigger` — drives the scrub binding
- `@studio-freight/lenis` — smooth scroll, synced to ScrollTrigger

**Structure:**

```
<section className="hero-scrub">          // height: 600vh (the scroll runway)
  <div className="hero-sticky">           // position: sticky, top: 0, height: 100vh
    <video
      ref={videoRef}
      src="/video/saferide-hero-scrub.mp4"
      muted
      playsInline
      preload="auto"
      className="hero-video"              // object-fit: cover, full viewport
    />
    <div className="hero-overlay">        // text/CTA layer, see 1.6
      ...
    </div>
  </div>
</section>
```

**Behavior spec:**

1. **On mount:** video autoplays muted, looping between `0` and
   `IDLE_LOOP_END` (2.0s). Implement with a `timeupdate` listener that
   resets `currentTime` to 0 when it passes `IDLE_LOOP_END`.

   > **AS BUILT.** A dedicated 336 KB `saferide-hero-idle.mp4` holding the
   > first two seconds is used instead, so it loops natively and no
   > `timeupdate` listener is needed. Its `<source>` elements for the scrub
   > file are withheld until the idle has painted, or the two race for
   > bandwidth and the small file loses.
   >
   > Measured, Chrome, Fast 3G at 204 KB/s and 562 ms RTT:
   >
   > | condition | first decoded frame |
   > |---|---|
   > | idle file alone, warm connection (`build/serve-throttled.js`) | 405 ms |
   > | idle file alone, cold, cache disabled | 822 ms |
   > | `saferide-hero-scrub.webm` alone, cold | 2085 ms |
   > | `saferide-hero-scrub.mp4` alone, cold | 1263 ms |
   > | idle frame in a full cold production page load | 5534 ms |
   >
   > The split is justified by the third and first rows: the idle shows film
   > 1263 ms sooner than the webm source Chrome selects. The 405 ms figure is
   > a warm-connection measurement of the file alone and is not what a
   > first-time visitor experiences.

2. **On first scroll input** (wheel, touchmove, or any ScrollTrigger
   progress > 0): pause the idle loop, remove the `timeupdate` handler,
   and hand control to ScrollTrigger.

3. **Scrub binding:**

```js
ScrollTrigger.create({
  trigger: ".hero-scrub",
  start: "top top",
  end: "bottom bottom",
  scrub: 0.5,                    // slight smoothing, feels less mechanical
  onUpdate: (self) => {
    if (video.readyState >= 2 && video.duration) {
      video.currentTime = self.progress * video.duration;
    }
  }
});
```

4. **Wait for metadata** before binding — guard on `loadedmetadata`.
   Show a subtle loading state (a still poster frame) until the video is
   buffered enough to scrub without stalling.

5. **Scroll runway length:** the `.hero-scrub` section height controls how
   much scrolling maps to the 52 seconds. Start at `600vh`. Tune it — too
   short and the video races past; too long and users get impatient. Aim
   for the full video to play over roughly 6–8 seconds of natural scrolling.

**Lenis setup:**

```js
const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

### 1.5 Mobile Handling

Mobile browsers handle video scrubbing poorly — Safari iOS in particular
stutters or refuses to seek smoothly.

**Below 768px viewport width:**
- Do **not** scrub. Instead, play the video normally as a looping background
  at reduced height (a standard 100vh hero), muted, `playsInline`, autoplay.
- Use the 720p mobile-encoded variant.
- Reduce the `.hero-scrub` height to `100vh` (no scroll runway).
- Overlay text is static, no scroll-linked reveals.

**If the device reports `prefers-reduced-motion: reduce`:**
- Show a static poster frame (the video's final wordmark frame, or a chosen
  hero still). No video playback, no scrub.

**If the video fails to load or `canplay` never fires within 5 seconds:**
- Fall back to the poster image. The page must remain fully functional.

### 1.6 Hero Overlay Content

Text and CTAs sit above the video. They should fade in and out at specific
scroll progress points, timed to the video's narrative beats.

| Scroll progress | Overlay content |
|---|---|
| 0.00 – 0.12 | Eyebrow: "AI-Powered School Transportation Safety"<br>H1: "Because every child deserves a safe ride home"<br>CTAs: "Explore Platform" (primary), "Our Story" (ghost) |
| 0.12 – 0.30 | Fade out hero copy. No overlay during the boarding sequence — let the video carry it. |
| 0.30 – 0.45 | Small caption, lower-left: "Face recognition confirms the right child boarded the right bus." |
| 0.45 – 0.60 | Small caption: "Every boarding, arrival, and delay reaches the parent instantly." |
| 0.60 – 0.80 | Small caption: "Live coverage across Cairo, Giza, Alexandria and beyond." |
| 0.80 – 1.00 | Fade to final state. Let the video's wordmark resolve cleanly with no overlay competing. |

Overlay elements animate with GSAP tied to the same ScrollTrigger progress.
Use `autoAlpha` and small `y` offsets. Keep it subtle — the video is the
star.

A "Scroll to discover" indicator sits at the bottom of the initial viewport
and fades out after the first scroll input.

---

## 2. Navigation Bar

The navigation is the **Sterling Gate kinetic navigation** component from
21st.dev. It is a full-screen overlay menu with GSAP-driven panel reveals,
staggered link entrances, and ambient hover shapes.

**This same component serves both desktop and mobile.** It is an overlay
menu by design.

> **STRUCTURE CHANGE, 2026-09-05, on instruction — this section is written
> around a fixed header bar that no longer exists.** There is no header. The
> logo and the Menu/Close text button went with it. The trigger is a floating
> hamburger, fixed in the top-right above everything; the language toggle and
> Log In moved inside the overlay panel. Read §2.2 E/F and §2.3's z-index and
> legibility notes with that in mind — each is annotated below.

### 2.1 Component Source

Copy this component to `/components/ui/sterling-gate-kinetic-navigation.tsx`.
If the project's component path is not `/components/ui`, create that folder —
it is the shadcn convention and keeps generated primitives separate from
application components.

```tsx
// components/ui/sterling-gate-kinetic-navigation.tsx
'use client';

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

// Register GSAP Plugins safely
if (typeof window !== "undefined") {
  gsap.registerPlugin(CustomEase);
}

export function Component() {
  // We need a ref for the parent container to scope GSAP
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Initial Setup & Hover Effects
  useEffect(() => {
    if (!containerRef.current) return;

    // Create custom easing
    try {
        if (!gsap.parseEase("main")) {
            CustomEase.create("main", "0.65, 0.01, 0.05, 0.99");
            gsap.defaults({ ease: "main", duration: 0.7 });
        }
    } catch (e) {
        console.warn("CustomEase failed to load, falling back to default.", e);
        gsap.defaults({ ease: "power2.out", duration: 0.7 });
    }

    const ctx = gsap.context(() => {
      // 1. Arrow Animation (safe no-op if the arrow element is absent)
      const arrowLine = document.querySelector(".arrow-line");
      if (arrowLine) {
        const pathLength = (arrowLine as SVGPathElement).getTotalLength();
        gsap.set(arrowLine, { strokeDasharray: pathLength, strokeDashoffset: pathLength });
        const arrowTl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
        arrowTl
          .to(arrowLine, { strokeDashoffset: 0, duration: 1, ease: "power2.out" })
          .to({}, { duration: 1.2 })
          .to(arrowLine, { strokeDashoffset: -pathLength, duration: 0.6, ease: "power2.in" })
          .set(arrowLine, { strokeDashoffset: pathLength });
      }

      // 2. Shape Hover
      const menuItems = containerRef.current!.querySelectorAll(".menu-list-item[data-shape]");
      const shapesContainer = containerRef.current!.querySelector(".ambient-background-shapes");

      menuItems.forEach((item) => {
        const shapeIndex = item.getAttribute("data-shape");
        const shape = shapesContainer ? shapesContainer.querySelector(`.bg-shape-${shapeIndex}`) : null;

        if (!shape) return;

        const shapeEls = shape.querySelectorAll(".shape-element");

        const onEnter = () => {
             if (shapesContainer) {
                 shapesContainer.querySelectorAll(".bg-shape").forEach((s) => s.classList.remove("active"));
             }
             shape.classList.add("active");

             gsap.fromTo(shapeEls,
                { scale: 0.5, opacity: 0, rotation: -10 },
                { scale: 1, opacity: 1, rotation: 0, duration: 0.6, stagger: 0.08, ease: "back.out(1.7)", overwrite: "auto" }
             );
        };

        const onLeave = () => {
            gsap.to(shapeEls, {
                scale: 0.8, opacity: 0, duration: 0.3, ease: "power2.in",
                onComplete: () => shape.classList.remove("active"),
                overwrite: "auto"
            });
        };

        item.addEventListener("mouseenter", onEnter);
        item.addEventListener("mouseleave", onLeave);

        (item as any)._cleanup = () => {
            item.removeEventListener("mouseenter", onEnter);
            item.removeEventListener("mouseleave", onLeave);
        };
      });

    }, containerRef);

    return () => {
        ctx.revert();
        if (containerRef.current) {
            const items = containerRef.current.querySelectorAll(".menu-list-item[data-shape]");
            items.forEach((item: any) => item._cleanup && item._cleanup());
        }
    };
  }, []);

  // Menu Open/Close Animation Effect
  useEffect(() => {
      if (!containerRef.current) return;

      const ctx = gsap.context(() => {
        const navWrap = containerRef.current!.querySelector(".nav-overlay-wrapper");
        const menu = containerRef.current!.querySelector(".menu-content");
        const overlay = containerRef.current!.querySelector(".overlay");
        const bgPanels = containerRef.current!.querySelectorAll(".backdrop-layer");
        const menuLinks = containerRef.current!.querySelectorAll(".nav-link");
        const fadeTargets = containerRef.current!.querySelectorAll("[data-menu-fade]");

        const menuButton = containerRef.current!.querySelector(".nav-close-btn");
        const menuButtonTexts = menuButton?.querySelectorAll("p");
        const menuButtonIcon = menuButton?.querySelector(".menu-button-icon");

        const tl = gsap.timeline();

        if (isMenuOpen) {
            // OPEN
            if (navWrap) navWrap.setAttribute("data-nav", "open");

            tl.set(navWrap, { display: "block" })
              .set(menu, { xPercent: 0 }, "<")
              .fromTo(menuButtonTexts, { yPercent: 0 }, { yPercent: -100, stagger: 0.2 })
              .fromTo(menuButtonIcon, { rotate: 0 }, { rotate: 315 }, "<")
              .fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1 }, "<")
              .fromTo(bgPanels, { xPercent: 101 }, { xPercent: 0, stagger: 0.12, duration: 0.575 }, "<")
              .fromTo(menuLinks, { yPercent: 140, rotate: 10 }, { yPercent: 0, rotate: 0, stagger: 0.05 }, "<+=0.35");

            if (fadeTargets.length) {
                tl.fromTo(fadeTargets, { autoAlpha: 0, yPercent: 50 }, { autoAlpha: 1, yPercent: 0, stagger: 0.04, clearProps: "all" }, "<+=0.2");
            }

        } else {
            // CLOSE
            if (navWrap) navWrap.setAttribute("data-nav", "closed");

            tl.to(overlay, { autoAlpha: 0 })
              .to(menu, { xPercent: 120 }, "<")
              .to(menuButtonTexts, { yPercent: 0 }, "<")
              .to(menuButtonIcon, { rotate: 0 }, "<")
              .set(navWrap, { display: "none" });
        }

      }, containerRef);

      return () => ctx.revert();
  }, [isMenuOpen]);

  // keydown Escape handling
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isMenuOpen) {
            setIsMenuOpen(false);
        }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isMenuOpen]);

  const toggleMenu = () => setIsMenuOpen(prev => !prev);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div ref={containerRef}>
        <div className="site-header-wrapper">
          <header className="header">
            <div className="container is--full">
              <nav className="nav-row">
                <a href="#" aria-label="home" className="nav-logo-row w-inline-block"></a>
                <div className="nav-row__right">
                  <div className="nav-toggle-label" onClick={toggleMenu} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>
                    <span className="toggle-text">click me</span>
                  </div>

                  <button role="button" className="nav-close-btn" onClick={toggleMenu} style={{ pointerEvents: 'auto' }}>
                    <div className="menu-button-text">
                      <p className="p-large">Menu</p>
                      <p className="p-large">Close</p>
                    </div>
                    <div className="icon-wrap">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="100%"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="menu-button-icon"
                      >
                        <path d="M7.33333 16L7.33333 -3.2055e-07L8.66667 -3.78832e-07L8.66667 16L7.33333 16Z" fill="currentColor"></path>
                        <path d="M16 8.66667L-2.62269e-07 8.66667L-3.78832e-07 7.33333L16 7.33333L16 8.66667Z" fill="currentColor"></path>
                        <path d="M6 7.33333L7.33333 7.33333L7.33333 6C7.33333 6.73637 6.73638 7.33333 6 7.33333Z" fill="currentColor"></path>
                        <path d="M10 7.33333L8.66667 7.33333L8.66667 6C8.66667 6.73638 9.26362 7.33333 10 7.33333Z" fill="currentColor"></path>
                        <path d="M6 8.66667L7.33333 8.66667L7.33333 10C7.33333 9.26362 6.73638 8.66667 6 8.66667Z" fill="currentColor"></path>
                        <path d="M10 8.66667L8.66667 8.66667L8.66667 10C8.66667 9.26362 9.26362 8.66667 10 8.66667Z" fill="currentColor"></path>
                      </svg>
                    </div>
                  </button>
                </div>
              </nav>
            </div>
          </header>
        </div>

      <section className="fullscreen-menu-container">
        <div data-nav="closed" className="nav-overlay-wrapper">
          <div className="overlay" onClick={closeMenu}></div>
          <nav className="menu-content">
            <div className="menu-bg">
              <div className="backdrop-layer first"></div>
              <div className="backdrop-layer second"></div>
              <div className="backdrop-layer"></div>

              <div className="ambient-background-shapes">
                {/* Shape 1: Floating circles */}
                <svg className="bg-shape bg-shape-1" viewBox="0 0 400 400" fill="none">
                  <circle className="shape-element" cx="80" cy="120" r="40" fill="rgba(99,102,241,0.15)" />
                  <circle className="shape-element" cx="300" cy="80" r="60" fill="rgba(139,92,246,0.12)" />
                  <circle className="shape-element" cx="200" cy="300" r="80" fill="rgba(236,72,153,0.1)" />
                  <circle className="shape-element" cx="350" cy="280" r="30" fill="rgba(99,102,241,0.15)" />
                </svg>

                {/* Shape 2: Wave pattern */}
                <svg className="bg-shape bg-shape-2" viewBox="0 0 400 400" fill="none">
                  <path className="shape-element" d="M0 200 Q100 100, 200 200 T 400 200" stroke="rgba(99,102,241,0.2)" strokeWidth="60" fill="none" />
                  <path className="shape-element" d="M0 280 Q100 180, 200 280 T 400 280" stroke="rgba(139,92,246,0.15)" strokeWidth="40" fill="none" />
                </svg>

                {/* Shape 3: Grid dots */}
                <svg className="bg-shape bg-shape-3" viewBox="0 0 400 400" fill="none">
                  <circle className="shape-element" cx="50" cy="50" r="8" fill="rgba(99,102,241,0.3)" />
                  <circle className="shape-element" cx="150" cy="50" r="8" fill="rgba(139,92,246,0.3)" />
                  <circle className="shape-element" cx="250" cy="50" r="8" fill="rgba(236,72,153,0.3)" />
                  <circle className="shape-element" cx="350" cy="50" r="8" fill="rgba(99,102,241,0.3)" />
                  <circle className="shape-element" cx="100" cy="150" r="12" fill="rgba(139,92,246,0.25)" />
                  <circle className="shape-element" cx="200" cy="150" r="12" fill="rgba(236,72,153,0.25)" />
                  <circle className="shape-element" cx="300" cy="150" r="12" fill="rgba(99,102,241,0.25)" />
                  <circle className="shape-element" cx="50" cy="250" r="10" fill="rgba(236,72,153,0.3)" />
                  <circle className="shape-element" cx="150" cy="250" r="10" fill="rgba(99,102,241,0.3)" />
                  <circle className="shape-element" cx="250" cy="250" r="10" fill="rgba(139,92,246,0.3)" />
                  <circle className="shape-element" cx="350" cy="250" r="10" fill="rgba(236,72,153,0.3)" />
                  <circle className="shape-element" cx="100" cy="350" r="6" fill="rgba(99,102,241,0.3)" />
                  <circle className="shape-element" cx="200" cy="350" r="6" fill="rgba(139,92,246,0.3)" />
                  <circle className="shape-element" cx="300" cy="350" r="6" fill="rgba(236,72,153,0.3)" />
                </svg>

                {/* Shape 4: Organic blobs */}
                <svg className="bg-shape bg-shape-4" viewBox="0 0 400 400" fill="none">
                  <path className="shape-element" d="M100 100 Q150 50, 200 100 Q250 150, 200 200 Q150 250, 100 200 Q50 150, 100 100" fill="rgba(99,102,241,0.12)" />
                  <path className="shape-element" d="M250 200 Q300 150, 350 200 Q400 250, 350 300 Q400 250, 350 300 Q300 350, 250 300 Q200 250, 250 200" fill="rgba(236,72,153,0.1)" />
                </svg>

                {/* Shape 5: Diagonal lines */}
                <svg className="bg-shape bg-shape-5" viewBox="0 0 400 400" fill="none">
                  <line className="shape-element" x1="0" y1="100" x2="300" y2="400" stroke="rgba(99,102,241,0.15)" strokeWidth="30" />
                  <line className="shape-element" x1="100" y1="0" x2="400" y2="300" stroke="rgba(139,92,246,0.12)" strokeWidth="25" />
                  <line className="shape-element" x1="200" y1="0" x2="400" y2="200" stroke="rgba(236,72,153,0.1)" strokeWidth="20" />
                </svg>
              </div>
            </div>

            <div className="menu-content-wrapper">
              <ul className="menu-list">
                <li className="menu-list-item" data-shape="1">
                  <a href="#" className="nav-link w-inline-block">
                    <p className="nav-link-text">About us</p>
                    <div className="nav-link-hover-bg"></div>
                  </a>
                </li>
                <li className="menu-list-item" data-shape="2">
                  <a href="#" className="nav-link w-inline-block">
                    <p className="nav-link-text">Our work</p>
                    <div className="nav-link-hover-bg"></div>
                  </a>
                </li>
                <li className="menu-list-item" data-shape="3">
                  <a href="#" className="nav-link w-inline-block">
                    <p className="nav-link-text">Services</p>
                    <div className="nav-link-hover-bg"></div>
                  </a>
                </li>
                <li className="menu-list-item" data-shape="4">
                  <a href="#" className="nav-link w-inline-block">
                    <p className="nav-link-text" data-menu-fade>Blog</p>
                    <div className="nav-link-hover-bg"></div>
                  </a>
                </li>
                <li className="menu-list-item" data-shape="5">
                  <a href="#" className="nav-link w-inline-block">
                    <p className="nav-link-text">Contact us</p>
                    <div className="nav-link-hover-bg"></div>
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </section>
    </div>
  );
}
```

**Install:**

```bash
pnpm add gsap
```

**Note on GSAP CustomEase:** `CustomEase` is a GSAP plugin. In current GSAP
versions it is included in the free tier — verify the import resolves. If it
does not, the component already has a try/catch fallback to `power2.out`,
which is acceptable but slightly less characterful. Do not spend time
fighting this.

### 2.2 Required Adaptations for SafeRide

The component ships with placeholder content. **All of the following must be
changed before it ships.**

**A. Replace the menu links.** The component has About us / Our work /
Services / Blog / Contact us. SafeRide's are:

| `data-shape` | Label | Href |
|---|---|---|
| 1 | Features | `#features` |
| 2 | AI Platform | `#ai` |
| 3 | Coverage | `#coverage` |
| 4 | Pricing | `#pricing` |
| 5 | FAQ | `#faq` |
| 6 | Contact | `#contact` |

That is **six** links, not five. Add a sixth `.menu-list-item` with
`data-shape="6"` and a corresponding sixth `.bg-shape bg-shape-6` SVG in
`.ambient-background-shapes`. Design the sixth shape in the same visual
family as the existing five.

**B. Recolor the ambient shapes.** The shipped SVG shapes use indigo,
violet, and pink (`rgba(99,102,241,…)`, `rgba(139,92,246,…)`,
`rgba(236,72,153,…)`). Those are not SafeRide colors. Replace every fill and
stroke with SafeRide brand tones drawn from the site at
https://safe-ridee.vercel.app/ and the video's palette. Keep the same alpha
values — the shapes are meant to be ambient, not loud.

> **The CSS block §2.2 C refers to is not in this document.** §2.1's TSX is
> complete, but there is no `<style>` block and no CSS for any of the ~25
> classes the component depends on. All of the panel geometry is therefore
> *inferred from the GSAP timeline*, which is the only specification of the
> layout that exists.
>
> That cost something concrete. The panel shipped with no background of its
> own — a background that never animates leaves no trace in the GSAP numbers —
> so the three sliding `.backdrop-layer` elements became the ground instead of
> a sweep over it, and for 465ms of every open the menu copy was painted over
> bare film. Fixed by giving `.menu-content` `--surface-dark` and animating the
> panel itself. Guarded frame by frame by `node build/diagnose-menu.js`.
> **The inference reproduces everything that moves and nothing that stands
> still**; assume anything static is missing and check it in a browser.

**C. Replace the `:root` variables.** The component's CSS block ships with
`--color-primary: #6366f1` and a neutral ramp. **Do not paste that block as
written** — it would override SafeRide's design tokens with a generic indigo
theme. Map the component's variables onto the existing SafeRide tokens
instead. The structural variables (`--size-container`, `--container-padding`,
`--section-padding`, `--gap`, `--cubic-default`) can be kept if they don't
already exist.

**D. Replace the "click me" label.** `.nav-toggle-label` currently reads
"click me". Either remove it entirely or replace it with something purposeful
for SafeRide. It is a demo artifact.

**E. ~~Add the logo.~~ DROPPED with the header.** `.nav-logo-row` was an empty
anchor in a header bar; there is no header bar, so there is nowhere for it to
sit. The site currently carries no mark above the fold. Open question, not a
decision: the asset is a square 159x159 mark with no wordmark.

**F. Add the utilities.** ~~The header needs, alongside the Menu button:~~
**They live in the overlay panel now**, below the six links:
- A language toggle (EN / العربية) — the site is bilingual
- A "Log In" link → `https://safe-ridee.vercel.app/login`

~~Both must survive the menu-open state or animate out with it.~~ Settled by
the move: they are inside the panel, so they arrive and leave with it. They
are unreachable while the menu is shut, which is the trade the floating
trigger buys.

**G. Replace the trigger.** The reference's `.nav-toggle-label` /
`.nav-close-btn` pair is replaced by a floating hamburger (Uiverse, by
JulanDeAlb): two SVG paths morphing to an X through `stroke-dasharray` and a
-45deg rotation. Three things do not port as written:

- Its state comes from a `<label>` wrapping a hidden checkbox. That has no
  role, no `aria-expanded` and no accessible name, and it duplicates state
  React already owns. Ship a real `<button>` carrying `data-open`, and let
  the CSS key off that — one source of truth.
- `stroke: white` is hardcoded. See §2.3.
- 600ms is long for a control reporting its own state. It runs on
  `--dur-state` (260ms), which also takes it to 0ms under reduced motion.

### 2.3 Integration With the Scrub Video

This is the part the component does not handle out of the box.

**Z-index:** ~~the header~~ **the trigger** must sit above the sticky video
hero, and above the overlay too — it is also the close control. Shipped:
trigger 70, overlay 50.

**Legibility over the video.** The video passes through radically different
frames — dark studio, solid orange, pure white-out, flat map, dark ink
wordmark. A fixed-color ~~header~~ **mark** will become invisible at several
points. Implement one of these, and verify at multiple scroll positions:

- ~~**Preferred:** a scroll-progress-aware color inversion.~~ **MEASURED AND
  REJECTED — do not re-propose this.** Sampled across all 209 frames of the
  film at 4 fps, worst pixel in the top 72px band, at 1440x900 and 1920x1080:
  **151 of 209 frames have no ink that clears 4.5:1 in either direction.**
  Neither dark nor light. The best contiguous run in the whole film bottoms
  out at 3.00:1.

  The reason is geometric, not a matter of scheduling. A full-width band
  across the top of the frame crosses bright and dark regions
  **simultaneously** in most frames — dark studio ceiling beside a lit bus
  roof, dark map beside a glowing node. A single ink cannot serve both ends
  of the same band, so there is nothing to invert *to*. No amount of
  progress-aware switching fixes it. This option was written from the clip
  breakdown rather than from pixels.

  Reproduce with `node build/header-ground.js <frames-dir>`, and the
  button-scoped version with `node build/hamburger-ground.js <frames-dir>`.

- **SPECIFIED APPROACH, SUPERSEDED BY THE STRUCTURE CHANGE:** a persistent
  surface behind the header — a dark tint of `--surface-dark` carrying the
  text, with `backdrop-filter: blur()` over it for the glass read.
  **Unprefixed only**: Gecko does not support `-webkit-backdrop-filter`
  (verified, Firefox 155).

  This shipped, briefly, and the numbers below are sound. It is recorded
  rather than deleted because it is the reference point for what replaced it.

  Tint alpha sized by measurement, blur deliberately excluded from the model
  because blur only reduces local extremes — a tint that passes without it
  passes with it:

  | tint alpha | worst frame | frames under 4.5:1 |
  |---|---|---|
  | 0.50 | 3.79:1 | 72 |
  | 0.55 | 4.52:1 | 0 |
  | **0.60** | **5.44:1** | **0** |

  0.55 is the floor. **Ship 0.60** — 4.52:1 clears by 0.02, and bare-minimum
  margins have twice proved fragile in this project.

The white-out at clip 4 is not the special case this section originally
assumed; 72% of the film fails without a surface.

- **SHIPPED: a collar on the stroke, and no surface at all.** With the header
  gone there is no band to tint — only a 48px square in one corner. Re-measured
  scoped to that square (`node build/hamburger-ground.js <frames-dir>`, 209
  frames, worst pixel anywhere in the button's box, at 1440x900 / 1920x1080 /
  390x844):

  | | full-width 72px band | 48px corner |
  |---|---|---|
  | frames where NEITHER ink clears 3:1 | 151 / 209 | **58 / 209** |
  | bare white stroke, worst frame | — | **1.00:1** |
  | bare white stroke, frames under 3:1 | — | **146 / 209** |

  The corner is far easier than the band and still nowhere near safe. A 48px
  tint plate would work (0.45 alpha clears 3:1 on every frame) but that is a
  header by another name, and it has to be large enough to cover wherever the
  stroke sweeps as the icon rotates.

  What ships instead is a **collar**: the same two paths painted underneath at
  `stroke-width: 7` against the ink's `3`, in `rgba(3,3,2,.62)`. It cannot
  miss, because it travels with the ink. The colour immediately adjacent to
  the white is then known, and the film reaches it only through 38%
  transmission.

  | ground | modelled | as painted (`build/shoot-hamburger.js`) |
  |---|---|---|
  | worst frame of the film | 5.86:1 | 5.96:1 |
  | white-out | — | 6.01:1 |
  | `--paper`, the sections below the hero | 6.05:1 | 5.91:1 |
  | over the open panel | 19.94:1 | 19.51:1 |
  | half way through the morph | — | 12.31:1 |

  0 frames under 4.5:1, so this clears the text threshold and not merely
  1.4.11's 3:1.

  **The sections below the hero are the case the film measurement cannot
  see.** The trigger is fixed and always visible, so it also floats over
  `--paper`, where a bare white stroke is **1.02:1**. The collar is what makes
  the mark work there, and the focus ring carries the same collar for the same
  reason — `--ring` resolves to `--accent-warm`, which is about 1.2:1 on
  paper on its own.

**Scroll locking.** When the menu opens, Lenis must be stopped
(`lenis.stop()`) so the page cannot scroll behind the overlay — and critically,
so the video does not scrub while the menu is open. Resume on close
(`lenis.start()`).

### 2.4 Accessibility Requirements

The shipped component is not accessible as-is. Fix all of these:

- The menu toggle uses `role="button"` on a `<button>` — redundant, remove it
- Add `aria-expanded={isMenuOpen}` and `aria-controls` on the toggle
- Add `aria-label` on the toggle that reflects state ("Open menu" / "Close menu")
- Add `role="dialog"` and `aria-modal="true"` on `.nav-overlay-wrapper` when open
- **Trap focus** inside the menu while open — Tab must cycle within it
- Return focus to the toggle button when the menu closes
- The overlay div has an `onClick` but no keyboard equivalent — it is
  decorative, so add `aria-hidden="true"` and rely on Escape (already handled)
  for keyboard users
- Every menu link needs a visible `focus-visible` ring
- Under `prefers-reduced-motion: reduce`: the menu opens and closes
  **instantly** with no panel stagger, no link entrance, no shape animation.
  Not faster — none.

### 2.5 Mobile

The overlay pattern works on mobile without a separate implementation, but:

- Menu link type scale must come down significantly — the desktop sizing will
  overflow on a 375px viewport
- If six links plus utilities overflow vertically, allow the menu content to
  scroll internally
- Ambient hover shapes are pointer-only. On touch devices, either disable them
  or trigger them on link tap. Do not leave dead animation code running.
- Tap targets minimum 44×44px

---

## 3. Post-Video Transition — REMOVED

**This section is struck, not deferred. There is no outstanding work here and
none is expected. Do not pick it up as unfinished.**

Removed on instruction, 2026-09-05, after the ground and geometry had been
built and measured against solid-colour placeholders. Everything it described
is gone from the repository: the component, its CSS, the three placeholder
images, the measurement rig, and the mount in `app/page.tsx`. `parallax`,
`Osmo`, `cdn.21st.dev` and `data-parallax-layer` return zero hits in shipped
source, with no commented-out remnants. Nothing was ever built that assumed
this section existed — no preload, no reserved height, no scroll arithmetic;
`app/layout.tsx` preloads only the hero's idle loop.

**The one job it was doing still needs an answer.** It existed to bridge the
film's last frame — the wordmark on dark ink — into the light content
sections. Without it the hero's pin releases straight into `--paper`. Whether
that reads as a clean cut or as an abrupt jump is a question for the capture,
not for a rebuild of this section.

The original content is in git history at the commit that removed it.


## 4. Content Sections (After the Video)

All copy below is taken verbatim from https://safe-ridee.vercel.app/.
Do not rewrite it. Fetch that site if any detail is unclear.

**ONE EXCEPTION, added 2026-09-07.** Copy is verbatim **except where a
factual claim in it has become false** — a count that no longer matches what
ships, a figure that was never real. In that case it is corrected, and the
correction is flagged rather than made silently. A wrong number is worse than
an edited sentence. First application: §4.3's subhead, when the phone tour
took five of the ten Platform cards.

### 4.1 Emotional Journey Strip

A short scroll-triggered sequence of statements that fade in and out.
Existing copy:

- "Every morning begins with a smile…"
- "…and one silent worry."
- "No new updates…"
- "Every minute feels longer."
- "Your child arrived safely at school."
- "Live location updated."

Then the SafeRide logo and: **"Peace of mind, every school journey."**

### 4.2 Stats Band — CUT

**Decided 2026-09-06: this section is removed, not deferred.** No real figures
exist for Partner Schools, Protected Students, Smart Buses or Journey Safety,
and the spec's own instruction was "either populate with real numbers or remove
the section entirely."

The absence of the section is more credible than its presence — placeholder
zeros are exactly what undermined the original site. If real data arrives the
section can come back; until then there is nothing here to build.

### 4.3 Platform — "Everything a safe journey needs"

**Section eyebrow:** Platform
**Heading:** Everything a safe journey needs
**Subhead:** ~~Ten systems working together so nothing about a child's
commute is left to chance.~~ **CORRECTED 2026-09-07** — the phone tour took
five of these ten cards, so the count was false. Under §4's copy rule
exception:

> Five systems working together in the background, so nothing about a child's
> commute is left to chance.

**This section now carries FIVE cards.** AI Incident Detection, Predictive
Maintenance, AI Reports, Multi-language Support, Dark & Light Mode. The other
five — Live GPS Tracking, Parent Notifications, Face Recognition Attendance,
Emergency Response, Driver Performance Analytics — are carried by the phone
tour section that follows. See SafeRide_Phone_Tour_Spec.md §1.1.

Ten feature cards:

1. **AI Incident Detection** — Computer vision watches every trip for unsafe
   behavior and flags it in seconds, before it becomes an incident report.
   *(carries a "Watching live right now" live-status indicator)*
2. **Live GPS Tracking** — Every bus reports its position in real time, so
   parents and supervisors always know exactly where a child is.
3. **Face Recognition Attendance** — Boarding and drop-off are logged
   automatically as each student steps on or off, no manual roll call
   required.
4. **Emergency Response** — One tap from a driver or supervisor puts the
   school, parents, and the emergency operator in the loop instantly.
5. **Driver Performance Analytics** — Braking, speed, and fatigue signals
   build a performance score schools can act on before a small habit becomes
   a risk.
6. **Predictive Maintenance** — SafeRide flags buses that are due for service
   based on usage patterns, not just a calendar reminder.
7. **Parent Notifications** — Boarding confirmations, arrival alerts, and
   delay updates reach parents the moment they happen.
8. **AI Reports** — Attendance, safety, and fleet reports generate
   themselves, with plain-language explanations behind every number.
9. **Multi-language Support** — A full English and Arabic experience for
   every role, switching instantly without reloading.
10. **Dark & Light Mode** — A carefully redesigned dark mode, not an inverted
    one, so the platform stays legible any hour.

### 4.4 The Journey — "Every step, accounted for"

**Section eyebrow:** The Journey
**Heading:** Every step, accounted for

Eight steps:

1. **Home** — The day starts where every parent can already see the bus
   approaching.
2. **Bus Arrives** — A live ETA reaches the parent's phone before the bus
   turns the corner.
3. **Boarding** — Face recognition confirms the right child boarded the right
   bus.
4. **GPS Tracking** — The full route is visible live, stop by stop, in real
   time.
5. **School Arrival** — Arrival is logged automatically and parents get an
   instant confirmation.
6. **School Day** — SafeRide steps back while your child is in class, no
   unnecessary noise.
7. **Return Journey** — The same visibility, attendance, and alerts apply on
   the way home.
8. **Home** — A final drop-off confirmation closes the loop for total peace
   of mind.

### 4.5 Intelligence Layer

**Section eyebrow:** Intelligence Layer
**Heading:** Artificial intelligence watching every journey
**Body:** AI assists, it never overwhelms. Every prediction ships with a
confidence score and a plain-language reason, so the people using SafeRide
always understand what it's telling them and why.

**Live example panel:**
- "Unbuckled seatbelt detected, seat 4" — 87% confidence
- "Match · 98%"

Six capability cards:

1. **Computer Vision** — Reads what's happening on board frame by frame, not
   just where the bus is.
2. **Incident Detection** — Recognizes unsafe patterns and flags them before
   they escalate.
3. **Heatmaps** — Surfaces where delays and risk cluster across a school's
   entire route network.
4. **Predictive Analytics** — Forecasts delays and maintenance needs from
   patterns humans would miss.
5. **Driver Monitoring** — Tracks braking, speed, and fatigue signals to
   build an ongoing safety score.
6. **Route Optimization** — Continuously reshapes routes around real traffic,
   not a fixed morning plan.

### 4.6 The Difference — "Why Choose SafeRide"

Two-column comparison.

**SafeRide:**
- Live GPS tracking, every trip
- AI-verified attendance
- Instant parent notifications
- One-tap emergency response
- AI incident detection
- Automated cloud reports

**Traditional Transportation:**
- Manual logbooks
- No live location
- Delayed communication
- Slow emergency response
- No incident visibility
- Paper reports

### 4.7 Coverage — "Protecting journeys across Egypt"

**Section eyebrow:** Coverage
**Heading:** Protecting journeys across Egypt
**Subhead:** From Alexandria to Aswan, every SafeRide school reports into the
same live network. Tap a city to see it.

~~Three stats — again currently showing `0+`:~~ **CUT, same decision as §4.2.**
No figures exist for Smart Buses, Students Protected or System Uptime, so the
stat row does not ship.

**The section itself stays.** The fourteen-city coverage list is not blocked on
any data, it is the `#coverage` target the navbar links to, and it is scheduled
into phase 5b. Only the three-stat row is removed.

Interactive city list (tap to view):
Cairo · Giza · Alexandria · Mansoura · Tanta · Ismailia · Port Said · Suez ·
Zagazig · Assiut · Minya · Sohag · Luxor · Aswan

### 4.8 Testimonials — "What families and schools tell us"

**Section eyebrow:** Trusted By Schools
**Heading:** What families and schools tell us

Four testimonials:

> "Every morning I used to call the school twice just to make sure my
> daughter got on the bus. Now I open the app and I can see exactly where she
> is. It changed how I feel about the whole school run."
> — **Ahmed Hassan**, Parent, Modern School

> "The first time I got a notification that said 'Sara boarded safely,' I
> actually teared up. It sounds small, but that peace of mind is everything
> when you're a working mother."
> — **Mona Ali**, Mother, Future Language School

> "We used to manage transportation with a notebook and a lot of phone calls.
> SafeRide gave us one dashboard for every bus, every driver, and every
> route. It's the biggest operational upgrade we've made in years."
> — **Dr. Karim El-Sayed**, Principal, El Rowad International School

> "Our front desk used to spend the first hour of every school day answering
> 'where is the bus' calls. Since we switched to SafeRide, those calls have
> almost completely stopped."
> — **Nourhan Fathy**, Administrator, Smart Vision School

### 4.9 Pricing

**Section eyebrow:** Pricing
**Heading:** Priced for one school, ready for a hundred
**Subhead:** Every plan includes the same core safety layer. Higher tiers add
scale and AI depth, not fewer guarantees.

**Basic — EGP 1,500/month**
For a single school getting live tracking and parent notifications off the
ground.
- Up to 2 buses
- Live GPS tracking
- Parent notifications
- Driver app
- Email support

CTA: Start Free Trial → `#contact`

**Professional — EGP 3,500/month** *(badge: Most Popular)*
The full AI safety layer, for schools ready to automate attendance and
monitoring.
- Up to 10 buses
- AI monitoring
- Smart attendance
- Parent mobile app
- Live dashboard
- Priority support

CTA: Start Free Trial → `#contact`

**Enterprise — Custom**
For school groups and transportation companies operating at city scale.
- Unlimited buses
- Full AI suite
- API integration
- Dedicated success manager
- 24/7 premium support

CTA: Talk to Sales → `#contact`

### 4.10 FAQ

**Section eyebrow:** Questions
**Heading:** Frequently asked questions

Seven questions (answers are on the source site — fetch them):

1. How does face recognition attendance protect my child's privacy?
2. How accurate is the live GPS tracking?
3. What happens if a bus loses internet connection mid-route?
4. Can SafeRide integrate with our existing school systems?
5. How fast is the emergency response?
6. Is there a free trial?
7. What languages does SafeRide support?

Accordion pattern. One open at a time. Plus icon rotates to a cross on open.

### 4.11 Contact

**Section eyebrow:** Get in Touch
**Heading:** Let's bring SafeRide to your school
**Subhead:** Tell us about your fleet and we'll walk you through a live demo
tailored to your school's routes.

**Contact details:**
- hello@saferide.app
- +20 2 0000 0000
- Cairo, Egypt

**Form fields:** Full name · Email · School / organization · Message
**Submit:** Send message

Wire with React Hook Form + Zod validation. Server Action to `/api/contact`.
Log payload and leave a TODO for real email service wiring.

### 4.12 Final CTA

**Heading:** Ready to experience SafeRide?
**Subhead:** Bring live tracking, AI safety monitoring, and total peace of
mind to your school's daily run.
**CTAs:** Talk to Our Team · Log In

### 4.13 Footer

Logo + **"Because every child deserves a safe ride home. AI-powered school
transportation for the schools that take safety seriously."**

**Product:** Features · AI Platform · Coverage · Pricing
**Company:** FAQ · Contact · Log In
~~**Legal:** Privacy Policy · Terms of Service~~ **REMOVED from the footer.**

Bottom: © 2026 SafeRide. All rights reserved. · Made for safer school
journeys, everywhere.

~~Social icons currently point to `#`.~~ **All six dead links are removed, not
repointed** (decided 2026-09-06): the four social icons, plus Privacy Policy
and Terms of Service. A link to an empty page is worse than no link.

**Privacy Policy and Terms of Service are LAUNCH-BLOCKING, not nice-to-have.**
SafeRide handles children's biometric data — face recognition attendance — so
these are a legal requirement, and shipping publicly without them is a real
problem. They need real pages with real legal content, which is not a Phase 5
task. Logged in `TODO.md` as required before any public launch.

---

## 5. Motion & UI System

### 5.1 ui-ux-pro-max Skill — Install It First

**Before styling anything, install this skill.**

Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

**Step 1 — Check whether it is already installed.**

Run `/skills` or inspect the available skills list. If `ui-ux-pro-max`
already appears, skip to Step 3.

**Step 2 — If it is not installed, install it.**

Try the plugin marketplace route first:

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max
```

If that fails, clone it manually into the skills directory:

```bash
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git \
  ~/.claude/skills/ui-ux-pro-max
```

On Windows:

```bash
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git \
  "$env:USERPROFILE\.claude\skills\ui-ux-pro-max"
```

Then verify the skill registers — confirm `SKILL.md` exists at the root of
that folder and that the skill appears in `/skills`. If the folder exists
but the skill does not register, the frontmatter in `SKILL.md` is likely
malformed or the folder name does not match the skill name; report this
rather than proceeding without it.

**Step 3 — Read it before writing any UI code.**

Read the skill's `SKILL.md` and any reference files it points to **before**
styling the first button. Do not skim it. The skill contains 50+ styles,
161 palettes, 57 font pairings, and 10 stacks — it is the reference for
component quality and craft.

**Step 4 — Use it correctly.**

Use `ui-ux-pro-max` as the authority for:

- **Button styles** — primary, secondary, ghost, and all their states
- **Hover interactions** — fills, lifts, arrow slides, magnetic effects
- **Micro-interactions** — every interactive element must have considered
  feedback
- **Section transitions** — how one section hands off to the next
- **Card behaviors** — hover lifts, spotlight effects, border reveals
- **Form field states** — focus, error, filled, disabled
- **Loading and empty states**

**Important boundary:** use this skill for **craft and interaction quality**,
not to invent a new visual identity. SafeRide's palette, typography, and
brand direction come from the existing site at
https://safe-ridee.vercel.app/ and the video's visual language. Do not pull
a palette or font pairing from `ui-ux-pro-max` and override the brand with
it. Use the skill to make the *implementation* of the existing brand as
polished as possible.

If the skill cannot be installed for any reason, **stop and report it**
before continuing — do not silently fall back to default styling. The
interaction quality of this build depends on it.

### 5.2 21st.dev MCP

The 21st.dev MCP server is configured. Before building each section, search
21st.dev for current best-in-class patterns for that section type (feature
grids, pricing tables, accordions, testimonial layouts, stats bands).

Use results as **pattern reference**. Do not paste 21st.dev component code
verbatim — build custom in the SafeRide design system. Do not install
shadcn components from 21st.dev URLs without asking first.

### 5.3 Global Motion Rules

- **Scroll reveals:** every content section fades up on entry
  (opacity 0 → 1, translateY 24px → 0, ~0.9s, custom ease)
- **Stagger:** children within a section stagger by 40–80ms
- **Smooth scroll:** Lenis across the whole page, synced to ScrollTrigger
- **Reduced motion:** every animation guarded by `useReducedMotion()`.
  Reduced-motion users get instant, non-animated states — **not** faster
  animations. Assert this with a test.
- **No animation on first paint above the fold** except the video idle loop
  and the hero copy entrance

---

## 6. Stack

- Next.js 15 (App Router) + TypeScript strict mode
- Tailwind CSS v4 with CSS-first design tokens
- shadcn/ui for primitives (Button, Accordion, Dialog, Sheet, Form, Select)
- GSAP + ScrollTrigger (video scrub, scroll animations)
- @studio-freight/lenis (smooth scroll)
- Framer Motion (component-level micro-interactions where GSAP is overkill)
- Lucide React for icons
- React Hook Form + Zod (contact form)
- next/font, next/image
- Deploy: Vercel

```bash
pnpm add gsap @studio-freight/lenis framer-motion lucide-react \
  react-hook-form zod @hookform/resolvers
```

---

## 7. File Structure

```
app/
  layout.tsx                    — fonts, metadata, Lenis provider
  page.tsx                      — composes hero + all sections
  api/contact/route.ts
  globals.css                   — tokens, reset, reduced-motion rules

components/
  hero/
    scrub-video-hero.tsx        — the sticky scroll-scrubbed video
    hero-overlay.tsx            — scroll-timed text/CTA layer
    scroll-indicator.tsx
  layout/
    nav.tsx                     — [SECTION 2 component]
    footer.tsx
    mobile-nav.tsx
  transition/
  sections/
    emotional-journey.tsx
    stats-band.tsx
    platform-features.tsx
    journey-steps.tsx
    intelligence-layer.tsx
    comparison.tsx
    coverage-map.tsx
    testimonials.tsx
    pricing.tsx
    faq.tsx
    contact.tsx
    final-cta.tsx
  ui/                           — shadcn primitives + ui-ux-pro-max buttons
  shared/
    reveal.tsx                  — scroll-reveal wrapper
    section.tsx
    section-header.tsx

lib/
  motion.ts                     — shared GSAP/Framer variants
  lenis.ts                      — smooth scroll setup
  video-scrub.ts                — the scrub binding logic, isolated + testable
  utils.ts
  validations/contact.ts

public/
  video/
    saferide-hero-scrub.mp4     — 1080p, every-frame keyframes
    saferide-hero-scrub.webm
    saferide-hero-mobile.mp4    — 720p, standard encode, for mobile loop
    hero-poster.jpg             — fallback still
  images/
  fonts/
```

---

## 8. Performance Budget

The scrub video is heavy. Everything else must be lean to compensate.

- **LCP target:** under 2.5s. The poster frame is the LCP element — preload
  it, do not let the video block it.
- **Video loading:** `preload="auto"` on desktop only. On mobile use
  `preload="metadata"`. Never block first paint on video.
- **Lighthouse targets:** Performance 85+ (the video makes 90+ unrealistic),
  Accessibility 95+, Best Practices 95+, SEO 95+.
- **No layout shift:** reserve exact dimensions for the video container and
  every image.
- **Code splitting:** GSAP/ScrollTrigger/Lenis load only on the client, in
  the hero component. Do not ship them in the initial server bundle.
- **Lazy load** everything below the fold.

---

## 9. Accessibility

- Semantic HTML throughout (`nav`, `main`, `section`, `article`, `footer`)
- Visible `focus-visible` ring on every interactive element
- The video is decorative — `aria-hidden="true"` on the `<video>` element,
  with the hero's meaning carried entirely by the overlay text
- All hero overlay copy is real DOM text, not baked into the video, so
  screen readers and search engines can read it
- Skip link to main content
- Full keyboard navigation — nav, accordion, form, mobile menu
- WCAG AA contrast minimum on all text, **including overlay text against
  every frame of the video**. Where the video goes light (the white-out at
  clip 4, the flat map at clip 5), overlay text must have a scrim or switch
  to dark ink. Verify at multiple scroll positions.
- `prefers-reduced-motion` fully honored

---

## 10. Build Order

**Phase 0 — Setup**
Install the `ui-ux-pro-max` skill per Section 5.1 and confirm it registers.
Verify the 21st.dev MCP is connected with `/mcp`. Inspect the source video
with `ffprobe` and report its frame rate, resolution, and duration.
→ Pause. Report the video's native frame rate before encoding.

**Phase 1 — Foundation**
Scaffold, tokens, fonts, Lenis provider, shared layout shell.
→ Pause for review.

**Phase 2 — The scrub video hero**
This is the hardest and most important part.

First, encode the video per Section 1.3 — highest possible frame rate,
every-frame keyframes. Run the verification commands and report both the
frame count and the keyframe count. They must match.

Then build `scrub-video-hero.tsx`, the idle loop → scrub handoff, the
ScrollTrigger binding, mobile fallback, reduced-motion fallback, poster
fallback. Get the scroll runway length tuned. Verify smooth scrubbing in
Chrome, Safari, Firefox.
→ Pause for review. Do not proceed until scrubbing is smooth at the target
frame rate.

**Phase 3 — Navbar**
Implement the component from Section 2.
→ Pause.

**Phase 4 — REMOVED with Section 3.**
The post-video transition is struck. Phase numbering after this point is left
as written so earlier notes still resolve; the next phase of work is the
content sections (Section 4).
→ Pause.

**Phase 5 — Content sections**
All sections from Section 4, top to bottom, with ui-ux-pro-max styling and
scroll reveals.
→ Pause.

**Phase 6 — Forms + polish**
Contact form with validation, footer, final CTA.
→ Pause.

**Phase 7 — QA**
Cross-browser, responsive at 375/768/1024/1440/1920, accessibility audit
with axe, Lighthouse on 5 pages, reduced-motion verification, video fallback
verification (throttle the network and confirm the poster shows).

---

## 11. Deliverables

1. Working `pnpm dev` project
2. Production build with no errors or warnings
3. Deployed Vercel preview
4. `TODO.md` listing:
   - Real numbers for the two stats bands (currently `0+`)
   - Real social media URLs or a decision to remove the icons
   - Email service wiring for the contact form
   - Any Arabic translation work deferred to phase 2
5. `README.md` with local dev, env vars, video re-encoding instructions,
   and deployment notes

---

## 12. Non-Negotiables

- **Highest possible frame rate on the scrub video.** 60fps minimum on
  desktop. Never downsample below the source. If file size is a problem,
  solve it with CRF or resolution — never by dropping frames. If you must
  drop below 60fps, stop and ask first.
- **Every-frame keyframes, verified.** Report the frame count and keyframe
  count after encoding. If they don't match, the encode is wrong.
- **`ui-ux-pro-max` must be installed and read** before any UI styling. If
  it can't be installed, stop and report — do not fall back to defaults
  silently.
- **No third-party demo assets ship.** The navbar's indigo/violet/pink ambient
  shapes and its `--color-primary: #6366f1` token block must not appear
  anywhere in the build. (The `cdn.21st.dev` mountain images and the Osmo
  credits block went with Section 3.)
- **One Lenis instance, one ScrollTrigger registration.** Both pasted
  components create their own. Refactor to a single app-root provider before
  wiring either of them, or the scroll will break.
- **No placeholder zeros.** The `0+` stats either get real numbers or the
  sections are removed.
- **No dead links.** Every `href="#"` gets a real destination or the element
  is removed.
- **The video must never block usability.** If it fails to load, stalls, or
  the device can't handle it, the page still works completely.
- **Overlay text is real DOM text.** Never bake copy into the video frames
  as the only source.
- **Reduced motion means no motion**, not less motion.
- **All copy comes from https://safe-ridee.vercel.app/.** Do not rewrite it.

---

*End of spec.*
