/**
 * §4.6 The Difference — a comparison, so it is built as one.
 *
 * The two lists are not two lists. Each SafeRide line answers the Traditional
 * line beside it — "Live GPS tracking, every trip" against "No live
 * location", "AI-verified attendance" against "Manual logbooks" — and that
 * pairing is the entire argument of the section. Two <ul>s side by side would
 * throw it away: a screen reader would read six claims, then six unrelated
 * complaints, and the reader would have to hold the first list in their head
 * to see the point.
 *
 * So it is a real <table> with a row per pair. That is what a table is for,
 * it makes the pairing explicit to assistive tech through the header
 * association, and it is the one shape on this page that the reader has not
 * already met — Platform is a grid, The Journey is an ordered path, the tour
 * is a scene.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const ROWS: [string, string][] = [
  ["Live GPS tracking, every trip", "No live location"],
  ["AI-verified attendance", "Manual logbooks"],
  ["Instant parent notifications", "Delayed communication"],
  ["One-tap emergency response", "Slow emergency response"],
  ["AI incident detection", "No incident visibility"],
  ["Automated cloud reports", "Paper reports"],
];

export function Difference() {
  return (
    <div className="max-w-4xl">
      {/*
        `overflow-x-auto` on the wrapper, never on the page. A comparison table
        is the one thing here with an irreducible minimum width, and the rule
        this project settled on is that wide content scrolls inside its own
        box rather than making the document scroll sideways.
      */}
      {/*
        The table carries its own opaque surface (§4b). Two columns of body
        copy read against ribbons drifting underneath the words is the exact
        thing the moving ground must not be allowed to do, and a border alone
        does not stop it — only a fill does. rounded-brand and the padding are
        so the fill reads as a panel rather than as a rectangle someone forgot
        to style.
      */}
      <div className="overflow-x-auto rounded-brand border border-border bg-card p-6 sm:p-8">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">
            SafeRide compared with traditional school transportation
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-1/2 pb-4 pr-6 text-lg font-semibold">
                SafeRide
              </th>
              <th scope="col" className="w-1/2 pb-4 text-lg font-semibold text-muted-foreground">
                Traditional transportation
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([ours, theirs]) => (
              <tr key={ours} className="border-b border-border last:border-0">
                <td className="py-4 pr-6 align-top">
                  <span className="flex gap-3">
                    {/*
                      The mark is decorative and the row is already in the
                      SafeRide column, so it is aria-hidden: read aloud it
                      would add "check" to every line and say nothing the
                      column header has not.
                    */}
                    <svg
                      aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"
                      className="mt-[0.45rem] shrink-0 text-success" fill="none"
                      stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M3 8.5 6.5 12 13 4" />
                    </svg>
                    <span className="leading-relaxed">{ours}</span>
                  </span>
                </td>
                <td className="py-4 align-top leading-relaxed text-muted-foreground">
                  {theirs}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
