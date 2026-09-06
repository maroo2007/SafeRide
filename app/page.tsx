import { Button } from "@/components/ui/button";
import { ScrubVideoHero } from "@/components/hero/scrub-video-hero";
import { SterlingGateNavigation } from "@/components/ui/sterling-gate-kinetic-navigation";
import { Section } from "@/components/sections/section";
import { PlatformGrid } from "@/components/sections/platform";
import { JourneySteps } from "@/components/sections/journey";
import { IntelligenceLayer } from "@/components/sections/intelligence";

/**
 * Phase 5a — the ground for the first three content sections.
 *
 * Spec 3's post-video transition was REMOVED, not deferred: the hero's pin
 * releases straight into paper, and now that the film reaches its last frame
 * that cut reads as an end-card rather than as a jump.
 *
 * The ground went in first and on its own (see components/sections/section.tsx
 * for why there are two tones and not four). Content follows it.
 *
 * The three sections deliberately do not share a shape: Platform is an
 * inventory and reads as a grid, The Journey is a sequence and reads as an
 * ordered path, Intelligence Layer is an argument and has a focal point with
 * quieter supporting material.
 *
 * All copy is verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

export default function Home() {
  return (
    <main id="main">
      <SterlingGateNavigation />
      <ScrubVideoHero />

      {/* §4.3 */}
      <Section
        id="features"
        headingId="platform"
        eyebrow="Platform"
        heading="Everything a safe journey needs"
        subhead="Ten systems working together so nothing about a child's commute is left to chance."
      >
        <PlatformGrid />
      </Section>

      {/* §4.4 */}
      <Section
        id="journey"
        headingId="journey-heading"
        eyebrow="The Journey"
        heading="Every step, accounted for"
      >
        <JourneySteps />
      </Section>

      {/*
        §4.5. The one dark beat in 5a, and the only mechanism that actually
        separates a section from its neighbours: paper -> dark is 19.51:1,
        where paper -> card is 1.06:1. It earns it on content too — this is
        the AI section, and dark echoes the film it follows.
      */}
      <Section
        id="ai"
        tone="dark"
        headingId="intelligence"
        eyebrow="Intelligence Layer"
        heading="Artificial intelligence watching every journey"
        subhead="AI assists, it never overwhelms. Every prediction ships with a confidence score and a plain-language reason, so the people using SafeRide always understand what it's telling them and why."
      >
        <IntelligenceLayer />
      </Section>

      {/*
        Phase 1 scaffolding, not a content section. It keeps the token system
        visible while sections are built on top of it, and it comes out before
        launch — logged in TODO.md.
      */}
      <section aria-labelledby="states" className="mx-auto max-w-6xl px-6 py-20">
        <p className="label-mono text-muted-foreground">Design system</p>
        <h2 id="states" className="mt-4 text-3xl">
          Interaction states
        </h2>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="cta">CTA</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" loading>Sending</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { name: "primary", cls: "bg-primary text-primary-foreground" },
            { name: "secondary", cls: "bg-secondary text-secondary-foreground" },
            { name: "accent", cls: "accent-fill" },
            { name: "muted", cls: "bg-muted text-muted-foreground" },
          ].map((t) => (
            <div
              key={t.name}
              className={`rounded-brand px-4 py-8 text-sm font-medium ${t.cls}`}
            >
              {t.name}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
