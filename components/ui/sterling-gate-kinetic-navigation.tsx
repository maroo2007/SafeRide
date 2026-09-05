"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap, registerGsap } from "@/lib/gsap";
import s from "./sterling-gate-kinetic-navigation.module.css";

/**
 * Sterling Gate kinetic navigation, adapted for SafeRide (spec 2).
 *
 * Adaptations applied here (§2.2):
 *   A  six links, not five, each with a matching ambient shape
 *   B  ambient shapes recoloured off indigo/violet/pink onto brand tones,
 *      alphas unchanged so they stay ambient
 *   C  none of the component's :root block — SafeRide tokens only
 *   D  the "click me" demo label is gone
 *   E  the empty logo anchor carries the wordmark, linked to #top
 *   F  language toggle and Log In on the right
 *
 * NOT yet done, deliberately, so the next step is visible: the §2.4
 * accessibility work beyond the trivial fixes — focus trap, dialog role,
 * focus return, reduced-motion instant open — and the §2.3 Lenis stop.
 *
 * The upstream component calls `gsap.registerPlugin(CustomEase)` at module
 * scope. It must not: spec 12 requires one registration, and a second one is
 * silent. Registration goes through lib/gsap.ts, which counts them.
 */

type NavLink = { shape: number; label: string; href: string };

/** §2.2 A. Six, not the shipped five. */
const LINKS: NavLink[] = [
  { shape: 1, label: "Features", href: "#features" },
  { shape: 2, label: "AI Platform", href: "#ai" },
  { shape: 3, label: "Coverage", href: "#coverage" },
  { shape: 4, label: "Pricing", href: "#pricing" },
  { shape: 5, label: "FAQ", href: "#faq" },
  { shape: 6, label: "Contact", href: "#contact" },
];

const LOGIN_HREF = "https://safe-ridee.vercel.app/login";

export function SterlingGateNavigation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");

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
      const wrap = root.querySelector<HTMLElement>(`.${s.overlayWrapper}`);
      const menu = root.querySelector(`.${s.menuContent}`);
      const overlay = root.querySelector(`.${s.overlay}`);
      const panels = root.querySelectorAll(`.${s.backdropLayer}`);
      const links = root.querySelectorAll(`.${s.navLink}`);
      const btnTexts = root.querySelectorAll(`.${s.buttonText} p`);
      const icon = root.querySelector(`.${s.menuButtonIcon}`);

      if (reduced) {
        // §2.4: instantly. No stagger, no entrance, no shape animation.
        gsap.set(wrap, { display: isMenuOpen ? "block" : "none" });
        gsap.set(menu, { xPercent: 0 });
        gsap.set(overlay, { autoAlpha: isMenuOpen ? 1 : 0 });
        gsap.set(panels, { xPercent: 0 });
        gsap.set(links, { yPercent: 0, rotate: 0 });
        gsap.set(btnTexts, { yPercent: isMenuOpen ? -100 : 0 });
        gsap.set(icon, { rotate: isMenuOpen ? 315 : 0 });
        return;
      }

      const tl = gsap.timeline();
      if (isMenuOpen) {
        tl.set(wrap, { display: "block" })
          .set(menu, { xPercent: 0 }, "<")
          .fromTo(btnTexts, { yPercent: 0 }, { yPercent: -100, stagger: 0.2 })
          .fromTo(icon, { rotate: 0 }, { rotate: 315 }, "<")
          .fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1 }, "<")
          .fromTo(panels, { xPercent: 101 }, { xPercent: 0, stagger: 0.12, duration: 0.575 }, "<")
          .fromTo(links, { yPercent: 140, rotate: 10 }, { yPercent: 0, rotate: 0, stagger: 0.05 }, "<+=0.35");
      } else {
        tl.to(overlay, { autoAlpha: 0 })
          .to(menu, { xPercent: 120 }, "<")
          .to(btnTexts, { yPercent: 0 }, "<")
          .to(icon, { rotate: 0 }, "<")
          .set(wrap, { display: "none" });
      }
    }, containerRef);

    return () => ctx.revert();
  }, [isMenuOpen]);

  /* ---- Escape --------------------------------------------------------- */
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  const shapeFill = (a: number) => `rgba(251,138,0,${a})`;
  const shapeAlt = (a: number) => `rgba(185,85,26,${a})`;
  const shapeWarm = (a: number) => `rgba(197,191,171,${a})`;

  return (
    <div ref={containerRef} className={s.root}>
      <div className={s.headerWrapper}>
        <header className={s.header}>
          <nav className={s.navRow} aria-label="Primary">
            {/* §2.2 E — was an empty anchor. */}
            <a href="#top" aria-label="SafeRide home" className={s.logoRow}>
              {/* The asset is a square 159x159 MARK, not a wordmark. Declaring 140x28
                  gave next/image a 5:1 intrinsic aspect for a 1:1 file. */}
              <Image src="/images/saferide-logo.png" alt="SafeRide" width={159} height={159} priority />
            </a>

            <div className={s.navRight}>
              {/* §2.2 F */}
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

              {/* §2.2 D: the "click me" label is gone. §2.4: role="button" on a
                  <button> was redundant and is removed. */}
              <button
                type="button"
                className={s.closeBtn}
                onClick={() => setIsMenuOpen((v) => !v)}
                aria-expanded={isMenuOpen}
                aria-controls="site-menu"
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              >
                <span className={s.buttonText} aria-hidden="true">
                  <p>Menu</p>
                  <p>Close</p>
                </span>
                <span className={s.iconWrap} aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" className={s.menuButtonIcon}>
                    <path d="M7.33333 16L7.33333 0L8.66667 0L8.66667 16L7.33333 16Z" fill="currentColor" />
                    <path d="M16 8.66667L0 8.66667L0 7.33333L16 7.33333L16 8.66667Z" fill="currentColor" />
                  </svg>
                </span>
              </button>
            </div>
          </nav>
        </header>
      </div>

      <section className={s.menuContainer}>
        <div id="site-menu" data-nav={isMenuOpen ? "open" : "closed"} className={s.overlayWrapper}>
          {/* §2.4: decorative, keyboard users close with Escape. */}
          <div className={s.overlay} onClick={() => setIsMenuOpen(false)} aria-hidden="true" />
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
                    <a href={l.href} className={s.navLink} onClick={() => setIsMenuOpen(false)}>
                      <p className={s.navLinkText}>{l.label}</p>
                      <span className={s.navLinkHoverBg} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <div className={s.menuFooter} data-menu-fade>
                <a className={s.utility} href={LOGIN_HREF}>Log In</a>
              </div>
            </div>
          </nav>
        </div>
      </section>
    </div>
  );
}
