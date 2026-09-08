/**
 * The topographic contour ground — a CANDIDATE, sitting alongside the grid.
 *
 * One organic blob, drawn twelve times at increasing scale and skew, each
 * copy a step lighter than the one inside it. Reads as elevation contours.
 *
 * ── Twelve, not thirteen ──────────────────────────────────────────────────
 *
 * The source file has thirteen paths. The first carries no transform and no
 * style override, so it renders at the generator's default `#FFFA72` — a
 * yellow — and every later copy paints over it. Rendered at 1920x1080 and
 * counted: ZERO pixels in the whole composition are yellowish, and the only
 * colours present are white plus the twelve ramp stops. It is dead geometry,
 * so it is not carried over. Recorded here because "there were thirteen"
 * would otherwise look like something was lost.
 *
 * ── No new hex ────────────────────────────────────────────────────────────
 *
 * The source ramp is cool grey on white: 255 down to 177, twelve stops. Cool
 * grey on #FDF8F0 paper reads as dirt rather than as texture, so every stop
 * is remapped into the warm family by interpolating between `--background`
 * and `--neutral-warm` — the bus colour, already a token.
 *
 *     t = (255 - v) / (255 - 177)
 *
 * and the fill is `color-mix(in srgb, var(--neutral-warm) t%, var(--background))`.
 * That is the interpolation stated as CSS rather than resolved into twelve
 * literals, so it stays live against the tokens and follows them into the
 * dark scope. The percentages below ARE the source ramp, converted; they are
 * not chosen values and there is nothing to tune in them.
 *
 * ── Why inline SVG and not a background-image ─────────────────────────────
 *
 * A `background-image` cannot see CSS custom properties, so a data URI would
 * mean twelve baked hex values — the thing the brief rules out. Inline, each
 * band is an opaque `color-mix` and the ramp is derived at paint time.
 *
 * The bands are OPAQUE rather than a stack of transparent ones. Nested
 * translucent fills compound: the innermost band would sit under eleven
 * others and land nowhere near its intended stop. Opaque fills put every
 * band exactly on the ramp, and cost nothing here because the outermost band
 * IS `--background`.
 *
 * ── The three placements ──────────────────────────────────────────────────
 *
 * The composition is a fixed 1920x1080 picture, and the page ground is
 * 1440 x 10954 at this viewport — 1:7.6 against 16:9. There is no placement
 * that is simply correct, so all three are built and switchable:
 *
 *   stretch   one copy filling the layer. 13.5x vertical distortion.
 *   repeat    twenty undistorted tiles down the page, via aspect-ratio so no
 *             measurement or script is needed. The blob recurs.
 *   anchor    one undistorted copy at one place, masked out at its lower
 *             edge, with the grid running over the top of it.
 *
 * `?ground=` selects between them on a production build. See globals.css.
 */

/* The blob, exactly as authored. One copy in <defs>, twelve <use> of it. */
const BLOB =
  "M734.567 34.372c-28.692 61.724-23.266 100.422 16.275 116.094 59.313 23.508 " +
  "200.347 32.911 259.299 83.906 58.95 50.994 238.697 11.572 269.438-75.95C1310.32 " +
  "70.9 1365.669-64 1073.808-64c-194.576 0-307.654 32.79-339.24 98.372h-.001z";

/**
 * The twelve copies, outermost first — the paint order is the stacking order.
 * `grey` is the source stop, kept so the remap can be checked against the
 * file rather than trusted; `mix` is that stop as a position on the warm ramp.
 */
const BANDS: { t: [number, number]; s: number; k: number; grey: number; mix: number }[] = [
  { t: [-1800, 60], s: 2.8, k: 30, grey: 255, mix: 0 },
  { t: [-1650, 55], s: 2.65, k: 27.5, grey: 248, mix: 9 },
  { t: [-1500, 50], s: 2.5, k: 25, grey: 241, mix: 18 },
  { t: [-1350, 45], s: 2.35, k: 22.5, grey: 234, mix: 27 },
  { t: [-1200, 40], s: 2.2, k: 20, grey: 227, mix: 36 },
  { t: [-1050, 35], s: 2.05, k: 17.5, grey: 220, mix: 45 },
  { t: [-900, 30], s: 1.9, k: 15, grey: 213, mix: 54 },
  { t: [-750, 25], s: 1.75, k: 12.5, grey: 205, mix: 64 },
  { t: [-600, 20], s: 1.6, k: 10, grey: 198, mix: 73 },
  { t: [-450, 15], s: 1.45, k: 7.5, grey: 191, mix: 82 },
  { t: [-300, 10], s: 1.3, k: 5, grey: 184, mix: 91 },
  { t: [-150, 5], s: 1.15, k: 2.5, grey: 177, mix: 100 },
];

/** How many tiles the repeat option stacks. 20 x 810px = 16200px at a 1440
 *  viewport, comfortably past the 10954px ground, and the overflow is
 *  clipped. A count rather than a measurement, so no script is involved. */
const TILES = 20;

function Stack() {
  return (
    <g id="topo-stack">
      {BANDS.map((b) => (
        <use
          key={b.grey}
          href="#topo-blob"
          transform={`translate(${b.t[0]}, ${b.t[1]}) scale(${b.s}) skewX(${b.k})`}
          fill={`color-mix(in srgb, var(--neutral-warm) ${b.mix}%, var(--background))`}
        />
      ))}
    </g>
  );
}

export function TopoContours() {
  return (
    <>
      {/*
        preserveAspectRatio="none" on all three, and the ELEMENT's box decides
        whether that distorts. stretch is given the layer's full height and
        does; the other two are sized by aspect-ratio to the composition's own
        16:9 and do not. Keeping one attribute value across all three means
        the difference between the options is the CSS box and nothing else.
      */}
      <svg className="topo topo-stretch" aria-hidden="true" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <defs>
          <path id="topo-blob" d={BLOB} fillRule="nonzero" />
        </defs>
        <Stack />
      </svg>
      <svg
        className="topo topo-repeat"
        aria-hidden="true"
        viewBox={`0 0 1920 ${1080 * TILES}`}
        preserveAspectRatio="none"
      >
        {Array.from({ length: TILES }, (_, i) => (
          <use key={i} href="#topo-stack" transform={`translate(0, ${1080 * i})`} />
        ))}
      </svg>
      <svg className="topo topo-anchor" aria-hidden="true" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <use href="#topo-stack" />
      </svg>
    </>
  );
}
