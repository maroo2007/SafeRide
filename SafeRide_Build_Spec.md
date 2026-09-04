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
menu by design — there is no separate hamburger implementation needed.

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

**E. Add the logo.** `.nav-logo-row` is currently an empty anchor. Put the
SafeRide logo in it, linked to `#top`.

**F. Add the right-side utilities.** The header needs, alongside the Menu
button:
- A language toggle (EN / العربية) — the site is bilingual
- A "Log In" link → `https://safe-ridee.vercel.app/login`

Both must survive the menu-open state or animate out with it — decide which
and be consistent.

### 2.3 Integration With the Scrub Video

This is the part the component does not handle out of the box.

**Z-index:** the header must sit above the sticky video hero. The full-screen
menu overlay must sit above everything including the header.

**Legibility over the video.** The video passes through radically different
frames — dark studio, solid orange, pure white-out, flat map, dark ink
wordmark. A fixed-color header will become invisible at several points.
Implement one of these, and verify at multiple scroll positions:

- **Preferred:** a scroll-progress-aware color inversion. Sample the video's
  approximate brightness at known progress ranges (they're predictable from
  the clip breakdown in Section 1.2) and switch the header between light and
  dark text accordingly, with a smooth transition.
- **Simpler fallback:** a persistent `backdrop-filter: blur()` surface behind
  the header with a subtle scrim, so the text always has contrast regardless
  of the frame behind it.

Do not ship a header that becomes unreadable during the white-out at clip 4.

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

## 3. Post-Video Transition

A layered parallax scroll sequence that bridges from the cinematic video into
the conventional content sections. Four image layers move at different speeds
as the user scrolls, with a title layer between them.

**Placement:** fires immediately after the scrub video hero completes — when
scroll progress reaches 1.0 and the sticky pin releases — and before the
Emotional Journey Strip (Section 4.1).

**Purpose:** the video ends on a resolved SafeRide wordmark against dark ink.
Cutting straight from that into a features grid would feel like the film just
stopped. This parallax sequence is the deliberate handoff — it carries the
momentum down and lands the user in the content.

### 3.1 Component Source

Copy this component to `/components/ui/parallax-scrolling.tsx`.

```tsx
// components/ui/parallax-scrolling.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from '@studio-freight/lenis';

export function ParallaxComponent() {
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const triggerElement = parallaxRef.current?.querySelector('[data-parallax-layers]');

    if (triggerElement) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerElement,
          start: "0% 0%",
          end: "100% 0%",
          scrub: 0
        }
      });

      const layers = [
        { layer: "1", yPercent: 70 },
        { layer: "2", yPercent: 55 },
        { layer: "3", yPercent: 40 },
        { layer: "4", yPercent: 10 }
      ];

      layers.forEach((layerObj, idx) => {
        tl.to(
          triggerElement.querySelectorAll(`[data-parallax-layer="${layerObj.layer}"]`),
          {
            yPercent: layerObj.yPercent,
            ease: "none"
          },
          idx === 0 ? undefined : "<"
        );
      });
    }

    const lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    return () => {
      ScrollTrigger.getAll().forEach(st => st.kill());
      gsap.killTweensOf(triggerElement);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="parallax" ref={parallaxRef}>
      <section className="parallax__header">
        <div className="parallax__visuals">
          <div className="parallax__black-line-overflow"></div>
          <div data-parallax-layers className="parallax__layers">
            <img src="/images/parallax/layer-1.webp" loading="eager" width="800" data-parallax-layer="1" alt="" className="parallax__layer-img" />
            <img src="/images/parallax/layer-2.webp" loading="eager" width="800" data-parallax-layer="2" alt="" className="parallax__layer-img" />
            <div data-parallax-layer="3" className="parallax__layer-title">
              <h2 className="parallax__title">Every step, accounted for</h2>
            </div>
            <img src="/images/parallax/layer-4.webp" loading="eager" width="800" data-parallax-layer="4" alt="" className="parallax__layer-img" />
          </div>
          <div className="parallax__fade"></div>
        </div>
      </section>
    </div>
  );
}
```

**Install:**

```bash
pnpm add gsap @studio-freight/lenis
```

Both are already required by the scrub video hero (Section 1.4), so this adds
no new dependencies.

### 3.2 Critical Adaptations

**A. The demo images must be replaced. This is not optional.**

The component as published on 21st.dev points at three images hosted on
`cdn.21st.dev` (an Osmo demo asset — a mountain scene). **Those are not
SafeRide's assets and must not ship on a commercial site.** The code above
already has the `src` paths swapped to local files. Generate or source three
owned layer images and place them at:

```
public/images/parallax/layer-1.webp   (back layer, moves most — yPercent: 70)
public/images/parallax/layer-2.webp   (mid layer — yPercent: 55)
public/images/parallax/layer-4.webp   (front layer, moves least — yPercent: 10)
```

Layer 3 is the title text, not an image.

**Art direction for the three layers:** they must continue the video's visual
language, not introduce a new one. The video ends on the SafeRide wordmark
against dark ink. These layers should carry that forward and resolve toward
the light content sections below. Suggested composition:

- **Layer 1 (back):** distant Cairo skyline or the glowing route network from
  clip 5/6, heavily atmospheric, low contrast
- **Layer 2 (mid):** mid-ground elements — buildings, route lines, or the
  branch roads
- **Layer 4 (front):** a foreground element that frames the composition — road
  surface, a bus silhouette edge, or foliage

Match the video's palette exactly. If assets need generating, flag it in
`TODO.md` and use a solid-color placeholder in the meantime rather than
shipping the Osmo mountains.

**B. Remove the Osmo attribution block.** The demo file includes an
`osmo-credits` div and an Osmo logo SVG in `parallax__content`. Both are demo
artifacts. The code above already omits them. Do not add them back.

**C. Replace the title.** The demo says "Parallax". The code above uses
"Every step, accounted for", which is the heading of the section this
transition leads into (Section 4.4). Use that, or another line from the
existing site copy — do not invent new copy.

### 3.3 Integration Requirements

**Do not double-instantiate Lenis.** The component creates its own Lenis
instance in its `useEffect`. The scrub video hero also needs Lenis. **Two
instances will fight each other and produce broken scrolling.**

Refactor: create a single Lenis instance in a provider at the app root
(`lib/lenis.ts` + a client provider in `app/layout.tsx`), and have both the
scrub hero and this parallax component consume it via context rather than
instantiating their own. Strip the Lenis creation and teardown out of this
component's `useEffect` — keep only the ScrollTrigger timeline.

**Do not double-register ScrollTrigger.** Register the plugin once, centrally.

**Hand off from the video's final frame.** The video ends on dark ink. Layer 1
of the parallax should start visually close to that state so the join is
invisible, then the sequence resolves lighter as it scrolls toward the content
sections.

**No layout shift.** Reserve exact dimensions on `.parallax__layers` and every
`<img>`. The `loading="eager"` on all three layers is correct here — they are
immediately below the fold and must be ready when the video releases.

**Consider `next/image`.** The raw `<img>` tags work, but the rest of the
project uses `next/image`. Convert them for consistency and automatic
optimization, keeping `priority` on all three.

### 3.4 Reduced Motion

`prefers-reduced-motion: reduce` must disable the parallax entirely. Do not
slow it down — remove it. Render the three layers as a single static composed
image with the title on top, no scroll-linked movement, no ScrollTrigger
timeline created at all.

Guard the `useEffect` with a `matchMedia` check so the timeline is never built
for these users.

### 3.5 Mobile

Multi-layer parallax is expensive on mobile GPUs and the effect largely
collapses on a narrow viewport.

Below 768px: render the composition **static**. Show layer 4 (or a purpose-cut
mobile composite) as a single image with the title. No parallax timeline.

### 3.6 Performance

Three eagerly-loaded images arriving right after a large video is a real risk.

- Serve the layers as WebP, and provide AVIF where supported
- Keep each layer under 300 KB
- Total for the three layers: under 800 KB
- Preload them during the video scrub so they are ready before the pin
  releases — the user should never see them pop in

---

## 4. Content Sections (After the Video)

All copy below is taken verbatim from https://safe-ridee.vercel.app/.
Do not rewrite it. Fetch that site if any detail is unclear.

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

### 4.2 Stats Band

Four stats. **The current site shows `0+` on every one of these — that must
be fixed.** Either populate with real numbers or remove the section
entirely. Do not ship placeholder zeros.

- Partner Schools
- Protected Students
- Smart Buses
- Journey Safety (%)

Flag this in `TODO.md` for the user to supply real figures.

### 4.3 Platform — "Everything a safe journey needs"

**Section eyebrow:** Platform
**Heading:** Everything a safe journey needs
**Subhead:** Ten systems working together so nothing about a child's commute
is left to chance.

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

Three stats — **again currently showing `0+`, must be fixed or removed:**
- Smart Buses
- Students Protected
- System Uptime (%)

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
**Legal:** Privacy Policy · Terms of Service

Bottom: © 2026 SafeRide. All rights reserved. · Made for safer school
journeys, everywhere.

Social icons currently point to `#` — either wire them to real profiles or
remove them. Do not ship dead links. Flag in `TODO.md`.

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
    post-video-transition.tsx   — [SECTION 3 component]
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

**Phase 4 — Post-video transition**
Implement the component from Section 3.
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
- **No third-party demo assets ship.** The parallax component's original
  `cdn.21st.dev` mountain images and the Osmo credits block must not appear
  anywhere in the build. Same for the navbar's indigo/violet/pink ambient
  shapes and its `--color-primary: #6366f1` token block.
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
