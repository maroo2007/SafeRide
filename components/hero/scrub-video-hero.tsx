"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HERO, HERO_SCRIM } from "@/lib/hero-captions";
import { useMediaQuery } from "@/lib/use-media-query";
import { HERO_PLAYING_ATTR } from "@/components/ui/load-screen";
import { CtaButton } from "@/components/ui/cta-button";
import { VariableProximity } from "@/components/hero/variable-proximity";

/**
 * The hero. A normal 100vh section with a film playing in it.
 *
 * ── What this REPLACES, and why it is gone rather than dormant ────────────
 *
 * This was a scroll-scrubbed hero: a 1200vh runway, a scroll-driven playhead,
 * three modes (FULL / CLAMPED / NO_SCRUB) selected from measured throughput,
 * and a 56.2 MB all-intra WebM whose every frame was a keyframe so seeking
 * stayed smooth. All of it is deleted, not disabled.
 *
 * The measurement that ended it: that file streams on `preload="auto"` and was
 * the single biggest competitor for bandwidth on the page. Blocking it cut the
 * phone tour's model download by 35% and its textures by 88%. Nothing on the
 * page seeks any more, so the constraint that justified all-intra — and most
 * of those 56 MB — no longer exists.
 *
 * ── The model now ─────────────────────────────────────────────────────────
 *
 *   - the film autoplays at normal speed, muted, inline
 *   - scrolling scrolls the page past it, like any website
 *   - it plays while ANY part of the hero is on screen and pauses only when
 *     the hero is 100% out of view. Threshold 0, not a fraction: half-scrolled
 *     or 90%-scrolled it keeps playing
 *   - resuming continues from where it stopped, never restarts
 *   - it HOLDS on the last frame. The wordmark reads as an end-card, which is
 *     the same reasoning that removed the post-video transition; looping would
 *     restart the story under whatever copy is on screen
 *
 * ── Captions run on the FILM, not on scroll ───────────────────────────────
 *
 * They were authored at scroll positions 0..1 while scroll mapped linearly to
 * film time, so the same numbers now mean the same moments — read from
 * currentTime instead. The guard asserted the opposite and was rewritten.
 *
 * ── The hero COPY does not run on either ──────────────────────────────────
 *
 * `heroScrimOpacity` also took scroll progress. Feeding
 * them film time would fade the headline and both CTAs away a few seconds
 * after load, while the visitor is still looking at the hero — so the copy and
 * its scrim are constant now, and the section simply scrolls away like any
 * other. That also retires the invisible-but-clickable CTA problem at source:
 * there is no longer a state in which the copy is transparent and still in the
 * tab order.
 */

/*
 * There is no mobile branch any more. The old hero had one because desktop
 * scrubbed and mobile could not; now both do the same thing, so the breakpoint
 * and its media query are gone rather than left computing a value nothing
 * reads. Same reason `narrow` and the unread idle ref went with them.
 */

export function ScrubVideoHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  /** The film has taken over from the idle loop. One-way. */
  const [handedOver, setHandedOver] = useState(false);
  /**
   * Autoplay was refused. Safari's Low Power Mode and Firefox's blocking
   * policy both do this, and without a path for it the visitor gets a frozen
   * first frame and no indication that anything is wrong.
   */
  const [blocked, setBlocked] = useState(false);

  const tryPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    /*
     * play() explicitly rather than the autoPlay attribute, because the
     * attribute gives no promise and therefore no way to detect refusal.
     */
    v.play().then(() => {
      setBlocked(false);
      /*
       * The signal the load screen and the phone tour both wait on. Set on
       * `playing`, not on `canplay`: canplay means a frame COULD be shown,
       * playing means one has been. The load screen lifting onto a frame
       * that has not painted is the thing this distinction prevents.
       */
      const raise = () => document.documentElement.setAttribute(HERO_PLAYING_ATTR, "");
      if (!v.paused && v.currentTime > 0) raise();
      else v.addEventListener("playing", raise, { once: true });
    }).catch(() => {
      setBlocked(true);
      /* Autoplay refused: nothing is going to play, so release the page
         rather than hold it behind a wordmark until the timeout. */
      document.documentElement.setAttribute(HERO_PLAYING_ATTR, "");
    });
  }, []);

  /* ---- hand over from the idle loop once the film can actually play ---- */
  useEffect(() => {
    if (reducedMotion || handedOver) return;
    const v = videoRef.current;
    if (!v) return;
    const ready = () => { setHandedOver(true); tryPlay(); };
    if (v.readyState >= 3) { ready(); return; }
    v.addEventListener("canplay", ready, { once: true });
    return () => v.removeEventListener("canplay", ready);
  }, [reducedMotion, handedOver, tryPlay]);

  /*
   * ---- STOP THE IDLE LOOP ONCE THE FILM HAS IT -------------------------
   *
   * `opacity: 0` hides a video. It does not stop it decoding.
   *
   * The idle clip is 1920x1080 H.264 at 48 fps, and it carries `loop` and
   * `autoPlay`, so after the handover it kept decoding at full rate for the
   * rest of the session behind an invisible element. Measured on one run it
   * had presented 4048 frames — a second 1080p48 decode running underneath
   * the film, the phone tour's WebGL and everything else, for nothing.
   *
   * Spec §2.2 named this as the second candidate for the hero's lag:
   * "confirm the idle element is fully released after handoff and not still
   * decoding". It was not.
   *
   * A DOM write, not state: `handedOver` already drives the cross-fade, and
   * pausing is the same event expressed on the element.
   */
  useEffect(() => {
    if (!handedOver) return;
    const idle = idleRef.current;
    if (!idle) return;
    /* After the 200ms cross-fade, so the frame under the film is still live
       while it is still partly visible. Pausing on the same tick shows a
       frozen idle frame through a half-transparent film. */
    const t = window.setTimeout(() => {
      if (!idle.paused) idle.pause();
      /* Drop the buffered data too. Paused still holds decoded frames and a
         network buffer; this releases both without disturbing the element. */
      idle.removeAttribute("autoplay");
    }, 260);
    return () => window.clearTimeout(t);
  }, [handedOver]);

  /* ---- play while ANY part of the hero is on screen -------------------- */
  useEffect(() => {
    if (reducedMotion) return;
    const el = sectionRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    /*
     * Threshold 0 is the whole point: the callback fires when the section
     * crosses fully out of view and not before, so a half-scrolled hero keeps
     * playing. A fractional threshold would pause a film the visitor can
     * still see.
     */
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { if (handedOver) tryPlay(); }
        else if (!v.paused) v.pause(); // resumes from here, never restarts
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reducedMotion, handedOver, tryPlay]);

  /*
   * THE CAPTION CLOCK IS GONE with the captions.
   *
   * It ran a requestAnimationFrame for the whole life of the hero purely to
   * push v.currentTime into React state, which re-rendered this component on
   * every frame so three <p> elements could read their opacity off it. No
   * captions, no clock, and no per-frame setState.
   */


  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-headline"
      /* One viewport. No runway, no pin, no dead scroll. */
      className="dark relative h-svh overflow-hidden bg-surface-dark"
    >
      {/* `dark` above is load-bearing, not cosmetic: it switches --accent-edge
          to transparent so the CTA does not wear a dark ring over footage, and
          --accent-lift to the smaller dark-ground shadow. Guarded in
          __tests__/hero-autoplay.test.tsx. */}
      {reducedMotion ? (
        /*
         * Reduced motion means NO motion — a still, never a paused video.
         *
         * This branch is correct and was NOT enough on its own. useMediaQuery
         * returns the SERVER snapshot on the first commit, so there is exactly
         * one render in which `reducedMotion` is false, the two <video>
         * elements mount with preload="auto", and the browser starts fetching.
         * By the time this branch swaps them for the still, the requests are
         * already out — measured on the production build: hero-idle.mp4 and
         * hero-av1.mp4 both downloaded by a visitor who never saw a frame of
         * either.
         *
         * The fix is on the <source> elements below, which carry a `media`
         * attribute so the resource selection algorithm matches nothing at all
         * under reduced motion. It is markup rather than state, so it is true
         * on the very first render and on the server.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/images/hero-poster.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          {/* THE IDLE LOOP. 336 KB holding the film's first two seconds,
              preloaded in layout.tsx. It covers the gap before the full film
              can play. Requested together they race and the small file loses,
              which is the whole reason it is a separate element. */}
          <video
            ref={idleRef}
            aria-hidden="true"
            muted playsInline loop autoPlay preload="auto"
            poster="/images/hero-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: handedOver ? 0 : 1, transition: "opacity 200ms linear" }}
          >
            <source src="/video/saferide-hero-idle.mp4" type="video/mp4" media="(prefers-reduced-motion: no-preference)" />
          </video>

          {/* THE FILM. No `loop`: it holds on the last frame. */}
          <video
            ref={videoRef}
            aria-hidden="true"
            muted playsInline preload="auto"
            poster="/images/hero-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: handedOver ? 1 : 0, transition: "opacity 200ms linear" }}
          >
            {/*
              AV1 first, H.264 behind it — and the AV1 source carries a FULL
              codecs string, not a bare video/mp4.

              Without it, a browser that can play MP4 but has no AV1 decoder
              (older Safari, plenty of mid-range Android) matches on the
              container alone, picks the AV1 file and fails, instead of
              falling through to the next source. The string is measured from
              the file rather than guessed: Main profile, seq_level_idx 9
              (4.1), Main tier, 8-bit.

              AV1 was rejected earlier in this project for slow seeking. That
              rejection is REVERSED and the reason is recorded in the spec:
              it applied to a scrub hero, and nothing seeks any more.

              ── 8-BIT, AND THE TRAILING .08 IS THE WHOLE FIX ──────────────

              This read `.10` for weeks while the comment above it said 8-bit,
              and the file WAS 10-bit — so the comment was the only thing that
              was wrong, and it was wrong in the direction that hid a defect.
              1080p48 10-bit AV1 has no hardware decode on a large share of
              machines, including the one this project is built on (Vega 8,
              no AV1 decode block at all), so it fell to software.

              Measured on that machine, headed, over the first five seconds a
              visitor actually sees — dropped frames and presented rate:

                AV1 10-bit   22 dropped   39.5/s   11.33 MB
                AV1  8-bit    0 dropped   48.1/s   10.65 MB
                H.264         2 dropped   46.6/s   23.02 MB

              Six reports of "the hero still lags" were this. Not the page —
              rAF measured a clean 58.2/s throughout — the PICTURE, stalling
              with currentTime frozen while the decoder shed frames.

              8-bit matches H.264's behaviour at less than half the bytes, so
              the H.264 fallback stays a fallback and no runtime source
              switching is needed. Re-encoded from the H.264 master with:

                ffmpeg -i saferide-hero.mp4 -an -c:v libsvtav1 -crf 34 \
                       -preset 6 -pix_fmt yuv420p -g 240 saferide-hero-av1.mp4
            */}
            <source src="/video/saferide-hero-av1.mp4" type='video/mp4; codecs="av01.0.09M.08"' media="(prefers-reduced-motion: no-preference)" />
            <source src="/video/saferide-hero.mp4" type='video/mp4; codecs="avc1.640032"' media="(prefers-reduced-motion: no-preference)" />
          </video>
        </>
      )}

      {/* Hero scrim, constant. The measurement that justifies it lives in
          lib/hero-captions.ts so the CSS cannot drift from it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ opacity: HERO.scrimOpacity, background: HERO_SCRIM }}
      />

      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-6">
        {/* max-w in rem, NOT ch. `ch` on this wrapper resolves against the
            BODY font size (16px), not the h1's 72px — 20ch was ~160px, which
            stacked the headline into a column of single words. */}
        <div className="max-w-xl">
          {/*
            The copy is on from the first frame and stays there. It used to
            fade out against scroll progress so it would not collide with the
            captions further into the film; there are no captions now, so
            there is nothing to schedule around and nothing to fade for.
          */}
          <p className="label-mono" style={{ color: "var(--accent-warm)" }}>
            {HERO.eyebrow}
          </p>
          <h1
            id="hero-headline"
            className="mt-5 text-5xl sm:text-6xl lg:text-7xl"
            style={{ color: "#fcfbf8", textWrap: "balance" }}
          >
            <VariableProximity text={HERO.headline} />
          </h1>
          <div className="mt-10 flex flex-wrap gap-4">
            <CtaButton
              href={HERO.primaryCta.href}
              label={HERO.primaryCta.label}
              fill="solid"
              route="below"
            />
            {/* Over footage, not over paper — outlineInk resolves its ink
                against the light theme and measured 1.62:1 on film. */}
            <CtaButton
              href={HERO.ghostCta.href}
              label={HERO.ghostCta.label}
              fill="outlineOnMediaBorder"
            />
          </div>

          {/* Autoplay refused. A real control, not a hint: the visitor is
              looking at a still frame and nothing else on the page says why. */}
          {blocked ? (
            <button
              type="button"
              onClick={tryPlay}
              className="mt-8 inline-flex items-center gap-2 rounded-brand border-2 px-5 py-3 text-sm"
              style={{ borderColor: "var(--accent-warm)", color: "var(--accent-warm)" }}
            >
              <span aria-hidden="true">▶</span>
              Play the film
            </button>
          ) : null}
        </div>

      </div>
    </section>
  );
}
