"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";
import { useMediaQuery } from "@/lib/use-media-query";
import { CHAPTERS, type Chapter } from "./chapters";
import { LEAN_DEG, MAX_PHONE_PX, PHONE_SIDE_X, readTuning } from "./constants";
import type { TourScene } from "./scene";

/**
 * §2 The Parent App — the 3D phone tour.
 *
 * Three chapters. The phone DESCENDS through the frame, spinning 360 degrees
 * about its own long axis, and alternates sides as it goes — right, left,
 * right. The text takes the opposite side each time, so the two are never in
 * the same half.
 *
 * The horizontal and the vertical come off one scroll value on two curves.
 * On a single curve the phone travels diagonally and crosses the text's band
 * while still moving sideways, which is the collision that made alternation
 * look impossible when the text was pinned to one side. The crossing instead
 * happens entirely inside the fade's dead zone (spec §5.1, §5.2a).
 *
 * ── What this deliberately does NOT do ────────────────────────────────────
 *
 *   below 768px          no three.js, no WebGL context, and the GLB is never
 *                        requested. Stacked list, purpose-cut 540px JPEGs.
 *   reduced motion       the same stacked list. The timeline is not built,
 *                        not built-and-skipped. "Not slower — none."
 *   no WebGL / lost ctx  the same stacked list again, at any width.
 *   hero on screen       the 8.1 MB GLB is not fetched. It competes with the
 *                        53.6 MB scrub file, which takes 109.8s to buffer on
 *                        Regular 4G; concurrent, it lengthens CLAMPED, which
 *                        is the majority experience for this audience.
 *
 * The hero had no IntersectionObserver to reuse and no out-of-view pause, so
 * the gate is created here. That the hero keeps decoding off screen is a
 * separate gap, logged rather than fixed in this pass.
 */

/*
 * Spec §5.2 as amended twice. The scrolled span is RUNWAY - 100vh = 300vh, so
 * each 360-degree transition takes one and a half screen-heights. Rest points
 * at 0, 0.5, 1.
 *
 * 400 rather than 300 because the phone now DESCENDS as well as turning
 * (§5.2a), and at 300vh an ordinary scroll completed a full 360 in under a
 * second: 0.40 deg/px against 0.27 here. 500vh reads better still and spends
 * five screens on three states.
 */
export const TOUR_RUNWAY_VH = 400;

/** Query override, so section pace can be compared without a rebuild. */
export function runwayVh(): number {
  if (typeof location === "undefined") return TOUR_RUNWAY_VH;
  const v = Number(new URLSearchParams(location.search).get("runway"));
  return Number.isFinite(v) && v >= 200 ? v : TOUR_RUNWAY_VH;
}

const MOBILE_BREAKPOINT = 768;

/* ---------- the stacked fallback ------------------------------------- */

function StackedChapter({ c }: { c: Chapter }) {
  return (
    <li className="grid gap-8 border-t border-border pt-10 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-10">
      <Image
        src={c.mobile}
        alt=""
        aria-hidden="true"
        width={540}
        height={1157}
        sizes="(max-width: 640px) 60vw, 220px"
        className="h-auto w-[60%] max-w-[220px] rounded-[1.6rem] sm:w-full"
      />
      <div>
        <h3 className="text-2xl">{c.heading}</h3>
        <p className="mt-3 max-w-[52ch] leading-relaxed text-muted-foreground">{c.body}</p>
        <ul className="mt-5 space-y-2">
          {c.bullets.map((b) => (
            <li key={b} className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
              {b}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Stacked() {
  return (
    <ul className="mt-14 space-y-12">
      {CHAPTERS.map((c) => (
        <StackedChapter key={c.id} c={c} />
      ))}
    </ul>
  );
}

/* ---------- the scene text, crossfaded -------------------------------- */

function ChapterText({ c, active }: { c: Chapter; active: boolean }) {
  return (
    <div
      /*
       * inert AND aria-hidden, not opacity alone. Opacity-0 text is still
       * focusable, still selectable and still read aloud — the hero shipped
       * invisible-but-clickable CTAs for exactly this reason. During a
       * crossfade both chapters are in the tree at once, so the outgoing one
       * has to leave it properly.
       */
      inert={!active}
      aria-hidden={!active}
      data-chapter={c.id}
      data-active={active}
      data-side={c.side}
      /*
       * Opacity is set per frame from scroll, not by a CSS transition. Tying
       * the fade to scroll rather than to a timer is what puts the text at
       * zero exactly while the phone crosses, which is also exactly when the
       * texture swaps.
       *
       * CONTENT HEIGHT, not `inset-y-0`. A full-height block's rect is the
       * whole viewport, which makes any vertical-band test trivially true and
       * any overlap test purely horizontal — a guard written against it would
       * have failed on a correct build.
       *
       * WIDTH shrinks with the viewport. 46ch is 478px; the phone's bbox is
       * ~262px centred at 0.75W, so a fixed 46ch column overlaps the phone
       * below about 873px of viewport width — 79px of overlap at 768px, on a
       * correct build. That is a layout constraint, not a defect, and it is
       * fixed here rather than papered over by narrowing the guard.
       */
      className="absolute top-1/2 flex w-[min(46ch,38vw)] -translate-y-1/2 flex-col will-change-[opacity]"
      style={{
        opacity: active ? 1 : 0,
        /* The text takes the side OPPOSITE the phone (§5.1). */
        [c.side === "right" ? "left" : "right"]: "max(24px, 6vw)",
      } as React.CSSProperties}
    >
      <h3 className="text-3xl sm:text-4xl">{c.heading}</h3>
      <p className="mt-4 leading-relaxed text-muted-foreground">{c.body}</p>
      <ul className="mt-6 space-y-2.5">
        {c.bullets.map((b) => (
          <li key={b} className="text-sm leading-relaxed text-muted-foreground">
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- the section ----------------------------------------------- */

export function PhoneTour() {
  const runwayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TourScene | null>(null);
  const [chapter, setChapter] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);


  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  const stacked = reduced || narrow || fallback;

  useEffect(() => {
    if (reduced || narrow) return;
    const canvas = canvasRef.current;
    const runway = runwayRef.current;
    if (!canvas || !runway) return;

    /*
     * The runway override is a DOM WRITE, not state. Reading location during
     * render would break hydration (the server has no query string), and
     * setState in an effect is the cascading-render pattern this project
     * rules out. Only the lab path touches it; the default is the JSX value.
     */
    const vh = runwayVh();
    if (runway && vh !== TOUR_RUNWAY_VH) runway.style.height = `${vh}vh`;

    let cancelled = false;
    let tickerFn: ((t: number) => void) | null = null;
    let io: IntersectionObserver | null = null;

    const onLost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    async function start() {
      /* Marks only. When the gate opened, so the diagnosis can separate
         "the loader is slow" from "the loader was not allowed to begin". */
      (window as unknown as { __tourGateAt?: number }).__tourGateAt = +performance.now().toFixed(1);
      /*
       * Re-read matchMedia here, do not trust the closed-over value.
       * useSyncExternalStore hands back the SERVER snapshot on the first
       * commit, so `reduced` and `narrow` are both false on the render that
       * set this effect up. A mobile visitor deep-linking past the hero would
       * otherwise fetch 8.1 MB before the correction arrived. "Brief isn't
       * none" is the standard this project settled on.
       */
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches) return;
      try {
        const { createScene } = await import("./scene");
        if (cancelled) return;
        const scene = await createScene(
          canvas!,
          CHAPTERS.map((c) => c.screen),
          { keepTransmission: new URLSearchParams(location.search).has("keepTransmission") },
        );
        if (cancelled) { scene.dispose(); return; }
        sceneRef.current = scene;
        setReady(true);

        const tuning = readTuning();

        const blocks = () => Array.from(
          runway!.querySelectorAll<HTMLElement>("[data-chapter]"),
        );

        tickerFn = () => {
          const r = runway!.getBoundingClientRect();
          const span = r.height - window.innerHeight;
          const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
          scene.setProgress(p);

          /*
           * The text's own curve. `t` counts half-turns, so it is a whole
           * number at every rest point and half-way between during a
           * transition. Full strength at rest, nothing at all across the
           * middle band where the phone crosses — and the dead zone is what
           * keeps the phone from ever passing over readable text.
           */
          const t = p * (CHAPTERS.length - 1);
          const swing = Math.abs(Math.sin(Math.PI * t));
          /* FADE_KNEE is owned by scene.ts, which derives the crossing window
             from it. Typing 2.2 here again is how the two drift apart. */
          const vis = Math.max(0, 1 - swing * tuning.knee);
          for (const el of blocks()) {
            el.style.opacity = el.dataset.active === "true" ? String(vis) : "0";
          }
          /* Chapter flips at the half-turn, where the back faces the camera,
             so the text change and the texture swap land together. setState
             fires twice per section, not per frame. */
          const next = Math.max(0, Math.min(CHAPTERS.length - 1, Math.round(p * (CHAPTERS.length - 1))));
          setChapter((cur) => (cur === next ? cur : next));
        };
        /* Spec §6.5: join the existing ticker, which already drives Lenis. A
           third independent rAF loop would make the frame-timing numbers
           measure contention we created. */
        gsap.ticker.add(tickerFn);
        window.addEventListener("resize", scene.resize);
        (window as unknown as { __phoneTour?: unknown }).__phoneTour = scene;
      } catch (err) {
        /*
         * Say what went wrong. A bare `catch {}` here cost a diagnostic cycle:
         * the scene failed, the fallback did not appear, and there was nothing
         * anywhere to say why. A fallback that hides its own cause is not a
         * fallback, it is a silence.
         */
        console.error("[phone tour] scene failed, falling back to the stacked list:", err);
        if (!cancelled) setFallback(true);
      }
    }

    /*
     * The gate. Nothing is imported and nothing is fetched until the hero is
     * fully out of view.
     */
    const hero = document.querySelector('section[aria-labelledby="hero-headline"]');
    if (!hero) {
      void start();
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => !e.isIntersecting)) {
            io?.disconnect();
            io = null;
            void start();
          }
        },
        { threshold: 0 },
      );
      io.observe(hero);
    }

    return () => {
      cancelled = true;
      io?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      if (tickerFn) gsap.ticker.remove(tickerFn);
      if (sceneRef.current) {
        window.removeEventListener("resize", sceneRef.current.resize);
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      delete (window as unknown as { __phoneTour?: unknown }).__phoneTour;
    };
  }, [reduced, narrow]);

  return (
    <section
      id="parent-app"
      aria-labelledby="parent-app-heading"
      data-mode={stacked ? "stacked" : "scene"}
      /* No ground of its own: it sits on the page layer (§4a). The canvas
         is alpha: true, so the lattice shows through behind the phone. */
      className="relative isolate text-foreground"
    >
      <div className="mx-auto max-w-6xl px-6 pt-[clamp(72px,9vw,136px)]">
        <p className="label-mono text-muted-foreground">The parent app</p>
        <h2 id="parent-app-heading" className="mt-4 max-w-[18ch] text-4xl sm:text-5xl">
          What a parent actually sees
        </h2>
        <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
          Three screens, every school morning.
        </p>
        {stacked ? <Stacked /> : null}
      </div>

      {stacked ? (
        <div className="h-[clamp(72px,9vw,136px)]" />
      ) : (
        <div
          ref={runwayRef}
          /*
           * data-tour-runway is how the harnesses find this, NOT its inline
           * height. Both of them used `[style*="300vh"]` with a silent
           * fallback to the section, so bumping the runway to 400 would have
           * left them measuring a different element and printing plausible
           * numbers about it. Spec §5.2.
           */
          data-tour-runway=""
          style={{ height: `${TOUR_RUNWAY_VH}vh` }}
          className="relative mt-16"
        >
          <div className="sticky top-0 h-svh overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
            {/*
              The section must never be an empty rectangle while 1.4 MB of
              model and texture arrives. There is no layout shift to fix —
              the canvas is absolute inside a fixed-height pin, so the space
              was always reserved — the problem is that the reserved space
              showed nothing.

              The 540px mobile JPEG at 63 KB, not the 1080px desktop texture.
              Fetching an 856 KB image to cover a slow fetch would compete
              with the thing it is covering for. It is already on the wire for
              the stacked fallback, so on most visits it costs nothing new.

              Placed and sized from the same numbers the scene uses: chapter 1
              sits on the right at PHONE_SIDE_X of the width, REST_FRACTION of
              the height, leaning LEAN_DEG. Typing those again here is how the
              placeholder and the phone drift apart.
            */}
            {!ready ? (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <Image
                  src={CHAPTERS[0].mobile}
                  alt=""
                  width={540}
                  height={1157}
                  priority
                  className="absolute top-1/2 h-auto -translate-x-1/2 -translate-y-1/2 rounded-[1.6rem] opacity-40"
                  style={{
                    left: `${50 + PHONE_SIDE_X * 100}%`,
                    height: `min(${readTuning().restFraction * 100}svh, ${MAX_PHONE_PX}px)`,
                    width: "auto",
                    transform: `translate(-50%, -50%) rotate(${-LEAN_DEG}deg)`,
                  }}
                />
              </div>
            ) : null}
            <div className="relative mx-auto h-full max-w-6xl px-6">
              {CHAPTERS.map((c, i) => (
                <ChapterText key={c.id} c={c} active={i === chapter} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
