"use client";

import { useEffect, useRef } from "react";
import { MOBILE_BREAKPOINT } from "@/components/sections/phone-tour/constants";
import { gsap } from "@/lib/gsap";
import { BlurReveal } from "@/components/ui/blur-reveal";

/**
 * The Scroll Stack — replaces the Platform card grid.
 *
 * ── Built by hand, not installed ──────────────────────────────────────────
 *
 * @reactbits-starter/scroll-stack-tw needs REACTBITS_LICENSE_KEY and a
 * registry entry in components.json. Neither exists here, so per the brief's
 * own fallback this is the effect built directly: a 300vh container, a sticky
 * viewport inside it, three cards stacked, and one scroll-progress value
 * driving all of them.
 *
 * ── The DOM is the same in every mode; only the CSS changes ───────────────
 *
 * The server renders three articles in normal flow — image above text, which
 * IS the mobile and reduced-motion presentation. The effect adds
 * `data-pinned` only when the viewport is wide enough and motion is allowed,
 * and that attribute is what switches the CSS to the sticky/absolute layout.
 *
 * Written this way round deliberately: a phone and a reduced-motion visitor
 * get the correct layout from the first byte with no JavaScript, rather than
 * getting the pinned version and having it torn down. It also means there is
 * exactly one copy of the content.
 *
 * ── One ticker callback, not one per card ─────────────────────────────────
 *
 * The transforms are written from a single gsap.ticker callback — the page
 * already runs that loop for the hero and the tour, so this adds no second
 * rAF. Each tick does one getBoundingClientRect on the container and then
 * writes transform and opacity only: no layout is read per card and nothing
 * that triggers reflow is written.
 */

type Card = {
  src: string;
  alt: string;
  eyebrow: string;
  heading: string;
  body: string;
};

const CARDS: Card[] = [
  {
    src: "/images/stack/01-incident-detection.webp",
    alt: "A school bus cabin seen from the front, with the camera's detection boxes drawn around seated and standing children.",
    eyebrow: "01. Detection",
    heading: "Every frame, scored",
    body: "On-device computer vision samples the cabin feed continuously, scoring each frame for unbuckled belts, standing passengers and aisle obstruction. Detections reach the supervisor in seconds, with the frame that triggered them.",
  },
  {
    src: "/images/stack/02-predictive-maintenance.webp",
    alt: "A SafeRide bus at a depot bay during a scheduled service check.",
    eyebrow: "02. Maintenance",
    heading: "A fault, before it is one",
    body: "Every trip logs braking events, engine hours and load. SafeRide models each bus against its own history and flags a service window before a fault appears — specific to the vehicle, not the fleet.",
  },
  {
    src: "/images/stack/03-ai-reports.webp",
    alt: "A SafeRide dashboard showing fleet reporting for a school's routes.",
    eyebrow: "03. Reporting",
    heading: "Every number, traceable",
    body: "Reports come from the same event stream the live dashboard reads, so a monthly summary and a Tuesday check never disagree. Open any figure and it resolves to the events behind it.",
  },
];

/** Each card owns an equal slice of the scroll runway. */
const SEGMENT = 1 / CARDS.length;

export function ScrollStack() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cards = Array.from(host.querySelectorAll<HTMLElement>("[data-stack-card]"));
    if (cards.length !== CARDS.length) return;

    /*
     * matchMedia, LISTENED TO — not one read of window.innerWidth.
     *
     * The first version read innerWidth once during hydration and returned
     * early if it was narrow. That is a race: it pinned on most runs and not
     * on some, and a harness caught it alternating between a 2700px runway and
     * a 2134px one on the same build at the same width. A query that is
     * subscribed to cannot be read at the wrong moment, and it also gives the
     * resize behaviour for free rather than through a second handler that has
     * to agree with the first.
     */
    const narrow = window.matchMedia("(max-width: " + (MOBILE_BREAKPOINT - 1) + "px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    const tick = () => {
      const rect = host.getBoundingClientRect();
      const runway = rect.height - window.innerHeight;
      /* p is 0 when the container's top reaches the viewport top and 1 when
         its bottom does. One value; every card derives its own state from it,
         so the three can never disagree about where the scroll is. */
      const p = runway > 0 ? clamp(-rect.top / runway) : 0;

      for (let i = 0; i < cards.length; i++) {
        const el = cards[i];
        /* Where this card is within its own segment: 0 as it starts rising,
           1 once it is fully in place. */
        const enter = clamp((p - i * SEGMENT) / SEGMENT);
        /* How far the NEXT card has come over the top of this one. */
        const covered = clamp((p - (i + 1) * SEGMENT) / SEGMENT);

        const y = i === 0 ? 0 : (1 - enter) * 100;
        const scale = 1 - covered * 0.08;
        const rot = covered * -1.5;
        /* Held at 1 until the next card is most of the way over, so the fade
           is the last thing that happens rather than a card dimming while it
           is still the one being read. */
        const opacity = 1 - clamp((covered - 0.55) / 0.45);

        el.style.transform =
          "translate3d(0," + y.toFixed(2) + "%,0) scale(" + scale.toFixed(4) + ") rotate(" + rot.toFixed(3) + "deg)";
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = String(i + 1);
      }
    };

    /* null, not false: the first call must always act, whichever way it
       decides. See the same note in journey.tsx. */
    let running: boolean | null = null;
    const clear = () => {
      for (const el of cards) { el.style.transform = ""; el.style.opacity = ""; el.style.zIndex = ""; }
    };

    const apply = () => {
      const want = !narrow.matches && !reduced.matches;
      if (want === running) return;
      running = want;
      if (want) {
        host.dataset.pinned = "";
        /* The page already runs this loop for the hero and the tour. Adding a
           callback to it is free; starting a second rAF would not be. */
        gsap.ticker.wake();
        gsap.ticker.add(tick);
        tick();
      } else {
        gsap.ticker.remove(tick);
        delete host.dataset.pinned;
        /* Give the cards back to normal flow rather than leaving stale
           transforms on them. */
        clear();
        /* Nothing here needs a frame loop under reduced motion, and importing
           gsap starts one regardless. */
        if (reduced.matches) gsap.ticker.sleep();
      }
    };

    apply();
    narrow.addEventListener("change", apply);
    reduced.addEventListener("change", apply);

    return () => {
      narrow.removeEventListener("change", apply);
      reduced.removeEventListener("change", apply);
      gsap.ticker.remove(tick);
      delete host.dataset.pinned;
      clear();
    };
  }, []);

  return (
    <div ref={hostRef} className="stack">
      <div className="stack-viewport">
        {CARDS.map((c, i) => (
          <article key={c.src} data-stack-card="" className="stack-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.src}
              alt={c.alt}
              width={1600}
              height={893}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="stack-img"
            />
            {/* The scrim. Decorative and never in the a11y tree — the text
                above it is real text. */}
            <div aria-hidden="true" className="stack-scrim" />

            <p className="stack-counter label-mono" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}/{String(CARDS.length).padStart(2, "0")}
            </p>

            <div className="stack-copy">
              <p className="label-mono stack-eyebrow">{c.eyebrow}</p>
              <BlurReveal as="h3" className="stack-heading" inView once>{c.heading}</BlurReveal>
              <p className="stack-body">{c.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
