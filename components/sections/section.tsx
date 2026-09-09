import type { ReactNode } from "react";
import { DarkGround } from "./page-ground";
import { BlurReveal, BlurBody } from "@/components/ui/blur-reveal";

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
 * ── The ground is opaque, always — AMENDED ────────────────────────────────
 *
 * Originally: every tone sets an explicit background, none inherits the
 * page's, the navbar lesson stated as a rule rather than remembered as an
 * anecdote.
 *
 * Build spec §4a introduces ONE page-level ground for the whole post-hero run,
 * because a per-section lattice restarts its rhythm at every boundary. Paper
 * sections therefore declare no background and sit on that layer. Dark
 * sections still declare their own and paint over it.
 *
 * The rule is narrowed, not dropped: what it was protecting against was a
 * section with NO ground at all, which is what the menu panel shipped. A
 * section sitting on a named, deliberate page layer is not that. The guard
 * names the exempted sections one by one so the exemption cannot spread by
 * accident.
 */

export type SectionTone = "paper" | "dark";

const TONE: Record<SectionTone, string> = {
  /*
   * AMENDED for the page ground (build spec §4a.4). Paper sections no longer
   * paint their own ground — they sit on the one continuous layer, which is
   * the only way the lattice can run unbroken across a boundary.
   *
   * This is a NARROWING of "the ground is opaque, always", not an abandonment
   * of it, and the rule below still stands everywhere else. The guard was
   * narrowed the same way: paper sections are exempted BY NAME, dark sections
   * keep the requirement in full, and a dark section that stops painting its
   * own ground still fails.
   */
  paper: "text-foreground",
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
  split = false,
}: {
  id?: string;
  tone?: SectionTone;
  eyebrow: string;
  heading: string;
  subhead?: string;
  headingId: string;
  children?: ReactNode;
  className?: string;
  /** Header beside the content rather than above it. See the note below. */
  split?: boolean;
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
      {tone === "dark" ? <DarkGround /> : null}
      {/*
       * Vertical rhythm carries the separation between two paper sections,
       * because at 1.06:1 nothing else can. Generous by necessity, not taste:
       * clamp(72px, 9vw, 136px) top and bottom means the smallest gap between
       * two adjacent sections is 144px and the largest 272px.
       */}
      <div className="mx-auto max-w-6xl px-6 py-[clamp(72px,9vw,136px)]">
        {/*
         * SPLIT puts the header block in its own column beside the content
         * instead of above it. It exists for the FAQ, where a stacked heading
         * pushes a seven-item accordion most of a screen down the page and
         * leaves the top third empty — and where the header is short enough
         * to sit still while a long list changes height next to it.
         *
         * One grid, two arrangements, rather than a second Section: the
         * eyebrow, heading and subhead keep identical markup and identical
         * classes in both, so nothing about the type can drift between them.
         */}
        <div className={split ? "grid gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20" : ""}>
          <div className={split ? "lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start" : ""}>
            <p className="label-mono text-muted-foreground">{eyebrow}</p>
            {/* §4 — headings only. The scope note lives in blur-reveal.tsx. */}
            <BlurReveal
              as="h2"
              id={headingId}
              className="mt-4 max-w-[18ch] text-4xl sm:text-5xl"
              inView
              once
              speedReveal={1.5}
              speedSegment={0.5}
            >
              {heading}
            </BlurReveal>
            {subhead ? (
              <BlurBody className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
                {subhead}
              </BlurBody>
            ) : null}
          </div>
          {children ? <div className={split ? "" : "mt-14"}>{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
