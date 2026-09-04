"use client";

import { useEffect, useRef } from "react";
import { CtaButton, type CtaFill, type CtaMechanic } from "@/components/ui/cta-button";
import { HERO_SCRIM } from "@/lib/hero-captions";

/**
 * Evaluation surface for the CTA variants.
 *
 * Deliberately uses the REAL video, the REAL hero scrim and the REAL tokens,
 * so what is measured here is what ships. Not a mock.
 */

const MECHANICS: { id: CtaMechanic; name: string }[] = [
  { id: "check", name: "A — checkmark draws + label swap" },
  { id: "label", name: "B — label swap only" },
  { id: "arrow", name: "C — arrow sweep" },
];

/** G1 solid primary + glass secondary; G2 sheen over opaque; G3 glass both. */
const GLASS: { id: string; name: string; primary: CtaFill; secondary: CtaFill }[] = [
  { id: "G1", name: "G1 — glass on secondary only", primary: "solid", secondary: "glassTrue" },
  // G2 is a claim about the PRIMARY's fill. Its secondary is the same glass as
  // G1's, so G1 and G2 differ in exactly one thing and the comparison is fair.
  { id: "G2", name: "G2 — glass layer over opaque fill", primary: "glassLayer", secondary: "glassTrue" },
  { id: "G3", name: "G3 — true glass on both", primary: "glassTrue", secondary: "glassTrue" },
];

function Pair({ m, g }: { m: CtaMechanic; g: (typeof GLASS)[number] }) {
  return (
    <div className="flex flex-wrap items-center gap-4" data-pair={`${g.id}-${m}`}>
      <CtaButton
        href="#features" label="Explore Platform" altLabel="See it in action"
        mechanic={m} fill={g.primary}
      />
      <CtaButton
        href="#story" label="Our Story" altLabel="How we started"
        mechanic={m} fill={g.secondary}
      />
    </div>
  );
}

export default function CtaLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Park the film on a frame the CTAs actually have to survive. Driven from
  // the capture script too, so one page serves every frame under test.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seek = () => { v.currentTime = 0; };
    if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
  }, []);

  return (
    <main className="min-h-svh bg-[var(--paper)]">
      {/* ---- 1. checkmark stroke weight, at ACTUAL 36px ---------------- */}
      <section id="stroke-test" className="px-10 py-10">
        <h2 className="label-mono mb-6">Checkmark at actual 36px — stroke weight ladder</h2>
        <div className="flex flex-wrap gap-10">
          {[2, 2.5, 2.75, 3, 3.5].map((w) => (
            <div key={w} className="flex flex-col items-center gap-3" data-stroke={w}>
              <div className="flex gap-3">
                {/* drawn, on ink circle (primary case) */}
                <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15.25" fill="#030917" />
                  <path d="M11.4 18.4 L15.9 22.9 L24.9 13.2" fill="none" stroke="#FB8A00"
                        strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {/* drawn, on orange circle (secondary case) */}
                <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15.25" fill="#FB8A00" />
                  <path d="M11.4 18.4 L15.9 22.9 L24.9 13.2" fill="none" stroke="#030917"
                        strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {/* resting outline */}
                <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15.25" fill="none" stroke="rgba(3,9,23,.55)" strokeWidth="1.5" />
                </svg>
              </div>
              <span className="label-mono">{w}</span>
            </div>
          ))}
        </div>

        <h2 className="label-mono mb-4 mt-10">Mid-draw — dashoffset 1.00 / 0.75 / 0.50 / 0.25 / 0</h2>
        <div className="flex gap-3" data-middraw>
          {[1, 0.75, 0.5, 0.25, 0].map((o) => (
            <svg key={o} viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.25" fill="#030917" />
              <path d="M11.4 18.4 L15.9 22.9 L24.9 13.2" fill="none" stroke="#FB8A00"
                    strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"
                    pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: o }} />
            </svg>
          ))}
        </div>
      </section>

      {/* ---- 2. over real footage -------------------------------------- */}
      <section id="over-footage" className="relative h-[720px] overflow-hidden bg-surface-dark">
        <video
          ref={videoRef} id="lab-video" muted playsInline preload="auto" aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/video/saferide-hero-scrub.webm" type="video/webm" />
          <source src="/video/saferide-hero-scrub.mp4" type="video/mp4" />
        </video>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
             style={{ background: HERO_SCRIM }} />
        <div className="relative flex h-full flex-col justify-center gap-7 px-10">
          {GLASS.map((g) => (
            <div key={g.id} data-row={g.id}>
              <p className="label-mono mb-3" style={{ color: "var(--accent-warm)" }}>{g.name}</p>
              <div className="flex flex-wrap gap-8">
                {MECHANICS.map((m) => <Pair key={m.id} m={m.id} g={g} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- 3. on paper ----------------------------------------------- */}
      <section id="on-paper" className="px-10 py-12">
        {GLASS.map((g) => (
          <div key={g.id} className="mb-9" data-paper-row={g.id}>
            <p className="label-mono mb-3">{g.name}</p>
            <div className="flex flex-wrap gap-8">
              {MECHANICS.map((m) => <Pair key={m.id} m={m.id} g={g} />)}
            </div>
          </div>
        ))}
        <div className="mb-2" data-paper-row="reference">
          <p className="label-mono mb-3">reference — current shipping pair</p>
          <div className="flex flex-wrap items-center gap-4">
            <CtaButton href="#features" label="Explore Platform" mechanic="arrow" fill="solid" />
            <CtaButton href="#story" label="Our Story" mechanic="arrow" fill="outlineInk" />
          </div>
        </div>
      </section>
    </main>
  );
}
