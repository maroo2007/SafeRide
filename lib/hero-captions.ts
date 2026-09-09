/**
 * The film's length, seconds. Only a pre-metadata fallback: the hero prefers
 * the video element's own `duration`, so a re-encode of a different length
 * cannot silently desync the captions from the picture.
 */
export const FILM_SECONDS = 2510 / 48;

/** A timestamp in the film as a 0..1 fraction of it. Was `atSecond` in the
 *  deleted scrub module, where it converted seconds to scroll progress; the
 *  arithmetic is identical because that mapping was linear. */
export const atSecond = (s: number) => s / FILM_SECONDS;


/**
 * Hero overlay schedule.
 *
 * Timings are anchored to timestamps in the source film, expressed as a
 * fraction of its length.
 *
 * They used to be described as SCROLL progress, because scroll drove the
 * playhead. With the scrub removed they are read from `currentTime` instead —
 * and because that mapping was linear, the numbers did not have to change.
 * Same moments, different clock. They live here, not in the component, so they can be tuned
 * against the real footage without touching rendering code.
 *
 * `ink`, `scrim` and `worstContrast` are not preferences. They come from
 * compositing the candidate scrim over real decoded frames, per pixel, at the
 * exact viewport rectangle the text occupies, and taking the worst pixel of
 * the worst frame across the whole segment — a caption sits for its entire
 * segment, so the worst frame governs. See `build/scrim-lab.js`.
 *
 * CORRECTION. An earlier version of this table was measured by cropping the
 * SOURCE frame and averaging its luma. That was wrong twice over:
 *   - it ignored object-cover, so it sampled a region of the film that is not
 *     where the caption actually lands on screen;
 *   - it averaged, which hides the dark and bright extremes that decide
 *     whether a glyph reads.
 * Both errors flattered the result. The old table claimed "alerts" reached
 * 11.26:1 unscrimmed and "coverage" 5.03:1 in white; measured properly at the
 * real rectangle both bottom out at 1.00:1. Every caption needs the scrim.
 *
 * The three rows now carry the same treatment. That is an outcome, not a
 * simplification — the fields stay per-caption because the film is scheduled
 * for a re-grade (see TODO.md), after which these will diverge again.
 */

export type CaptionInk = "ink" | "white";

export type Caption = {
  id: string;
  /** Verbatim from the spec. Never baked into the video. */
  text: string;
  /** Scroll progress, 0..1. */
  from: number;
  to: number;
  ink: CaptionInk;
  /** A soft gradient anchored to the viewport corner — never a bounded panel. */
  scrim: boolean;
  /**
   * Worst-case contrast of `ink` against the composited ground over the whole
   * segment, at the tighter of 1440x900 and 1920x1080. Must clear 4.5:1.
   */
  worstContrast: number;
  /** Why this ink and this scrim. Kept next to the value so it survives tuning. */
  evidence: string;
};

export const CAPTIONS: Caption[] = [
  {
    id: "boarding",
    text: "Face recognition confirms the right child boarded the right bus.",
    from: atSecond(11.1),
    to: atSecond(17.0),
    ink: "ink",
    scrim: true,
    worstContrast: 5.11,
    evidence:
      "Unscrimmed the segment bottoms out at 1.00:1 for dark ink (ground rgb(12,13,9)) and 1.04:1 for white (ground rgb(212,204,188)) — it contains both extremes, so no ink survives it alone. With the scrim: 5.11:1 worst pixel, 5.59 at the 5th percentile.",
  },
  {
    id: "alerts",
    text: "Every boarding, arrival, and delay reaches the parent instantly.",
    from: atSecond(22.0),
    to: atSecond(32.6),
    ink: "ink",
    scrim: true,
    worstContrast: 5.36,
    evidence:
      "Previously marked scrim:false on an averaged reading of 11.26:1. At the real rectangle the median is indeed high (13.84) but the worst pixel is 1.00:1 — the orange bus crosses the lower left. A median cannot clear a caption. With the scrim: 5.36:1 worst.",
  },
  {
    id: "coverage",
    text: "Live coverage across Cairo, Giza, Alexandria and beyond.",
    from: atSecond(34.0),
    to: atSecond(43.0),
    ink: "ink",
    scrim: true,
    worstContrast: 5.26,
    evidence:
      "Restored to the spec's 34.0s. The 35.0s shift existed only to dodge the white-out tail for unscrimmed white ink; measured with the scrim, 34.0-43.0 and 35.0-43.0 are indistinguishable (5.27 vs 5.27 worst), so the deviation had no reason to survive.",
  },
];

/**
 * Hero scrim — dark, raked across the frame from the copy side.
 *
 * The previous 105deg version was modelled as a flat 0.45 alpha, which is what
 * produced a predicted 7.54:1 for the headline against a measured 2.63:1. A
 * gradient decays ACROSS the very box the text occupies: at the headline's far
 * end the old alpha was ~0.12, not 0.45. Averaging the scrim away is the bug.
 *
 * This one reaches exactly zero at 90% of the gradient line, which is short of
 * the right edge at both target viewports (verified alpha 0.00000 there), so
 * it has no boundary anywhere on screen — it reads as grading, not as a panel.
 */
export const HERO_SCRIM =
  "linear-gradient(98deg, rgba(3,3,2,.86) 0%, rgba(3,3,2,.72) 34%, rgba(3,3,2,.48) 60%, rgba(3,3,2,.16) 78%, rgba(3,3,2,0) 90%)";

/**
 * Caption scrim — a light wash out of the bottom-left corner.
 *
 * Anchored to the FULL viewport on purpose. The earlier versions were given
 * their own shorter box, and a gradient that has not reached its transparent
 * stop by the end of its box gets cut off square — that is precisely the
 * hard-edged rectangle. Here the left and bottom are screen edges, which
 * cannot show a seam, and the ellipse reaches zero at 0.94 of a radius that
 * runs out at 1.15 horizontally and 2.38 vertically. Verified: maximum alpha
 * anywhere on the top or right edge is 0.00000 at both viewports.
 *
 * The plateau is 0.50 because that is the weakest value that still clears
 * 4.5:1 on every caption. Every unit of alpha past that is footage the visitor
 * paid to download and cannot see.
 */
export const CAPTION_SCRIM =
  "radial-gradient(75% 42% at 14% 100%, rgba(253,248,240,.56) 0%, rgba(253,248,240,.50) 58%, rgba(253,248,240,.26) 76%, rgba(253,248,240,0) 94%)";

/** The hero copy, which is real DOM text and never gated on video progress. */
export const HERO = {
  eyebrow: "AI-Powered School Transportation Safety",
  headline: "Because every child deserves a safe ride home",
  primaryCta: { label: "Explore Platform", href: "#features" },
  /*
   * "#difference", not "#story", and this is a compromise rather than a fix.
   *
   * It pointed at #story, and no section with that id has ever existed on
   * this page — the hero's secondary button scrolled nowhere, which is the
   * same defect as a link pointing at "#" with an extra step, and it is what
   * removed six links from the footer. Caught by the in-page link check in
   * build/verify-faq-contact.js, which resolves every hash against the DOM.
   *
   * #difference is "Why Choose SafeRide", which is the nearest thing on the
   * page to the case this label promises. It is not a story section, and the
   * honest resolution is either to build one or to change the label. Logged
   * in TODO.md rather than settled here, because both are content decisions.
   */
  ghostCta: { label: "Our Story", href: "#difference" },
  /**
   * Hero copy fade window (spec 1.6: finishes by 0.12).
   *
   * fadeOutFrom is 0.03, not 0. The spec says the fade FINISHES by 0.12; it
   * does not say it starts at 0. Read as starting at 0, the headline's 7.28:1
   * existed at exactly one scroll position and was already under 4.5:1 by
   * ~90px of scrolling — a technicality rather than a legible headline. The
   * plateau gives it 0..0.03 at full opacity, which at 1200vh is 297px of
   * scrolling at a 900px viewport.
   */
  /*
   * fadeOutFrom / fadeOutTo / scrimHoldTo / scrimGoneBy are RETAINED BUT NO
   * LONGER APPLIED, and that is deliberate rather than an oversight.
   *
   * They described a fade against SCROLL progress inside a 1200vh runway.
   * With the scrub removed the hero is one viewport, there is no scroll
   * "within" it to fade against, and feeding these numbers film time instead
   * would fade the headline and both CTAs away a few seconds after load while
   * the visitor is still looking at them.
   *
   * The copy and its scrim are constant now. These stay because the contrast
   * figures below were measured across this window and are the evidence for
   * `scrimOpacity`; deleting them would leave that number unexplained.
   */
  fadeOutFrom: 0.03,
  fadeOutTo: 0.12,
  /**
   * The constant hero scrim.
   *
   * This is the plateau value the fade used to start from — the strength at
   * which the worst pixel over both target viewports measured 7.28:1 on the
   * headline and 11.51:1 on the eyebrow. Holding it means the copy sits at
   * its best measured contrast for as long as it is on screen, rather than at
   * its worst.
   */
  scrimOpacity: 1,
  /**
   * The scrim fades on its OWN schedule, deliberately trailing the copy.
   *
   * Tying it to the copy compounded two losses: the ink weakened while the
   * ground it sat on brightened at the same rate. Measured, that took the
   * headline to 2.15:1 at progress 0.05 while the copy was still 58% opaque.
   * Holding the scrim through 0.06 lifts the same point to 3.47:1 — the fall
   * is then only the glyph's own alpha, which is what a fade should look like.
   *
   * 0.06 rather than something longer because the numbers are identical for
   * every hold past it while the copy is still on screen; a longer hold only
   * dims footage that no longer has copy to protect. Spec 1.6 governs the
   * COPY timing and is untouched; the scrim is not in the spec.
   */
  /* Moved with the plateau. The copy now passes half opacity at 0.075
     (1 - (p - 0.03) / 0.09 = 0.5), not at 0.06, and the scrim must still be
     at full strength there — otherwise the ground brightens while the ink
     weakens, which is the compounding the trailing scrim exists to stop. */
  scrimHoldTo: 0.075,
  scrimGoneBy: 0.15,
  /**
   * Worst pixel, both target viewports, composited over real frames.
   * The first pair is at full opacity. `whileHalfOpaque` is the floor for as
   * long as the copy is at least 50% opaque.
   *
   * OPEN QUESTION, flagged rather than decided: those floors are below AA
   * because `fadeOutFrom` is 0, so the copy begins dissolving on the first
   * pixel of scroll and has no readable plateau at all. Spec 1.6 gives the
   * window as 0.00-0.12 without saying whether the fade must START at 0. A
   * short hold (fadeOutFrom ~0.03) would give the headline a beat at 7.28:1
   * before it goes. Not changed unilaterally — it is a spec reading.
   */
  worstContrast: {
    /* Worst pixel ANYWHERE on the plateau (progress 0..fadeOutFrom), sampled
       across both target viewports. Not the value at progress 0: a figure
       that holds at one scroll position is a technicality. */
    headline: 6.72,
    eyebrow: 10.24,
    /* Once the copy is dissolving these necessarily fall — the glyph itself
       is going. Recorded so the decline is documented rather than discovered. */
    whileHalfOpaque: { headline: 2.92, eyebrow: 3.72 },
  },
} as const;

/** Opacity for a caption at a given scroll progress, with soft in/out edges. */
export function captionOpacity(c: Caption, progress: number, feather = 0.018): number {
  if (progress <= c.from - feather || progress >= c.to + feather) return 0;
  if (progress < c.from) return (progress - (c.from - feather)) / feather;
  if (progress > c.to) return ((c.to + feather) - progress) / feather;
  return 1;
}

/** Hero scrim opacity — holds, then trails the copy out. */
export function heroScrimOpacity(progress: number): number {
  if (progress <= HERO.scrimHoldTo) return 1;
  if (progress >= HERO.scrimGoneBy) return 0;
  return 1 - (progress - HERO.scrimHoldTo) / (HERO.scrimGoneBy - HERO.scrimHoldTo);
}

/** Hero copy opacity — 1 until fadeOutFrom, 0 by fadeOutTo. */
export function heroCopyOpacity(progress: number): number {
  if (progress <= HERO.fadeOutFrom) return 1;
  if (progress >= HERO.fadeOutTo) return 0;
  return 1 - (progress - HERO.fadeOutFrom) / (HERO.fadeOutTo - HERO.fadeOutFrom);
}
