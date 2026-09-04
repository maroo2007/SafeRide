/**
 * Single-instance Lenis owner.
 *
 * Spec 12: "One Lenis instance, one ScrollTrigger registration. Both pasted
 * components create their own. Refactor to a single app-root provider before
 * wiring either of them, or the scroll will break."
 *
 * The module owns the instance rather than a React component so that a
 * double-invoked effect (StrictMode) or a second provider mounted by mistake
 * cannot produce two instances fighting over the same scroll.
 */
import Lenis from "lenis";
import { gsap, registerGsap } from "./gsap";

type LenisInstance = InstanceType<typeof Lenis>;

let instance: LenisInstance | null = null;
let createdCount = 0;
let tickerFn: ((time: number) => void) | null = null;
let stopDepth = 0;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---- external stores, so React can subscribe without setState-in-effect ---- */

const readyListeners = new Set<() => void>();

function emitReady(): void {
  for (const l of readyListeners) l();
}

export function subscribeLenisReady(cb: () => void): () => void {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

export function getLenisReadySnapshot(): boolean {
  return instance !== null;
}

export function getLenisReadyServerSnapshot(): boolean {
  return false;
}

export function subscribeReducedMotion(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

export function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * Get the app's Lenis instance, creating it on first call.
 * Returns null on the server and under reduced motion, where smooth scrolling
 * must not run at all (spec 12: reduced motion means no motion).
 */
export function getLenis(): LenisInstance | null {
  if (typeof window === "undefined") return null;
  if (prefersReducedMotion()) return null;
  if (instance) return instance;

  const ScrollTrigger = registerGsap();

  instance = new Lenis({ duration: 1.2, smoothWheel: true });
  createdCount++;

  instance.on("scroll", ScrollTrigger.update);
  tickerFn = (time: number) => {
    instance?.raf(time * 1000);
  };
  gsap.ticker.add(tickerFn);
  gsap.ticker.lagSmoothing(0);

  emitReady();
  return instance;
}

/**
 * Pause scrolling. Reference-counted, so two overlapping owners (e.g. the menu
 * and a modal) cannot have the inner one resume scrolling while the outer is
 * still open.
 */
export function stopScroll(): void {
  stopDepth++;
  if (stopDepth === 1) getLenis()?.stop();
}

export function startScroll(): void {
  if (stopDepth === 0) return;
  stopDepth--;
  if (stopDepth === 0) getLenis()?.start();
}

export function isScrollStopped(): boolean {
  return stopDepth > 0;
}

export function destroyLenis(): void {
  if (tickerFn) {
    gsap.ticker.remove(tickerFn);
    tickerFn = null;
  }
  instance?.destroy();
  instance = null;
  stopDepth = 0;
  emitReady();
}

/** Test/diagnostic hook: how many Lenis instances have actually been created. */
export function __getCreatedCount(): number {
  return createdCount;
}

export function __resetLenisForTest(): void {
  destroyLenis();
  createdCount = 0;
}
