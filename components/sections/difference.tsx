"use client";

import { useEffect, useRef } from "react";
import { BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.6 The Difference — six contrasts as cards, not a two-column table.
 *
 * ── Why the table went ────────────────────────────────────────────────────
 *
 * A comparison table is the right shape for numbers you want to scan down a
 * column. These are six independent pairs, and nobody reads "no live
 * location, manual logbooks, delayed communication" as a column worth
 * scanning — the pairing is the content, so each pair gets its own card and
 * the contrast is stated inside it.
 *
 * ── The panels are shapes, not icons ──────────────────────────────────────
 *
 * Each visual is a small abstract statement of the same contrast the words
 * make: a route with a live dot against a broken dashed line, a filled
 * checklist against an empty one, one tap against a queue. Drawn here rather
 * than pulled from an icon set, because an icon set would bring its own line
 * weight, its own corner radius and its own metaphors, and six of them side
 * by side would not agree with each other. All six share a 1.5 stroke, round
 * caps, and the same left-is-SafeRide, right-is-traditional reading.
 *
 * They are aria-hidden. Every one of them is a picture of the sentence
 * directly underneath it, and announcing "graphic" six times adds nothing.
 *
 * ── The contrast is prefixed, not implied ─────────────────────────────────
 *
 * "Instead of manual logbooks" rather than "Manual logbooks" on its own. The
 * table carried that meaning in its column header; a card has no column, so
 * the sentence has to say it.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

/** One stroke weight, one cap style, one colour source, for all six. */
const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* Each panel is 120x64: a wide, shallow band, so the two halves sit side by
   side and read as a comparison rather than as a stack. */
const VB = "0 0 120 64";

function Tracking() {
  return (
    <svg viewBox={VB} {...S} aria-hidden="true" className="dc-art">
      {/* live: a continuous route with a dot on it */}
      <path d="M6 46c10-22 22 8 30-10s16 4 20-12" />
      <circle cx="46" cy="26" r="4.5" fill="currentColor" stroke="none" />
      <circle cx="46" cy="26" r="9" opacity="0.35" />
      {/* traditional: the same journey, broken */}
      <path d="M70 46c10-22 22 8 30-10s10 2 14-8" strokeDasharray="4 7" opacity="0.45" />
    </svg>
  );
}

function Attendance() {
  return (
    <svg viewBox={VB} {...S} aria-hidden="true" className="dc-art">
      {/* verified: three rows, each ticked */}
      {[16, 32, 48].map((y) => (
        <g key={y}>
          <path d="M6 0h14" transform={`translate(0 ${y})`} />
          <path d="M26 0l4 4 6-8" transform={`translate(0 ${y})`} />
        </g>
      ))}
      {/* manual: the same three rows, nothing entered */}
      {[16, 32, 48].map((y) => (
        <g key={y} opacity="0.45">
          <path d="M70 0h14" transform={`translate(0 ${y})`} />
          <rect x="90" y={y - 5} width="10" height="10" rx="2" />
        </g>
      ))}
    </svg>
  );
}

function Notifications() {
  return (
    <svg viewBox={VB} {...S} aria-hidden="true" className="dc-art">
      {/* instant: one source, arcs going out */}
      <circle cx="20" cy="32" r="4" fill="currentColor" stroke="none" />
      <path d="M29 22a13 13 0 0 1 0 20" />
      <path d="M36 15a22 22 0 0 1 0 34" />
      {/* delayed: a queue waiting */}
      <g opacity="0.45">
        <rect x="70" y="18" width="30" height="8" rx="4" />
        <rect x="70" y="30" width="22" height="8" rx="4" />
        <rect x="70" y="42" width="26" height="8" rx="4" />
      </g>
    </svg>
  );
}

function Emergency() {
  return (
    <svg viewBox={VB} {...S} aria-hidden="true" className="dc-art">
      {/* one tap */}
      <circle cx="22" cy="32" r="10" fill="currentColor" stroke="none" />
      <circle cx="22" cy="32" r="17" opacity="0.35" />
      {/* slow: a chain of hops */}
      <g opacity="0.45">
        <circle cx="70" cy="32" r="4" />
        <path d="M76 32h8" />
        <circle cx="90" cy="32" r="4" />
        <path d="M96 32h8" />
        <circle cx="110" cy="32" r="4" />
      </g>
    </svg>
  );
}

function Detection() {
  return (
    <svg viewBox={VB} {...S} aria-hidden="true" className="dc-art">
      {/* detected: a frame with something marked inside it */}
      <rect x="6" y="12" width="44" height="40" rx="3" />
      <rect x="18" y="24" width="20" height="16" rx="2" fill="currentColor" stroke="none" opacity="0.85" />
      {/* no visibility: the same frame, empty */}
      <rect x="70" y="12" width="44" height="40" rx="3" opacity="0.45" />
      <path d="M84 40l16-16" opacity="0.45" />
      <path d="M100 40L84 24" opacity="0.45" />
    </svg>
  );
}

function Reports() {
  return (
    <svg viewBox={VB} {...S} aria-hidden="true" className="dc-art">
      {/* automated: a chart that draws itself */}
      <path d="M8 52V34M20 52V22M32 52V40M44 52V28" strokeWidth="4" />
      <path d="M6 52h44" />
      {/* paper: a sheet of ruled lines */}
      <g opacity="0.45">
        <rect x="72" y="10" width="34" height="44" rx="2" />
        <path d="M79 22h20M79 30h20M79 38h14" />
      </g>
    </svg>
  );
}

type Item = { ours: string; theirs: string; Art: () => React.JSX.Element };

const ITEMS: Item[] = [
  { ours: "Live GPS tracking, every trip", theirs: "no live location", Art: Tracking },
  { ours: "AI-verified attendance", theirs: "manual logbooks", Art: Attendance },
  { ours: "Instant parent notifications", theirs: "delayed communication", Art: Notifications },
  { ours: "One-tap emergency response", theirs: "slow emergency response", Art: Emergency },
  { ours: "AI incident detection", theirs: "no incident visibility", Art: Detection },
  { ours: "Automated cloud reports", theirs: "paper reports", Art: Reports },
];

export function Difference() {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      list.dataset.in = "";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { list.dataset.in = ""; io.disconnect(); }
      },
      { threshold: 0.1 },
    );
    io.observe(list);
    return () => io.disconnect();
  }, []);

  return (
    <ul ref={ref} className="diffs">
      {ITEMS.map((it, i) => (
        <li key={it.ours} className="diff" style={{ ["--i" as string]: i }}>
          <div className="diff-panel">
            <it.Art />
          </div>
          <h3 className="diff-title">{it.ours}</h3>
          <BlurBody className="diff-body">
            {`Instead of ${it.theirs}.`}
          </BlurBody>
        </li>
      ))}
    </ul>
  );
}
