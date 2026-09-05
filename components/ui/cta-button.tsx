"use client";

import s from "./cta-button.module.css";

/**
 * The hero CTA — lift and press.
 *
 * Rest flat; hover lifts 4px with a hard shadow offset by exactly that much,
 * so the button appears to rise off its own footprint; press punches 2px below
 * the resting plane and drops the shadow.
 *
 * Button 2 (expanding fill / shine / ripple) is REMOVED, not disabled. It is
 * in git history at c43a3db along with the measurements that ruled it out.
 */

export type CtaFill =
  | "solid"
  /** Secondary on paper: fills faintly on hover. */
  | "outlineInk"
  /** Secondary on paper: stays empty, border deepens. */
  | "outlineInkBorder"
  /** Secondary over footage: fills faintly on hover. */
  | "outlineOnMedia"
  /** Secondary over footage: stays empty, border deepens. */
  | "outlineOnMediaBorder";

const FILL_CLASS: Record<CtaFill, string> = {
  solid: s.solid,
  outlineInk: s.outlineInk,
  outlineInkBorder: s.outlineInkBorder,
  outlineOnMedia: s.outlineOnMedia,
  outlineOnMediaBorder: s.outlineOnMediaBorder,
};

/**
 * Where the route line sits relative to the label.
 *
 * It may never cross the words. In the 56-unit box the label runs roughly
 * y=22..39 (cap height to descender), so both placements clear it with margin.
 * Both are inset 18/240 horizontally so the curve cannot run into the 16px
 * corner radius and get clipped at either end.
 */
export type RoutePlacement = "below" | "top" | "none";

export const ROUTE_PATHS: Record<Exclude<RoutePlacement, "none">, string> = {
  below: "M18 47 C 58 43, 96 50, 136 46 C 172 42, 200 48, 222 44",
  top: "M18 10 C 58 6, 96 13, 136 9 C 172 5, 200 11, 222 7",
};

/**
 * The colour of the route mark. On the accent fill this is ink: #FDF8F0 on
 * #FB8A00 is 2.15:1 and fails WCAG 1.4.11 as a UI component, while ink on the
 * same fill is 8.36:1. On a dark ground the mark inverts to paper.
 */
function markColour(fill: CtaFill) {
  return fill.startsWith("outlineOnMedia") ? "#fcfbf8" : "#030917";
}

export type CtaButtonProps = {
  href: string;
  /** The label. Verbatim from the live site; this is the accessible name. */
  label: string;
  /**
   * Second label revealed on hover. OPTIONAL and off by default: the spec
   * takes copy verbatim from the live site, which carries one string per
   * button, so a swap needs copy that does not exist yet. With no altLabel
   * the button renders a single label and no swap markup at all.
   */
  altLabel?: string;
  fill: CtaFill;
  /** The route line is the primary's flourish; the secondary stays plain. */
  route?: RoutePlacement;
  className?: string;
  style?: React.CSSProperties;
};

export function CtaButton({
  href, label, altLabel, fill, route = "none", className, style,
}: CtaButtonProps) {
  const d = route === "none" ? null : ROUTE_PATHS[route];
  return (
    <a
      href={href}
      className={`${s.btn} ${FILL_CLASS[fill]} ${className ?? ""}`}
      /* The accessible name stays the RESTING label. Without this the name
         becomes both spans concatenated ("Explore Platform See it in action"),
         which is what the reference button does and is a defect, not a style. */
      aria-label={label}
      style={{
        "--icon-mark": markColour(fill),
        // One constant drives both the stroke's `d` and the dot's offset-path.
        ...(d ? { "--route": `path("${d}")` } : {}),
        ...style,
      } as React.CSSProperties}
    >
      {altLabel ? (
        <span className={s.labels} aria-hidden="true" data-label>
          <span className={s.rest}>{label}</span>
          <span className={s.alt}>{altLabel}</span>
        </span>
      ) : (
        <span className={s.single} aria-hidden="true" data-label>{label}</span>
      )}

      {d && (
        /* preserveAspectRatio none stretches the path to the button's width;
           non-scaling-stroke keeps the line the same weight regardless, so a
           longer label cannot thin it out. */
        <svg className={s.route} viewBox="0 0 240 56" preserveAspectRatio="none"
             aria-hidden="true" focusable="false">
          <path className={s.routePath} d={d} pathLength={1}
                vectorEffect="non-scaling-stroke" />
          <circle className={s.routeDot} cx="0" cy="0" r="2.8" />
        </svg>
      )}
    </a>
  );
}
