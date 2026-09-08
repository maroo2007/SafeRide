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

/** Spec §7.1 as amended: at most 620 CSS px tall, whatever the viewport. */
export const MAX_PHONE_PX = 620;

/** Spec §5.2a. The cap above still wins on tall viewports; this is what
 *  leaves room underneath it for the phone to descend through the frame. */
export const REST_FRACTION = 0.46;

/** Spec §5.1. How far off centre each side sits, as a fraction of the
 *  visible width. The phone alternates between +/- this; the text takes the
 *  opposite side. */
export const PHONE_SIDE_X = 0.25;

/** Spec §5.2a. How much of the free vertical room the descent uses. 1 would
 *  put the phone flush against both edges at the extremes. */
export const DESCENT_USE = 0.86;

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
export const FADE_KNEE = 3.0;

/**
 * Spec §5.2a as amended. The 620px cap still wins on tall viewports.
 *
 * 0.60, up from 0.46, because the app's own text was hard to read. Chapter 2
 * is NOT the constraint people expect: at 0.60 the phone is still downsampling
 * 4.29x, and its 487px source would only begin upsampling above a ~1043px
 * phone, far past the cap. What binds is descent room.
 *
 * That costs descent: 310px total, 155px per transition against a 540px
 * phone — 29% of its own height, where 0.46 gave 50%. Below the 342px once
 * called "a drift", and the threshold is retired rather than ignored: it was
 * set when the descent was the ONLY motion and had to replace 720px of lost
 * horizontal traverse. The phone now does both, so a number that assumed
 * otherwise does not transfer.
 */
export const REST_FRACTION_DEFAULT = 0.60;

/**
 * How much of the fade's dead zone the crossing occupies.
 *
 * 0.60 with a knee of 3.0 gives 533px of crossing against 297px before —
 * 1.8x slower. A wider option (knee 4.0, fraction 0.80, 729px) was measured
 * and REFUSED: at that fade one wheel notch takes the copy from 1.00 to 0.13
 * opacity, which is a flicker rather than a shorter dwell. At 3.0 a notch
 * leaves it at 0.35.
 *
 * Measured with trusted wheel events at Chrome's 100px notch. A trackpad
 * scrolls finer and would feel smoother; the mouse-wheel case is the one that
 * breaks and the common one on this viewport.
 */
export const CROSS_FRACTION_DEFAULT = 0.60;

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
  let exposure = 1;
  let envIntensity = 1;
  let fov = 35;
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
  }
  const dead0 = Math.asin(Math.min(1, 1 / knee)) / Math.PI;
  return {
    knee, crossFraction, restFraction, descentUse, exposure, envIntensity, fov, dead0,
    crossStart: dead0,
    crossEnd: dead0 + (1 - 2 * dead0) * crossFraction,
  };
}
