"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";
import { useMediaQuery } from "@/lib/use-media-query";
import { CHAPTERS, type Chapter } from "./chapters";
import type { TourScene } from "./scene";

/**
 * §2 The Parent App — the 3D phone tour.
 *
 * Three chapters. The text holds the left side and does not move; the phone
 * holds the right and DESCENDS through the frame, spinning 360 degrees about
 * its own long axis as it goes. Two transitions, 2 x 360 degrees, mapped
 * linearly across the section's runway. Driven by scroll position alone —
 * stop mid-scroll and the phone sits mid-turn, mid-descent.
 *
 * The alternation this used to have was not dropped for taste: with the text
 * pinned to one side, a phone that alternates lands on top of it at chapter 2
 * (spec §5.1).
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
      /*
       * Opacity is set per frame from scroll, not by a CSS transition, and
       * there is no transform at all any more (§5.5a).
       *
       * Tying the fade to scroll rather than to a timer is what puts the text
       * at zero exactly when the phone is centre-stage, which is also exactly
       * when the texture swaps. A timed fade left the outgoing text at full
       * opacity while the phone arrived on top of it.
       *
       * LEFT for all three chapters. The block does not move; the phone
       * descends past it on the right.
       */
      className="absolute inset-y-0 left-[max(24px,6vw)] flex max-w-[46ch] flex-col justify-center will-change-[opacity]"
      style={{ opacity: active ? 1 : 0 }}
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

  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  const stacked = reduced || narrow || fallback;

  useEffect(() => {
    if (reduced || narrow) return;
    const canvas = canvasRef.current;
    const runway = runwayRef.current;
    if (!canvas || !runway) return;

    let cancelled = false;
    let tickerFn: ((t: number) => void) | null = null;
    let io: IntersectionObserver | null = null;

    const onLost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    async function start() {
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
          const vis = Math.max(0, 1 - swing * 2.2);
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
