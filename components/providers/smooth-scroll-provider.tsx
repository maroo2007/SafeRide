"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getLenis,
  destroyLenis,
  startScroll,
  stopScroll,
  prefersReducedMotion,
  subscribeLenisReady,
  getLenisReadySnapshot,
  getLenisReadyServerSnapshot,
  subscribeReducedMotion,
  getReducedMotionServerSnapshot,
} from "@/lib/lenis";

type SmoothScrollValue = {
  /** True once the app-root instance exists (false on server + reduced motion). */
  ready: boolean;
  /** Reduced-motion users get no smooth scroll at all. */
  reducedMotion: boolean;
  stop: () => void;
  start: () => void;
};

const SmoothScrollContext = createContext<SmoothScrollValue | null>(null);

/**
 * Owns the app's only Lenis instance.
 *
 * Consumers must call `useSmoothScroll()` rather than constructing Lenis. The
 * spec 2 navbar ships code that news up its own instance; that code was
 * stripped when it was wired in, and anything pasted later must be too.
 *
 * State comes from useSyncExternalStore rather than setState-in-effect: Lenis
 * and matchMedia are external systems, and subscribing to them keeps the
 * reduced-motion preference live if the user changes it mid-session.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    getReducedMotionServerSnapshot,
  );

  const ready = useSyncExternalStore(
    subscribeLenisReady,
    getLenisReadySnapshot,
    getLenisReadyServerSnapshot,
  );

  useEffect(() => {
    if (!reducedMotion) getLenis();
    return () => destroyLenis();
  }, [reducedMotion]);

  const value = useMemo<SmoothScrollValue>(
    () => ({ ready, reducedMotion, stop: stopScroll, start: startScroll }),
    [ready, reducedMotion],
  );

  return (
    <SmoothScrollContext.Provider value={value}>
      {children}
    </SmoothScrollContext.Provider>
  );
}

export function useSmoothScroll(): SmoothScrollValue {
  const ctx = useContext(SmoothScrollContext);
  if (!ctx) {
    throw new Error(
      "useSmoothScroll must be used inside <SmoothScrollProvider>. " +
        "Do not create your own Lenis instance — see lib/lenis.ts.",
    );
  }
  return ctx;
}
