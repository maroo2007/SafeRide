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
 *   A  six links, not five, each with a matching ambient shape
 *   B  ambient shapes recoloured off indigo/violet/pink onto brand tones,
 *      alphas unchanged so they stay ambient
 *   C  none of the component's :root block — SafeRide tokens only
 *   D  the "click me" demo label is gone
 *   E  dropped: there is no header for a logo to sit in
 *   F  language toggle and Log In, now in the panel footer
 *
 * §2.3: Lenis is stopped while the menu is open, so the film cannot scrub
 * behind the overlay. §2.4 in full: dialog role, focus trap, focus return,
 * visible rings, and instant open/close under reduced motion.
 *
 * The upstream component calls `gsap.registerPlugin(CustomEase)` at module
 * scope. It must not: spec 12 requires one registration, and a second one is
 * silent. Registration goes through lib/gsap.ts, which counts them.
 */

type NavLink = { shape: number; label: string; href: string };

/** §2.2 A. Six, not the shipped five. */
const LINKS: NavLink[] = [
  { shape: 1, label: "Features", href: "#features" },
  { shape: 3, label: "Coverage", href: "#coverage" },
  { shape: 4, label: "Pricing", href: "#pricing" },
  { shape: 5, label: "FAQ", href: "#faq" },
  { shape: 6, label: "Contact", href: "#contact" },
];

const LOGIN_HREF = "https://safe-ridee.vercel.app/login";

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
  const [lang, setLang] = useState<"en" | "ar">("en");

  const { stop, start } = useSmoothScroll();

  const close = useCallback(() => setIsMenuOpen(false), []);

  /* ---- one registration, counted ------------------------------------ */
  useEffect(() => {
    registerGsap();
  }, []);

  /* ---- ambient shape hover ------------------------------------------ */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    // §2.5: the shapes are pointer-only. On a touch device there is no hover,
    // so none of this is wired up rather than left running dead.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const items = root.querySelectorAll<HTMLElement>("[data-shape]");
      const shapes = root.querySelector(`.${s.ambientShapes}`);
      const cleanups: (() => void)[] = [];

      items.forEach((item) => {
        const idx = item.getAttribute("data-shape");
        const shape = shapes?.querySelector(`[data-bg-shape="${idx}"]`);
        if (!shape) return;
        const els = shape.querySelectorAll(".shape-element");

        const onEnter = () => {
          shapes?.querySelectorAll("[data-bg-shape]").forEach((el) => el.classList.remove(s.active));
          shape.classList.add(s.active);
          gsap.fromTo(els,
            { scale: 0.5, opacity: 0, rotation: -10 },
            { scale: 1, opacity: 1, rotation: 0, duration: 0.6, stagger: 0.08, ease: "back.out(1.7)", overwrite: "auto" });
        };
        const onLeave = () => {
          gsap.to(els, {
            scale: 0.8, opacity: 0, duration: 0.3, ease: "power2.in", overwrite: "auto",
            onComplete: () => shape.classList.remove(s.active),
          });
        };
        item.addEventListener("mouseenter", onEnter);
        item.addEventListener("mouseleave", onLeave);
        cleanups.push(() => {
          item.removeEventListener("mouseenter", onEnter);
          item.removeEventListener("mouseleave", onLeave);
        });
      });
      return () => cleanups.forEach((fn) => fn());
    }, containerRef);

    return () => ctx.revert();
  }, []);

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

  const shapeFill = (a: number) => `rgba(251,138,0,${a})`;
  const shapeAlt = (a: number) => `rgba(185,85,26,${a})`;
  const shapeWarm = (a: number) => `rgba(197,191,171,${a})`;

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

              {/* §2.2 B — same shapes, same alphas, brand tones. The sixth is
                  new (§2.2 A) and follows the same visual family. */}
              <div className={s.ambientShapes} aria-hidden="true">
                <svg className={s.bgShape} data-bg-shape="1" viewBox="0 0 400 400" fill="none">
                  <circle className="shape-element" cx="80" cy="120" r="40" fill={shapeFill(0.15)} />
                  <circle className="shape-element" cx="300" cy="80" r="60" fill={shapeAlt(0.12)} />
                  <circle className="shape-element" cx="200" cy="300" r="80" fill={shapeWarm(0.1)} />
                  <circle className="shape-element" cx="350" cy="280" r="30" fill={shapeFill(0.15)} />
                </svg>
                <svg className={s.bgShape} data-bg-shape="2" viewBox="0 0 400 400" fill="none">
                  <path className="shape-element" d="M0 200 Q100 100, 200 200 T 400 200" stroke={shapeFill(0.2)} strokeWidth="60" fill="none" />
                  <path className="shape-element" d="M0 280 Q100 180, 200 280 T 400 280" stroke={shapeAlt(0.15)} strokeWidth="40" fill="none" />
                </svg>
                <svg className={s.bgShape} data-bg-shape="3" viewBox="0 0 400 400" fill="none">
                  {[50, 150, 250, 350].map((x) => (
                    <circle key={x} className="shape-element" cx={x} cy="50" r="8" fill={shapeFill(0.3)} />
                  ))}
                  {[100, 200, 300].map((x) => (
                    <circle key={x} className="shape-element" cx={x} cy="150" r="12" fill={shapeAlt(0.25)} />
                  ))}
                  {[50, 150, 250, 350].map((x) => (
                    <circle key={x} className="shape-element" cx={x} cy="250" r="10" fill={shapeWarm(0.3)} />
                  ))}
                  {[100, 200, 300].map((x) => (
                    <circle key={x} className="shape-element" cx={x} cy="350" r="6" fill={shapeFill(0.3)} />
                  ))}
                </svg>
                <svg className={s.bgShape} data-bg-shape="4" viewBox="0 0 400 400" fill="none">
                  <path className="shape-element" d="M100 100 Q150 50, 200 100 Q250 150, 200 200 Q150 250, 100 200 Q50 150, 100 100" fill={shapeFill(0.12)} />
                  <path className="shape-element" d="M250 200 Q300 150, 350 200 Q400 250, 350 300 Q300 350, 250 300 Q200 250, 250 200" fill={shapeWarm(0.1)} />
                </svg>
                <svg className={s.bgShape} data-bg-shape="5" viewBox="0 0 400 400" fill="none">
                  <line className="shape-element" x1="0" y1="100" x2="300" y2="400" stroke={shapeFill(0.15)} strokeWidth="30" />
                  <line className="shape-element" x1="100" y1="0" x2="400" y2="300" stroke={shapeAlt(0.12)} strokeWidth="25" />
                  <line className="shape-element" x1="200" y1="0" x2="400" y2="200" stroke={shapeWarm(0.1)} strokeWidth="20" />
                </svg>
                {/* Sixth shape: concentric arcs, echoing the film's 3D network
                    converging to a point. Same family, same alpha range. */}
                <svg className={s.bgShape} data-bg-shape="6" viewBox="0 0 400 400" fill="none">
                  <circle className="shape-element" cx="200" cy="220" r="40" stroke={shapeFill(0.2)} strokeWidth="18" fill="none" />
                  <circle className="shape-element" cx="200" cy="220" r="95" stroke={shapeAlt(0.15)} strokeWidth="14" fill="none" />
                  <circle className="shape-element" cx="200" cy="220" r="150" stroke={shapeWarm(0.1)} strokeWidth="10" fill="none" />
                </svg>
              </div>
            </div>

            <div className={s.contentWrapper}>
              <ul className={s.menuList}>
                {LINKS.map((l) => (
                  <li key={l.shape} className={s.menuListItem} data-shape={l.shape}>
                    <a href={l.href} className={s.navLink} onClick={close}>
                      <p className={s.navLinkText}>{l.label}</p>
                      <span className={s.navLinkHoverBg} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>

              {/* §2.2 F, relocated: the utilities are in the panel now, so
                  they animate in with it rather than surviving beside it. */}
              <div className={s.menuFooter} data-menu-fade>
                <button
                  type="button"
                  className={`${s.utility} ${s.langToggle}`}
                  onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
                  aria-label={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
                >
                  <span className={lang === "en" ? s.langActive : undefined}>EN</span>
                  <span className={s.langSep} aria-hidden="true">/</span>
                  <span className={lang === "ar" ? s.langActive : undefined} lang="ar">العربية</span>
                </button>

                <a className={s.utility} href={LOGIN_HREF}>Log In</a>
              </div>
            </div>
          </nav>
        </div>
      </section>
    </div>
  );
}
