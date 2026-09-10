"use client";

import { motion } from "framer-motion";
import { Fragment } from "react";
import type { CSSProperties, ElementType } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * BlurReveal — a heading that resolves out of a blur, character by character.
 *
 * ── `framer-motion`, not `motion` ─────────────────────────────────────────
 *
 * The brief says `npm install motion`. `motion` IS framer-motion under its
 * newer package name, and framer-motion 13 is already a dependency here and
 * already in the bundle for the hero and the navbar. Installing the other
 * name would put a second copy of the same animation runtime in the payload,
 * which works directly against the first rule. Same library, same API, no new
 * weight.
 *
 * ── Scope is the whole design of this component ───────────────────────────
 *
 * One character is one animated element. A 44-character heading is 44 of
 * them. Applied to every paragraph, bullet and label on this page that would
 * be several thousand animated nodes, and no amount of easing makes that
 * smooth — so this is used on section headings, the three Scroll Stack card
 * headings and the Final CTA, and nowhere else. It is not a general-purpose
 * text wrapper and should not become one.
 *
 * ── children is a string, and here that costs nothing ─────────────────────
 *
 * The type is `string` because the component splits it. That would be a real
 * constraint on a site whose headings carry an italic accent span — passing
 * that JSX would throw. Every heading on this page is already a plain string
 * prop on <Section>, so nothing is lost and no heading has to opt out.
 *
 * ── Reduced motion renders no component at all ────────────────────────────
 *
 * Not a faster animation and not a zero-duration one: the plain string, in
 * the plain tag, with no motion elements in the tree. Guarded by asserting
 * that zero of them exist.
 *
 * Selection: per-character spans break clean copy-and-paste of a heading.
 * That is accepted here and is the other reason this stays off body copy.
 * The full string is present as an sr-only node, so assistive tech and the
 * clipboard-by-selection case both still have one contiguous run of text.
 */

/** The visually-hidden recipe, inline so nothing can drop it. */
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};

export type BlurRevealProps = {
  children: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** Seconds for one character to resolve. */
  speedReveal?: number;
  /** Seconds between one character starting and the next. */
  speedSegment?: number;
  /** Animate when scrolled into view rather than on mount. */
  inView?: boolean;
  /** Animate once and stay resolved. */
  once?: boolean;
};

export function BlurReveal({
  children,
  as,
  className,
  id,
  speedReveal = 1.5,
  speedSegment = 0.5,
  inView = true,
  once = true,
}: BlurRevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  /* ?blur=off renders the plain heading, so the cost of this effect can be
     measured against its own absence on one build rather than two. */
  const off = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("blur") === "off",
    () => false,
  );

  /*
   * PLAIN UNTIL IT IS NEARLY ON SCREEN.
   *
   * The server used to render every character of every heading as its own
   * motion component — 311 of them — and the browser hydrated all 311 during
   * load. Measured on the production build: 2,060ms of total blocking time
   * against 660ms without, and 14 Lighthouse points. The scroll itself was
   * always 60fps; the cost was entirely at load, where a blocked main thread
   * is exactly the jank rule 1 exists to prevent.
   *
   * So the server sends the heading as text, and it becomes an animated
   * heading only when it is within 200px of the viewport — which is off
   * screen, so the swap is never seen. One or two headings are ever in that
   * state at a time instead of all eleven at once, and the effect keeps its
   * full scope rather than being cut back.
   */
  const hostRef = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduced || off || armed) return;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setArmed(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setArmed(true); io.disconnect(); } },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, off, armed]);

  if (reduced || off || !armed) {
    return (
      <Tag ref={hostRef} className={className} id={id}>
        {children}
      </Tag>
    );
  }

  /* Split on spaces so a word never breaks across a line mid-animation, then
     on characters within each word. The spaces are rendered as their own
     inline nodes rather than as part of a character, so wrapping behaves
     exactly as it would with plain text. */
  const words = children.split(" ");
  let index = 0;

  const duration = Math.max(0.05, 0.6 / speedReveal);
  const stagger = Math.max(0.005, 0.05 / Math.max(0.01, speedSegment) / 10);

  const animateProps = inView
    ? { whileInView: "shown" as const, viewport: { once, amount: 0.35 } }
    : { animate: "shown" as const };

  return (
    <Tag className={className} id={id}>
      {/*
        The whole string, once, for anything that reads rather than looks —
        crawlers, find-in-page, and a clean copy-and-paste.

        HIDDEN BY INLINE STYLE, not by the sr-only utility. It shipped as
        className="sr-only" and rendered VISIBLE, so every heading appeared
        twice: the real string followed by the same words with the spaces
        stripped out, because the animated copy puts each word in its own
        inline-block. Whatever swallowed that class, a style attribute cannot
        be purged, overridden by specificity, or missed by a scanner.
      */}
      <span style={SR_ONLY}>{children}</span>
      <motion.span
        aria-hidden="true"
        initial="hidden"
        {...animateProps}
        /* The parent owns the timing; each character inherits it. One
           transition object rather than one per character. */
        transition={{ staggerChildren: stagger }}
        style={{ display: "inline" }}
      >
        {words.map((word, w) => (
          /*
           * THE SPACE GOES BETWEEN THE WORDS, not inside one.
           *
           * It was the last child of the word's own span, which is an
           * inline-block with white-space: nowrap — so the trailing space
           * collapsed and every revealed heading lost its spaces:
           * "Protecting journeys across Egypt" rendered as
           * "Protectingjourneys acrossEgypt". As a sibling text node between
           * two inline-blocks it is a real space and wraps normally.
           */
          <Fragment key={w}>
          <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
            {Array.from(word).map((ch, c) => {
              const i = index++;
              return (
                <motion.span
                  key={c}
                  variants={{
                    hidden: { opacity: 0, filter: "blur(10px)", y: "0.18em" },
                    shown: { opacity: 1, filter: "blur(0px)", y: "0em" },
                  }}
                  transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
                  style={{ display: "inline-block", willChange: "filter, opacity, transform" }}
                  data-blur-char={i}
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
          {w < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </motion.span>
    </Tag>
  );
}

/**
 * WHETHER BODY COPY IS REVEALED TOO.
 *
 * Item 1 asked for this on every heading, subhead, paragraph, bullet and card
 * description, with the instruction to measure once and pull it back from body
 * copy if it drops below 50fps — keeping every heading either way.
 *
 * This constant is that lever, and it exists so the decision is one edit
 * rather than an edit to every component. `BlurBody` is what body copy uses;
 * when the constant is false it renders the plain element and headings are
 * untouched.
 */
export const REVEAL_BODY = false;
/*
 * MEASURED, AND PULLED BACK. One 6s scroll past the Difference-to-
 * Testimonials stretch, read from the compositor:
 *
 *   body copy revealed too   876 animated chars   50.6/s   100 dropped
 *   headings only              0 extra chars      59.9/s     1 dropped
 *
 * 15.5% of presented frames and a hundred dropped, which is the jank rule 1
 * exists to prevent — so body copy is plain and every heading keeps the
 * reveal, exactly as item 1 instructed. Flip this to true to put it back;
 * every call site is already in place.
 */

/**
 * Body copy's wrapper. Same component, one gate.
 *
 * Deliberately NOT the same call as a heading: a heading is always revealed
 * and a paragraph is revealed only while REVEAL_BODY holds, so the two are
 * distinguishable at every call site and the pull-back cannot take a heading
 * with it by accident.
 */
export function BlurBody({ children, as, className, id }: BlurRevealProps) {
  const Tag = (as ?? "p") as ElementType;
  if (!REVEAL_BODY) {
    return (
      <Tag className={className} id={id}>
        {children}
      </Tag>
    );
  }
  /* Faster per character than a heading: body copy is longer, and a heading's
     pace over forty words reads as a page that will not settle. */
  return (
    <BlurReveal as={Tag} className={className} id={id} inView once speedReveal={2.4} speedSegment={1.2}>
      {children}
    </BlurReveal>
  );
}
