"use client";

import { useState } from "react";

/**
 * §4.7 Coverage — fourteen cities, and an honest interaction.
 *
 * ── What "tap a city to see it" can truthfully do ─────────────────────────
 *
 * The brief asks for an interactive city list. It does not supply anything to
 * reveal: there are no per-city figures, and §4.7 already CUT the three-stat
 * row for exactly that reason — "no figures exist for Smart Buses, Students
 * Protected or System Uptime, so the stat row does not ship".
 *
 * A tap that opens a panel of invented numbers would be the same defect the
 * stat row was removed for, one level down. A tap that opens an empty panel
 * is a dead affordance, which is worse than no affordance.
 *
 * So selecting a city says the one true thing there is to say — that SafeRide
 * operates there — and says it in a live region so it reaches a screen reader
 * rather than only the sighted. When per-city data exists this is where it
 * goes, and the shape is already right for it.
 *
 * ── Buttons, not links ────────────────────────────────────────────────────
 *
 * Nothing navigates. A link that goes nowhere is the dead affordance again,
 * and `aria-pressed` is the correct role for a toggle that changes state on
 * the page.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const CITIES = [
  "Cairo", "Giza", "Alexandria", "Mansoura", "Tanta", "Ismailia", "Port Said",
  "Suez", "Zagazig", "Assiut", "Minya", "Sohag", "Luxor", "Aswan",
];

export function Coverage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <ul className="flex flex-wrap gap-2.5">
        {CITIES.map((city) => {
          const on = selected === city;
          return (
            <li key={city}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(on ? null : city)}
                className={[
                  "tap-target rounded-full border px-4 py-2 text-sm",
                  "transition-[background-color,border-color,color] duration-[--dur-state] ease-[--ease-out]",
                  "motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on
                    ? "border-transparent bg-primary text-primary-foreground"
                    /* bg-card, not bare: an unselected pill over moving
                       ribbons is a label with no surface under it. */
                    : "border-border bg-card text-foreground hover:border-foreground",
                ].join(" ")}
              >
                {city}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        A live region that is ALWAYS in the tree, not one mounted on
        selection. An aria-live element inserted at the moment it gets content
        is frequently not announced at all — the region has to exist for the
        assistive tech to be watching it.

        `min-h` so the block does not reflow the page when the line appears;
        a comparison table one screen down should not jump because someone
        tapped a city.
      */}
      <p
        aria-live="polite"
        className="mt-8 min-h-[1.75rem] text-base leading-relaxed text-muted-foreground"
      >
        {selected
          ? `${selected} — SafeRide operates here.`
          : "Fourteen cities, one live network."}
      </p>
    </div>
  );
}
