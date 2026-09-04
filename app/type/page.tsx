import { BUCKETS, ALL, type Candidate } from "@/lib/type-candidates";
import { FontLoadCheck } from "@/components/type/font-load-check";

/**
 * STAGE 1 — wide scan.
 *
 * One word, one size, one ground, 46 candidates. Built to be scanned, not read.
 *
 * Font loading is deliberately isolated from the app:
 *   - a single self-contained stylesheet, public/specimen/fonts.css
 *   - every face base64-inlined, so the page makes ZERO external font requests
 *   - Google faces subset to the glyphs of "SafeRide" only (~2.4 KB each)
 *   - nothing here touches next/font or the production bundle
 */

export const metadata = { title: "Type specimen — stage 1" };

const SIZE = 34;

function styleChip(n: number, italic?: boolean) {
  const critical = n === 1;
  const thin = n <= 2;
  return (
    <span
      className="label-mono rounded px-1.5 py-0.5"
      style={{
        background: critical ? "#4a1d1d" : thin ? "#4a3a1d" : "#1a1f2e",
        color: critical ? "#fca5a5" : thin ? "#fcd34d" : "#9fb0bd",
      }}
      title={critical ? "single style — no weight range for hierarchy" : undefined}
    >
      {n} style{n === 1 ? "" : "s"}
      {italic ? " + ital" : ""}
    </span>
  );
}

function arabicChip(c: Candidate) {
  const a = c.arabic;
  if (a.kind === "native")
    return (
      <span className="label-mono rounded px-1.5 py-0.5" style={{ background: "#12331f", color: "#6ee7a0" }}>
        Arabic native
      </span>
    );
  if (a.kind === "companion")
    return (
      <span
        className="label-mono rounded px-1.5 py-0.5"
        style={{ background: "#1a2f3d", color: "#7dd3fc" }}
        title={`${a.family} — ${a.styles} styles, same superfamily`}
      >
        Arabic companion
      </span>
    );
  return (
    <span className="label-mono rounded px-1.5 py-0.5" style={{ background: "#1a1a1a", color: "#7a7a7a" }}>
      no Arabic
    </span>
  );
}

function Cell({ c }: { c: Candidate }) {
  return (
    <figure className="m-0 rounded-brand border p-5" style={{ borderColor: "#ffffff14", background: "#0a0a0c" }}>
      <div
        className="flex min-h-[68px] items-center"
        style={{ fontFamily: `'${c.css}', Georgia, serif`, fontSize: SIZE, color: "#ededef", lineHeight: 1.1 }}
      >
        SafeRide
      </div>
      <figcaption className="mt-4 border-t pt-3" style={{ borderColor: "#ffffff0f" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium" style={{ color: "#ededef" }}>
            {c.name}
          </span>
          <span className="label-mono" style={{ color: c.source === "Fontshare" ? "#c9a227" : "#6b7280" }}>
            {c.source}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {styleChip(c.styles, c.italic)}
          {arabicChip(c)}
        </div>
      </figcaption>
    </figure>
  );
}

export default function TypeStage1() {
  const singles = ALL.filter((c) => c.styles === 1);
  const withArabic = ALL.filter((c) => c.arabic.kind !== "none");

  return (
    <>
      {/* Self-contained, base64-inlined. No external font requests.
          The manual <link> is the point: it keeps 46 specimen faces out of the
          app bundle and away from next/font entirely. Bundling them is exactly
          what this page must not do. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/specimen/fonts.css" />

      <main id="main" style={{ background: "#050506", minHeight: "100dvh" }}>
        <div className="mx-auto max-w-[1400px] px-6 py-14">
          <header>
            <p className="label-mono" style={{ color: "#c9a227" }}>
              Type specimen · stage 1 · wide scan
            </p>
            <h1 className="mt-3 text-4xl" style={{ color: "#ededef", fontFamily: "var(--font-fraunces)", fontWeight: 700 }}>
              {ALL.length} heading candidates
            </h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed" style={{ color: "#a2a7b0" }}>
              One word, one size ({SIZE}px), one ground. Grouped by direction so the
              buckets can be compared against each other rather than font-by-font.
              Pick 5–6 and stage 2 builds the full treatment for only those.
            </p>
            <div className="mt-4">
              <FontLoadCheck families={ALL.map((c) => c.css)} />
            </div>
          </header>

          {/* What the three facts actually killed */}
          <section
            className="mt-8 rounded-brand border p-5"
            style={{ borderColor: "#ffffff14", background: "#0a0a0c" }}
          >
            <p className="label-mono" style={{ color: "#a2a7b0" }}>
              What the metadata kills before you look at a single letterform
            </p>
            <ul className="mt-3 space-y-2 text-sm" style={{ color: "#c8ccd2" }}>
              <li>
                <strong style={{ color: "#fca5a5" }}>{singles.length} are single-style</strong> —{" "}
                {singles.map((s) => s.name).join(", ")}. One weight means hierarchy has to come
                from size and colour alone; body text in the same face is not an option.
              </li>
              <li>
                <strong style={{ color: "#6ee7a0" }}>Only {withArabic.length} of {ALL.length} can do Arabic</strong>{" "}
                — and all {withArabic.length} are in the bucket I added. Just 57 of Google&rsquo;s 1,946
                families carry an Arabic subset, and none of your 40 do.
              </li>
              <li style={{ color: "#a2a7b0" }}>
                So the Arabic column does not thin the list — it splits it. Every candidate
                outside the last bucket commits SafeRide to sourcing and pairing a second,
                visually unrelated Arabic face.
              </li>
            </ul>
          </section>

          {BUCKETS.map((b) => (
            <section key={b.id} id={b.id} className="mt-14 scroll-mt-6">
              <div className="flex flex-wrap items-baseline gap-x-4">
                <h2 className="text-xl" style={{ color: "#ededef", fontFamily: "var(--font-fraunces)", fontWeight: 700 }}>
                  {b.label}
                </h2>
                <span className="label-mono" style={{ color: "#6b7280" }}>
                  {b.fonts.length} faces
                </span>
              </div>
              <p className="mt-2 max-w-[80ch] text-sm" style={{ color: "#8a8f98" }}>
                {b.blurb}
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {b.fonts.map((c) => (
                  <Cell key={c.name} c={c} />
                ))}
              </div>
            </section>
          ))}

          <footer className="mt-16 border-t pt-6" style={{ borderColor: "#ffffff14" }}>
            <p className="label-mono" style={{ color: "#6b7280" }}>
              Stage 2 (after you pick 5–6): hero headline in caps and sentence case ·
              32px section heading · body paragraph in the paired face · light and dark ·
              over the real white-out frame · Arabic headline in the companion ·
              wordmark at nav size.
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
