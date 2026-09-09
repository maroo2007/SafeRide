import { Button } from "@/components/ui/button";
import { BlurReveal, BlurBody } from "@/components/ui/blur-reveal";

/**
 * §4.12 Final CTA — centre-set, and the last thing before the footer.
 *
 * No new treatment. The primary is the existing `cta` variant — solid accent
 * with the #B9551A edge, which exists because #FB8A00 alone measures 2.27:1
 * against paper and fails WCAG 1.4.11's 3:1 boundary requirement. The
 * secondary is `outline`. Inventing a third button here would mean a page
 * with three ideas about what a primary action looks like.
 *
 * Both are real anchors rather than buttons: they navigate, they work before
 * hydration, and they can be middle-clicked. "Talk to Our Team" goes to the
 * contact form on this page. "Log In" points at the product.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

/**
 * TODO — LOG IN HAS NOWHERE REAL TO GO YET.
 *
 * It points at the shipped app's own login, which is the only honest target
 * that exists. When the product's URL is settled this becomes it. It is NOT
 * pointed at "#" — a link that goes nowhere is the thing the footer's dead
 * links were removed for. Logged in TODO.md.
 */
const LOGIN_HREF = "https://safe-ridee.vercel.app/login";

export function FinalCta() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <BlurReveal as="h2" id="final-cta-heading" className="text-4xl sm:text-5xl" inView once>
        Ready to experience SafeRide?
      </BlurReveal>
      <BlurBody className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
        Bring live tracking, AI safety monitoring, and total peace of mind to your school&apos;s daily run.
      </BlurBody>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild variant="cta">
          <a href="#contact">Talk to Our Team</a>
        </Button>
        <Button asChild variant="outline">
          <a href={LOGIN_HREF}>Log In</a>
        </Button>
      </div>
    </div>
  );
}
