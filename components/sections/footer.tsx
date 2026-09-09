import { DarkGround } from "./page-ground";

/**
 * §4.13 Footer — dark, and keeping its own ground, grid and glow.
 *
 * It paints `--surface-dark` and carries DarkGround exactly as the
 * Intelligence Layer does. §4b removed the PAPER lattice because a hairline
 * grid over drifting ribbons is two textures in the same pixels; a dark
 * section is opaque, the video is not behind it, and its grid has nothing to
 * compete with. So the rule that removed one grid does not touch this one.
 *
 * ── Six links are missing on purpose ──────────────────────────────────────
 *
 * The source site's footer has four social icons plus Privacy Policy and
 * Terms of Service, and all six point at "#". They are REMOVED here rather
 * than repointed: a link that goes nowhere is worse than no link, because it
 * costs a visitor a click and a screen reader user a stop in the tab order to
 * find out it was never real.
 *
 * PRIVACY AND TERMS ARE LAUNCH-BLOCKING, not deferred decoration. SafeRide
 * runs face recognition on children, so those pages are a legal requirement
 * and not a content task — and a link to an empty one would be worse than
 * their absence, because it would look like the obligation had been met. Both
 * are in TODO.md as required before any public launch.
 *
 * Every remaining link goes to a real destination on this page. Copy verbatim
 * from https://safe-ridee.vercel.app/ (spec 12).
 */

const COLUMNS: [string, [string, string][]][] = [
  ["Product", [
    ["Features", "#features"],
    ["AI Platform", "#ai"],
    ["Coverage", "#coverage"],
    ["Pricing", "#pricing"],
  ]],
  ["Company", [
    ["FAQ", "#faq"],
    ["Contact", "#contact"],
    /* The only off-site link in the footer, and the same target the final
       CTA uses. See the TODO on LOGIN_HREF in final-cta.tsx. */
    ["Log In", "https://safe-ridee.vercel.app/login"],
  ]],
];

export function Footer() {
  return (
    <footer className="dark relative isolate bg-surface-dark text-foreground">
      <DarkGround />
      <div className="mx-auto max-w-6xl px-6 py-[clamp(56px,7vw,96px)]">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <p className="text-2xl">SafeRide</p>
            <p className="mt-4 max-w-[44ch] leading-relaxed text-muted-foreground">
              Because every child deserves a safe ride home. AI-powered school
              transportation for the schools that take safety seriously.
            </p>
          </div>

          {/*
            nav, and labelled — two link lists in a footer are a landmark a
            screen reader user navigates to, and an unlabelled one is
            announced as just "navigation" alongside the site's main nav.
          */}
          <nav aria-label="Footer" className="grid gap-10 sm:grid-cols-2">
            {COLUMNS.map(([title, links]) => (
              <div key={title}>
                <h2 className="label-mono text-muted-foreground">{title}</h2>
                <ul className="mt-4 space-y-3">
                  {links.map(([label, href]) => (
                    <li key={label}>
                      <a
                        href={href}
                        className="tap-target inline-flex items-center rounded-sm text-foreground transition-colors duration-[--dur-micro] hover:text-accent-warm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 SafeRide. All rights reserved.</p>
          <p>Made for safer school journeys, everywhere.</p>
        </div>
      </div>
    </footer>
  );
}
