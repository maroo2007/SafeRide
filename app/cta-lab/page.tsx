"use client";

import { useEffect, useRef } from "react";
import { CtaButton, type CtaFill, type RoutePlacement } from "@/components/ui/cta-button";
import { HERO_SCRIM } from "@/lib/hero-captions";

/**
 * Evaluation surface for the locked lift-and-press CTA.
 *
 * Uses the REAL video, the REAL hero scrim and the REAL tokens, so what is
 * measured here is what ships. Not a mock.
 *
 * Labels are the live site's, verbatim. The hover-swap copy was mine and is
 * not in use — see CtaButton's altLabel.
 */

const ROUTES: { id: string; name: string; route: RoutePlacement }[] = [
  { id: "below", name: "route below the baseline", route: "below" },
  { id: "top", name: "route along the top edge", route: "top" },
  { id: "none", name: "no route line", route: "none" },
];

function Row({
  id, name, route, secondary,
}: { id: string; name: string; route: RoutePlacement; secondary: CtaFill }) {
  return (
    <div data-row={id}>
      <p className="label-mono mb-2" style={{ opacity: 0.85 }}>{name}</p>
      <div className="flex flex-wrap items-center gap-4" data-pair={id}>
        <CtaButton href="#features" label="Explore Platform" fill="solid" route={route} />
        <CtaButton href="#story" label="Our Story" fill={secondary} />
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
          <source src="/video/saferide-hero.webm" type="video/webm" />
          <source src="/video/saferide-hero.mp4" type="video/mp4" />
        </video>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
             style={{ background: HERO_SCRIM }} />
        <div className="relative flex h-full flex-col justify-center gap-6 px-10">
          {ROUTES.map((r) => (
            <Row key={r.id} {...r} secondary="outlineOnMediaBorder" />
          ))}
        </div>
      </section>

      {/* ---- on paper -------------------------------------------------- */}
      <section id="route-paper" className="flex flex-col gap-7 px-10 py-9">
        {ROUTES.map((r) => (
          <Row key={r.id} {...r} secondary="outlineInkBorder" />
        ))}
      </section>

      {/* ---- secondary hover: filled vs border-only -------------------- */}
      <section id="secondary" className="flex flex-col gap-7 border-t border-border px-10 py-9">
        <div data-row="sec-fill">
          <p className="label-mono mb-2">secondary A — fills faintly on hover</p>
          <div className="flex flex-wrap items-center gap-4" data-pair="sec-fill">
            <CtaButton href="#features" label="Explore Platform" fill="solid" route="below" />
            <CtaButton href="#story" label="Our Story" fill="outlineInk" />
          </div>
        </div>
        <div data-row="sec-border">
          <p className="label-mono mb-2">secondary B — stays empty, border deepens</p>
          <div className="flex flex-wrap items-center gap-4" data-pair="sec-border">
            <CtaButton href="#features" label="Explore Platform" fill="solid" route="below" />
            <CtaButton href="#story" label="Our Story" fill="outlineInkBorder" />
          </div>
        </div>
      </section>
    </main>
  );
}
