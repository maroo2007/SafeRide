"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap, registerGsap } from "@/lib/gsap";
import s from "./parallax-scrolling.module.css";

/**
 * Post-video parallax transition, adapted for SafeRide (spec §3).
 *
 * Ported from §3.1 verbatim except where §3.2/§3.3 require otherwise:
 *
 *   §3.3  `gsap.registerPlugin(ScrollTrigger)` is gone — one registration,
 *         centrally, through lib/gsap.ts, which counts them.
 *   §3.3  `new Lenis()`, its `scroll` handler, its ticker callback and its
 *         `destroy()` are gone. The app owns one instance
 *         (components/providers/smooth-scroll-provider.tsx) and a second one
 *         fights it for the same scroll. The component keeps only the
 *         ScrollTrigger timeline, which is what §3.3 asks for.
 *   §3.2A the three cdn.21st.dev Osmo demo images are replaced by local
 *         placeholders. The URLs appear nowhere in this file, including in
 *         comments.
 *   §3.2B no osmo-credits div, no Osmo logo.
 *   §3.2C the title is "Every step, accounted for" — §4.4's heading, existing
 *         site copy, not invented.
 *   §3.3  next/image with explicit dimensions and `priority`, so the layers
 *         reserve their space and are ready before the pin releases.
 *   §3.4  under prefers-reduced-motion the timeline is NEVER BUILT.
 *   §3.5  below 768px the timeline is never built either; the composition is
 *         static.
 *
 * The layer heights are part of the motion, not just the layout: yPercent is
 * a percentage of each element's OWN height, so a taller layer travels
 * further. See the module CSS for what the timeline forces and what it
 * leaves open.
 */

const MOBILE_BREAKPOINT = 768;

/**
 * Layer 3 is the title, not an image (§3.2). The other three are art on the
 * section's own ground — they are not the ground, which is exactly the
 * distinction the navbar panel got wrong.
 */
const LAYER_SRC = {
  1: "/images/parallax/layer-1.webp",
  2: "/images/parallax/layer-2.webp",
  4: "/images/parallax/layer-4.webp",
} as const;

/** Intrinsic size of the placeholder assets; see TODO.md for the real spec. */
const LAYER_W = 1920;
const LAYER_H = 1080;

export function ParallaxTransition() {
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = parallaxRef.current;
    if (!root) return;

    /*
     * §3.4 and §3.5: the timeline is not built at all — not built and then
     * disabled, and not built with a duration of zero. Read here rather than
     * through a subscribed hook because this effect runs once and a
     * useSyncExternalStore value is the SERVER snapshot on the first commit,
     * which would build the timeline for a reduced-motion visitor and only
     * then learn better.
     */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches) return;

    const ScrollTrigger = registerGsap();

    const ctx = gsap.context(() => {
      const triggerElement = root.querySelector("[data-parallax-layers]");
      if (!triggerElement) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerElement,
          start: "0% 0%",
          end: "100% 0%",
          scrub: 0,
        },
      });

      const layers = [
        { layer: "1", yPercent: 70 },
        { layer: "2", yPercent: 55 },
        { layer: "3", yPercent: 40 },
        { layer: "4", yPercent: 10 },
      ];

      layers.forEach((layerObj, idx) => {
        tl.to(
          triggerElement.querySelectorAll(`[data-parallax-layer="${layerObj.layer}"]`),
          { yPercent: layerObj.yPercent, ease: "none" },
          idx === 0 ? undefined : "<",
        );
      });

      // The hero's runway is 1200vh and this sits under it, so the trigger's
      // start position is only correct once the hero has laid out.
      ScrollTrigger.refresh();
    }, parallaxRef);

    return () => ctx.revert();
  }, []);

  return (
    <div data-parallax-root className={s.parallax} ref={parallaxRef}>
      <section className={s.header} aria-labelledby="parallax-title">
        <div className={s.visuals}>
          <div className={s.blackLineOverflow} aria-hidden="true" />
          <div data-parallax-layers className={s.layers}>
            <Image
              src={LAYER_SRC[1]}
              alt=""
              aria-hidden="true"
              width={LAYER_W}
              height={LAYER_H}
              priority
              data-parallax-layer="1"
              className={`${s.layerImg} ${s.layer1}`}
            />
            <Image
              src={LAYER_SRC[2]}
              alt=""
              aria-hidden="true"
              width={LAYER_W}
              height={LAYER_H}
              priority
              data-parallax-layer="2"
              className={`${s.layerImg} ${s.layer2}`}
            />
            <div data-parallax-layer="3" className={s.layerTitle}>
              <h2 id="parallax-title" className={s.title}>
                Every step, accounted for
              </h2>
            </div>
            <Image
              src={LAYER_SRC[4]}
              alt=""
              aria-hidden="true"
              width={LAYER_W}
              height={LAYER_H}
              priority
              data-parallax-layer="4"
              className={`${s.layerImg} ${s.layer4}`}
            />
          </div>
          <div data-parallax-fade className={s.fade} aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
