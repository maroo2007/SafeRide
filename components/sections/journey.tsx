/**
 * §4.4 The Journey — a sequence, not an inventory.
 *
 * Eight steps that happen in order, and the first and last are both called
 * "Home" because the point is that the loop closes. A grid would throw that
 * away: it would say "here are eight things" when the copy says "here is one
 * day, start to finish".
 *
 * So it is an ordered list on a rule, with the numbers visible and the line
 * running through them. Deliberately NOT the shape used by §4.3 — the reader
 * meets that grid a screen earlier, and two grids of title-plus-sentence a
 * screen apart read as the same section twice.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const STEPS: { title: string; body: string }[] = [
  { title: "Home", body: "The day starts where every parent can already see the bus approaching." },
  { title: "Bus Arrives", body: "A live ETA reaches the parent's phone before the bus turns the corner." },
  { title: "Boarding", body: "Face recognition confirms the right child boarded the right bus." },
  { title: "GPS Tracking", body: "The full route is visible live, stop by stop, in real time." },
  { title: "School Arrival", body: "Arrival is logged automatically and parents get an instant confirmation." },
  { title: "School Day", body: "SafeRide steps back while your child is in class, no unnecessary noise." },
  { title: "Return Journey", body: "The same visibility, attendance, and alerts apply on the way home." },
  { title: "Home", body: "A final drop-off confirmation closes the loop for total peace of mind." },
];

export function JourneySteps() {
  return (
    <ol className="relative max-w-3xl">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={`${s.title}-${i}`} className="relative flex gap-6 pb-10 last:pb-0">
            {/* The line runs BETWEEN markers, so it stops at the last one
                rather than trailing off the end of the journey. */}
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-px bg-border"
              />
            ) : null}
            <span
              aria-hidden="true"
              className="label-mono relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="pt-2">
              <h3 className="text-xl">{s.title}</h3>
              <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
