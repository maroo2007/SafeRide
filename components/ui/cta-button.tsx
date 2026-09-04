"use client";

import s from "./cta-button.module.css";

/**
 * CTA hover variants under evaluation.
 *
 * A — circle outline that fills, with a checkmark that DRAWS, plus a label swap
 * B — label swap only
 * C — arrow sweep, label static
 *
 * Fill treatments are orthogonal: solid, glassLayer (G2), glassTrue (G3).
 */

export type CtaMechanic = "check" | "label" | "arrow";
export type CtaFill = "solid" | "glassLayer" | "glassTrue" | "outlineInk";

const FILL_CLASS: Record<CtaFill, string> = {
  solid: s.solid,
  glassLayer: s.glassLayer,
  glassTrue: s.glassTrue,
  outlineInk: s.outlineInk,
};

/**
 * Ink used for the circle fill and the checkmark stroke.
 *
 * The brief says the circle fills with #FB8A00. On the SECONDARY that works.
 * On the primary it cannot: the button is already #FB8A00, so an orange circle
 * on an orange ground is invisible. On an orange fill the circle takes the ink
 * and the check is drawn in the fill colour, which keeps the same "confirmation
 * lands" reading and measures far better. Flagged rather than silently chosen.
 */
function checkColours(fill: CtaFill) {
  const onOrange = fill === "solid" || fill === "glassLayer";
  return onOrange
    ? { ring: "#030917", stroke: "#FB8A00", ringStroke: "rgba(3,9,23,.55)" }
    : { ring: "#FB8A00", stroke: "#030917", ringStroke: "rgba(252,251,248,.62)" };
}

export type CtaButtonProps = {
  href: string;
  /** Resting label. This is the accessible name and it never changes. */
  label: string;
  /** Revealed on hover. Decorative — see `aria-hidden` below. */
  altLabel?: string;
  mechanic: CtaMechanic;
  fill: CtaFill;
  /**
   * Stroke width of the checkmark, in the 36px viewBox.
   *
   * 3 rather than 2.5, chosen at actual size against the PRIMARY case, which
   * is the weaker one: orange on near-black reads optically lighter than
   * near-black on orange at the same width. 2 loses definition at 36px and
   * 3.5 crowds the circle.
   */
  checkStroke?: number;
  className?: string;
};

export function CtaButton({
  href, label, altLabel, mechanic, fill, checkStroke = 3, className,
}: CtaButtonProps) {
  const c = checkColours(fill);
  const swaps = mechanic === "check" || mechanic === "label";
  return (
    <a
      href={href}
      className={`${s.btn} ${FILL_CLASS[fill]} ${className ?? ""}`}
      /* The accessible name stays the RESTING label. Without this the name
         becomes both spans concatenated ("Explore Platform See it in action"),
         which is what the reference button does and is a defect, not a style. */
      aria-label={label}
      style={
        { "--check-fill": c.ring, "--check-stroke": c.stroke } as React.CSSProperties
      }
    >
      {mechanic === "check" && (
        <svg
          className={s.icon}
          viewBox="0 0 36 36"
          width="36"
          height="36"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className={s.ring}
            cx="18" cy="18" r="15.25"
            stroke={c.ringStroke}
            strokeWidth="1.5"
          />
          {/* pathLength=1 so dasharray/dashoffset do not depend on geometry. */}
          <path
            className={s.check}
            d="M11.4 18.4 L15.9 22.9 L24.9 13.2"
            pathLength={1}
            strokeWidth={checkStroke}
          />
        </svg>
      )}

      {swaps ? (
        <span className={s.labels} aria-hidden="true">
          <span className={s.rest}>{label}</span>
          <span className={s.alt}>{altLabel ?? label}</span>
        </span>
      ) : (
        <span aria-hidden="true" style={{ zIndex: 1 }}>{label}</span>
      )}

      {mechanic === "arrow" && (
        <span className={s.arrowTrack} aria-hidden="true">
          <svg className={`${s.arrow} ${s.arrowOut}`} viewBox="0 0 20 20" width="20" height="20">
            <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg className={`${s.arrow} ${s.arrowIn}`} viewBox="0 0 20 20" width="20" height="20">
            <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </a>
  );
}
