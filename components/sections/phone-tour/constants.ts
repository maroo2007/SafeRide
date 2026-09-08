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
export const FADE_KNEE = 2.2;
const DEAD0 = Math.asin(1 / FADE_KNEE) / Math.PI;
export const CROSS_START = DEAD0;
export const CROSS_END = DEAD0 + (1 - 2 * DEAD0) * 0.35;
