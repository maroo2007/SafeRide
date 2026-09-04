"use client";

import s from "./cta-button.module.css";

/**
 * CTA hover variants under evaluation.
 *
 * Icon treatments, all on the same label-swap mechanic and all budgeted to
 * finish inside 400ms:
 *   A check   circle fills, checkmark draws            60 + 250 = 310ms
 *   D pin     circle fills, pin drops and settles      60 + 270 = 330ms
 *   E route   hairline draws across the button,
 *             dot travelling along it                        300ms
 *   F notify  notification card rises from the
 *             button's bottom edge and settles              300ms
 *   G signal  three arcs pulse outward once           140 + 200 = 340ms
 *   H dots    line draws between two dots, both pulse 240 + 120 = 360ms
 * Plus the two non-icon controls: B (label swap only) and C (arrow sweep).
 *
 * Fill treatments are orthogonal: solid, glassLayer (G2), glassTrue (G3).
 */

export type CtaMechanic =
  | "check" | "pin" | "route" | "notify" | "signal" | "dots" | "label" | "arrow"
  /** The three glass treatments of the route line. */
  | "routeLum" | "routeInk" | "routeGroove";
export type CtaFill =
  | "solid" | "glassLayer" | "glassTrue" | "glassQuiet" | "outlineInk";

const FILL_CLASS: Record<CtaFill, string> = {
  solid: s.solid,
  glassLayer: s.glassLayer,
  glassTrue: s.glassTrue,
  glassQuiet: s.glassQuiet,
  outlineInk: s.outlineInk,
};

/** The route path. One definition, shared by the SVG and by the dot's
 *  offset-path in CSS — they must not be allowed to diverge. */
const ROUTE_D = "M0 38 C 62 14, 128 46, 186 22 C 214 11, 230 22, 240 26";
const ROUTES: CtaMechanic[] = ["route", "routeLum", "routeInk", "routeGroove"];

/** Which mechanics carry a 36px icon in the circle shell. */
const CIRCLE_ICONS: CtaMechanic[] = ["check", "pin"];
/** Which mechanics swap the label. All of them except the arrow. */
const SWAPS: CtaMechanic[] = [
  "check", "pin", "route", "routeLum", "routeInk", "routeGroove",
  "notify", "signal", "dots", "label",
];

/**
 * Ink for the icon fill and its stroke.
 *
 * The brief says the circle fills with #FB8A00. On the SECONDARY that works.
 * On the primary it cannot: the button is already #FB8A00, so an orange shape
 * on an orange ground is invisible. On an orange fill the shape takes the ink
 * and the detail is drawn in the fill colour, which keeps the same reading and
 * measures 8.36:1. Flagged rather than silently chosen.
 */
function iconColours(fill: CtaFill) {
  const onOrange = fill === "solid" || fill === "glassLayer";
  return onOrange
    ? {
        fill: "#030917",        // backing shape: circle, notification card
        stroke: "#FB8A00",      // detail drawn ON that shape
        mark: "#030917",        // mark drawn straight onto the button
        ringStroke: "rgba(3,9,23,.55)",
      }
    : {
        fill: "#FB8A00",
        stroke: "#030917",
        mark: "#fcfbf8",
        ringStroke: "rgba(252,251,248,.62)",
      };
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
  const c = iconColours(fill);
  return (
    <a
      href={href}
      className={`${s.btn} ${FILL_CLASS[fill]} ${className ?? ""}`}
      /* The accessible name stays the RESTING label. Without this the name
         becomes both spans concatenated ("Explore Platform See it in action"),
         which is what the reference button does and is a defect, not a style. */
      aria-label={label}
      style={{
        "--icon-fill": c.fill,
        "--icon-stroke": c.stroke,
        "--icon-mark": c.mark,
      } as React.CSSProperties}
    >
      {CIRCLE_ICONS.includes(mechanic) && (
        <svg className={s.icon} viewBox="0 0 36 36" width="36" height="36"
             aria-hidden="true" focusable="false">
          <circle className={s.ring} cx="18" cy="18" r="15.25"
                  stroke={c.ringStroke} strokeWidth="1.5" />
          {mechanic === "check" && (
            /* pathLength=1 so dasharray/dashoffset do not depend on geometry. */
            <path className={s.check} d="M11.4 18.4 L15.9 22.9 L24.9 13.2"
                  pathLength={1} strokeWidth={checkStroke} />
          )}
          {mechanic === "pin" && (
            <>
              <path className={s.pin}
                    d="M18 8.4a6.1 6.1 0 0 1 6.1 6.1c0 4.4-6.1 11.1-6.1 11.1s-6.1-6.7-6.1-11.1A6.1 6.1 0 0 1 18 8.4z" />
              <circle className={s.pinHole} cx="18" cy="14.4" r="2.25" />
            </>
          )}
        </svg>
      )}

      {mechanic === "signal" && (
        <svg className={s.icon} viewBox="0 0 36 36" width="36" height="36"
             aria-hidden="true" focusable="false">
          <path className={`${s.arc} ${s.arc1}`} d="M13.4 25a4.6 4.6 0 0 1 9.2 0" />
          <path className={`${s.arc} ${s.arc2}`} d="M8.6 25a9.4 9.4 0 0 1 18.8 0" />
          <path className={`${s.arc} ${s.arc3}`} d="M3.8 25a14.2 14.2 0 0 1 28.4 0" />
          <circle className={s.signalCore} cx="18" cy="25" r="2.4" />
        </svg>
      )}

      {mechanic === "dots" && (
        <svg className={s.icon} viewBox="0 0 36 36" width="36" height="36"
             aria-hidden="true" focusable="false">
          <path className={s.link} d="M10.6 18 L25.4 18" pathLength={1} />
          <circle className={`${s.node} ${s.nodeA}`} cx="7" cy="18" r="3.2" />
          <circle className={`${s.node} ${s.nodeB}`} cx="29" cy="18" r="3.2" />
        </svg>
      )}

      {mechanic === "notify" && (
        <svg className={s.icon} viewBox="0 0 36 36" width="36" height="36"
             aria-hidden="true" focusable="false">
          <g className={s.notify}>
            <rect className={s.notifyCard} x="2.5" y="10" width="31" height="17" rx="5" />
            <rect className={s.notifyBar} x="7" y="15.2" width="15" height="2.4" rx="1.2" />
            <rect className={s.notifyBar} x="7" y="20" width="10" height="2.4" rx="1.2" />
            <circle className={s.notifyBadge} cx="27.6" cy="16.4" r="2.5" />
          </g>
        </svg>
      )}

      {SWAPS.includes(mechanic) ? (
        <span className={s.labels} aria-hidden="true">
          <span className={s.rest}>{label}</span>
          <span className={s.alt}>{altLabel ?? label}</span>
        </span>
      ) : (
        <span aria-hidden="true" style={{ zIndex: 1 }}>{label}</span>
      )}

      {ROUTES.includes(mechanic) && (
        /* preserveAspectRatio none stretches the path to the button's width;
           non-scaling-stroke keeps the line the same weight regardless, so a
           longer label cannot thin it out. */
        <svg className={s.route} viewBox="0 0 240 56" preserveAspectRatio="none"
             aria-hidden="true" focusable="false">
          {mechanic === "routeGroove" && (
            <>
              {/* Always present. This is the resting state, and the reason
                  E3 survives on touch where the others do not. */}
              <path className={s.groove} d={ROUTE_D} vectorEffect="non-scaling-stroke" />
              <path className={s.trail} d={ROUTE_D} pathLength={1}
                    vectorEffect="non-scaling-stroke" />
            </>
          )}
          {mechanic !== "routeGroove" && (
            <path
              className={`${s.routePath} ${mechanic === "routeLum" ? s.lumPath : s.inkPath}`}
              d={ROUTE_D} pathLength={1} vectorEffect="non-scaling-stroke"
            />
          )}
          <circle
            className={`${s.routeDot} ${mechanic === "routeLum" ? s.lumDot : s.inkDot}`}
            cx="0" cy="0" r={mechanic === "routeGroove" ? 3.1 : 2.8}
          />
        </svg>
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
