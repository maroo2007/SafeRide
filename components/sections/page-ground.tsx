"use client";

import { useEffect, useRef } from "react";

/**
 * The page ground — build spec §4a.
 *
 * One layer for the whole post-hero run. It is a plain element rather than a
 * per-section background for one measurable reason: `background-size` origins
 * at the element's own top-left, so a per-section lattice restarts its rhythm
 * at every boundary and two adjacent paper sections show a seam.
 *
 * It never reaches the hero, which composites its own video ground and sits
 * outside the wrapper entirely.
 *
 * The phone tour IS inside it. That canvas is `alpha: true`, so the ground
 * shows through behind the phone and scrolls while the canvas is pinned.
 *
 * ── Two candidates, one build ─────────────────────────────────────────────
 *
 * `data-ground` selects the treatment: the hairline `grid` that ships, or one
 * of three placements of the topographic contours. `?ground=` overrides it on
 * a production build so the options can be judged on the real page rather
 * than from a mock — the same reason every other knob in this project is
 * query-tunable.
 *
 * It is a DOM WRITE, not state. Reading `location` during render breaks
 * hydration (the server has no query string), and setState in an effect is
 * the cascading-render pattern this project rules out. The default is the
 * value in the JSX, which is what ships if nothing is chosen.
 */

export type GroundMode = "grid" | "stretch" | "repeat" | "anchor";
const MODES: GroundMode[] = ["grid", "stretch", "repeat", "anchor"];

/**
 * What ships unless the query string says otherwise.
 *
 * `anchor`, at the top of the layer — which is the end of the hero, over
 * Platform. One 16:9 composition, undistorted, masked out at its lower edge,
 * with the survey grid drawn over the top of it.
 *
 * The two field placements were measured and rejected. `stretch` is a 13.5x
 * vertical scale at this page length and does not distort the contours so
 * much as remove them: what is left is a smooth vertical wash, a vignette
 * rather than a map. `repeat` is 13.5 recurrences at a 1440 viewport, about
 * one blob per screen, and the blob runs off the top of its own tile so every
 * boundary is a visible seam. Both also cost 2-4 points of contrast across
 * every section they cover.
 *
 * It is NOT anchored on the phone tour, and the reason is structural rather
 * than a contrast figure. The tour is eight screens; one composition covers
 * one of them. Placed there, chapter 1 gets terrain and chapters 2 and 3 get
 * plain grid — three things meant to read as a series stop matching. The
 * contrast cost of doing it is negligible (5.88:1 at chapter 1, the other two
 * untouched), which is exactly why the number is not the argument.
 */
/**
 * Grid. The contour candidate is REMOVED, not switched off — the SVG, the
 * component and the three placement modes are all gone. It was a treatment of
 * the paper ground that was tried, measured and then briefly displaced by a
 * background video; the video is out too, and what is left is the lattice this
 * page always had.
 */
export const GROUND_DEFAULT: GroundMode = "grid";

export function PageGround() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const q = new URLSearchParams(location.search);
    const m = q.get("ground");
    if (m && (MODES as string[]).includes(m)) el.setAttribute("data-ground", m);
    /* Two knobs for the anchored placement, so where it sits and how big it
       is can be argued about against the real page instead of in the
       abstract. Both are plain CSS lengths. */
    const top = q.get("topoTop");
    if (top) el.style.setProperty("--topo-top", top);
    const w = q.get("topoW");
    if (w) el.style.setProperty("--topo-w", w);
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="page-ground" data-ground={GROUND_DEFAULT}>
    </div>
  );
}

/**
 * The ground for a dark section. Painted over the page layer, not instead of
 * it: dark sections still declare an opaque ground of their own, which is the
 * half of that rule §4a.4 keeps rather than narrows.
 */
export function DarkGround() {
  return <div aria-hidden="true" className="dark-ground" />;
}
