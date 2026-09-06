import type { ReactNode } from "react";

/**
 * The ground every content section stands on (spec §4).
 *
 * Built BEFORE any content, deliberately. The menu panel shipped with no
 * background because the ground was never decided separately from the thing
 * standing on it; a page of eleven sections is the same trap eleven times.
 *
 * ── Why there are two tones and not four ──────────────────────────────────
 *
 * The obvious rhythm is to alternate light grounds. Measured, that rhythm does
 * not exist:
 *
 *     --background (paper #fdf8f0) -> --card (#ffffff)    1.057:1
 *     --background -> --muted (warm-100 #f2ede3)          1.104:1
 *     --background -> --border hairline (warm-200)        1.29:1
 *     --background -> --surface-dark                      19.51:1
 *
 * At 1.06:1 a card-toned band is not a band, it is the same page with a
 * different token name. Any separation it appears to have comes entirely from
 * a border doing the work, which is a line pretending to be a ground.
 *
 * So: `paper` and `dark`. Rhythm comes from vertical space and from the
 * occasional dark section, both of which are real, rather than from tints that
 * measure 5% apart. Adding `card` back would be adding a token that changes
 * nothing and hides the decision.
 *
 * Text on each tone, all comfortably clear:
 *     ink on paper              18.82:1      muted on paper        8.70:1
 *     film paper on dark        19.94:1      dark muted on dark    8.93:1
 *     accent-warm on dark       16.77:1
 *
 * ── The ground is opaque, always ──────────────────────────────────────────
 *
 * Every tone sets an explicit background. None inherits the page's. That is
 * the navbar lesson stated as a rule rather than remembered as an anecdote.
 */

export type SectionTone = "paper" | "dark";

const TONE: Record<SectionTone, string> = {
  /* Explicit, not inherited. */
  paper: "bg-background text-foreground",
  /* `dark` flips the token scope; bg-surface-dark alone would leave --ring,
     --muted-foreground and the accent tokens on their light values, which is
     exactly how the hero's CTA wore a dark ring over footage for weeks. */
  dark: "dark bg-surface-dark text-foreground",
};

export function Section({
  id,
  tone = "paper",
  eyebrow,
  heading,
  subhead,
  headingId,
  children,
  className = "",
}: {
  id?: string;
  tone?: SectionTone;
  eyebrow: string;
  heading: string;
  subhead?: string;
  headingId: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      /*
       * `relative` and `isolate`: each section is its own stacking context, so
       * nothing inside one can paint over its neighbour. The floating nav is
       * fixed at z-70 and sits above all of them regardless.
       */
      className={`relative isolate ${TONE[tone]} ${className}`}
    >
      {/*
       * Vertical rhythm carries the separation between two paper sections,
       * because at 1.06:1 nothing else can. Generous by necessity, not taste:
       * clamp(72px, 9vw, 136px) top and bottom means the smallest gap between
       * two adjacent sections is 144px and the largest 272px.
       */}
      <div className="mx-auto max-w-6xl px-6 py-[clamp(72px,9vw,136px)]">
        <p className="label-mono text-muted-foreground">{eyebrow}</p>
        <h2 id={headingId} className="mt-4 max-w-[18ch] text-4xl sm:text-5xl">
          {heading}
        </h2>
        {subhead ? (
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
            {subhead}
          </p>
        ) : null}
        {children ? <div className="mt-14">{children}</div> : null}
      </div>
    </section>
  );
}
