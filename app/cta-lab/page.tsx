"use client";

import { useEffect, useRef } from "react";
import { CtaButton, type CtaFill, type CtaMechanic } from "@/components/ui/cta-button";
import { HERO_SCRIM } from "@/lib/hero-captions";

/**
 * Evaluation surface for the route-line CTA.
 *
 * Uses the REAL video, the REAL hero scrim and the REAL tokens, so what is
 * measured here is what ships. Not a mock.
 */

type Row = {
  id: string;
  name: string;
  mechanic: CtaMechanic;
  primary: CtaFill;
  /** Glass on paper measures 1.02:1, so paper gets the ink outline instead. */
  secondaryOnDark: CtaFill;
  secondaryOnPaper: CtaFill;
};

const ROWS: Row[] = [
  {
    id: "E1", name: "E1 — true glass surface, luminous line",
    mechanic: "routeLum", primary: "glassTrue",
    secondaryOnDark: "glassQuiet", secondaryOnPaper: "glassQuiet",
  },
  {
    id: "E2", name: "E2 — glass layer over solid fill, ink line",
    mechanic: "routeInk", primary: "glassLayer",
    secondaryOnDark: "glassQuiet", secondaryOnPaper: "outlineInk",
  },
  {
    id: "E3", name: "E3 — frosted track over solid fill (groove visible at rest)",
    mechanic: "routeGroove", primary: "glassLayer",
    secondaryOnDark: "glassQuiet", secondaryOnPaper: "outlineInk",
  },
  {
    id: "E3g", name: "E3g — the same groove on a TRUE glass surface",
    mechanic: "routeGroove", primary: "glassTrue",
    secondaryOnDark: "glassQuiet", secondaryOnPaper: "glassQuiet",
  },
];

function Pair({ r, onPaper }: { r: Row; onPaper: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-4" data-pair={`${r.id}`}>
      <CtaButton href="#features" label="Explore Platform" altLabel="See it in action"
                 mechanic={r.mechanic} fill={r.primary} />
      <CtaButton href="#story" label="Our Story" altLabel="How we started"
                 mechanic={r.mechanic}
                 fill={onPaper ? r.secondaryOnPaper : r.secondaryOnDark} />
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
      <section id="route-footage" className="relative h-[520px] overflow-hidden bg-surface-dark">
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
          {ROWS.map((r) => (
            <div key={r.id} data-row={r.id}>
              <p className="label-mono mb-2" style={{ color: "var(--accent-warm)" }}>{r.name}</p>
              <Pair r={r} onPaper={false} />
            </div>
          ))}
        </div>
      </section>

      {/* ---- on paper -------------------------------------------------- */}
      <section id="route-paper" className="px-10 py-10">
        {ROWS.map((r) => (
          <div key={r.id} className="mb-7" data-paper-row={r.id}>
            <p className="label-mono mb-2">{r.name}</p>
            <Pair r={r} onPaper />
          </div>
        ))}
      </section>
    </main>
  );
}
