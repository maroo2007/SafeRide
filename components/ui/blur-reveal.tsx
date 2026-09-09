"use client";

import { motion } from "framer-motion";
import type { ElementType } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import { useSyncExternalStore } from "react";

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

  if (reduced || off) {
    return (
      <Tag className={className} id={id}>
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
      {/* The whole string, once, for anything that reads rather than looks. */}
      <span className="sr-only">{children}</span>
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
          <span key={w} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
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
            {w < words.length - 1 ? " " : null}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
