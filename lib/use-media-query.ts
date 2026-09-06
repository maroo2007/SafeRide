"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query is an external system; subscribing to it is the correct
 * primitive, not setState inside an effect.
 *
 * Extracted from the hero rather than copied into the phone tour. Two
 * identical hooks in two files is how the copy drifts, and the version that
 * gets it wrong is always the one that was pasted.
 *
 * ONE THING TO KNOW BEFORE YOU DEPEND ON IT: useSyncExternalStore returns the
 * SERVER snapshot on the first commit, so the first render of any effect that
 * reads this sees `false`, whatever the device actually is. That has already
 * cost this project once — a reduced-motion listener attached four times
 * before the real value arrived. If an effect must not run for a given media
 * state, re-read `window.matchMedia` inside it rather than trusting the value
 * it closed over.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}
