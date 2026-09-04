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

/** Icon treatments for the hero PRIMARY, with their motion budgets. */
const ICONS: { id: CtaMechanic; tag: string; ms: number }[] = [
  { id: "check", tag: "A · checkmark", ms: 310 },
  { id: "pin", tag: "D · location pin", ms: 330 },
  { id: "route", tag: "E · route line", ms: 300 },
  { id: "notify", tag: "F · notification", ms: 300 },
  { id: "signal", tag: "G · signal", ms: 340 },
  { id: "dots", tag: "H · two dots", ms: 360 },
];

/** G1 solid primary + glass secondary; G2 sheen over opaque; G3 glass both. */
const GLASS: { id: string; name: string; primary: CtaFill; secondary: CtaFill }[] = [
  { id: "G1", name: "G1 — glass on secondary only", primary: "solid", secondary: "glassTrue" },
  // G2 is a claim about the PRIMARY's fill. Its secondary is the same glass as
  // G1's, so G1 and G2 differ in exactly one thing and the comparison is fair.
  { id: "G2", name: "G2 — glass layer over opaque fill", primary: "glassLayer", secondary: "glassTrue" },
  { id: "G3", name: "G3 — true glass on both", primary: "glassTrue", secondary: "glassTrue" },
];

/** The resolved primary fill, so the icon comparison sits on the real button. */
const PRIMARY: CtaFill = "glassLayer";

function IconRow({ fill }: { fill: CtaFill }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-8">
      {ICONS.map((i) => (
        <div key={i.id} className="flex flex-col gap-2" data-icon={i.id}>
          <CtaButton
            href="#features" label="Explore Platform" altLabel="See it in action"
            mechanic={i.id} fill={fill}
          />
          <span className="label-mono" style={{ opacity: 0.72 }}>{i.tag} · {i.ms}ms</span>
        </div>
      ))}
    </div>
  );
}

/** Static specimens at ACTUAL 36px — resting and settled, no animation. */
function Specimen({ id, settled }: { id: CtaMechanic; settled: boolean }) {
  const ink = "#030917", accent = "#FB8A00";
  const o = settled ? 1 : 0;
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
      {(id === "check" || id === "pin") && (
        <circle cx="18" cy="18" r="15.25" fill={settled ? ink : "transparent"}
                stroke="rgba(3,9,23,.55)" strokeWidth="1.5" />
      )}
      {id === "check" && (
        <path d="M11.4 18.4 L15.9 22.9 L24.9 13.2" fill="none" stroke={accent}
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - o }} />
      )}
      {id === "pin" && (
        <g opacity={o}>
          <path d="M18 8.4a6.1 6.1 0 0 1 6.1 6.1c0 4.4-6.1 11.1-6.1 11.1s-6.1-6.7-6.1-11.1A6.1 6.1 0 0 1 18 8.4z" fill={accent} />
          <circle cx="18" cy="14.4" r="2.25" fill={ink} />
        </g>
      )}
      {id === "signal" && (
        <g opacity={o}>
          <path d="M13.4 25a4.6 4.6 0 0 1 9.2 0" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M8.6 25a9.4 9.4 0 0 1 18.8 0" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M3.8 25a14.2 14.2 0 0 1 28.4 0" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="18" cy="25" r="2.4" fill={ink} />
        </g>
      )}
      {id === "dots" && (
        <g>
          <path d="M10.6 18 L25.4 18" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round"
                pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - o }} />
          <circle cx="7" cy="18" r="3.2" fill={ink} />
          <circle cx="29" cy="18" r="3.2" fill={ink} />
        </g>
      )}
      {id === "notify" && (
        <g opacity={o}>
          <rect x="2.5" y="10" width="31" height="17" rx="5" fill={ink} />
          <rect x="7" y="15.2" width="15" height="2.4" rx="1.2" fill={accent} />
          <rect x="7" y="20" width="10" height="2.4" rx="1.2" fill={accent} />
          <circle cx="27.6" cy="16.4" r="2.5" fill={accent} />
        </g>
      )}
      {id === "route" && (
        <g>
          <path d="M2 24 C 10 14, 26 30, 34 20" fill="none" stroke={ink} strokeWidth="1.5"
                strokeLinecap="round" pathLength={1}
                style={{ strokeDasharray: 1, strokeDashoffset: 1 - o }} />
          <circle cx={settled ? 34 : 2} cy={settled ? 20 : 24} r="2.6" fill={ink} opacity={o} />
        </g>
      )}
    </svg>
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
      {/* ---- 1. every icon at ACTUAL 36px ------------------------------ */}
      <section id="icons-36" className="px-10 py-9">
        <h2 className="label-mono mb-5">Every icon at actual 36px — resting, then settled</h2>
        <div className="flex flex-wrap gap-9">
          {ICONS.map((i) => (
            <div key={i.id} className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <Specimen id={i.id} settled={false} />
                <Specimen id={i.id} settled />
              </div>
              <span className="label-mono">{i.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- 2. icons on the real primary, over footage ---------------- */}
      <section id="icon-footage" className="relative h-[380px] overflow-hidden bg-surface-dark">
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
          <IconRow fill={PRIMARY} />
        </div>
      </section>

      {/* ---- 3. same icons on paper ------------------------------------ */}
      <section id="icon-paper" className="px-10 py-9">
        <IconRow fill={PRIMARY} />
      </section>

      {/* ---- 4. glass comparison, kept for the record ------------------ */}
      <section id="over-footage" className="relative h-[560px] overflow-hidden bg-surface-dark">
        <video muted playsInline preload="auto" aria-hidden="true"
               className="absolute inset-0 h-full w-full object-cover">
          <source src="/video/saferide-hero-scrub.webm" type="video/webm" />
          <source src="/video/saferide-hero-scrub.mp4" type="video/mp4" />
        </video>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
             style={{ background: HERO_SCRIM }} />
        <div className="relative flex h-full flex-col justify-center gap-7 px-10">
          {GLASS.map((g) => (
            <div key={g.id} data-row={g.id}>
              <p className="label-mono mb-3" style={{ color: "var(--accent-warm)" }}>{g.name}</p>
              <div className="flex flex-wrap items-center gap-4" data-pair={`${g.id}-check`}>
                <CtaButton href="#features" label="Explore Platform" altLabel="See it in action"
                           mechanic="check" fill={g.primary} />
                <CtaButton href="#story" label="Our Story" altLabel="How we started"
                           mechanic="check" fill={g.secondary} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="on-paper" className="px-10 py-12">
        {GLASS.map((g) => (
          <div key={g.id} className="mb-9" data-paper-row={g.id}>
            <p className="label-mono mb-3">{g.name}</p>
            <div className="flex flex-wrap items-center gap-4" data-pair={`${g.id}-check`}>
              <CtaButton href="#features" label="Explore Platform" altLabel="See it in action"
                         mechanic="check" fill={g.primary} />
              <CtaButton href="#story" label="Our Story" altLabel="How we started"
                         mechanic="check" fill={g.secondary} />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
