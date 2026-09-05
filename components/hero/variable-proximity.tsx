"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Per-letter weight response to cursor proximity, for the hero headline.
 *
 * Adapted from React Bits' VariableProximity (JS-CSS). Three things from the
 * reference are deliberately NOT carried over:
 *
 *   - `motion/react`. The reference imports framer-motion and renders
 *     `motion.span`, but passes it no animation props at all. It is a
 *     dependency doing nothing; plain spans render identically.
 *   - The Roboto Flex @import. We ship Fraunces, self-hosted by next/font.
 *   - Its rAF loop and window listeners, which are attached unconditionally.
 *     See the reduced-motion note below.
 *
 * AXES, measured rather than assumed (see build/ probe in the report):
 *   wght  live 100..900, clamps at 900. 800 -> 900 moves the headline's
 *         advance width by 1.4%.
 *   opsz  live 9..144, clamps at 144. HELD at 144 and never animated: across
 *         its range it moves advance width by 22%, so animating it would
 *         reflow the headline under the cursor. This is the reason to hold
 *         it, not taste.
 *   SOFT / WONK  not in the build. layout.tsx requests `axes: ["opsz"]`, and
 *         the width probe finds no response on either.
 *
 * The rest state is wght 800 — the headline's existing, approved weight — so
 * the static headline is unchanged by mounting this.
 */

const REST_WGHT = 800;
const NEAR_WGHT = 900;
const OPSZ = 144;

const settings = (wght: number) => `"opsz" ${OPSZ}, "wght" ${wght}`;

/** A media query is an external system; subscribing is the right primitive. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    () => false,
  );
}

export type VariableProximityProps = {
  /** The full sentence. This is what a screen reader announces. */
  text: string;
  /** Pixels. Beyond this a letter sits at its rest weight. */
  radius?: number;
  className?: string;
  id?: string;
};

export function VariableProximity({
  text, radius = 130, className, id,
}: VariableProximityProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  /** Letter centres, cached. Recomputed on resize/scroll, not per frame. */
  const centresRef = useRef<{ x: number; y: number }[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(true);
  /** Last weight written per letter. Most letters sit at rest and stay there;
   *  rewriting all of them on every pointer move is style invalidation for
   *  nothing, and it showed up in the scrub frame timing. */
  const lastWeightRef = useRef<number[]>([]);

  const measure = useCallback(() => {
    centresRef.current = letterRefs.current.map((el) => {
      if (!el) return { x: -1e6, y: -1e6 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }, []);

  useEffect(() => {
    // EVERYTHING is inside this guard. Under reduced motion no listener is
    // registered and no animation frame is ever requested — the reference
    // attaches both unconditionally and only skips the work.
    //
    // The media query is re-read HERE rather than trusted from `reduced`.
    // useSyncExternalStore returns the server snapshot (false) on the first
    // commit so hydration matches, so on a reduced-motion machine this effect
    // runs once with `reduced` still false. Measured: that attached four
    // listeners and then removed them a tick later. Brief is not "none".
    if (reduced) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let lastX = NaN, lastY = NaN;

    const onPointer = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => { pointerRef.current = null; };
    const invalidate = () => { dirtyRef.current = true; };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const p = pointerRef.current;
      // The reference calls getBoundingClientRect on every letter every frame.
      // At 44 letters that is 44 forced layouts per frame, on top of a video
      // seek. Centres are cached and only re-measured when something that can
      // move them fires.
      if (dirtyRef.current) { measure(); dirtyRef.current = false; }
      if (!p) {
        if (Number.isNaN(lastX)) return;
        lastX = NaN; lastY = NaN;
        for (let i = 0; i < letterRefs.current.length; i++) {
          const el = letterRefs.current[i];
          if (el && lastWeightRef.current[i] !== REST_WGHT) {
            el.style.fontVariationSettings = settings(REST_WGHT);
            lastWeightRef.current[i] = REST_WGHT;
          }
        }
        return;
      }
      if (p.x === lastX && p.y === lastY) return;
      lastX = p.x; lastY = p.y;

      const centres = centresRef.current;
      for (let i = 0; i < letterRefs.current.length; i++) {
        const el = letterRefs.current[i];
        const c = centres[i];
        if (!el || !c) continue;
        const dx = p.x - c.x, dy = p.y - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        // Gaussian: no hard ring at the radius edge, which linear falloff
        // gives away as a visible circle sweeping the text.
        const t = d >= radius ? 0 : Math.exp(-((d / (radius / 2)) ** 2) / 2);
        const w = Math.round(REST_WGHT + (NEAR_WGHT - REST_WGHT) * t);
        if (lastWeightRef.current[i] === w) continue;
        lastWeightRef.current[i] = w;
        el.style.fontVariationSettings = settings(w);
      }
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    window.addEventListener("scroll", invalidate, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate);
      cancelAnimationFrame(raf);
    };
  }, [reduced, radius, measure]);

  // Under reduced motion the headline is plain text. Not "the effect at zero"
  // — no split, no spans, nothing to go wrong.
  if (reduced) {
    return <span id={id} className={className}>{text}</span>;
  }

  let n = -1;
  const words = text.split(" ");
  return (
    <span id={id} className={className} ref={rootRef}>
      {/* The accessible name, as one sentence. `user-select: none` so a reader
          selecting the headline copies it ONCE — the reference leaves this
          selectable, so selecting its text yields the sentence twice. */}
      <span className="sr-only" style={{ userSelect: "none" }}>{text}</span>
      {words.map((word, wi) => (
        <span key={wi} aria-hidden="true">
          {/* NOT inline-block. The reference uses it because it originally
              animated transforms; font-variation-settings needs no such thing,
              and inline-block swallowed every inter-word space — selecting the
              headline copied "Becauseeverychild...". `nowrap` still prevents a
              line break landing between two letters of one word. */}
          <span style={{ whiteSpace: "nowrap" }}>
            {[...word].map((ch) => {
              const i = ++n;
              return (
                <span
                  key={i}
                  ref={(el) => { letterRefs.current[i] = el; }}
                  style={{ fontVariationSettings: settings(REST_WGHT) }}
                >
                  {ch}
                </span>
              );
            })}
          </span>
          {wi < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
