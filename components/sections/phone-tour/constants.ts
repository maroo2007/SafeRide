/**
 * Numbers shared by the scene and the DOM around it.
 *
 * They live here rather than in scene.ts because phone-tour.tsx needs them at
 * module scope — for the fade curve and for placing the placeholder — and
 * importing them from scene.ts would pull `createScene` into the main bundle,
 * quietly undoing the dynamic split that keeps three.js and the loader out of
 * the initial download. three itself stays behind `await import("three")`
 * either way, but the gate's intent is that none of this module's code ships
 * until the hero has left.
 *
 * The alternative — typing the same values in both files — is how FADE_KNEE
 * and the crossing window drift apart, which is the failure these constants
 * exist to prevent.
 */

/**
 * Spec §7.1 as amended. A cap on the phone's PROJECTED BOX, not on a height
 * measured off an upright model.
 *
 * 620 was the old number and it was never what appeared: it solved the camera
 * distance from the model's world AABB taken at the raw glTF orientation,
 * which on this export is edge-on. Turned front-on the phone presents its
 * width to the lean and the lean folds that width into the height, and
 * perspective adds more on top because the near half of a spinning phone is
 * ~10% closer than the far half. Measured on the shipped build: solved for
 * 620, drew 652 at the centre and 664 at its worst, and clipped at both ends
 * because the descent handed out the difference as free room.
 *
 * So this now caps the thing that has to fit. It is deliberately the box
 * around the model rather than the drawn silhouette — a rounded phone does
 * not fill its own corners, so the phone on screen is about 4% shorter than
 * this number. Conservative in the safe direction, and cheap: a silhouette
 * measurement means reading pixels back off the GPU on every resize.
 *
 * The VALUE is chosen to leave the phone exactly the size it already was.
 * Spec §7.1's ceiling was approved from captures, and those captures showed a
 * 652px phone whatever the constant claimed.
 */
export const MAX_PHONE_PX = 693;

/**
 * How close the phone's projected box may come to the canvas edge, CSS px.
 *
 * Not decoration: the descent is solved to use every pixel the frame has
 * left, so without a margin the phone ends flush against the boundary and
 * "does not clip" and "is cut off by one pixel" become the same build.
 */
export const EDGE_MARGIN_PX = 12;

/** Spec §5.1. How far off centre each side sits, as a fraction of the
 *  visible width. The phone alternates between +/- this; the text takes the
 *  opposite side. */
export const PHONE_SIDE_X = 0.25;

/**
 * Below this the tour is a stacked list: no three.js, no WebGL context, and
 * the GLB is never requested.
 *
 * It lives here rather than in phone-tour.tsx because the LOAD SCREEN needs
 * the same number — it holds for the scene on desktop and for the hero alone
 * on mobile, and it can only know which by asking the same question the tour
 * asks. Two copies of 768 is how a load screen ends up waiting eight seconds
 * for a scene that was never going to be built.
 */
export const MOBILE_BREAKPOINT = 768;

/**
 * Spec §5.2a. How much of the room the fit found the descent actually uses.
 *
 * 1.0, and it has to be: the room is now SOLVED — a binary search for the
 * largest travel at which the phone's projected box still clears the frame's
 * margins at every pose it passes through — so anything under 1.0 is travel
 * deliberately left on the table. 195px at 1440x900.
 *
 * It used to multiply an arithmetic estimate of the free height, and that
 * estimate was 44px optimistic because the "phone height" it subtracted was
 * the height the layout asked for rather than the height it drew.
 */
export const DESCENT_USE = 1.0;

/** Spec §5.4: 8-12 degrees. */
export const LEAN_DEG = 10;

/**
 * The text fade's steepness, and the crossing window DERIVED from it.
 *
 * These two were coupled and only one was written down. The phone's
 * horizontal travel is invisible because it happens while no text is on
 * screen — not because any particular percentage is special. Typing "40%"
 * next to a fade curve that owns the real constraint is the SCRUB_RATE
 * mistake: move either one and the other silently stops protecting anything.
 *
 * vis = max(0, 1 - |sin(pi t)| * FADE_KNEE), so the text is at zero opacity
 * between DEAD0 and 1 - DEAD0. The crossing starts exactly when the outgoing
 * text has gone and finishes well before the incoming one arrives.
 *
 * Starting at 0 instead measured as a visible collision: at local 0.10 the
 * outgoing text is still at 0.32 opacity while an eased-from-zero phone is
 * already 58% across — 236px of overlap, measured by breaking it.
 */
/**
 * Renderer exposure. 1.6, not 1.
 *
 * The phone BODY is lit entirely by the environment and rendered dark; this
 * is the only brightness lever that reaches it without touching the screen,
 * because the screen material is toneMapped:false and therefore immune.
 * Measured: metal edge 109 -> 133, screen unchanged at rgb(250, 200, 140).
 */
export const EXPOSURE_DEFAULT = 1.6;

export const FADE_KNEE = 3.0;

/**
 * Spec §5.2a as amended. The MAX_PHONE_PX cap still wins on tall viewports.
 *
 * 0.80, and above ~0.77 at a 900px viewport this value does nothing at all:
 * `min(693, h * f)` clamps, so 0.77, 0.80 and 0.90 are the same phone. It is
 * set to 0.80 so the CAP is visibly the thing in control, and so a taller
 * viewport gets the cap rather than a fraction of itself.
 *
 * Chapter 2 is NOT the constraint people expect: at this size it is still
 * downsampling 1.6x against its 487px source, which would only begin
 * upsampling above a roughly 1040px phone. What binds is descent room — see
 * MAX_PHONE_PX, and spec §7.1 for the arithmetic of the trade.
 */
export const REST_FRACTION_DEFAULT = 0.80;

/**
 * How much of the fade's dead zone the crossing occupies.
 *
 * 0.85 at knee 3.0 gives 743px of crossing. Raising it is FREE: with the
 * knee held, 0.60 -> 0.75 -> 0.85 moved the crossing 533 -> 662 -> 743px
 * while dwell and legible scroll stayed identical (0.35 after one wheel
 * notch, 296px legible, in all three). knee owns the dwell; this does not
 * touch it. 1.0 is the ceiling — beyond it the crossing leaves the dead zone. A wider option (knee 4.0, fraction 0.80, 729px) was measured
 * and REFUSED: at that fade one wheel notch takes the copy from 1.00 to 0.13
 * opacity, which is a flicker rather than a shorter dwell. At 3.0 a notch
 * leaves it at 0.35.
 *
 * Measured with trusted wheel events at Chrome's 100px notch. A trackpad
 * scrolls finer and would feel smoother; the mouse-wheel case is the one that
 * breaks and the common one on this viewport.
 */
export const CROSS_FRACTION_DEFAULT = 0.85;

/**
 * The two knobs, read together.
 *
 * Crossing speed and phone size are ONE decision, not two: a bigger phone has
 * a wider projected box, which tightens the no-overlap constraint that the
 * crossing window exists to satisfy. Tuning either alone moves a limit the
 * other depends on.
 *
 * Query overrides exist so every candidate can be photographed and measured
 * from a single build rather than one build per option. Defaults are what
 * ships; `location` is guarded because this module is imported during SSR.
 */
export type Tuning = {
  knee: number;
  crossFraction: number;
  restFraction: number;
  /** How much of the free vertical room the descent uses. Independent of
   *  phone size, so it can recover descent a larger phone gives up. */
  descentUse: number;
  /** Renderer exposure. The screen is toneMapped:false so it is IMMUNE to
   *  this — which makes it the one brightness knob that cannot touch §4. */
  exposure: number;
  /** Multiplier on the environment's contribution to the body materials. */
  envIntensity: number;
  /** Camera field of view. SEPARATE from restFraction: the layout solves
   *  camera distance to hit a target pixel height, so a narrower fov at the
   *  same size flattens perspective rather than shrinking the phone. */
  fov: number;
  /** The projected-box cap itself. Above restFraction ~0.72 at a 900px
   *  viewport it is the cap, not the fraction, that decides the size. */
  maxPhonePx: number;
  /** Clearance kept between the phone's projected box and the canvas edge. */
  edgeMargin: number;
  /** Where the text reaches zero opacity, as a fraction of one transition. */
  dead0: number;
  crossStart: number;
  crossEnd: number;
};

export function readTuning(): Tuning {
  let knee = FADE_KNEE;
  let crossFraction = CROSS_FRACTION_DEFAULT;
  let restFraction = REST_FRACTION_DEFAULT;
  let descentUse = DESCENT_USE;
  let exposure = EXPOSURE_DEFAULT;
  let envIntensity = 1;
  let fov = 35;
  let maxPhonePx = MAX_PHONE_PX;
  let edgeMargin = EDGE_MARGIN_PX;
  if (typeof location !== "undefined") {
    const q = new URLSearchParams(location.search);
    const num = (k: string, d: number) => {
      const v = Number(q.get(k));
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    knee = num("knee", knee);
    crossFraction = num("crossFraction", crossFraction);
    restFraction = num("restFraction", restFraction);
    descentUse = num("descentUse", descentUse);
    exposure = num("exposure", exposure);
    envIntensity = num("envIntensity", envIntensity);
    fov = num("fov", fov);
    maxPhonePx = num("maxPhonePx", maxPhonePx);
    /* Zero is a legitimate margin to ask for — it is what a "does the guard
       actually catch a clip?" run needs — so this one accepts 0, which the
       shared `num` helper rejects along with the negatives. */
    const m = Number(q.get("margin"));
    if (Number.isFinite(m) && m >= 0 && q.has("margin")) edgeMargin = m;
  }
  const dead0 = Math.asin(Math.min(1, 1 / knee)) / Math.PI;
  return {
    knee, crossFraction, restFraction, descentUse, exposure, envIntensity, fov, maxPhonePx,
    edgeMargin, dead0,
    crossStart: dead0,
    crossEnd: dead0 + (1 - 2 * dead0) * crossFraction,
  };
}
