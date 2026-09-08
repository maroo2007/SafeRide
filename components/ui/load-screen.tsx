"use client";

import { useEffect, useRef } from "react";
import { MOBILE_BREAKPOINT } from "@/components/sections/phone-tour/constants";

/**
 * The load screen.
 *
 * It waits for the page to be genuinely finished, and what "finished" means
 * depends on what the page is going to build.
 *
 * ── Desktop: hold until the tour scene has nothing left to block on ───────
 *
 * The hero's first frame is not the expensive thing. The tour is: an 8 MB
 * GLB, three 1080x2314 textures, shader compilation and a PMREM prefilter
 * that costs 2.0-2.6s on an AMD Vega 8 and cannot be made cheaper — sigma,
 * source resolution, shader precompilation and context warm-up were each
 * measured and each rejected. Deferring it past the first frame converted a
 * block into a later block; it did not remove one.
 *
 * So on desktop the screen holds for both: the hero playing AND the scene
 * settled. The hero plays behind it — the film does not need the cover gone
 * to run — and every remaining cost is paid where nobody is looking at a
 * moving thing. After the lift, nothing is left to hitch on.
 *
 * ── Mobile: the hero, and only the hero ───────────────────────────────────
 *
 * Below 768px none of that work happens at all: no WebGL context, and the
 * GLB is never requested. Waiting for a scene that will never be built would
 * be a load screen waiting for nothing. Reduced motion is the same case for
 * the same reason.
 *
 * ── It must never outstay the thing it covers ─────────────────────────────
 *
 * Both paths are capped, and the cap is the main path on a slow connection
 * rather than a safety net. At this project's own measured Regular 4G figure
 * of 0.49 MB/s the hero film alone is 22 seconds; a load screen that waits
 * for it is far worse than a poster that appears late. Past the cap the
 * screen drops and the placeholder covers the tour.
 *
 * ── Minimal on purpose ────────────────────────────────────────────────────
 *
 * The wordmark on the paper ground. No spinner, no percentage, no "Loading".
 * It should read as the page settling rather than as software working, and a
 * progress indicator would invite the visitor to watch it — which matters
 * more now that the desktop hold is measured in seconds, not tenths.
 *
 * Reduced motion gets no fade — it is removed outright rather than
 * transitioned, since a cross-fade is motion like any other.
 */

/** Mobile and reduced motion: long enough for a decode on a fast connection,
 *  short enough that a slow one is not held staring at a wordmark. */
export const HERO_TIMEOUT_MS = 2500;

/**
 * Desktop, where the screen also waits for the tour scene.
 *
 * 8000 because the thing being waited for is measured in seconds and varies
 * with the GPU: model parse, texture upload, shader compile and PMREM came
 * to about 2.3s on the reference machine and there is no reason to think
 * that is anyone's worst case. Past this the placeholder covers the tour,
 * which is what it is for.
 */
export const SCENE_TIMEOUT_MS = 8000;

/** Set on <html> by the hero once its film is genuinely playing. The tour
 *  reads the same flag to know when it may start its own work. */
export const HERO_PLAYING_ATTR = "data-hero-playing";

/**
 * Set on <html> by the tour when its scene has settled — OR when it has
 * decided it is not building one (no WebGL, a load failure, a width that
 * gets the stacked list). "Ready or not coming" rather than "ready", because
 * a screen that waits for a signal a failed scene never sends is a screen
 * that sits there for the full timeout every time WebGL is unavailable.
 */
export const TOUR_READY_ATTR = "data-tour-ready";

export function LoadScreen() {
  const ref = useRef<HTMLDivElement>(null);

  /*
   * The overlay is removed by a DOM WRITE, not by state.
   *
   * setState in an effect is the cascading-render pattern this project rules
   * out, and it would also mean the server renders one tree and the client
   * immediately renders another. The element is always in the markup — which
   * is what makes it cover the page before any JavaScript runs — and the
   * effect only takes it away.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
    /*
     * Read here, not from useMediaQuery. useSyncExternalStore hands back the
     * SERVER snapshot on the first commit, so a hook value would say "wide,
     * full motion" on the render that set this effect up — and a mobile
     * visitor would be held waiting for a scene their device never builds.
     * The tour's own gate re-reads matchMedia for exactly this reason.
     */
    const waitsForTour = !reduced && !narrow;
    const budget = waitsForTour ? SCENE_TIMEOUT_MS : HERO_TIMEOUT_MS;
    let timer = 0;

    /* Reduced motion gets no fade: a cross-fade is motion like any other. */
    const remove = () => { el.remove(); };
    const lift = () => {
      if (timer) window.clearTimeout(timer);
      if (reduced) { remove(); return; }
      /* Two frames, so what is underneath has actually painted before the
         cover comes off — otherwise the screen lifts onto a blank frame. */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = "0";
        window.setTimeout(remove, 280);
      }));
    };

    const root = document.documentElement;
    const done = () =>
      root.hasAttribute(HERO_PLAYING_ATTR) &&
      (!waitsForTour || root.hasAttribute(TOUR_READY_ATTR));

    if (done()) { lift(); return; }

    const obs = new MutationObserver(() => { if (done()) { obs.disconnect(); lift(); } });
    obs.observe(root, { attributes: true, attributeFilter: [HERO_PLAYING_ATTR, TOUR_READY_ATTR] });
    /*
     * The deadline is measured from NAVIGATION, not from this effect.
     *
     * Measured: with autoplay refused the screen persisted 6004ms against a
     * 2500ms timeout, because the effect does not run until hydration
     * finishes and the timer only started there. A load screen whose deadline
     * begins after the page is already interactive is not a deadline.
     */
    const elapsed = performance.now();
    timer = window.setTimeout(
      () => { obs.disconnect(); lift(); },
      Math.max(0, budget - elapsed),
    );

    return () => { obs.disconnect(); if (timer) window.clearTimeout(timer); };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-load-screen=""
      className="pointer-events-none fixed inset-0 z-[200] grid place-items-center bg-background"
      style={{ transition: "opacity 260ms linear" }}
    >
      <span
        style={{
          font: "600 26px var(--font-fraunces), Georgia, serif",
          letterSpacing: "-0.01em",
          color: "var(--foreground)",
        }}
      >
        SafeRide
      </span>
    </div>
  );
}
