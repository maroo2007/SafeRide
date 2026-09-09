"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { BlurReveal, BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.4 / §5 The Journey — a sequence, not an inventory, and now horizontal.
 *
 * Eight steps that happen in order, and the first and last are both called
 * "Home" because the point is that the loop closes. A grid would throw that
 * away: it would say "here are eight things" when the copy says "here is one
 * day, start to finish". Left to right says it more directly than top to
 * bottom does.
 *
 * ── Two layouts, one list ─────────────────────────────────────────────────
 *
 * Above 900px the ordered list becomes a grid: titles on one row, nodes on a
 * rule through the middle, bodies on a third. `grid-template-rows: subgrid`
 * on each item is what makes the three rows line up across all eight columns
 * regardless of how tall any one title or body is — without it, eight
 * independent columns each find their own baseline and the rule stops being
 * a rule.
 *
 * Below 900px it is the vertical timeline it has always been. Eight steps
 * side by side on a phone is unreadable, so that is a real layout and not a
 * squeeze of this one. Both are in the markup; CSS shows one.
 *
 * ── Two body strings, and why that is not duplication for its own sake ────
 *
 * At 1440 each column is about 170px. The full sentences wrap to four lines
 * there, and §5.1 is explicit that the copy shortens rather than the type. So
 * the horizontal layout carries a shortened line and the vertical keeps the
 * sentence from the source site. Only one is ever in the layout — the other
 * is display:none, so it is not read out twice either.
 *
 * ── One scroll value, not nine ────────────────────────────────────────────
 *
 * A single progress figure is written to the list as `--p`, and the same
 * figure decides which nodes are lit. The orange rule is that value as a
 * scaleX; a node is active when the value has passed its own centre. There is
 * no second timeline and nothing to fall out of step.
 */

type Step = { title: string; body: string; short: string };

const STEPS: Step[] = [
  { title: "Home", body: "The day starts where every parent can already see the bus approaching.", short: "Parents see the bus approaching." },
  { title: "Bus Arrives", body: "A live ETA reaches the parent's phone before the bus turns the corner.", short: "A live ETA before it turns the corner." },
  { title: "Boarding", body: "Face recognition confirms the right child boarded the right bus.", short: "The right child, on the right bus." },
  { title: "GPS Tracking", body: "The full route is visible live, stop by stop, in real time.", short: "The full route, live, stop by stop." },
  { title: "School Arrival", body: "Arrival is logged automatically and parents get an instant confirmation.", short: "Arrival logged, parents told." },
  { title: "School Day", body: "SafeRide steps back while your child is in class, no unnecessary noise.", short: "SafeRide steps back. No noise." },
  { title: "Return Journey", body: "The same visibility, attendance, and alerts apply on the way home.", short: "The same visibility, homeward." },
  { title: "Home", body: "A final drop-off confirmation closes the loop for total peace of mind.", short: "A final drop-off confirmation." },
];

/** Where each node sits along the rule: the centre of its own column. */
const at = (i: number) => (i + 0.5) / STEPS.length;

export function JourneySteps() {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const ol = ref.current;
    if (!ol) return;

    /* Subscribed, not read once. The same race that made the Scroll Stack pin
       intermittently applies here. */
    const wide = window.matchMedia("(min-width: 900px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const nodes = Array.from(ol.querySelectorAll<HTMLElement>("[data-j-node]"));
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    let last = -1;
    const write = (p: number) => {
      /* Two decimals is under a pixel of line at any width this runs at, and
         it stops a scroll of a few pixels from rewriting eight attributes. */
      const q = Math.round(p * 100) / 100;
      if (q === last) return;
      last = q;
      ol.style.setProperty("--p", String(q));
      for (let i = 0; i < nodes.length; i++) {
        const on = q >= at(i);
        /* Written only on change: setAttribute on an unchanged value still
           invalidates style for that element. */
        if ((nodes[i].dataset.active !== undefined) !== on) {
          if (on) nodes[i].dataset.active = "";
          else delete nodes[i].dataset.active;
        }
      }
    };

    const tick = () => {
      const r = ol.getBoundingClientRect();
      /* The line draws while the list crosses the middle of the viewport:
         it starts when the list's top reaches 80% down the screen and
         finishes when its bottom passes 35%. Tied to the section's own travel
         rather than to a timer, so scrolling back reverses it exactly. */
      const start = window.innerHeight * 0.8;
      const end = window.innerHeight * 0.35;
      const span = (r.height + (start - end)) || 1;
      write(clamp((start - r.top) / span));
    };

    /*
     * null, not false — the first call must always act.
     *
     * It was `false`, so on a reduced-motion or narrow load the very first
     * apply() saw want === running and returned before writing anything. The
     * rule stayed at 0 and not one node lit: measured as "0 of 8" at all three
     * widths, on the state that is supposed to be the FINISHED one.
     */
    let running: boolean | null = null;
    const apply = () => {
      const want = wide.matches && !reduced.matches;
      if (want === running) return;
      running = want;
      if (want) {
        /* gsap sleeps its ticker when nothing needs it; adding a callback
           to a sleeping ticker would never run. */
        gsap.ticker.wake();
        gsap.ticker.add(tick);
        tick();
      } else {
        gsap.ticker.remove(tick);
        /* Reduced motion and the vertical layout both want the finished
           state, not a half-drawn one: the rule full, every node lit. */
        last = -1;
        write(1);
        /* And nothing on this page needs a frame loop in that state. Importing
           gsap starts its ticker whether or not anything is animating — 102
           requestAnimationFrame calls in three seconds with every animation on
           the page already disabled. */
        if (reduced.matches) gsap.ticker.sleep();
      }
    };

    apply();
    wide.addEventListener("change", apply);
    reduced.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
      reduced.removeEventListener("change", apply);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <ol ref={ref} className="journey" style={{ ["--p" as string]: 1 }}>
      {STEPS.map((s, i) => (
        <li key={`${s.title}-${i}`} className="j-step">
          <BlurReveal as="h3" className="j-title" inView once>{s.title}</BlurReveal>
          <span aria-hidden="true" data-j-node="" className="j-node label-mono">
            {String(i + 1).padStart(2, "0")}
          </span>
          <BlurBody className="j-body j-long">{s.body}</BlurBody>
          <BlurBody className="j-body j-short">{s.short}</BlurBody>
        </li>
      ))}
    </ol>
  );
}
