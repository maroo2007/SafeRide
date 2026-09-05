"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  RUNWAY_VH, VIDEO_DURATION, bufferedEdge, clampToBuffer, easeEdge, pickMode,
  upgradeOnly, type HeroMode,
} from "@/lib/video-scrub";
import {
  CAPTIONS, CAPTION_SCRIM, HERO, HERO_SCRIM, captionOpacity, heroCopyOpacity,
  heroScrimOpacity,
} from "@/lib/hero-captions";
import { useSmoothScroll } from "@/components/providers/smooth-scroll-provider";
import { CtaButton } from "@/components/ui/cta-button";

/**
 * The scrub hero, built CLAMPED-first.
 *
 * On Regular 4G the scrub file needs ~110s to fully buffer while a scrub
 * advances 7.5x real-time, so a visitor on that connection spends the whole
 * visit in CLAMPED. It is the experience, not a fallback, and it must never
 * announce that anything did not finish: no spinner, no progress bar, no
 * loading language. The video stops leading and starts following.
 */

const SCRUB_FILE_BYTES = 53.6 * 1024 * 1024;
const FILE_BYTES_PER_SECOND = SCRUB_FILE_BYTES / VIDEO_DURATION;

/** Below this the hero does not scrub at all (spec 1.5). */
const MOBILE_BREAKPOINT = 768;

/** A media query is an external system; subscribing to it is the correct
 *  primitive, not setState inside an effect. */
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}

export function ScrubVideoHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runwayRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  // saveData is an external read like any other. Subscribing keeps it out of
  // the effect body and gives SSR a defined answer.
  const saveData = useSyncExternalStore(
    () => () => {},
    () => !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData,
    () => false,
  );
  // Called for its guard: it throws if the hero is mounted outside the single
  // app-root Lenis provider. The hero reads native scroll, which Lenis drives.
  useSmoothScroll();

  /** Scroll progress drives EVERYTHING the reader sees. Never currentTime. */
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<HeroMode>("clamped");

  const easedEdgeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const startedAtRef = useRef(0);

  /* ---- scroll progress ------------------------------------------------ */
  useEffect(() => {
    const el = runwayRef.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / span));
      setProgress(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---- mode selection, from MEASURED throughput ------------------------ */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || reducedMotion || narrow) return;
    startedAtRef.current = performance.now();

    const tick = () => {
      const edge = bufferedEdge(v.buffered);
      const elapsedMs = performance.now() - startedAtRef.current;
      // Bytes actually delivered, inferred from how much video is buffered.
      const bytes = edge * FILE_BYTES_PER_SECOND;
      const next = pickMode({
        sample: elapsedMs > 800 ? { bytes, ms: elapsedMs } : null,
        fileBytesPerSecond: FILE_BYTES_PER_SECOND,
        fullyBuffered: v.duration > 0 && edge >= v.duration - 0.3,
        // A real user signal, not a guess. pickMode lets it override everything.
        saveData,
        bufferedFraction: v.duration > 0 ? edge / v.duration : 0,
        elapsedMs,
      });
      // Only ever upgrade. A hero that degrades under the cursor is worse
      // than one that was never fancy.
      setMode((m) => upgradeOnly(m, next));
    };
    // Deliberately NOT called synchronously here: that would be setState in an
    // effect body. "clamped" is the correct starting assumption anyway — it is
    // the mode we design for — and the first probe lands 500ms later.
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [reducedMotion, narrow, saveData]);

  /* ---- bind the playhead ---------------------------------------------- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || reducedMotion || narrow || mode === "no-scrub") return;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = lastFrameRef.current ? now - lastFrameRef.current : 16;
      lastFrameRef.current = now;
      if (v.readyState < 2 || !v.duration) return;

      // Chase the real buffered edge so chunk arrivals become glides, not
      // lurches. This is what makes the unlock invisible.
      easedEdgeRef.current = easeEdge(easedEdgeRef.current, bufferedEdge(v.buffered), dt);

      const target = progress * v.duration;
      const next = clampToBuffer(target, easedEdgeRef.current, v.duration);
      if (Math.abs(v.currentTime - next) > 1 / 96) v.currentTime = next;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [progress, mode, reducedMotion, narrow]);

  const scrubs = !reducedMotion && !narrow && mode !== "no-scrub";
  const copyOpacity = heroCopyOpacity(progress);
  const scrimOpacity = heroScrimOpacity(progress);

  return (
    <section
      ref={runwayRef}
      aria-labelledby="hero-headline"
      /* The runway collapses to one viewport whenever we are not scrubbing,
         so a NO-SCRUB visitor gets a normal hero rather than dead scroll. */
      /* From the constant that SCRUB_RATE is derived from, so the two cannot
         drift: a runway change that left the scrub rate stale would silently
         mis-select the mode. */
      style={{ height: scrubs ? `${RUNWAY_VH}vh` : "100svh" }}
      className="relative"
    >
      <div className="sticky top-0 h-svh overflow-hidden bg-surface-dark">
        {reducedMotion ? (
          /* Reduced motion means NO motion — a still, never a paused video. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/hero-poster.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            aria-hidden="true"
            muted
            playsInline
            loop={!scrubs}
            autoPlay={!scrubs}
            preload={narrow ? "metadata" : "auto"}
            poster="/images/hero-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover"
          >
            {narrow ? (
              <source src="/video/saferide-hero-mobile.mp4" type="video/mp4" />
            ) : (
              <>
                <source src="/video/saferide-hero-scrub.webm" type="video/webm" />
                <source src="/video/saferide-hero-scrub.mp4" type="video/mp4" />
              </>
            )}
          </video>
        )}

        {/* Hero scrim. Spec and measurement live together in
            lib/hero-captions.ts so the CSS cannot drift from the numbers that
            justify it. Worst pixel over the whole fade window: headline
            7.28:1, eyebrow 11.51:1. It holds and then TRAILS the copy out
            rather than leaving with it — see HERO.scrimHoldTo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{ opacity: scrimOpacity, background: HERO_SCRIM }}
        />

        {/* Caption scrims sit HERE, as siblings of the copy container rather
            than inside it. `inset-0` resolves against the nearest positioned
            ancestor: inside the centred max-w-6xl column that is a 1152px box,
            so the ellipse would be sliced off at its left edge and draw a
            vertical seam down the middle of the frame — the same class of bug
            as the bottom strip it replaced. Out here the box is the viewport,
            whose left and bottom edges cannot show a seam. */}
        {CAPTIONS.map((c) => {
          const o = captionOpacity(c, progress);
          if (o <= 0 || !c.scrim) return null;
          return (
            <div
              key={`${c.id}-scrim`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0"
              style={{ opacity: o, background: CAPTION_SCRIM }}
            />
          );
        })}

        {/* Overlay copy is real DOM text and is driven by SCROLL only. */}
        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-6">
          {/* max-w in rem, NOT ch. `ch` on this wrapper resolves against the
              BODY font size (16px), not the h1's 72px — 20ch was ~160px, which
              is what stacked the headline into a column of single words.
              576px holds the headline to three balanced lines AND keeps it in
              the deep end of the scrim; at 768px its far end ran out into the
              bright part of the frame at only 2.6:1. */}
          {/* `inert` once fully faded. Opacity alone leaves the two CTAs
              clickable and in the tab order while completely invisible —
              measured: effective opacity 0 at progress 0.13, still hit-testing
              and still focusable. Invisible controls that take a click are
              worse than absent ones. */}
          <div
            style={{ opacity: copyOpacity }}
            className="max-w-xl"
            inert={copyOpacity === 0}
          >
            <p className="label-mono" style={{ color: "var(--accent-warm)" }}>
              {HERO.eyebrow}
            </p>
            <h1
              id="hero-headline"
              className="mt-5 text-5xl sm:text-6xl lg:text-7xl"
              style={{ color: "#fcfbf8", textWrap: "balance" }}
            >
              {HERO.headline}
            </h1>
            {/* CTAs are never gated on MODE — clamped, full or no-scroll, they
                are present and clickable from first paint. They do fade with
                the rest of the hero copy on scroll, which is the spec 1.6
                behaviour; `opacity: 1` here previously implied otherwise and
                was simply false, since a parent's opacity applies to its whole
                subtree and cannot be undone by a child. */}
            <div className="mt-10 flex flex-wrap gap-4">
              <CtaButton
                href={HERO.primaryCta.href}
                label={HERO.primaryCta.label}
                fill="solid"
                route="below"
              />
              {/* Over footage, not over paper — outlineInk resolves its ink
                  against the light theme and measured 1.62:1 on film. The
                  border variant keeps the outline empty on hover, which holds
                  the hierarchy and takes the boundary to 13.36:1. */}
              <CtaButton
                href={HERO.ghostCta.href}
                label={HERO.ghostCta.label}
                fill="outlineOnMediaBorder"
              />
            </div>
          </div>

          {CAPTIONS.map((c) => {
            const o = captionOpacity(c, progress);
            if (o <= 0) return null;
            return (
              <p
                key={c.id}
                aria-hidden={o < 0.5}
                /* Stays inside the content column so it aligns to the same
                   grid as the headline. Only the scrim needed hoisting. */
                className="absolute bottom-24 left-6 max-w-[34ch] text-lg sm:left-10"
                style={{
                  opacity: o,
                  color: c.ink === "white" ? "#fcfbf8" : "var(--ink)",
                }}
              >
                {c.text}
              </p>
            );
          })}
        </div>
      </div>
    </section>
  );
}
