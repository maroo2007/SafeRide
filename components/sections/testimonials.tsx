"use client";

import { useEffect, useRef } from "react";
import { BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.8 Testimonials — four quotes, marked up as quotes.
 *
 * <blockquote> with a <figcaption>, not a div with big text. The attribution
 * belongs to the quote and the markup should say so; a screen reader then
 * reads "quote ... Ahmed Hassan, Parent, Modern School" as one unit rather
 * than as a paragraph followed by an orphan name.
 *
 * ── The layout is taken from the reference; none of its colour is ─────────
 *
 * A dark header bar across the top-left carrying the name and role, a
 * circular avatar overlapping the top-right and sitting half on the bar, the
 * quote below on the card surface with an --accent rule down its left edge.
 * The bar is --surface-dark with --paper on it, which is the one dark-on-
 * light pairing this palette already uses everywhere else.
 *
 * NO STAR RATINGS. The reference has them and we have no rating data; a row
 * of five filled stars with nothing behind it is the same defect as the `0+`
 * stats and the coverage figures that were cut.
 *
 * ── The avatars are initials, not faces ───────────────────────────────────
 *
 * There are no photographs of these people. A stock portrait would be a
 * stranger's face attached to a real named person's words, and a generated
 * one would be a fabricated human being presented as a customer. Initials in
 * Fraunces on --accent-warm say exactly as much as is actually known.
 *
 * ── The card assembles rather than appearing ──────────────────────────────
 *
 * One IntersectionObserver per list, adding a single attribute; the stagger
 * and the 100ms lag on the bar and the avatar are CSS transition delays off
 * that attribute. No timers, no per-card observer, and nothing to clean up
 * beyond the one observer. Under reduced motion the attribute is set on the
 * first paint and every transition is already zero.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const QUOTES: { quote: string; name: string; role: string }[] = [
  {
    quote:
      "Every morning I used to call the school twice just to make sure my daughter got on the bus. Now I open the app and I can see exactly where she is. It changed how I feel about the whole school run.",
    name: "Ahmed Hassan",
    role: "Parent, Modern School",
  },
  {
    quote:
      "The first time I got a notification that said 'Sara boarded safely,' I actually teared up. It sounds small, but that peace of mind is everything when you're a working mother.",
    name: "Mona Ali",
    role: "Mother, Future Language School",
  },
  {
    quote:
      "We used to manage transportation with a notebook and a lot of phone calls. SafeRide gave us one dashboard for every bus, every driver, and every route. It's the biggest operational upgrade we've made in years.",
    name: "Dr. Karim El-Sayed",
    role: "Principal, El Rowad International School",
  },
  {
    quote:
      "Our front desk used to spend the first hour of every school day answering 'where is the bus' calls. Since we switched to SafeRide, those calls have almost completely stopped.",
    name: "Nourhan Fathy",
    role: "Administrator, Smart Vision School",
  },
];

/**
 * Initials from the name as written, skipping an honorific — "Dr. Karim
 * El-Sayed" is KE, not DK.
 */
function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((p) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(p));
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function Testimonials() {
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
      { threshold: 0.15 },
    );
    io.observe(list);
    return () => io.disconnect();
  }, []);

  return (
    <ul ref={ref} className="quotes">
      {QUOTES.map((q, i) => (
        <li key={q.name} className="quote" style={{ ["--i" as string]: i }}>
          <figure className="quote-card">
            <figcaption className="quote-bar">
              <span className="quote-name">{q.name}</span>
              <span className="quote-role">{q.role}</span>
            </figcaption>

            {/* Decorative: the name is already in the figcaption above, so an
                initials disc that repeated it would be announced twice. */}
            <span aria-hidden="true" className="quote-avatar">{initials(q.name)}</span>

            <blockquote className="quote-body">
              <BlurBody className="quote-text">{q.quote}</BlurBody>
            </blockquote>
          </figure>
        </li>
      ))}
    </ul>
  );
}
