import { Button } from "@/components/ui/button";

/**
 * §4.9 Pricing — three tiers, Professional featured.
 *
 * ── How the featured tier is marked, and why not by fill ──────────────────
 *
 * The obvious move is to give Professional a tinted background. On this
 * palette that does nothing: --card measures 1.06:1 against paper, which is
 * the arithmetic §4's ground rule is built on — "elevation on paper is border
 * and shadow, not fill". A tint here would be a token change that changes no
 * pixels.
 *
 * So Professional is marked by weight instead: a full-strength border where
 * the others carry a hairline, the shadow, the badge, and the only `cta`
 * button on the page outside the hero. Those are all real separations.
 *
 * ── Every price here is real ──────────────────────────────────────────────
 *
 * EGP 1,500 and EGP 3,500 are the published figures; Enterprise is genuinely
 * "Custom" and is shown as that rather than as a number with a tilde in front
 * of it. Nothing on this page is a placeholder — the rule that cut the
 * coverage stat row and the `0+` counters applies here too.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

type Tier = {
  name: string;
  price: string;
  per?: string;
  blurb: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Basic",
    price: "EGP 1,500",
    per: "/month",
    blurb: "For a single school getting live tracking and parent notifications off the ground.",
    features: ["Up to 2 buses", "Live GPS tracking", "Parent notifications", "Driver app", "Email support"],
    cta: "Start Free Trial",
  },
  {
    name: "Professional",
    price: "EGP 3,500",
    per: "/month",
    blurb: "The full AI safety layer, for schools ready to automate attendance and monitoring.",
    features: ["Up to 10 buses", "AI monitoring", "Smart attendance", "Parent mobile app", "Live dashboard", "Priority support"],
    cta: "Start Free Trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "For school groups and transportation companies operating at city scale.",
    features: ["Unlimited buses", "Full AI suite", "API integration", "Dedicated success manager", "24/7 premium support"],
    cta: "Talk to Sales",
  },
];

export function Pricing() {
  return (
    <ul className="grid items-start gap-6 lg:grid-cols-3">
      {TIERS.map((t) => (
        <li key={t.name}>
          <div
            className={[
              "relative flex h-full flex-col rounded-brand p-7",
              t.featured
                ? "border-2 border-foreground shadow-lg"
                : "border border-border",
            ].join(" ")}
          >
            {t.featured ? (
              /* Positioned over the border rather than inside the padding, so
                 the card's own rhythm is not shifted down by one tier having
                 a badge and the others not. */
              /*
                py-2, not py-1 — 8px of vertical padding around a 12px label.

                Two guards flagged this badge for two DIFFERENT reasons and
                only one of them was the guard's fault. verify-sections walked
                past the badge's own background to the card behind it, which
                is fixed there. verify-ground-contrast samples a 6px ring of
                real pixels around the glyph box, and at 4px of padding the
                pill was 20px tall — so the ring genuinely escaped it and
                landed on paper. That one is not an artefact: a pill whose own
                ground does not surround its own text is a pill that is too
                tight, and 12px uppercase mono wants the room regardless.
              */
              <span className="label-mono absolute -top-3.5 left-7 rounded-full bg-foreground px-3.5 py-2 text-background">
                Most Popular
              </span>
            ) : null}

            <h3 className="text-2xl">{t.name}</h3>

            <p className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl">{t.price}</span>
              {t.per ? <span className="text-muted-foreground">{t.per}</span> : null}
            </p>

            <p className="mt-4 leading-relaxed text-muted-foreground">{t.blurb}</p>

            <ul className="mt-6 flex-1 space-y-3">
              {t.features.map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-relaxed">
                  <svg
                    aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"
                    className="mt-[0.3rem] shrink-0 text-success" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M3 8.5 6.5 12 13 4" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild variant={t.featured ? "cta" : "outline"} className="w-full">
                {/*
                  A real anchor, so it works before hydration and on a
                  middle-click. The label names the tier for assistive tech —
                  three buttons all reading "Start Free Trial" out of context
                  is the classic screen-reader link-list failure.
                */}
                <a href="#contact">
                  {t.cta}
                  <span className="sr-only"> — {t.name} plan</span>
                </a>
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
