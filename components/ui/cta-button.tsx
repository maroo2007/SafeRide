"use client";

import s from "./cta-button.module.css";

/**
 * The hero CTA.
 *
 * One mechanic, chosen from the A/D/E/F/G/H evaluation: a route line that
 * draws across the button on hover with a dot travelling the path, alongside
 * a label swap. 300ms total, inside the 400ms ceiling.
 *
 * The glass treatments (E1/E2/E3, G1/G2/G3) and the rejected icons are
 * REMOVED, not disabled — they remain in git history at b844831 and e406575
 * if the evaluation ever needs revisiting.
 */

export type CtaFill = "solid" | "outlineInk" | "outlineOnMedia";

const FILL_CLASS: Record<CtaFill, string> = {
  solid: s.solid,
  outlineInk: s.outlineInk,
  outlineOnMedia: s.outlineOnMedia,
};

/**
 * The route path. ONE definition, shared by the SVG's `d` and — asserted by
 * the test suite — by the dot's offset-path in CSS. If the two drift the dot
 * leaves the line, and nothing would fail loudly; it would just look subtly
 * wrong.
 *
 * Shaped so its middle runs BELOW the label's baseline and it rises only at
 * the ends, where there are no glyphs. Two readings had to be avoided at
 * once: a flat hairline on the bottom edge read as a link underline, and a
 * line crossing the x-height read as a strikethrough — worse. This clears the
 * text but keeps enough amplitude (25 -> 47 -> 21 in a 56-tall box) to read
 * as a route rather than a rule.
 */
export const ROUTE_D = "M0 25 C 32 45, 72 49, 122 47 C 172 45, 206 33, 240 21";

/**
 * The colour of the route mark.
 *
 * On the accent fill this is ink: #FDF8F0 on #FB8A00 is 2.15:1 and fails
 * WCAG 1.4.11 as a UI component, while ink on the same fill is 8.36:1. On a
 * dark ground the mark inverts to paper.
 */
function markColour(fill: CtaFill) {
  return fill === "outlineOnMedia" ? "#fcfbf8" : "#030917";
}

export type CtaButtonProps = {
  href: string;
  /** Resting label. This is the accessible name and it never changes. */
  label: string;
  /** Revealed on hover. Decorative — see `aria-hidden` below. */
  altLabel?: string;
  fill: CtaFill;
  /** The route line is the primary's flourish; the secondary stays plain. */
  route?: boolean;
  className?: string;
};

export function CtaButton({
  href, label, altLabel, fill, route = false, className,
}: CtaButtonProps) {
  return (
    <a
      href={href}
      className={`${s.btn} ${FILL_CLASS[fill]} ${className ?? ""}`}
      /* The accessible name stays the RESTING label. Without this the name
         becomes both spans concatenated ("Explore Platform See it in action"),
         which is what the reference button does and is a defect, not a style. */
      aria-label={label}
      style={{ "--icon-mark": markColour(fill) } as React.CSSProperties}
    >
      <span className={s.labels} aria-hidden="true">
        {/* The knockout only matters where a line passes behind the words. */}
        <span className={`${s.rest} ${route ? s.knockout : ""}`}>{label}</span>
        <span className={`${s.alt} ${route ? s.knockout : ""}`}>{altLabel ?? label}</span>
      </span>

      {route && (
        /* preserveAspectRatio none stretches the path to the button's width;
           non-scaling-stroke keeps the line the same weight regardless, so a
           longer label cannot thin it out. */
        <svg className={s.route} viewBox="0 0 240 56" preserveAspectRatio="none"
             aria-hidden="true" focusable="false">
          <path className={s.routePath} d={ROUTE_D} pathLength={1}
                vectorEffect="non-scaling-stroke" />
          <circle className={s.routeDot} cx="0" cy="0" r="2.8" />
        </svg>
      )}
    </a>
  );
}
