"use client";

import { useEffect, useRef } from "react";

/**
 * The load screen.
 *
 * It waits for ONE thing: the hero's first frame decoded and playing. Nothing
 * else blocks it — not the model, not the textures, not the environment.
 *
 * That restraint is the whole design. The hero film is 10.77 MB and the phone
 * tour's model plus textures is about 9 MB; at this project's own measured
 * figure for Regular 4G, 0.49 MB/s, waiting for all of it would be roughly
 * forty seconds of held page. A forty-second load screen on a Cairo mobile
 * connection is far worse than a phone that appears two seconds late.
 *
 * ── It must never outstay the thing it covers ─────────────────────────────
 *
 * If the hero has not become playable within HERO_TIMEOUT_MS the screen drops
 * anyway and the poster shows through. A load screen that persists past its
 * subject is the failure mode it exists to prevent, so the timeout is not a
 * safety net — it is the main path on a slow connection.
 *
 * ── Minimal on purpose ────────────────────────────────────────────────────
 *
 * The wordmark on the paper ground. No spinner, no percentage, no "Loading".
 * It should read as the page settling rather than as software working, and a
 * progress indicator would invite the visitor to watch it.
 *
 * Reduced motion gets no fade — it is removed outright rather than
 * transitioned, since a cross-fade is motion like any other.
 */

/** Long enough for a decode on a fast connection, short enough that a slow
 *  one is not held staring at a wordmark. */
export const HERO_TIMEOUT_MS = 2500;

/** Set on <html> by the hero once its film is genuinely playing. The tour
 *  reads the same flag to know when it may start its own work. */
export const HERO_PLAYING_ATTR = "data-hero-playing";

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
    let timer = 0;

    /* Reduced motion gets no fade: a cross-fade is motion like any other. */
    const remove = () => { el.remove(); };
    const lift = () => {
      if (timer) window.clearTimeout(timer);
      if (reduced) { remove(); return; }
      /* Two frames, so the hero has actually painted underneath before the
         cover comes off — otherwise the screen lifts onto a blank frame. */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = "0";
        window.setTimeout(remove, 280);
      }));
    };

    if (document.documentElement.hasAttribute(HERO_PLAYING_ATTR)) { lift(); return; }

    const obs = new MutationObserver(() => {
      if (document.documentElement.hasAttribute(HERO_PLAYING_ATTR)) { obs.disconnect(); lift(); }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [HERO_PLAYING_ATTR] });
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
      Math.max(0, HERO_TIMEOUT_MS - elapsed),
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
