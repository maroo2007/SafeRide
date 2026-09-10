import { DarkGround } from "./page-ground";
import { BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.13 Footer — dark, and keeping its own ground, grid and glow.
 *
 * It paints `--surface-dark` and carries DarkGround. Since the Intelligence
 * Layer was deleted this is the only dark ground on the page, and it keeps
 * its grid and its glow — the rule that removed the paper lattice was about
 * two textures competing in the same pixels, and a dark section is opaque.
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
    ["Coverage", "#coverage"],
    ["Pricing", "#pricing"],
  ]],
  ["Company", [
    ["FAQ", "#faq"],
    ["Contact", "#contact"],
    /* The only off-site link on the page now: the Final CTA's Log In button
       and the navbar's were both removed. It still points at the old site's
       login because that is the only one that exists — logged in TODO.md. */
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
            <BlurBody className="mt-4 max-w-[44ch] leading-relaxed text-muted-foreground">
              Because every child deserves a safe ride home. AI-powered school transportation for the schools that take safety seriously.
            </BlurBody>
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
