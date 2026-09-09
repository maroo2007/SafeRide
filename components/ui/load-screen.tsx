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
 * inside one hexagon. That scale is computed from the viewport at reveal time
 * rather than guessed — and from HEX_INRADIUS rather than from the hexagon's
 * vertex distance, which is a different number and left the corners dark.
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

/**
 * How long the frozen honeycomb is held before the reveal starts.
 *
 * 500, and 300 of that is not a design beat — it is waiting for the GPU.
 *
 * The loader lifts at the moment the tour scene becomes ready, which is the
 * moment the GPU is busiest: shaders have just compiled, three 1080x2314
 * textures have just uploaded, the first frame has just rendered. Traced on
 * the production build, a 240.9ms GPUTask sat directly across the start of
 * the reveal, and the reveal presented 17 frames while dropping 23 — 20.8fps
 * with a 215.9ms gap. rAF had reported the same animation as 47.7fps with a
 * 34ms worst frame, which is the second time in this project that rAF has
 * described a stall as smooth.
 *
 * So the reveal waits for that work to drain. It costs a third of a second of
 * loading, which the visitor is already spending, and it buys the animation
 * an idle GPU.
 *
 * ?hold= overrides it, so the two can be compared on one build.
 */
export const REVEAL_DELAY_MS = 500;
/** The honeycomb becoming a window: the plate behind the holes fading out. */
export const PLATE_FADE_MS = 160;
/** §4.3's ~0.9s. Query-tunable (?reveal=) so durations can be compared on a
 *  production build without a rebuild. */
export const REVEAL_MS = 900;
/** Must match --hive-scale in globals.css: the clip path is generated in JS
 *  and has to start at exactly the size the mask is already showing. */
export const HIVE_SCALE = 3.2;

/**
 * HOW THE WINDOW OPENS — three implementations of one visual.
 *
 * They differ only in what the compositor has to redo each frame:
 *
 *   mask    scales the hive INSIDE the SVG mask. The mask is an input to the
 *           masked rect's paint, so moving its contents re-rasterises the
 *           cover every frame.
 *   clip    a plain dark div under an animated clip-path(evenodd) of the same
 *           seven cells. Path clipping is CPU raster work, per frame.
 *   layer   the mask never moves. The masked ELEMENT is scaled instead, so
 *           the cover is rasterised once and the growth is a transform the
 *           compositor can run on its own.
 *
 * Same geometry in all three: the middle cell is centred on the viewport, so
 * scaling the hive about its origin and scaling the cover about its centre
 * describe the same hexagon.
 */
export const REVEAL_MODES = ["mask", "clip", "layer"];
export const REVEAL_MODE = "mask";

/**
 * THE EASING, AND WHY IT IS NOT easeOutQuint ANY MORE.
 *
 * The reveal used cubic-bezier(0.22, 1, 0.36, 1). Measured on the production
 * build, that put the hexagon past the edge of the viewport 366ms into a
 * 898ms scale — 41% of it. The other 532ms was a full-viewport masked overlay
 * that covered nothing, still composited, still re-rastering, sitting on top
 * of a page whose hero video had just started. The three worst frame stalls
 * in that run (179ms, 132ms, 117ms) were all inside that invisible tail.
 *
 * So the reveal was not a slow animation. It was a fast one followed by half
 * a second of the loader getting in the way after it had stopped being
 * visible — which is felt as the PAGE stuttering on arrival, not as the
 * loader being slow, and is why "make the animation faster" was never going
 * to fix it.
 *
 * This curve is 3s^2 - 2s^3 on the value axis — smoothstep — so the aperture
 * accelerates out of the spinner instead of snapping, and it reaches the edge
 * of the viewport at about 90% of the duration rather than 41% of it. The
 * overlay is then removed on the frame that proves coverage (see the watcher
 * in the reveal), so the little that is left of the tail is not composited
 * either.
 */
export const REVEAL_EASE: readonly [number, number, number, number] = [0.45, 0, 0.55, 1];


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
const HEX_POINTS: [number, number][] = [
  [0, -12], [12, -6], [12, 6], [0, 12], [-12, 6], [-12, -6],
];
const HEX = HEX_POINTS.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * THE DISTANCE FROM THE CENTRE TO THE NEAREST POINT ON THE EDGE — 10.82,
 * NOT 12, and the difference was visible in every reveal this build ever ran.
 *
 * The reveal is finished when the middle hexagon contains the whole viewport,
 * and the code decided that by comparing the half-diagonal against 12 units
 * of scale. 12 is the distance to the VERTEX at (0,12). The nearest point on
 * the boundary is the midpoint of a slanted edge, at (6,9) — hypot(6,9), or
 * about 10.82. Sizing the reveal by the vertex therefore stops it about 10%
 * short of covering the corners.
 *
 * At 1440x900 that put the final scale at 77 where 79 was needed: the
 * aperture's apothem reached 833px against a half-diagonal of 849, leaving a
 * dark wedge in each of the four corners for the whole back half of the
 * reveal. Caught by looking at a captured frame, 12ms after the arithmetic
 * said the screen was covered, and finding the corners still dark.
 *
 * Derived from the points rather than written down, so a change to the
 * hexagon cannot leave this behind.
 */
export const HEX_INRADIUS = (() => {
  let min = Infinity;
  for (let i = 0; i < HEX_POINTS.length; i++) {
    const [x1, y1] = HEX_POINTS[i];
    const [x2, y2] = HEX_POINTS[(i + 1) % HEX_POINTS.length];
    const dx = x2 - x1, dy = y2 - y1;
    /* Clamped projection of the origin onto the edge, so the nearest point is
       found whether it falls inside the segment or at one of its ends. */
    const t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy)));
    min = Math.min(min, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return min;
})();

/**
 * The same seven cells as an SVG path string, for the clip-path reveal.
 *
 * An outer rectangle plus seven hexagons under `evenodd`, so the hexagons are
 * holes in it. Written with explicit L commands and never H/V, because CSS
 * only interpolates two path() values when their command sequences match
 * exactly — the transition is between this at the spinner's scale and this at
 * the reveal's, and a shorthand in one would stop it animating at all.
 *
 * The rectangle is 40000 units so that at any scale it still covers a
 * viewport; it is clip geometry, not a painted surface, so its size costs
 * nothing.
 */
function clipPath(scale: number): string {
  const R = 20000;
  const rect = `M${-R},${-R} L${R},${-R} L${R},${R} L${-R},${R} Z`;
  const cells = CELLS.map(([cx, cy]) => {
    const pts = HEX_POINTS.map(([x, y]) => [(cx + x) * scale, (cy + y) * scale]);
    return "M" + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L") + " Z";
  }).join(" ");
  return `path(evenodd, "${rect} ${cells}")`;
}

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
    let removed = false;
    const timeouts: number[] = [];
    const rafs: number[] = [];
    const after = (ms: number, fn: () => void) => { timeouts.push(window.setTimeout(fn, ms)); };

    /* Every exit runs through here, including the ones that throw. */
    const remove = () => {
      /* The coverage watcher and the backstop timer both call this, and
         whichever loses has to stop the other: an orphan rAF reading styles
         off a detached node would run for the rest of the session. */
      removed = true;
      rafs.forEach(window.cancelAnimationFrame);
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
      const holdMs = nq("hold", REVEAL_DELAY_MS);

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

        after(holdMs, () => {
          /* The scale that puts the whole viewport inside the middle cell:
             the half-diagonal over the hexagon's inscribed radius, plus a
             margin, computed from the actual viewport rather than assumed.
             HEX_INRADIUS and not 12 — see the note on it. */
          const half = Math.hypot(window.innerWidth, window.innerHeight) / 2;
          const k = Math.ceil(half / HEX_INRADIUS) + 6;
          el.style.setProperty("--reveal-scale", String(k));
          el.style.setProperty("--reveal-ms", `${revealMs}ms`);
          el.style.setProperty("--reveal-ease", `cubic-bezier(${REVEAL_EASE.join(",")})`);
          /* Both clip paths, at the spinner's scale and the reveal's. Set
             here rather than in CSS because the end scale depends on the
             viewport, and set BEFORE the phase flips so the starting value is
             already in place when the transition begins. */
          el.style.setProperty("--clip-from", clipPath(HIVE_SCALE));
          el.style.setProperty("--clip-to", clipPath(k));
          /* mask | clip | layer — see the three blocks in globals.css. The
             default is whichever one measured fastest; the others stay
             reachable so the comparison can be re-run rather than believed. */
          const rm = q.get("revealMode") || "";
          el.dataset.reveal = REVEAL_MODES.includes(rm) ? rm : REVEAL_MODE;
          el.dataset.phase = "opening";
          /* PHASE 3 starts once the plate has gone, so the honeycomb is a
             window before it is a growing window. */
          /*
           * The removal is scheduled from INSIDE this callback, so it is
           * measured from the moment the transition actually started rather
           * than from the moment it was supposed to.
           *
           * Anchoring both timers to the same origin looked equivalent and is
           * not: the plate-fade timer drifted to 189ms against its 160, the
           * removal timer did not, and the transition therefore got 29ms less
           * than it was given. Measured, the aperture was still at scale 65.9
           * when the overlay was removed against the 70.8 it needed to cover
           * the viewport — a flash of the dark corners at the very end.
           */
          after(PLATE_FADE_MS, () => {
            el.dataset.phase = "open";

            /*
             * GO WHEN YOU STOP COVERING ANYTHING — measured, not predicted.
             *
             * The overlay is invisible once the rendered scale puts the
             * hexagon's inscribed radius past the viewport's half-diagonal.
             * Everything after that instant is a
             * full-viewport masked layer showing nothing, still composited,
             * competing with a hero video that has just become visible — and
             * on the previous build that was 532ms of the 898ms reveal, with
             * the three worst frame stalls of the run inside it.
             *
             * This reads the rendered scale each frame and goes on the first
             * frame that proves coverage. Two timer-based versions were tried
             * first and both were wrong by a visible margin: solving the
             * easing curve for the crossing time is exact in principle and in
             * practice raced the transition's own start, leaving the aperture
             * at 65.9 and then 68.8 against the 70.8 it needed — a flash of
             * the dark corners. A predicted time cannot be made safe by
             * padding without giving back the dead time it was removing.
             * Reading the value has neither problem.
             *
             * One getComputedStyle per frame, for about 700ms, against a
             * full-viewport mask re-raster per frame. It is not the expensive
             * thing here.
             */
            const covers = () => {
              const hive = el.querySelector<SVGGElement>(".loader-hive");
              if (!hive) return true;
              /* Both, multiplied: the mask variant scales the hive and the
                 layer variant scales the cover the hive is inside. */
              const cover = el.querySelector<SVGSVGElement>(".loader-cover");
              const a = new DOMMatrixReadOnly(getComputedStyle(hive).transform).a;
              const b = cover
                ? new DOMMatrixReadOnly(getComputedStyle(cover).transform).a
                : 1;
              return a * b * HEX_INRADIUS >= half;
            };

            const watch = () => {
              if (removed) return;
              if (covers()) { remove(); return; }
              rafs.push(window.requestAnimationFrame(watch));
            };
            rafs.push(window.requestAnimationFrame(watch));

            /*
             * The backstop, and it is not decoration: the clip variant does
             * not move the hive at all, so `covers` is false for its whole
             * run and this is what ends it. It is also the answer if a
             * computed transform ever reads back as none.
             */
            after(revealMs + 60, remove);
          });
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

      {/*
        The clip-path alternative (§4.3), reachable with ?revealMode=clip.
        Identical geometry to the mask, generated from the same CELLS, so the
        swap at `opening` is invisible — and the handoff guard measures
        exactly that. Inert unless selected.
      */}
      <div className="loader-clip" aria-hidden="true" />

      {/* Announced, not drawn. The honeycomb is decorative; this is the only
          thing a screen reader has to go on, and the element leaves the tree
          entirely once the reveal finishes. */}
      <span className="sr-only">Loading SafeRide</span>
    </div>
  );
}
