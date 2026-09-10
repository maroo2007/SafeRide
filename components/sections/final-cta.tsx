import { Button } from "@/components/ui/button";
import { BlurReveal, BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.12 Final CTA — centre-set, and the last thing before the footer.
 *
 * No new treatment. The one button is the existing `cta` variant — solid
 * accent with the #B9551A edge, which exists because #FB8A00 alone measures
 * 2.27:1 against paper and fails WCAG 1.4.11's 3:1 boundary requirement.
 *
 * A real anchor rather than a button: it navigates, it works before
 * hydration, and it can be middle-clicked. It goes to the contact form on
 * this page.
 *
 * There is one button now. "Log In" is removed — it pointed at the old site's
 * login because that was the only one that existed, and a lone secondary
 * action next to the page's final call was competing with it for no gain.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */


export function FinalCta() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <BlurReveal as="h2" id="final-cta-heading" className="text-4xl sm:text-5xl" inView once>
        Ready to experience SafeRide?
      </BlurReveal>
      <BlurBody className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
        Bring live tracking, AI safety monitoring, and total peace of mind to your school&apos;s daily run.
      </BlurBody>
      <div className="mt-10 flex justify-center">
        <Button asChild variant="cta">
          <a href="#contact">Talk to Our Team</a>
        </Button>
      </div>
    </div>
  );
}
