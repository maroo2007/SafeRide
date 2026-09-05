import { Button } from "@/components/ui/button";
import { ScrubVideoHero } from "@/components/hero/scrub-video-hero";
import { SterlingGateNavigation } from "@/components/ui/sterling-gate-kinetic-navigation";

/**
 * Phase 1 shell.
 *
 * The scrub hero (spec 1/2) and the content sections (spec 4) land in later
 * phases. Spec 3's post-video transition was REMOVED, not deferred. This exists so the design system —
 * tokens, type stack, interaction states — can be seen and verified in both
 * themes before anything is built on top of it.
 *
 * All copy is verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const FEATURES = [
  {
    title: "AI Incident Detection",
    body: "Computer vision watches every trip for unsafe behavior and flags it in seconds, before it becomes an incident report.",
  },
  {
    title: "Live GPS Tracking",
    body: "Every bus reports its position in real time, so parents and supervisors always know exactly where a child is.",
  },
  {
    title: "Face Recognition Attendance",
    body: "Boarding and drop-off are logged automatically as each student steps on or off, no manual roll call required.",
  },
];

export default function Home() {
  return (
    <main id="main">
      <SterlingGateNavigation />
      <ScrubVideoHero />

      <section
        id="features"
        aria-labelledby="platform"
        className="border-t border-border bg-card/40"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="label-mono text-muted-foreground">Platform</p>
          <h2 id="platform" className="mt-4 text-4xl sm:text-5xl">
            Everything a safe journey needs
          </h2>

          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-brand border border-border bg-card p-6 transition-[transform,box-shadow] duration-[--dur-state] ease-[--ease-out] hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none"
              >
                <h3 className="text-xl">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
