/**
 * §4.5 Intelligence Layer — an argument with a centre of gravity.
 *
 * This section is not a list. It is making a claim — "AI assists, it never
 * overwhelms" — and the live example panel is the evidence for it: a real
 * detection with a confidence score and a plain-language reason, which is
 * precisely what the body copy promises. So the panel is the focal point and
 * gets the weight; the six capabilities are the supporting apparatus and are
 * deliberately quieter.
 *
 * That is the whole reason the six are NOT cards. §4.3 puts ten equal cards
 * on screen a moment earlier; six more of the same shape here would read as
 * the same section again, and would also flatten the panel into just another
 * tile. They are a two-column definition list on the section's own ground,
 * with no borders and no boxes — subordinate by construction.
 *
 * The panel uses --card, which on DARK is a real surface (#24211b, 1.29:1
 * from the ground). On paper it would not be: nothing lighter than white
 * exists there. The focal treatment is available here because the ground is
 * dark, which is one more reason this is the section that takes the dark beat.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const CAPABILITIES: { title: string; body: string }[] = [
  { title: "Computer Vision", body: "Reads what's happening on board frame by frame, not just where the bus is." },
  { title: "Incident Detection", body: "Recognizes unsafe patterns and flags them before they escalate." },
  { title: "Heatmaps", body: "Surfaces where delays and risk cluster across a school's entire route network." },
  { title: "Predictive Analytics", body: "Forecasts delays and maintenance needs from patterns humans would miss." },
  { title: "Driver Monitoring", body: "Tracks braking, speed, and fatigue signals to build an ongoing safety score." },
  { title: "Route Optimization", body: "Continuously reshapes routes around real traffic, not a fixed morning plan." },
];

export function IntelligenceLayer() {
  return (
    <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-20">
      {/* The evidence. First in the DOM as well as in the eye, because it is
          what the section's claim rests on. */}
      <figure className="m-0 rounded-brand border border-border bg-card p-7 shadow-lg">
        <figcaption className="label-mono text-muted-foreground">Live example</figcaption>

        <p className="mt-6 text-2xl leading-snug sm:text-[1.75rem]">
          &ldquo;Unbuckled seatbelt detected, seat 4&rdquo;
        </p>

        <dl className="mt-7 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-t border-border pt-6">
          <div>
            <dt className="label-mono text-muted-foreground">Confidence</dt>
            <dd className="mt-2 text-3xl text-accent-warm">87%</dd>
          </div>
          <div>
            <dt className="label-mono text-muted-foreground">Match</dt>
            <dd className="mt-2 text-3xl text-accent-warm">98%</dd>
          </div>
        </dl>
      </figure>

      {/* The apparatus. No boxes: on a dark ground a border around each of six
          items would compete with the panel it is meant to support. */}
      <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {CAPABILITIES.map((c) => (
          <div key={c.title}>
            <dt className="text-base font-semibold">{c.title}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
