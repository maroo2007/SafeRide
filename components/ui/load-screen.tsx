"use client";

import { useEffect, useRef } from "react";
import { MOBILE_BREAKPOINT } from "@/components/sections/phone-tour/constants";

/**
 * The loader — build spec §4.
 *
 * Three phases: a honeycomb spinner on a dark ground, the honeycomb becoming
 * a hole, and the hole opening until it has swallowed the screen.
 *
 * ── ONE GEOMETRY, SO THERE IS NO HANDOFF ──────────────────────────────────
 *
 * §4.3 asks for the spinner as seven DOM divs and the reveal as a separate
 * SVG mask path, with the swap between them pixel-aligned and verified by
 * diffing the frames either side. That is a real risk and this build removes
 * it instead of managing it: there is ONE set of seven hexagons, in one SVG
 * mask, from the first paint to the last frame. Nothing is ever swapped, so
 * nothing can be misaligned.
 *
 * What changes between the phases is not the geometry, it is what is behind
 * the holes:
 *
 *   phase 1   a white plate sits behind the masked cover, so the holes read
 *             as white hexagons on dark. Each hexagon runs the supplied
 *             keyframes, which fade and scale the MASK, so the spinner is
 *             the hole animating rather than a shape drawn on top.
 *   phase 2   the plate fades out. The same holes now show the page. The
 *             honeycomb has become a window without moving a pixel.
 *   phase 3   the mask group scales up about its centre.
 *
 * ── WHY SCALING ABOUT THE CENTRE CLEARS THE SCREEN ────────────────────────
 *
 * Scaling a honeycomb uniformly grows the gaps between the cells as fast as
 * the cells, so the dark web between them would never go away. It works here
 * because the SEVENTH hexagon sits exactly on the group's origin: it grows
 * about its own centre while the other six fly outward off screen. Once its
 * inscribed circle passes the viewport's half-diagonal the whole screen is
 * inside one hexagon. That scale is computed from the viewport at reveal
 * time rather than guessed.
 *
 * ── What it waits for (§4.4) ──────────────────────────────────────────────
 *
 * Desktop: the hero playing AND the tour scene settled — GLB parsed,
 * textures uploaded, PMREM built, shaders compiled, first frame rendered.
 * The hero plays behind the cover, so every expensive thing is paid where
 * nobody is looking at a moving thing.
 *
 * Below 768px and on reduced motion none of that work happens: no WebGL
 * context, and the GLB is never requested. Waiting for a scene that will
 * never be built would be a loader waiting for nothing.
 *
 * ── It must never outstay what it covers ──────────────────────────────────
 *
 * Both paths are capped and the cap is anchored to NAVIGATION, not to
 * effect-mount. Measured before that was fixed: with autoplay refused the
 * screen persisted 6004ms against a 2500ms timeout, because the effect does
 * not run until hydration finishes and the timer only started there. A
 * deadline that begins after the page is interactive is not a deadline.
 *
 * And it never traps: every path out runs through `lift()`, the cap fires
 * regardless of what else happened, and the whole effect body is wrapped so
 * a throw still removes the cover.
 */

/** Mobile and reduced motion: long enough for a decode on a fast connection,
 *  short enough that a slow one is not held staring at a spinner. */
export const HERO_TIMEOUT_MS = 2500;

/**
 * Desktop, where the loader also waits for the tour scene.
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
 * a loader that waits for a signal a failed scene never sends is a loader
 * that sits there for the full timeout every time WebGL is unavailable.
 */
export const TOUR_READY_ATTR = "data-tour-ready";

/** §4.3: the reveal begins a beat after the wait ends, so the freeze reads
 *  as a deliberate pause rather than a stutter. */
export const REVEAL_DELAY_MS = 200;
/** The honeycomb becoming a window: the plate behind the holes fading out. */
export const PLATE_FADE_MS = 160;
/** §4.3's ~0.9s. Query-tunable (?reveal=) so durations can be compared on a
 *  production build without a rebuild. */
export const REVEAL_MS = 900;

/*
 * The seven cells, as offsets from the centre one — which is the last entry,
 * at the origin, and the reason the reveal works.
 *
 * These ARE the supplied CSS's `left`/`top` values. In that markup each
 * hexagon is a 24x24 box positioned by its top-left; measured from the
 * middle cell's centre those same numbers are the cell CENTRES, so they
 * carry over unchanged and the arrangement is provably the one specified.
 */
const CELLS: [number, number][] = [
  [-28, 0], [-14, 22], [14, 22], [28, 0], [14, -22], [-14, -22], [0, 0],
];

/**
 * One pointy-top hexagon 24 units across, drawn around its OWN origin, and
 * matching the supplied shape exactly: a 24x12 body with a 6-unit triangle
 * above and below.
 *
 * Around the origin rather than at the cell's position, because each cell is
 * then placed by a wrapping <g transform="translate(...)"> — which means the
 * spinner's `scale(0) -> scale(1)` is about the cell's own centre without
 * needing `transform-box: fill-box`. See the note on centring below: neither
 * transform-box value can be relied on inside a <mask> in <defs>.
 */
const HEX = "0,-12 12,-6 12,6 0,12 -12,6 -12,-6";

export function LoadScreen() {
  const ref = useRef<HTMLDivElement>(null);

  /*
   * The overlay is removed by DOM WRITES, not by state.
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

    let timer = 0;
    let done = false;
    const timeouts: number[] = [];
    const after = (ms: number, fn: () => void) => { timeouts.push(window.setTimeout(fn, ms)); };

    /* Every exit runs through here, including the ones that throw. */
    const remove = () => {
      try { el.remove(); } catch { /* already gone */ }
      document.documentElement.removeAttribute("data-loading");
    };

    try {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const narrow = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
      /*
       * Read here, not from useMediaQuery. useSyncExternalStore hands back
       * the SERVER snapshot on the first commit, so a hook value would say
       * "wide, full motion" on the render that set this effect up — and a
       * mobile visitor would be held waiting for a scene their device never
       * builds. The tour's own gate re-reads matchMedia for the same reason.
       */
      const waitsForTour = !reduced && !narrow;
      const budget = waitsForTour ? SCENE_TIMEOUT_MS : HERO_TIMEOUT_MS;

      const q = new URLSearchParams(location.search);
      /*
       * `q.has(k)` FIRST. Number(null) is 0, not NaN, so a plain
       * `Number.isFinite(v) && v >= 0` accepts a missing parameter as zero
       * and the default is never reached — measured: the reveal ran with a
       * 0ms duration and the phase went straight from "opening" to removed
       * in 172ms, skipping the animation entirely.
       */
      const nq = (k: string, d: number) => {
        if (!q.has(k)) return d;
        const v = Number(q.get(k));
        return Number.isFinite(v) && v >= 0 ? v : d;
      };
      const revealMs = nq("reveal", REVEAL_MS);

      const lift = () => {
        if (done) return;
        done = true;
        if (timer) window.clearTimeout(timer);

        /*
         * Reduced motion: no spinner, no zoom. §4.5 allows the ground to
         * fade, and only that.
         */
        if (reduced) {
          el.dataset.phase = "out";
          after(320, remove);
          return;
        }

        /*
         * PHASE 2. Freeze first, at a defined phase — all seven cells at
         * opacity 1 and scale 1.
         *
         * Without the freeze the reveal starts from wherever the 2.1s cycle
         * happened to be, so four of the seven hexagons would be part-way
         * through fading and the window would open ragged. It also makes the
         * handoff diffable: two frames either side of the plate fade differ
         * only in what is inside the holes, never in where the holes are.
         */
        el.dataset.phase = "frozen";

        after(REVEAL_DELAY_MS, () => {
          /* The scale that puts the whole viewport inside the middle cell.
             Its inscribed radius is 12 units, so this is the half-diagonal
             over 12, with a margin, computed from the actual viewport rather
             than assumed. */
          const half = Math.hypot(window.innerWidth, window.innerHeight) / 2;
          el.style.setProperty("--reveal-scale", String(Math.ceil(half / 12) + 6));
          el.style.setProperty("--reveal-ms", `${revealMs}ms`);
          el.dataset.phase = "opening";
          /* PHASE 3 starts once the plate has gone, so the honeycomb is a
             window before it is a growing window. */
          after(PLATE_FADE_MS, () => { el.dataset.phase = "open"; });
          after(PLATE_FADE_MS + revealMs, remove);
        });
      };

      const root = document.documentElement;
      const ready = () =>
        root.hasAttribute(HERO_PLAYING_ATTR) &&
        (!waitsForTour || root.hasAttribute(TOUR_READY_ATTR));

      if (ready()) { lift(); return () => { timeouts.forEach(window.clearTimeout); }; }

      const obs = new MutationObserver(() => { if (ready()) { obs.disconnect(); lift(); } });
      obs.observe(root, { attributes: true, attributeFilter: [HERO_PLAYING_ATTR, TOUR_READY_ATTR] });

      const elapsed = performance.now();
      timer = window.setTimeout(() => { obs.disconnect(); lift(); }, Math.max(0, budget - elapsed));

      return () => {
        obs.disconnect();
        if (timer) window.clearTimeout(timer);
        timeouts.forEach(window.clearTimeout);
      };
    } catch {
      /* NEVER TRAP. If anything above threw — a matchMedia that does not
         exist, a URL that will not parse — the cover still comes off. */
      remove();
      return;
    }
  }, []);

  return (
    <div
      ref={ref}
      /*
       * `dark` is load-bearing, not cosmetic: it resolves --foreground to the
       * film's wordmark white and --surface-dark to the ground the video
       * settles on, so the loader needs no colour of its own and no new hex.
       * §4.2's `#f3f3f3` becomes --foreground in this scope.
       */
      className="dark loader"
      data-load-screen=""
      data-phase="loading"
      role="status"
      aria-live="polite"
    >
      {/* The plate the holes show in phase 1. Behind the cover, so it is only
          ever visible through the honeycomb. */}
      <div className="loader-plate" aria-hidden="true" />

      <svg className="loader-cover" width="100%" height="100%" aria-hidden="true" focusable="false">
        <defs>
          {/*
            maskUnits="userSpaceOnUse" and a deliberately oversized white
            rect: the mask has to stay opaque out to wherever the cover
            reaches, and the cover is the viewport at any size.
          */}
          <mask id="loader-honeycomb" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {/*
              CENTRED BY A NESTED <svg>, NOT BY A PERCENTAGE TRANSFORM.

              The first build centred the hive with
              `transform: translate(50%, 50%)` plus `transform-box: view-box`.
              That COMPUTES correctly — it read back as
              matrix(3.2, 0, 0, 3.2, 720, 450) on a 1440x900 viewport — and it
              does not paint. Content inside a <mask> in <defs> has no layout
              box, so the reference box the percentages resolve against never
              materialises at mask-render time and the mask punches nothing.
              The whole loader rendered as a plain black rectangle.

              Isolated by rebuilding the mask live: one hard-coded black
              square punched (2870 lit pixels), the shipped hive punched zero,
              and this structure punched 796 — seven hexagons' worth.

              A nested <svg> takes percentages on x/y natively and does the
              centring in SVG's own coordinate machinery, which needs no
              layout box. `overflow="visible"` because the cells sit at
              negative coordinates around that new origin.
            */}
            <svg x="50%" y="50%" overflow="visible">
              <g className="loader-hive">
                {CELLS.map(([x, y], i) => (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <polygon className="loader-cell" points={HEX} fill="#000"
                      style={{ animationDelay: `${i * 0.1}s` }} />
                  </g>
                ))}
              </g>
            </svg>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="var(--surface-dark)" mask="url(#loader-honeycomb)" />
      </svg>

      {/* Announced, not drawn. The honeycomb is decorative; this is the only
          thing a screen reader has to go on, and the element leaves the tree
          entirely once the reveal finishes. */}
      <span className="sr-only">Loading SafeRide</span>
    </div>
  );
}
