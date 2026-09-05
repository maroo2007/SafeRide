"use client";

import { useEffect, useRef } from "react";
import { CtaButton, type CtaBehaviour, type CtaFill } from "@/components/ui/cta-button";
import { HERO_SCRIM } from "@/lib/hero-captions";

/**
 * Side-by-side comparison surface for the two CTA candidates.
 *
 * Uses the REAL video, the REAL hero scrim and the REAL tokens, so what is
 * measured here is what ships. Not a mock.
 */

const CANDIDATES: { id: string; name: string; behaviour: CtaBehaviour }[] = [
  { id: "B1", name: "Button 1 — lift and press", behaviour: "lift" },
  { id: "R2a", name: "Button 2 R2a — expanding fill inverts to #B9551A", behaviour: "invert" },
  { id: "R2b", name: "Button 2 R2b — expanding fill stays in the orange family", behaviour: "sheen" },
];

function Row({ c, secondary }: { c: (typeof CANDIDATES)[number]; secondary: CtaFill }) {
  return (
    <div data-row={c.id}>
      <p className="label-mono mb-2" style={{ opacity: 0.85 }}>{c.name}</p>
      <div className="flex flex-wrap items-center gap-4" data-pair={c.id}>
        <CtaButton href="#features" label="Explore Platform" altLabel="See it in action"
                   fill="solid" route behaviour={c.behaviour} />
        <CtaButton href="#story" label="Our Story" altLabel="How we started"
                   fill={secondary} behaviour={c.behaviour} />
      </div>
    </div>
  );
}

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
      {/* ---- over real footage ---------------------------------------- */}
      <section id="route-footage" className="relative h-[400px] overflow-hidden bg-surface-dark">
        <video
          ref={videoRef} id="lab-video" muted playsInline preload="auto" aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/video/saferide-hero-scrub.webm" type="video/webm" />
          <source src="/video/saferide-hero-scrub.mp4" type="video/mp4" />
        </video>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
             style={{ background: HERO_SCRIM }} />
        <div className="relative flex h-full flex-col justify-center gap-6 px-10">
          {CANDIDATES.map((c) => <Row key={c.id} c={c} secondary="outlineOnMedia" />)}
        </div>
      </section>

      {/* ---- on paper -------------------------------------------------- */}
      <section id="route-paper" className="flex flex-col gap-7 px-10 py-10">
        {CANDIDATES.map((c) => <Row key={c.id} c={c} secondary="outlineInk" />)}
      </section>
    </main>
  );
}
