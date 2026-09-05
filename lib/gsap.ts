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

export function registerGsap(): typeof ScrollTrigger {
  registrationCount++;
  if (!registered) {
    if (typeof window !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
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
