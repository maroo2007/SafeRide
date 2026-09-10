"use client";

import { useEffect, useRef } from "react";

/**
 * §4.7 Coverage — fourteen cities on a map of Egypt.
 *
 * ── The map is a picture, and the names are the content ───────────────────
 *
 * The image is decorative: it carries no information that is not also in the
 * list underneath it, which is why it is `alt=""` and why the list stays.
 * That list is not a fallback bolted on for form — it is what the section
 * says. If the image never loads, or a reader cannot see it, or the markers
 * are too small on a given screen, the fourteen names are still there in
 * text, and nothing is lost but the geography.
 *
 * ── No numbers ────────────────────────────────────────────────────────────
 *
 * Names only. There are no per-city figures — no bus counts, no student
 * counts, no uptime — and inventing them is the defect that cut the stats
 * band and the `0+` counters. A marker says "here", and that is all it says.
 *
 * ── The image is desaturated at build time, not by a filter ───────────────
 *
 * The source is a full-colour reference map with blue water and red roads,
 * which on paper reads as a different document pasted onto the page. It is
 * desaturated, warmed and lightened by ffmpeg into
 * public/images/egypt-map.webp — 174 KB of JPEG down to 101 KB — rather than
 * corrected by a CSS filter, so the browser composites a plain image and
 * pays nothing per frame for it.
 *
 * ── The sequence runs north to south, once ────────────────────────────────
 *
 * Ordered by latitude, not by the order the cities happen to be listed in:
 * the point of a sequence on a map is that it moves across the map. One
 * timer chain, 80ms apart, started by an IntersectionObserver that
 * disconnects immediately. Below 768px and under reduced motion every marker
 * is lit from the first paint and no timer is ever created.
 */

/**
 * Positions are fractions of the image box, eyeballed against the artwork and
 * checked in a capture. They are not derived from latitude and longitude —
 * the source is a hand-drawn reference map, not a projection, so a computed
 * position would be precisely wrong.
 *
 * `y` doubles as the north-to-south order; the sequence sorts on it rather
 * than relying on this array staying sorted.
 */
type Marker = { city: string; x: number; y: number };

const MARKERS: Marker[] = [
  { city: "Port Said", x: 63.5, y: 10.0 },
  { city: "Alexandria", x: 38.5, y: 12.5 },
  { city: "Mansoura", x: 55.0, y: 13.2 },
  { city: "Tanta", x: 52.0, y: 14.8 },
  { city: "Ismailia", x: 64.5, y: 17.0 },
  { city: "Zagazig", x: 54.5, y: 17.4 },
  { city: "Cairo", x: 56.8, y: 22.0 },
  { city: "Suez", x: 61.0, y: 22.6 },
  { city: "Giza", x: 55.0, y: 23.0 },
  { city: "Minya", x: 45.5, y: 39.5 },
  { city: "Assiut", x: 49.0, y: 51.5 },
  { city: "Sohag", x: 54.5, y: 55.5 },
  { city: "Luxor", x: 61.8, y: 64.5 },
  { city: "Aswan", x: 68.5, y: 78.5 },
];

/** Reading order for the text list: the order the site has always used. */
const CITIES = [
  "Cairo", "Giza", "Alexandria", "Mansoura", "Tanta", "Ismailia", "Port Said",
  "Suez", "Zagazig", "Assiut", "Minya", "Sohag", "Luxor", "Aswan",
];

const STEP_MS = 80;

export function Coverage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const dots = Array.from(host.querySelectorAll<HTMLElement>("[data-marker]"));
    if (!dots.length) return;

    const narrow = window.matchMedia("(max-width: 767px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* Lit from the first paint, with no timer created at all. Not a faster
       sequence — no sequence. */
    if (narrow.matches || reduced.matches) {
      for (const d of dots) d.dataset.lit = "";
      return;
    }

    const timers: number[] = [];
    /* Sorted by latitude here rather than trusting the array's order, so a
       marker added in the wrong place cannot break the direction. */
    const order = dots
      .map((el) => ({ el, y: parseFloat(el.dataset.y || "0") }))
      .sort((a, b) => a.y - b.y);

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        order.forEach(({ el }, i) => {
          timers.push(window.setTimeout(() => { el.dataset.lit = ""; }, i * STEP_MS));
        });
      },
      { threshold: 0.25 },
    );
    io.observe(host);

    return () => {
      io.disconnect();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  return (
    <div>
      <div ref={ref} className="map">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/egypt-map.webp"
          alt=""
          width={1200}
          height={1087}
          loading="lazy"
          decoding="async"
          className="map-img"
        />
        {MARKERS.map((m) => (
          <button
            key={m.city}
            type="button"
            data-marker=""
            data-y={m.y}
            /* The city name IS the accessible name. The visible label below is
               decoration, so it is hidden from assistive tech to stop the name
               being announced twice. */
            aria-label={m.city}
            className="map-marker"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            <span aria-hidden="true" className="map-halo" />
            <span aria-hidden="true" className="map-dot" />
            <span aria-hidden="true" className="map-tip label-mono">{m.city}</span>
          </button>
        ))}
      </div>

      {/*
        The names, in text, underneath. Smaller than body copy on purpose —
        the map is what the eye reads and this is what it can fall back to.
      */}
      <ul className="map-list">
        {CITIES.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
