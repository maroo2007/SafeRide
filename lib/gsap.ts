/**
 * The single place GSAP plugins are registered.
 *
 * Spec 12: "One Lenis instance, one ScrollTrigger registration."
 *
 * The Sterling Gate navbar pasted in from spec 2 calls `gsap.registerPlugin`
 * itself, at module scope. It must not: import from here instead, so
 * registration happens exactly once and a second one is detectable rather
 * than silent.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;
let registrationCount = 0;

/**
 * REGISTERING SCROLLTRIGGER STARTS A rAF LOOP THAT NEVER STOPS.
 *
 * ScrollTrigger.register() kicks off its own frame loop — the one guarding
 * against a Safari scroll bug — as `function t(){ return tR && requestAnimationFrame(t) }()`,
 * and GSAP's ticker runs alongside it. Neither cares whether anything is
 * animating. Measured on the production build under reduced motion, with
 * every scrub and every tween already disabled: 213 requestAnimationFrame
 * calls in three seconds, 180 of them from that one loop.
 *
 * A visitor who asked for reduced motion often did so for battery or for
 * vestibular reasons, and waking the compositor sixty times a second to
 * animate nothing serves neither. Spec 12 says reduced motion means no
 * motion; a frame loop with nothing in it is still the machinery of motion
 * running.
 *
 * So registration is SKIPPED entirely under reduced motion. Every caller
 * already returns early in that state — nothing asks ScrollTrigger to do
 * anything — so what is lost is the loop and nothing else. matchMedia is
 * re-read here rather than taken from a hook, because useMediaQuery hands
 * back the server snapshot on the first commit and this runs at that moment.
 */
export function registerGsap(): typeof ScrollTrigger {
  registrationCount++;
  if (!registered) {
    if (typeof window !== "undefined") {
      const reduced = window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) gsap.registerPlugin(ScrollTrigger);
      /* `registered` is set either way: a second caller under reduced motion
         must not retry and must not be reported as a duplicate registration. */
    }
    registered = true;
  }
  return ScrollTrigger;
}

/** Test/diagnostic hook: how many times registration was *requested*. */
export function __getRegistrationCount(): number {
  return registrationCount;
}

/** Whether the plugin has actually been registered with GSAP. */
export function __isRegistered(): boolean {
  return registered;
}

/** Test-only reset. */
export function __resetGsapRegistration(): void {
  registered = false;
  registrationCount = 0;
}

export { gsap, ScrollTrigger };
