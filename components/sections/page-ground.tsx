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
 * The phone tour IS inside it. That canvas is `alpha: true`, so the lattice
 * shows through behind the phone and scrolls while the canvas is pinned.
 */
export function PageGround() {
  return <div aria-hidden="true" className="page-ground" />;
}

/**
 * The ground for a dark section. Painted over the page layer, not instead of
 * it: dark sections still declare an opaque ground of their own, which is the
 * half of that rule §4a.4 keeps rather than narrows.
 */
export function DarkGround() {
  return <div aria-hidden="true" className="dark-ground" />;
}
