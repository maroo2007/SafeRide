"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, registerGsap } from "@/lib/gsap";
import { useSmoothScroll } from "@/components/providers/smooth-scroll-provider";
import s from "./sterling-gate-kinetic-navigation.module.css";

/**
 * Sterling Gate kinetic navigation, adapted for SafeRide (spec 2).
 *
 * STRUCTURE CHANGE, ON INSTRUCTION, AFTER THE FIRST PORT.
 * There is no fixed header bar. The logo and the Menu/Close text button are
 * gone with it; the trigger is a floating hamburger, and the utilities live
 * inside the panel. That resolves §2.2 E (the logo anchor) by removing what it
 * attached to, and moves §2.2 F inside the overlay.
 *
 * Adaptations still in force (§2.2):
 *   A  one link per section
 *   C  none of the component's :root block — SafeRide tokens only
 *   D  the "click me" demo label is gone
 *   E  dropped: there is no header for a logo to sit in
 *   F  language toggle and Log In — REMOVED entirely, not hidden
 *   B  ambient hover shapes — REMOVED entirely, markup and tweens
 *
 * §2.3: Lenis is stopped while the menu is open, so the film cannot scrub
 * behind the overlay. §2.4 in full: dialog role, focus trap, focus return,
 * visible rings, and instant open/close under reduced motion.
 *
 * The upstream component calls `gsap.registerPlugin(CustomEase)` at module
 * scope. It must not: spec 12 requires one registration, and a second one is
 * silent. Registration goes through lib/gsap.ts, which counts them.
 */

/* No `shape`: the ambient shapes those numbers keyed are gone. */
type NavLink = { label: string; href: string };

/** One per section. */
const LINKS: NavLink[] = [
  { label: "Features", href: "#features" },
  { label: "Coverage", href: "#coverage" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

/**
 * The two paths, verbatim from the reference (Uiverse, JulanDeAlb). The morph
 * is entirely stroke-dasharray on the first path plus a -45deg rotation of the
 * whole icon, so the geometry must not be touched: the 12/63 and 20/300 dash
 * pairs and the -32.42 offset are measured against THESE path lengths.
 */
const PATH_TOP_BOTTOM =
  "M27 10 13 10C10.8 10 9 8.2 9 6 9 3.5 10.8 2 13 2 15.2 2 17 3.8 17 6L17 26C17 28.2 18.8 30 21 30 23.2 30 25 28.2 25 26 25 23.8 23.2 22 21 22L7 22";
const PATH_MIDDLE = "M7 16 27 16";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SterlingGateNavigation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { stop, start } = useSmoothScroll();

  const close = useCallback(() => setIsMenuOpen(false), []);

  /* ---- one registration, counted ------------------------------------ */
  useEffect(() => {
    registerGsap();
  }, []);

  /*
   * The ambient hover shapes are GONE — markup, handlers and tweens.
   *
   * Six SVGs of circles and rings, six mouseenter/mouseleave pairs, and a
   * gsap.fromTo per hover. Menu links keep their own text hover state, which
   * is the one that tells a visitor what they are about to click.
   */

  /* ---- open / close -------------------------------------------------- */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      const wrap = wrapperRef.current;
      const menu = root.querySelector(`.${s.menuContent}`);
      const overlay = root.querySelector(`.${s.overlay}`);
      const panels = root.querySelectorAll(`.${s.backdropLayer}`);
      const links = root.querySelectorAll(`.${s.navLink}`);
      const fades = root.querySelectorAll("[data-menu-fade]");

      if (reduced) {
        // §2.4: instantly. No stagger, no entrance, no shape animation.
        gsap.set(wrap, { display: isMenuOpen ? "block" : "none" });
        gsap.set(menu, { xPercent: 0 });
        gsap.set(overlay, { autoAlpha: isMenuOpen ? 1 : 0 });
        gsap.set(panels, { xPercent: 0 });
        gsap.set(links, { yPercent: 0, rotate: 0 });
        gsap.set(fades, { autoAlpha: 1, yPercent: 0 });
        return;
      }

      const tl = gsap.timeline();
      if (isMenuOpen) {
        // gsap.set, NOT tl.set: the focus effect below runs in the same commit
        // and cannot focus anything inside a display:none subtree. A timeline's
        // frame 0 does not render until the next ticker tick; gsap.set applies
        // now.
        gsap.set(wrap, { display: "block" });
        /*
         * THE PANEL SLIDES IN; it used to be set straight to xPercent 0.
         *
         * The reference only `set`s the menu and slides the three backdrop
         * layers, which works there because the panel has a ground of its own
         * and the layers are a flourish over it. My inferred CSS gave the
         * panel no ground, so the layers WERE the ground — and the links start
         * at +0.35s while the last layer does not land until 0.24 + 0.575 =
         * 0.815s. For those 465ms the copy was painted over whatever the
         * layers had not reached yet: bare film at the panel's left edge, and
         * the transient orange beside it. Measured at 400ms, layers at
         * x = 946 / 1052 / 1207 with the panel's left edge at 880 and the
         * first link at 920.
         *
         * .menuContent now carries --surface-dark, and the panel itself
         * animates, so its ground arrives with it and its content can never
         * outrun it. It also makes open and close symmetric — close has always
         * been a slide (xPercent 120).
         */
        tl.fromTo(menu, { xPercent: 101 }, { xPercent: 0, duration: 0.575 })
          .fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1 }, "<")
          .fromTo(panels, { xPercent: 101 }, { xPercent: 0, stagger: 0.12, duration: 0.575 }, "<")
          .fromTo(links, { yPercent: 140, rotate: 10 }, { yPercent: 0, rotate: 0, stagger: 0.05 }, "<+=0.35")
          .fromTo(fades, { autoAlpha: 0, yPercent: 50 }, { autoAlpha: 1, yPercent: 0, stagger: 0.04, clearProps: "all" }, "<+=0.2");
      } else {
        tl.to(overlay, { autoAlpha: 0 })
          .to(menu, { xPercent: 120 }, "<")
          .set(wrap, { display: "none" });
      }
    }, containerRef);

    return () => ctx.revert();
  }, [isMenuOpen]);

  /* ---- §2.3 scroll lock ---------------------------------------------- */
  useEffect(() => {
    if (!isMenuOpen) return;
    stop();
    return () => start();
  }, [isMenuOpen, stop, start]);

  /* ---- §2.4 focus trap ------------------------------------------------ */
  useEffect(() => {
    if (!isMenuOpen) return;
    const wrap = wrapperRef.current;
    const toggle = toggleRef.current;
    if (!wrap || !toggle) return;

    // The toggle is the close control and sits outside the panel in the DOM,
    // so it belongs to the cycle: trapping strictly inside the panel would put
    // the only visible close button out of Tab's reach. It goes last, so Tab
    // from the final link reaches it and then wraps to the first link.
    // Filtered on visibility, not on offsetParent: the footer arrives on an
    // autoAlpha tween, so for the first fraction of a second it is
    // visibility:hidden — which the browser already skips in sequential focus.
    // A trap that hands focus to it would make Tab look dead. offsetParent is
    // the usual idiom and is unusable here: jsdom has no layout, so it is null
    // for everything and the filter would empty the cycle in tests.
    const cycle = () => [
      ...wrap.querySelectorAll<HTMLElement>(FOCUSABLE),
      toggle,
    ].filter((el) => getComputedStyle(el).visibility !== "hidden");

    /*
     * preventScroll IS THE POINT, not a nicety.
     *
     * An overflow:hidden box is still programmatically scrollable, and .focus()
     * scrolls every ancestor to reveal its target. The first link starts its
     * entrance translated 140% below its 65px row, so focusing it made the
     * browser scroll THAT ROW down 50px to bring it into view. Measured
     * (build/diagnose-links.js): row scrolled at t=78ms and held until 785ms.
     *
     * The tween was never the problem — all six travel 90.72px, 55/91/122/195/
     * 248ms apart, ~490ms each. But Features was visually 50px ahead of its own
     * transform for the whole entrance: half revealed before it started moving,
     * then carried 13px PAST its resting place before the scroll clamped back.
     * Which reads exactly as "the first one is already settled".
     *
     * Nothing here needs scrolling into view: the panel is on screen already.
     */
    cycle()[0]?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = cycle();
      if (list.length === 0) return;
      const here = list.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? here <= 0 ? list.length - 1 : here - 1
        : here === -1 || here === list.length - 1 ? 0 : here + 1;
      e.preventDefault();
      // Same reason: a Tab landing mid-entrance would scroll that link's row.
      list[next].focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  /* ---- §2.4 focus returns to the toggle on close ---------------------- */
  useEffect(() => {
    if (wasOpen.current && !isMenuOpen) toggleRef.current?.focus({ preventScroll: true });
    wasOpen.current = isMenuOpen;
  }, [isMenuOpen]);

  /* ---- Escape --------------------------------------------------------- */
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen, close]);

  return (
    /* `dark` is load-bearing: it is what resolves --ring to --accent-warm and
       the foreground tokens to the film's paper. The hero shipped for weeks
       with a dark-ground token that never applied because this class was
       missing there. */
    <div ref={containerRef} className={`dark ${s.root}`}>
      {/*
        A real <button>, not the reference's label-wrapping-checkbox: that
        pattern has no role, no expanded state, and no accessible name. The
        checkbox is gone entirely rather than made controlled — React already
        owns isMenuOpen, and data-open is the only thing the CSS needs.
      */}
      <button
        ref={toggleRef}
        type="button"
        className={s.hamburger}
        data-open={isMenuOpen}
        onClick={() => setIsMenuOpen((v) => !v)}
        aria-expanded={isMenuOpen}
        aria-controls="site-menu"
        aria-label={isMenuOpen ? "Close menu" : "Open menu"}
      >
        <svg className={s.icon} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          {/* The collar, first so it paints underneath. Same paths, same
              classes, so it morphs with the ink instead of trailing it. */}
          <path className={`${s.line} ${s.collar} ${s.lineTopBottom}`} d={PATH_TOP_BOTTOM} />
          <path className={`${s.line} ${s.collar}`} d={PATH_MIDDLE} />
          <path className={`${s.line} ${s.lineTopBottom}`} d={PATH_TOP_BOTTOM} />
          <path className={s.line} d={PATH_MIDDLE} />
        </svg>
      </button>

      <section className={s.menuContainer}>
        <div
          ref={wrapperRef}
          id="site-menu"
          data-nav={isMenuOpen ? "open" : "closed"}
          className={s.overlayWrapper}
          /* §2.4. Only while open: a dialog that is not showing must not
             claim to be modal. */
          role={isMenuOpen ? "dialog" : undefined}
          aria-modal={isMenuOpen ? true : undefined}
          aria-label={isMenuOpen ? "Site menu" : undefined}
        >
          {/* §2.4: decorative, keyboard users close with Escape. */}
          <div className={s.overlay} onClick={close} aria-hidden="true" />
          <nav className={s.menuContent} aria-label="Site">
            <div className={s.menuBg}>
              <div className={`${s.backdropLayer} ${s.backdropFirst}`} />
              <div className={`${s.backdropLayer} ${s.backdropSecond}`} />
              <div className={s.backdropLayer} />

            </div>

            <div className={s.contentWrapper}>
              <ul className={s.menuList}>
                {LINKS.map((l) => (
                  <li key={l.href} className={s.menuListItem}>
                    <a href={l.href} className={s.navLink} onClick={close}>
                      <p className={s.navLinkText}>{l.label}</p>
                      <span className={s.navLinkHoverBg} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>

            </div>
          </nav>
        </div>
      </section>
    </div>
  );
}
