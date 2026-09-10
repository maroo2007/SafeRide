import { ScrubVideoHero } from "@/components/hero/scrub-video-hero";
import { SterlingGateNavigation } from "@/components/ui/sterling-gate-kinetic-navigation";
import { Section } from "@/components/sections/section";
import { ScrollStack } from "@/components/sections/scroll-stack";
import { PhoneTour } from "@/components/sections/phone-tour/phone-tour";
import { JourneySteps } from "@/components/sections/journey";
import { Difference } from "@/components/sections/difference";
import { Coverage } from "@/components/sections/coverage";
import { Testimonials } from "@/components/sections/testimonials";
import { PageGround } from "@/components/sections/page-ground";
import { LoadScreen } from "@/components/ui/load-screen";
import { Faq } from "@/components/sections/faq";
import { Contact } from "@/components/sections/contact";
import { FinalCta } from "@/components/sections/final-cta";
import { Footer } from "@/components/sections/footer";

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
 * ordered path.
 *
 * All copy is verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

export default function Home() {
  return (
    <main id="main">
      <LoadScreen />


      <SterlingGateNavigation />
      <ScrubVideoHero />

      {/*
        Build spec §4a. One ground for everything after the hero: the lattice
        origins here and runs unbroken to the end of main, so no boundary shows
        the rhythm restarting. The hero is outside it deliberately — it
        composites its own video ground.
      */}
      <div className="relative">
        <PageGround />

      {/*
        §2 — the Scroll Stack, in place of the Platform grid.

        It keeps id="features" because the navbar and the footer both point
        there and those links have to keep resolving. It carries no Section
        eyebrow or heading: the brief removed Platform's, and the three cards
        carry their own. The h2 is present but visually hidden, so the landmark
        still has a name for anyone navigating by region.

        Multi-language Support and Dark & Light Mode are CUT from the site
        rather than moved — they were two of the five Platform cards and they
        do not appear anywhere else.
      */}
      <section id="features" aria-labelledby="features-heading" className="relative isolate">
        <div className="mx-auto max-w-6xl px-6 py-[clamp(72px,9vw,136px)]">
          <h2 id="features-heading" className="sr-only">Platform</h2>
          <ScrollStack />
        </div>
      </section>

      {/* Phone tour §2 — sits between Platform and The Journey, and carries
          the five capability cards Platform gave up. */}
      <PhoneTour />

      {/* §4.4 */}
      <Section
        id="journey"
        headingId="journey-heading"
        eyebrow="The Journey"
        heading="Every step, accounted for"
      >
        <JourneySteps />
      </Section>


      {/* §4.6 */}
      <Section
        id="difference"
        headingId="difference-heading"
        eyebrow="The Difference"
        heading="Why Choose SafeRide"
      >
        <Difference />
      </Section>

      {/* §4.7. The three-stat row is CUT, not deferred: no figures exist for
          Smart Buses, Students Protected or System Uptime. */}
      <Section
        id="coverage"
        headingId="coverage-heading"
        eyebrow="Coverage"
        heading="Protecting journeys across Egypt"
        subhead="From Alexandria to Aswan, every SafeRide school reports into the same live network."
      >
        <Coverage />
      </Section>

      {/* §4.8 */}
      <Section
        id="testimonials"
        headingId="testimonials-heading"
        eyebrow="Trusted By Schools"
        heading="What families and schools tell us"
      >
        <Testimonials />
      </Section>


      {/* §4.10 — split so a seven-item accordion is not pushed a screen down
          the page by its own heading. */}
      <Section
        id="faq"
        headingId="faq-heading"
        eyebrow="Questions"
        heading="Frequently asked questions"
        split
      >
        <Faq />
      </Section>

      {/* §4.11 — the page's primary conversion. */}
      <Section
        id="contact"
        headingId="contact-heading"
        eyebrow="Get in Touch"
        heading="Let's bring SafeRide to your school"
        subhead="Tell us about your fleet and we'll walk you through a live demo tailored to your school's routes."
        note="Contact us for pricing."
      >
        <Contact />
      </Section>

      {/* §4.12. Its own heading, so no Section eyebrow above it — this is the
          close, and an eyebrow would make it look like one more topic. */}
      <section id="final-cta" aria-labelledby="final-cta-heading" className="relative isolate">
        <div className="mx-auto max-w-6xl px-6 py-[clamp(72px,9vw,136px)]">
          <FinalCta />
        </div>
      </section>
      </div>

      {/* §4.13 */}
      <Footer />
    </main>
  );
}
