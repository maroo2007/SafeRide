/**
 * §4.3 Platform — a capability inventory.
 *
 * FIVE things now, not ten. The phone tour section that follows carries Live
 * GPS Tracking, Parent Notifications, Face Recognition Attendance, Emergency
 * Response and Driver Performance Analytics — each of those is visible in a
 * screen, so a card repeating it would be the same claim twice. What is left
 * has no screenshot behind it and the card is the only place it exists.
 * See SafeRide_Phone_Tour_Spec.md §1.1.
 *
 * The subhead moved with the count. A stale number is the kind of thing that
 * survives to launch, and the build spec now carries an explicit exception to
 * its copy-verbatim rule for exactly this: a false factual claim is corrected
 * and the correction is flagged.
 *
 * Still an inventory, so still a grid of equals — the structure is the
 * argument. The Journey is a sequence and the Intelligence Layer is an
 * argument with a focal point; none of the three share a shape.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 *
 * Card surfaces are border + shadow, not fill. On this palette --card
 * resolves to the page ground because nothing lighter than white exists:
 * paper against white is 1.057:1. The edge was always what made a card read;
 * the fill was decoration pretending to be structure. See app/globals.css.
 */

type Capability = { title: string; body: string; live?: string };

const CAPABILITIES: Capability[] = [
  {
    title: "AI Incident Detection",
    body: "Computer vision watches every trip for unsafe behavior and flags it in seconds, before it becomes an incident report.",
    live: "Watching live right now",
  },
  {
    title: "Predictive Maintenance",
    body: "SafeRide flags buses that are due for service based on usage patterns, not just a calendar reminder.",
  },
  {
    title: "AI Reports",
    body: "Attendance, safety, and fleet reports generate themselves, with plain-language explanations behind every number.",
  },
  {
    title: "Multi-language Support",
    body: "A full English and Arabic experience for every role, switching instantly without reloading.",
  },
  {
    title: "Dark & Light Mode",
    body: "A carefully redesigned dark mode, not an inverted one, so the platform stays legible any hour.",
  },
];

export function PlatformGrid() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {CAPABILITIES.map((c) => (
        <li
          key={c.title}
          className="rounded-brand border border-border bg-card p-6 transition-[transform,box-shadow] duration-[--dur-state] ease-[--ease-out] hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none"
        >
          {c.live ? (
            <p
              className="label-mono mb-3 flex items-center gap-2"
              /*
               * --route-mark, not --accent-edge, and not a Tailwind class.
               *
               * The first version used `text-accent-edge` and
               * `bg-accent-edge`. Neither resolves: --color-accent-edge is not
               * in the @theme bridge in globals.css, so the dot rendered with
               * no background at all and the label fell back to inherited ink.
               * It looked almost right in the capture, which is how it nearly
               * shipped.
               *
               * --accent-edge would also have been the wrong token even
               * bridged: it is `transparent` under .dark, so a live indicator
               * built on it disappears the moment this card sits on a dark
               * ground. --route-mark is the project's legible accent INK —
               * 7.94:1 on paper against the 4.5:1 this 12px label needs, and
               * it does not flip.
               */
              style={{ color: "var(--route-mark)" }}
            >
              {/*
                It does not pulse. Spec 12's reduced-motion rule is "no motion,
                not less motion", and an indefinitely animating dot is exactly
                the kind of thing that gets an exemption it has not earned. The
                dot says live; so do the words.
              */}
              <span
                aria-hidden="true"
                data-live-dot
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "var(--route-mark)" }}
              />
              {c.live}
            </p>
          ) : null}
          <h3 className="text-xl">{c.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
