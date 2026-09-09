"use client";

import { useEffect, useRef } from "react";
import { MOBILE_BREAKPOINT } from "@/components/sections/phone-tour/constants";
import { HERO_PLAYING_ATTR, TOUR_READY_ATTR } from "@/components/ui/load-screen";

/**
 * The moving ground — build spec §4b.
 *
 * A fixed, full-viewport layer that runs the whole length of the page and is
 * never bounded to a section. There is no scroll listener, no fade band and no
 * scroll-driven opacity anywhere in this file, and that is the design rather
 * than an omission: the hero declares an opaque ground of its own and simply
 * COVERS this layer above the Platform boundary, so the boundary is a hard
 * edge drawn by an element that was already there. Every alternative — a
 * gradient mask, an opacity ramp, an observer that fades it in — is a second
 * mechanism that can disagree with the first one about where the edge is.
 *
 * ── The still is the ground; the video is an enhancement ───────────────────
 *
 * What the server renders is the still frame, and that is the whole ground
 * until several things have gone right. The video is created in JavaScript,
 * after the reduced-motion check, after the tour scene is ready, and only
 * then does its first byte leave the network. So the still is not a fallback
 * that appears when something fails — it is the default state, and the video
 * is what may or may not arrive on top of it.
 *
 * That ordering is also why the element is built here rather than written in
 * the JSX with a `src`. A <video> in the markup starts fetching during the
 * hero, which is the one moment on this page that must not share bandwidth
 * or decode capacity with anything. Nothing about `preload="none"` is
 * reliable enough to be the guard for that; not existing is.
 *
 * ── Frame 176, and why not frame 0 ────────────────────────────────────────
 *
 * The still is frame 176 of 268. Every frame was reduced to a 32x18 luma
 * descriptor and scored by its total distance to all the others; frame 8 won
 * outright but sits inside the 15-frame cross-fade, where two ribbon states
 * are superimposed and the picture is a blend the clip never rests on. Frame
 * 176 is the best-scoring frame outside that window, 10.1% off the global
 * medoid, and its upper third is clear where headings sit. Frame 0 — the
 * obvious choice, and the one the brief rejected — ranks 243rd of 268.
 */

/** Frame 176's descriptor distance put it 10.1% off the clip medoid. */
export const STILL_SRC = "/gemini-background/ground-still.webp";
export const VIDEO_SRC = "/gemini-background/ground-av1.mp4";

/** The fade from still to video. Long enough not to be a cut, short enough
 *  that it is over before anyone has scrolled off the hero. */
export const VIDEO_FADE_MS = 400;

/**
 * Whether the video is attached below MOBILE_BREAKPOINT. It is, and that was
 * not the expected answer.
 *
 * Measured by build/measure-mobile-ground.js: one full 12s scroll of the page
 * at 390x844 on the production build, twice, differing only in ?bgvideo, and
 * read from the compositor's DrawFrame record rather than from rAF.
 *
 *   without the video   714 presented,  8 dropped   (59.4/s)
 *   with the video      708 presented, 14 dropped   (59.0/s)
 *
 * 0.8% of presented frames and six dropped frames across twelve seconds. The
 * reason it is nearly free is structural: below this breakpoint the tour
 * builds no WebGL scene at all, so the thing the video would have been
 * competing with on desktop is not running. The file is 0.377 MB, which is
 * the other half of "affordable".
 *
 * This shipped as `false` first, on the assumption that a phone could not
 * afford it. The assumption was wrong and the measurement is what changed it.
 */
export const VIDEO_ON_MOBILE = true;

/** Marks the layer for the guards, so they never search for it by class. */
export const GROUND_ATTR = "data-bg-video";

/**
 * The floor under "loads last".
 *
 * Past this the video attaches whatever the hero and the tour have or have
 * not said. It is deliberately longer than the loader's own 8s scene cap, so
 * in the ordinary slow case the loader has already given up and lifted before
 * this fires — this is for the case where a signal never comes at all.
 */
export const ATTACH_CAP_MS = 10000;

/**
 * How long after the page is ready before the video is attached.
 *
 * "After the tour is ready" was not late enough. The tour raises its flag when
 * its scene has settled, and the frames immediately after that are its most
 * expensive — the last texture uploads, the first real renders, and on the
 * default path the loader's own reveal. Starting a second video decode into
 * that measured, on the production build:
 *
 *                        scene settled    worst frame after the lift
 *   video attached at ready   14691ms      100ms
 *   video not attached        10582ms       67ms
 *
 * Four seconds of extra settling and a dropped frame on the first thing the
 * visitor sees, for a background that nobody is looking at yet.
 *
 * This is the same lever as the loader's REVEAL_DELAY_MS and for the same
 * reason: the moment something declares itself ready is the moment the GPU is
 * busiest, and the cheapest fix is to not be there. It costs nothing — the
 * still is already the ground and stays it.
 */
export const ATTACH_DELAY_MS = 900;

export function BackgroundVideo() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    /*
     * REDUCED MOTION REMOVES THE VIDEO, it does not slow it down. There is no
     * "gentler" version of a moving background: the still IS the reduced
     * version, and it is already on screen.
     */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    /*
     * ?bgvideo=on|off forces the mobile decision either way, so the cost of
     * attaching it at 390 can be MEASURED on a production build rather than
     * assumed. Reduced motion is deliberately above this and cannot be
     * overridden by a query string — that is a user's stated preference, not
     * a knob.
     */
    const q = new URLSearchParams(location.search);
    const forced = q.get("bgvideo");
    if (forced === "off") return;
    const small = window.innerWidth < MOBILE_BREAKPOINT;
    if (small && !VIDEO_ON_MOBILE && forced !== "on") return;

    let video: HTMLVideoElement | null = null;
    let io: IntersectionObserver | null = null;
    let obs: MutationObserver | null = null;
    let timer = 0;
    let cancelled = false;

    const attach = () => {
      if (cancelled || video) return;
      if (timer) { window.clearTimeout(timer); timer = 0; }

      video = document.createElement("video");
      video.className = "bg-video-film";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      /* Decorative. It carries no information the page does not already say
         in words, so it is hidden from assistive tech outright. */
      video.setAttribute("aria-hidden", "true");
      video.src = VIDEO_SRC;

      /*
       * Fade in on the first frame that is actually DECODED, not on
       * loadeddata. A video revealed before it has a picture shows one frame
       * of nothing, and on a ground this pale that reads as a flash.
       */
      const el = video;
      const show = () => { el.dataset.on = ""; };
      const rvfc = (el as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }).requestVideoFrameCallback;
      if (typeof rvfc === "function") rvfc.call(el, show);
      else el.addEventListener("playing", show, { once: true });

      host.appendChild(video);
      void video.play().catch(() => {
        /* Autoplay refused. The still is already the ground, so there is
           nothing to fall back to and nothing to report. */
      });

      /*
       * PAUSED WHILE THE TOUR IS ON SCREEN.
       *
       * The tour canvas is alpha:true, so this layer is visible behind a
       * pinned 3D phone for eight screens of scrolling — two moving things
       * competing in the same frame, and the decode is being paid for at the
       * exact moment the GPU is busiest. A paused video costs nothing.
       */
      const runway = document.querySelector("[data-tour-runway]");
      if (runway) {
        io = new IntersectionObserver(
          (entries) => {
            if (!video) return;
            const over = entries.some((e) => e.isIntersecting);
            if (over) video.pause();
            else void video.play().catch(() => {});
          },
          { threshold: 0 },
        );
        io.observe(runway);
      }
    };

    /*
     * LAST. The tour scene is the most expensive thing this page builds, and
     * it is what the loader is waiting for; anything that competes with it
     * delays the moment the page becomes usable. The attribute is the same
     * signal the loader lifts on, so "last" means the same instant to both.
     */
    const root = document.documentElement;

    /*
     * THE SAME GATE THE LOADER USES, and it has to be, because below the
     * mobile breakpoint the tour builds no scene, renders a stacked list, and
     * the runway element never exists. Waiting on TOUR_READY alone measured
     * false ten seconds into a 390 load: the video would never have attached
     * there at all, and a forced run to measure its cost sat waiting for a
     * signal that was never coming.
     */
    const narrow = window.innerWidth < MOBILE_BREAKPOINT;
    const waitsForTour = !narrow;
    const ready = () =>
      root.hasAttribute(HERO_PLAYING_ATTR) &&
      (!waitsForTour || root.hasAttribute(TOUR_READY_ATTR));

    /* Ready, THEN a beat. See ATTACH_DELAY_MS. */
    const attachSoon = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(attach, ATTACH_DELAY_MS);
    };

    if (ready()) attachSoon();
    else {
      obs = new MutationObserver(() => {
        if (ready()) { obs?.disconnect(); attachSoon(); }
      });
      obs.observe(root, { attributes: true, attributeFilter: [HERO_PLAYING_ATTR, TOUR_READY_ATTR] });
      /*
       * And a floor under it. Every signal this waits on is set by another
       * component, and a ground that silently never arrives because one of
       * them threw is worse than a ground that arrives late — the still is
       * already on screen either way, so the cost of being late is nothing.
       */
      timer = window.setTimeout(() => { obs?.disconnect(); attach(); }, ATTACH_CAP_MS);
      /* attachSoon() reuses `timer`, so the cap and the delay cannot both be
         pending — whichever is set last is the one that fires, and the cap is
         only ever replaced by a delay that means the page IS ready. */
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      obs?.disconnect();
      io?.disconnect();
      if (video) { video.pause(); video.removeAttribute("src"); video.remove(); }
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="bg-video" {...{ [GROUND_ATTR]: "" }}>
      {/*
        A plain <img>, not a CSS background-image and not next/image. It has to
        be in the server's HTML so the ground is painted before any JavaScript
        runs, and it must not be swapped, lazy-loaded or resized by anything —
        this is the page's ground, not a picture on it.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bg-video-still" src={STILL_SRC} alt="" width={1920} height={1080} />
    </div>
  );
}
