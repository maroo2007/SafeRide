import Link from "next/link";

/**
 * STAGE 2 — deep treatment for Synonym (Indian Type Foundry, Fontshare).
 *
 * Verified against the Fontshare API, not assumed:
 *   - variable, single file, weight axis 200–700
 *   - normal style only; there is NO italic
 *   - 39 KB for the whole range
 *
 * English copy is verbatim from the spec. Arabic copy is the REAL Arabic from
 * https://safe-ridee.vercel.app/ (language toggle), not machine translation.
 */

export const metadata = { title: "Synonym — stage 2" };

const EN = {
  hero: "Because every child deserves a safe ride home",
  section: "Everything a safe journey needs",
  sub: "Five systems working together in the background, so nothing about a child's commute is left to chance.",
  cardTitle: "AI Incident Detection",
  card:
    "Computer vision watches every trip for unsafe behavior and flags it in seconds, before it becomes an incident report.",
};

const AR = {
  hero: "لأن كل طفل يستحق رحلة آمنة إلى المنزل",
  section: "كل ما تحتاجه رحلة آمنة",
  cardTitle: "رصد الحوادث بالذكاء الاصطناعي",
  card:
    "تراقب الرؤية الحاسوبية كل رحلة لرصد أي سلوك غير آمن والتنبيه عليه خلال ثوانٍ، قبل أن يتحول إلى بلاغ حادث.",
};

const SYN = "'Synonym', ui-sans-serif, system-ui, sans-serif";

const RAMP: { w: number; name: string; use: string }[] = [
  { w: 200, name: "ExtraLight", use: "— too fragile for this brand" },
  { w: 300, name: "Light", use: "large quiet display only" },
  { w: 400, name: "Regular", use: "body, card paragraphs" },
  { w: 500, name: "Medium", use: "subheads, UI labels, nav" },
  { w: 600, name: "SemiBold", use: "section headings" },
  { w: 700, name: "Bold", use: "hero — the ceiling" },
];

const ARABIC_CANDIDATES = [
  { name: "Readex Pro", css: "'Readex Pro', sans-serif", note: "Humanist, low contrast, open apertures. Closest skeleton match." },
  { name: "IBM Plex Sans Arabic", css: "'IBM Plex Sans Arabic', sans-serif", note: "Institutional, slightly cooler and more mechanical." },
  { name: "Cairo", css: "'Cairo', sans-serif", note: "Ubiquitous in Egypt. Familiar, but reads more generic." },
  { name: "Almarai", css: "'Almarai', sans-serif", note: "Clean and modern; a touch more geometric than Synonym." },
];

function Swatch({
  label,
  bg,
  color,
  image,
  weight = 700,
  size = 44,
}: {
  label: string;
  bg?: string;
  color: string;
  image?: string;
  weight?: number;
  size?: number;
}) {
  return (
    <figure className="m-0">
      <figcaption className="label-mono mb-2" style={{ color: "#8a8f98" }}>
        {label}
      </figcaption>
      <div
        className="overflow-hidden rounded-brand border p-7"
        style={{
          borderColor: "#ffffff1a",
          background: bg,
          backgroundImage: image ? `url(${image})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <p style={{ fontFamily: SYN, fontWeight: weight, fontSize: size, lineHeight: 1.08, color, margin: 0 }}>
          {EN.hero}
        </p>
      </div>
    </figure>
  );
}

export default function SynonymDeep() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/specimen/deep.css" />

      <main id="main" style={{ background: "#050506", minHeight: "100dvh", color: "#ededef" }}>
        <div className="mx-auto max-w-[1200px] px-6 py-14">
          <p className="label-mono" style={{ color: "#c9a227" }}>
            Type specimen · stage 2 · deep
          </p>
          <h1 className="mt-3" style={{ fontFamily: SYN, fontWeight: 700, fontSize: 52, lineHeight: 1.05 }}>
            Synonym
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#a2a7b0" }}>
            Indian Type Foundry · Fontshare · variable 200–700 in one 39 KB file ·{" "}
            <strong style={{ color: "#fcd34d" }}>no italic</strong>
          </p>
          <p className="mt-4">
            <Link href="/type" className="label-mono underline" style={{ color: "#7dd3fc" }}>
              ← back to the stage-1 grid
            </Link>
          </p>

          {/* ---------- the two answers, up front ---------- */}
          <section className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="rounded-brand border p-5" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
              <p className="label-mono" style={{ color: "#a2a7b0" }}>Q1 · can it carry the whole site alone?</p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                <strong style={{ color: "#6ee7a0" }}>Yes for Latin</strong> — 200–700 is enough range to
                separate hero / heading / subhead / body without a second family. That is
                genuinely what Boxing and Tanker could not do.
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                <strong style={{ color: "#fcd34d" }}>Two real costs.</strong> There is no italic, so
                emphasis inside body copy has to come from weight or colour — across 27 routes
                of testimonials and FAQ answers that will be felt. And 700 is the ceiling: there
                is no 800/900, so the hero can never get heavier than what you see below.
              </p>
            </div>
            <div className="rounded-brand border p-5" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
              <p className="label-mono" style={{ color: "#a2a7b0" }}>Q2 · Arabic</p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                <strong style={{ color: "#fca5a5" }}>Synonym has no Arabic glyphs.</strong> Verified by
                parsing the font&rsquo;s own character map: 381 codepoints total, 58/58 Basic Latin,
                and <strong>0 of 256</strong> in the Arabic block (0 across all four Arabic ranges).
                Two browser-based checks gave misleading answers first — <code>document.fonts.check</code>{" "}
                returns true whenever <em>any</em> font in the stack can render the text, and on Windows
                every generic fallback resolves to the same system Arabic font. A second face is
                unavoidable.
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                Four candidates are set against the real Arabic headline further down. My pick is
                <strong style={{ color: "#6ee7a0" }}> Readex Pro</strong> — humanist, low stroke
                contrast, open apertures, which is the same skeleton Synonym has.
              </p>
            </div>
          </section>

          {/* ---------- hero ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              Hero — 72px. 700 is the heaviest the family goes.
            </p>
            <p className="mt-4" style={{ fontFamily: SYN, fontWeight: 700, fontSize: 72, lineHeight: 1.02, maxWidth: "18ch" }}>
              {EN.hero}
            </p>
            <p className="label-mono mt-8" style={{ color: "#8a8f98" }}>
              Same size at 600 — for comparison
            </p>
            <p className="mt-3" style={{ fontFamily: SYN, fontWeight: 600, fontSize: 72, lineHeight: 1.02, maxWidth: "18ch", color: "#c8ccd2" }}>
              {EN.hero}
            </p>
          </section>

          {/* ---------- weight ramp ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              The full variable axis — every weight, and what it is for
            </p>
            <div className="mt-4 space-y-1">
              {RAMP.map((r) => (
                <div
                  key={r.w}
                  className="flex flex-wrap items-baseline gap-x-5 border-b py-3"
                  style={{ borderColor: "#ffffff0f" }}
                >
                  <span className="label-mono w-32 shrink-0" style={{ color: "#6b7280" }}>
                    {r.w} {r.name}
                  </span>
                  <span style={{ fontFamily: SYN, fontWeight: r.w, fontSize: 30 }}>
                    {EN.section}
                  </span>
                  <span className="label-mono" style={{ color: "#6b7280" }}>{r.use}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- Q1 evidence: a whole composition, one family ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              Q1 evidence — a full composition using ONLY Synonym (nav, label, heading, subhead, card, body, button)
            </p>
            <div className="mt-4 rounded-brand border p-8" style={{ borderColor: "#ffffff1a", background: "#0a0a0c", fontFamily: SYN }}>
              <div className="flex items-center justify-between border-b pb-5" style={{ borderColor: "#ffffff14" }}>
                <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.01em" }}>SafeRide</span>
                <nav className="flex gap-6" style={{ fontWeight: 500, fontSize: 15, color: "#a2a7b0" }}>
                  <span>Features</span><span>Coverage</span><span>Pricing</span><span>FAQ</span>
                </nav>
              </div>

              <p style={{ fontWeight: 500, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c9a227", marginTop: 32 }}>
                Platform
              </p>
              <h2 style={{ fontWeight: 600, fontSize: 34, lineHeight: 1.15, marginTop: 10 }}>{EN.section}</h2>
              <p style={{ fontWeight: 400, fontSize: 19, lineHeight: 1.5, color: "#c8ccd2", marginTop: 12, maxWidth: "58ch" }}>
                {EN.sub}
              </p>

              <div className="mt-8 rounded-brand border p-6" style={{ borderColor: "#ffffff14", background: "#101014", maxWidth: 460 }}>
                <h3 style={{ fontWeight: 600, fontSize: 20 }}>{EN.cardTitle}</h3>
                <p style={{ fontWeight: 400, fontSize: 15, lineHeight: 1.65, color: "#a2a7b0", marginTop: 10 }}>
                  {EN.card}
                </p>
              </div>

              <span
                className="mt-8 inline-flex items-center rounded-brand px-6"
                style={{ background: "#e8b04b", color: "#0a0a0c", fontWeight: 600, fontSize: 16, height: 48 }}
              >
                Book a demo
              </span>
            </div>
          </section>

          {/* ---------- grounds ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>Legibility across grounds</p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <Swatch label="white on dark — #050506" bg="#050506" color="#ededef" />
              <Swatch label="dark on light — #f8fafc" bg="#f8fafc" color="#020617" />
              <Swatch label="over the real white-out frame (luma 255)" color="#020617" image="/images/type-test-whiteout.jpg" />
              <Swatch label="over the real bright + busy frame (luma 202)" color="#020617" image="/images/type-test-busy.jpg" />
            </div>
          </section>

          {/* ---------- wordmark ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>Wordmark, nav position and nav sizes</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[{ bg: "#050506", fg: "#ededef", sub: "#8a8f98" }, { bg: "#f8fafc", fg: "#0f172a", sub: "#64748b" }].map((t) => (
                <div key={t.bg} className="flex h-16 items-center justify-between rounded-brand border px-5"
                     style={{ background: t.bg, borderColor: "#ffffff1a" }}>
                  <span style={{ fontFamily: SYN, fontWeight: 700, fontSize: 22, color: t.fg, letterSpacing: "-0.01em" }}>SafeRide</span>
                  <span className="label-mono" style={{ color: t.sub }}>Synonym 700</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-8 rounded-brand border p-7"
                 style={{ background: "#050506", borderColor: "#ffffff1a" }}>
              {[16, 20, 24, 32, 44].map((s) => (
                <div key={s} className="text-center">
                  <span style={{ fontFamily: SYN, fontWeight: 700, fontSize: s, letterSpacing: "-0.01em" }}>SafeRide</span>
                  <div className="label-mono mt-2" style={{ color: "#8a8f98" }}>{s}px</div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- Q2: Arabic ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              Q2 · Arabic — real copy from the live site, same size, side by side
            </p>
            <p className="mt-2 text-sm" style={{ color: "#a2a7b0" }}>
              Left is Synonym. Right is the candidate Arabic face. Judge whether they read as one
              brand: matching x-height, stroke contrast, and how open the counters are.
            </p>
            <div className="mt-5 space-y-4">
              {ARABIC_CANDIDATES.map((a) => (
                <div key={a.name} className="rounded-brand border p-6" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="label-mono" style={{ color: "#ededef" }}>{a.name}</span>
                    <span className="label-mono" style={{ color: "#6b7280" }}>{a.note}</span>
                  </div>
                  <div className="mt-4 grid items-center gap-6 lg:grid-cols-2">
                    <p style={{ fontFamily: SYN, fontWeight: 700, fontSize: 34, lineHeight: 1.15, margin: 0 }}>
                      {EN.hero}
                    </p>
                    <p dir="rtl" lang="ar" style={{ fontFamily: a.css, fontWeight: 700, fontSize: 34, lineHeight: 1.5, margin: 0 }}>
                      {AR.hero}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-6 border-t pt-4 lg:grid-cols-2" style={{ borderColor: "#ffffff0f" }}>
                    <div>
                      <h3 style={{ fontFamily: SYN, fontWeight: 600, fontSize: 20 }}>{EN.cardTitle}</h3>
                      <p style={{ fontFamily: SYN, fontWeight: 400, fontSize: 15, lineHeight: 1.65, color: "#a2a7b0", marginTop: 8 }}>
                        {EN.card}
                      </p>
                    </div>
                    <div dir="rtl" lang="ar">
                      <h3 style={{ fontFamily: a.css, fontWeight: 700, fontSize: 20 }}>{AR.cardTitle}</h3>
                      <p style={{ fontFamily: a.css, fontWeight: 400, fontSize: 15, lineHeight: 1.9, color: "#a2a7b0", marginTop: 8 }}>
                        {AR.card}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- the direction choice ---------- */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#c9a227" }}>
              The direction choice — warm humanist sans vs editorial serif
            </p>
            <p className="mt-2 max-w-[75ch] text-sm" style={{ color: "#a2a7b0" }}>
              Your earlier reference sheets were high-contrast editorial serifs; Synonym is not that.
              Same headline, same size, same ground. Fraunces is the serif I would put forward — 18
              styles, variable, and warm rather than fashion-cold, so it is the serif most likely to
              survive both the brightness problem and the emotional register.
            </p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-brand border p-7" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
                <p className="label-mono mb-4" style={{ color: "#6ee7a0" }}>Synonym 700 · humanist sans</p>
                <p style={{ fontFamily: SYN, fontWeight: 700, fontSize: 46, lineHeight: 1.05, margin: 0 }}>{EN.hero}</p>
              </div>
              <div className="rounded-brand border p-7" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
                <p className="label-mono mb-4" style={{ color: "#7dd3fc" }}>Fraunces 700 · editorial serif</p>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700, fontSize: 46, lineHeight: 1.05, margin: 0 }}>
                  {EN.hero}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div className="rounded-brand border p-7" style={{ borderColor: "#ffffff1a", background: "#f8fafc" }}>
                <p className="label-mono mb-4" style={{ color: "#64748b" }}>Synonym · on light</p>
                <p style={{ fontFamily: SYN, fontWeight: 700, fontSize: 40, lineHeight: 1.05, margin: 0, color: "#020617" }}>{EN.hero}</p>
              </div>
              <div className="rounded-brand border p-7" style={{ borderColor: "#ffffff1a", background: "#f8fafc" }}>
                <p className="label-mono mb-4" style={{ color: "#64748b" }}>Fraunces · on light</p>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700, fontSize: 40, lineHeight: 1.05, margin: 0, color: "#020617" }}>
                  {EN.hero}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
