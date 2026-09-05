"use client";

import { useEffect, useRef } from "react";
import { CtaButton } from "@/components/ui/cta-button";
import { HERO_SCRIM } from "@/lib/hero-captions";

/**
 * Evaluation surface for the hero CTA.
 *
 * Uses the REAL video, the REAL hero scrim and the REAL tokens, so what is
 * measured here is what ships. Not a mock.
 */

export default function CtaLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seek = () => { v.currentTime = 0; };
    if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
  }, []);

  return (
    <main className="min-h-svh bg-[var(--paper)]">
      {/* ---- lift ladder, on paper where the cast shadow reads most ---- */}
      <section id="lift-ladder" className="px-10 py-8">
        <p className="label-mono mb-4">lift ladder — 3 / 4 / 5 / 6px (hover forced)</p>
        <div className="flex flex-wrap gap-8">
          {[3, 4, 5, 6].map((px) => (
            <div key={px} className="flex flex-col gap-2" data-lift={px}>
              <CtaButton href="#features" label="Explore Platform"
                         altLabel="See it in action" fill="solid" route
                         style={{ "--lift": `${px}px` } as React.CSSProperties} />
              <span className="label-mono">{px}px</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- over real footage ---------------------------------------- */}
      <section id="route-footage" className="relative h-[260px] overflow-hidden bg-surface-dark">
        <video
          ref={videoRef} id="lab-video" muted playsInline preload="auto" aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/video/saferide-hero-scrub.webm" type="video/webm" />
          <source src="/video/saferide-hero-scrub.mp4" type="video/mp4" />
        </video>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
             style={{ background: HERO_SCRIM }} />
        <div className="relative flex h-full flex-col justify-center px-10">
          <p className="label-mono mb-3" style={{ color: "var(--accent-warm)" }}>
            solid #FB8A00 + #B9551A edge · route line on hover
          </p>
          <div className="flex flex-wrap items-center gap-4" data-pair="E">
            <CtaButton href="#features" label="Explore Platform"
                       altLabel="See it in action" fill="solid" route />
            <CtaButton href="#story" label="Our Story"
                       altLabel="How we started" fill="outlineOnMedia" />
          </div>
        </div>
      </section>

      {/* ---- on paper -------------------------------------------------- */}
      <section id="route-paper" className="px-10 py-10">
        <p className="label-mono mb-3">on paper</p>
        <div className="flex flex-wrap items-center gap-4" data-pair="E">
          <CtaButton href="#features" label="Explore Platform"
                     altLabel="See it in action" fill="solid" route />
          <CtaButton href="#story" label="Our Story"
                     altLabel="How we started" fill="outlineInk" />
        </div>
      </section>
    </main>
  );
}
