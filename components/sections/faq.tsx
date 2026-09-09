"use client";

import { useId, useRef, useState } from "react";
import { FAQ_EN } from "@/lib/faq-en";
import { BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.10 FAQ — seven questions, one open at a time.
 *
 * ── Built here rather than on shadcn's Accordion, and why ─────────────────
 *
 * shadcn's Accordion is Radix's, and Radix is not a dependency of this
 * project — nothing else here uses it, so taking it would mean adding a
 * primitive library and its peer tree for one component. What shadcn actually
 * provides is the WAI-ARIA Accordion pattern with tokens applied on top, and
 * the pattern is a short, well-specified contract: a button per header
 * carrying aria-expanded and aria-controls, a labelled region per panel, and
 * arrow-key roving between the headers. That contract is implemented in full
 * below, in this project's tokens, with no new dependency.
 *
 * ── The answers are in the HTML whether they are open or not ──────────────
 *
 * The source site injects each answer into the DOM when its question is
 * clicked, so a collapsed FAQ ships seven headings and no content: nothing
 * for a crawler, nothing for find-in-page, and nothing for a reader who has
 * JavaScript fail. Every answer here is server-rendered inside its panel from
 * the first byte. Opening one changes what is VISIBLE, never what exists.
 *
 * That is also what makes the height animation honest: the panel is measured
 * by the browser from content that is already laid out, using a grid row that
 * goes from 0fr to 1fr, rather than by JavaScript reading scrollHeight after
 * inserting something.
 *
 * ── Collapsed panels are inert, not `hidden` ──────────────────────────────
 *
 * The APG says to use `hidden`, which is display:none, which cannot be
 * animated — the accordion would jump. `inert` does the part that matters:
 * a collapsed panel is out of the tab order and out of the accessibility
 * tree, so a screen reader and a keyboard both see exactly what a sighted
 * reader sees, while the element stays laid out and animatable. The trigger's
 * aria-expanded is what announces the state either way.
 *
 * Copy comes from lib/faq-en.ts, which already held all seven pairs. It was
 * transcribed here first, from the source site's own panels, and then checked
 * against the existing file character for character before this import
 * replaced it — the two were identical, which is the only reason there is one
 * copy of this text in the repo rather than two that can drift.
 */


export function Faq() {
  /* One index, so "one open at a time" is a property of the state's shape and
     not a rule some handler has to remember to apply. */
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);

  /*
   * Arrow keys move between the QUESTIONS; they never open anything. Enter and
   * Space are what toggle, and those need no handler at all because every
   * trigger is a real <button>. Escape closes the open panel and leaves focus
   * where it was, which is the one thing a visitor cannot otherwise do without
   * reaching back for the mouse.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = FAQ_EN.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") { setOpen(null); return; }
    if (next === null) return;
    e.preventDefault();
    /*
     * preventScroll: false, stated rather than left to the default.
     *
     * This is the case the codebase-wide rule carves out: roving focus
     * through a seven-item list, where the next question can be below the
     * fold and a focus ring on something off screen is a focus ring nobody
     * can see. The rule exists for focusables inside masked or transformed
     * containers, where the browser scrolls a clipped box instead of the
     * page; nothing here is masked or transformed.
     */
    triggers.current[next]?.focus({ preventScroll: false });
  };

  return (
    <ul className="space-y-3">
      {FAQ_EN.map(({ q, a }, i) => {
        const on = open === i;
        const panelId = `${base}-panel-${i}`;
        const triggerId = `${base}-trigger-${i}`;
        return (
          <li
            key={q}
            data-open={on ? "" : undefined}
            className="rounded-brand border border-border"
          >
            <h3 className="m-0">
              <button
                type="button"
                id={triggerId}
                ref={(el) => { triggers.current[i] = el; }}
                aria-expanded={on}
                aria-controls={panelId}
                onClick={() => setOpen(on ? null : i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className="tap-target flex w-full items-start justify-between gap-6 rounded-brand px-6 py-5 text-left text-lg leading-snug focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span>{q}</span>
                {/*
                  A plus that becomes a cross by rotating 45 degrees — one
                  shape, one transform, so the two states cannot drift apart
                  the way two drawn icons would. aria-hidden because
                  aria-expanded on the button already says which it is.
                */}
                <svg
                  aria-hidden="true" viewBox="0 0 20 20" width="20" height="20"
                  className="mt-1 shrink-0 text-muted-foreground transition-transform duration-[--dur-state] ease-[--ease-out] motion-reduce:transition-none"
                  /* The angle is inline rather than a variant class: it is a
                     value that has to be exactly 45 and exactly reversible,
                     and it is verified by reading the computed matrix. */
                  style={{ transform: on ? "rotate(45deg)" : "rotate(0deg)" }}
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                >
                  <path d="M10 3.5v13M3.5 10h13" />
                </svg>
              </button>
            </h3>

            {/*
              grid-template-rows 0fr -> 1fr. The browser measures the answer,
              which is already in the layout; nothing here reads scrollHeight
              and nothing is inserted on open.
            */}
            <div
              className="grid transition-[grid-template-rows] duration-[--dur-state] ease-[--ease-out] motion-reduce:transition-none"
              style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
              data-open={on ? "" : undefined}
            >
              <div className="overflow-hidden">
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  inert={!on}
                  className="px-6 pb-6"
                >
                  <BlurBody className="max-w-[62ch] leading-relaxed text-muted-foreground">{a}</BlurBody>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
