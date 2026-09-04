import Link from "next/link";

/**
 * STAGE 2 — deep treatment for Fraunces, plus the decisive white-out test
 * against Synonym.
 *
 * Verified, not assumed:
 *   - 18 styles; axes wght 100–900, opsz 9–144, SOFT 0–100, WONK 0–1
 *   - REAL italic (a separate variable file)
 *   - Arabic: 0 codepoints. Confirmed by parsing the font's cmap table, the
 *     same way Synonym was — document.fonts.check lies about this.
 *
 * Arabic copy is the real Arabic from the live site's language toggle.
 */

export const metadata = { title: "Fraunces — stage 2" };

const EN = {
  hero: "Because every child deserves a safe ride home",
  section: "Everything a safe journey needs",
  sub: "Ten systems working together so nothing about a child's commute is left to chance.",
  cardTitle: "AI Incident Detection",
  card:
    "Computer vision watches every trip for unsafe behavior and flags it in seconds, before it becomes an incident report.",
  quote:
    "The first time I got a notification that said 'Sara boarded safely,' I actually teared up. It sounds small, but that peace of mind is everything when you're a working mother.",
};

const AR = {
  hero: "لأن كل طفل يستحق رحلة آمنة إلى المنزل",
  section: "كل ما تحتاجه رحلة آمنة",
  cardTitle: "رصد الحوادث بالذكاء الاصطناعي",
  card:
    "تراقب الرؤية الحاسوبية كل رحلة لرصد أي سلوك غير آمن والتنبيه عليه خلال ثوانٍ، قبل أن يتحول إلى بلاغ حادث.",
};

const FR = "'Fraunces', Georgia, serif";
const SYN = "'Synonym', ui-sans-serif, system-ui, sans-serif";

const RAMP = [
  { w: 100, n: "Thin" },
  { w: 200, n: "ExtraLight" },
  { w: 300, n: "Light" },
  { w: 400, n: "Regular — body" },
  { w: 500, n: "Medium" },
  { w: 600, n: "SemiBold — section headings" },
  { w: 700, n: "Bold" },
  { w: 800, n: "ExtraBold" },
  { w: 900, n: "Black — hero ceiling" },
];

const ARABIC = [
  { name: "Readex Pro", css: "'Readex Pro', sans-serif", kind: "humanist sans", note: "Your approved pick — but it is a low-contrast SANS against a high-contrast serif." },
  { name: "Markazi Text", css: "'Markazi Text', serif", kind: "modern Naskh", note: "Text Naskh with real stroke contrast. Closest structural match to Fraunces." },
  { name: "Noto Naskh Arabic", css: "'Noto Naskh Arabic', serif", kind: "Naskh", note: "Neutral, institutional, very legible at body size." },
  { name: "Amiri", css: "'Amiri', serif", kind: "classical Naskh", note: "Most calligraphic and formal. Highest contrast of the four." },
];

/** Hero headline over a given ground, in a given face. */
function Ground({
  label,
  font,
  weight,
  bg,
  image,
  color,
  size = 44,
  opsz,
}: {
  label: string;
  font: string;
  weight: number;
  bg?: string;
  image?: string;
  color: string;
  size?: number;
  opsz?: number;
}) {
  return (
    <figure className="m-0">
      <figcaption className="label-mono mb-2" style={{ color: "#8a8f98" }}>{label}</figcaption>
      <div
        className="overflow-hidden rounded-brand border p-6"
        style={{
          borderColor: "#ffffff1a",
          background: bg,
          backgroundImage: image ? `url(${image})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <p
          style={{
            fontFamily: font,
            fontWeight: weight,
            fontSize: size,
            lineHeight: 1.06,
            color,
            margin: 0,
            fontVariationSettings: opsz ? `"opsz" ${opsz}` : undefined,
          }}
        >
          {EN.hero}
        </p>
      </div>
    </figure>
  );
}

export default function FrauncesDeep() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/specimen/deep.css" />

      <main id="main" style={{ background: "#050506", minHeight: "100dvh", color: "#ededef" }}>
        <div className="mx-auto max-w-[1200px] px-6 py-14">
          <p className="label-mono" style={{ color: "#c9a227" }}>Type specimen · stage 2 · deep</p>
          <h1 className="mt-3" style={{ fontFamily: FR, fontWeight: 800, fontSize: 56, lineHeight: 1.03 }}>
            Fraunces
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#a2a7b0" }}>
            Undercase Type · Google Fonts · 18 styles · axes{" "}
            <strong style={{ color: "#ededef" }}>wght 100–900</strong>, opsz 9–144, SOFT 0–100, WONK 0–1 ·{" "}
            <strong style={{ color: "#6ee7a0" }}>real italic</strong>
          </p>
          <p className="mt-4 flex flex-wrap gap-4">
            <Link href="/type" className="label-mono underline" style={{ color: "#7dd3fc" }}>← stage-1 grid</Link>
            <Link href="/type/synonym" className="label-mono underline" style={{ color: "#7dd3fc" }}>Synonym stage 2</Link>
            <a href="#whiteout" className="label-mono underline" style={{ color: "#fcd34d" }}>↓ jump to the white-out test</a>
          </p>

          {/* ============ THE DECISIVE TEST, FIRST ============ */}
          <section id="whiteout" className="mt-12 scroll-mt-6 rounded-brand border p-6"
                   style={{ borderColor: "#fcd34d55", background: "#0a0a0c" }}>
            <h2 className="text-2xl" style={{ fontFamily: FR, fontWeight: 700 }}>
              The white-out test
            </h2>
            <p className="mt-2 max-w-[78ch] text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
              Both faces, the real headline, hero size, over the two bright grounds the video
              actually passes through. The white-out frame is pulled from the hold at 32.6–34.0s
              (flat, luma 255). The orange is the real fill at 16.75s —{" "}
              <strong style={{ color: "#ededef" }}>rgb(188, 92, 42)</strong>. I scanned for it rather
              than inventing one; the hold I had previously labelled &ldquo;orange&rdquo; at 10.3s is
              actually pure white.
            </p>

            <p className="label-mono mt-8" style={{ color: "#fcd34d" }}>Fraunces 700 vs Synonym 700 — over flat white</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              <Ground label="Fraunces 700 · opsz 144 (display default)" font={FR} weight={700} bg="#ffffff" color="#020617" opsz={144} />
              <Ground label="Synonym 700" font={SYN} weight={700} bg="#ffffff" color="#020617" />
            </div>

            <p className="label-mono mt-8" style={{ color: "#fcd34d" }}>Over the real solid-orange frame</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              <Ground label="Fraunces 700 · opsz 144" font={FR} weight={700} image="/images/type-test-orange.jpg" color="#020617" opsz={144} />
              <Ground label="Synonym 700" font={SYN} weight={700} image="/images/type-test-orange.jpg" color="#020617" />
            </div>

            <p className="label-mono mt-8" style={{ color: "#fcd34d" }}>Over the real white-out frame (luma 255)</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              <Ground label="Fraunces 700 · opsz 144" font={FR} weight={700} image="/images/type-test-whiteout.jpg" color="#020617" opsz={144} />
              <Ground label="Synonym 700" font={SYN} weight={700} image="/images/type-test-whiteout.jpg" color="#020617" />
            </div>

            {/* Measured, because the eye is a poor judge of this */}
            <div className="mt-10 rounded-brand border p-5" style={{ borderColor: "#fca5a555", background: "#160b0b" }}>
              <p className="label-mono" style={{ color: "#fca5a5" }}>
                Measured — and it moves the problem off the typeface entirely
              </p>
              <table className="mt-3 w-full text-sm" style={{ color: "#c8ccd2", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#8a8f98" }}>
                    <th className="label-mono py-2 text-left">ground</th>
                    <th className="label-mono py-2 text-left">dark ink #020617</th>
                    <th className="label-mono py-2 text-left">white #ffffff</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: "1px solid #ffffff14" }}>
                    <td className="py-2">white-out frame (luma 255)</td>
                    <td className="py-2" style={{ color: "#6ee7a0" }}>20.17 : 1 — AAA</td>
                    <td className="py-2" style={{ color: "#fca5a5" }}>1.00 : 1 — fail</td>
                  </tr>
                  <tr style={{ borderTop: "1px solid #ffffff14" }}>
                    <td className="py-2">solid orange rgb(188, 92, 42)</td>
                    <td className="py-2" style={{ color: "#fcd34d" }}>4.52 : 1 — bare AA</td>
                    <td className="py-2" style={{ color: "#fcd34d" }}>4.47 : 1 — large text only</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-4 max-w-[80ch] text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                The white-out is not the dangerous frame — dark text on it is 20:1 and no typeface can
                fail there. <strong style={{ color: "#ededef" }}>The orange fill is the dangerous one</strong>,
                and it is dangerous for <em>both</em> faces equally: it sits at an awkward middle luma, so
                black lands at 4.52:1 and white at 4.47:1. Neither direction is comfortably legible, and
                no choice of typeface fixes it.
              </p>
              <p className="mt-2 max-w-[80ch] text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                So: overlay copy crossing the orange fill needs a scrim or a shifted overlay schedule
                whichever font wins. That is a hero-composition problem, not a type-selection one — it
                should not decide this.
              </p>
            </div>

            {/* The lever the opsz axis gives you */}
            <div className="mt-10 rounded-brand border p-5" style={{ borderColor: "#ffffff1a", background: "#101014" }}>
              <p className="label-mono" style={{ color: "#6ee7a0" }}>
                The lever Synonym does not have: optical size
              </p>
              <p className="mt-2 max-w-[78ch] text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
                Fraunces&rsquo; <code>opsz</code> axis directly controls stroke contrast. High opsz is
                the elegant display cut with fine hairlines — exactly what is at risk over a bright
                frame. Low opsz thickens those hairlines. If Fraunces thins out below, this is the
                dial that fixes it, and it costs nothing: same file, same weight.
              </p>
              <div className="mt-4 grid gap-5 lg:grid-cols-3">
                <Ground label="opsz 144 — most contrast, most fragile" font={FR} weight={700} bg="#ffffff" color="#020617" opsz={144} size={34} />
                <Ground label="opsz 48 — middle" font={FR} weight={700} bg="#ffffff" color="#020617" opsz={48} size={34} />
                <Ground label="opsz 9 — sturdiest hairlines" font={FR} weight={700} bg="#ffffff" color="#020617" opsz={9} size={34} />
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <Ground label="opsz 144 over orange" font={FR} weight={700} image="/images/type-test-orange.jpg" color="#020617" opsz={144} size={34} />
                <Ground label="opsz 48 over orange" font={FR} weight={700} image="/images/type-test-orange.jpg" color="#020617" opsz={48} size={34} />
                <Ground label="opsz 9 over orange" font={FR} weight={700} image="/images/type-test-orange.jpg" color="#020617" opsz={9} size={34} />
              </div>
            </div>
          </section>

          {/* ============ hero ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>Hero — 72px. 900 is available; 800 is where I would stop.</p>
            <p className="mt-4" style={{ fontFamily: FR, fontWeight: 800, fontSize: 72, lineHeight: 1.02, maxWidth: "18ch" }}>
              {EN.hero}
            </p>
            <p className="label-mono mt-8" style={{ color: "#8a8f98" }}>Same at 900 — the ceiling</p>
            <p className="mt-3" style={{ fontFamily: FR, fontWeight: 900, fontSize: 72, lineHeight: 1.02, maxWidth: "18ch", color: "#c8ccd2" }}>
              {EN.hero}
            </p>
          </section>

          {/* ============ ramp ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              Full weight axis — 100–900. Synonym gives you 200–700.
            </p>
            <div className="mt-4 space-y-1">
              {RAMP.map((r) => (
                <div key={r.w} className="flex flex-wrap items-baseline gap-x-5 border-b py-2.5" style={{ borderColor: "#ffffff0f" }}>
                  <span className="label-mono w-44 shrink-0" style={{ color: "#6b7280" }}>{r.w} {r.n}</span>
                  <span style={{ fontFamily: FR, fontWeight: r.w, fontSize: 30 }}>{EN.section}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ============ italic — the thing Synonym lacks ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#6ee7a0" }}>
              Real italic — the capability Synonym has none of
            </p>
            <p className="mt-2 max-w-[78ch] text-sm" style={{ color: "#a2a7b0" }}>
              A real testimonial from the site, set the way it would actually run.
            </p>
            <blockquote className="mt-5 rounded-brand border p-7" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
              <p style={{ fontFamily: FR, fontStyle: "italic", fontWeight: 400, fontSize: 26, lineHeight: 1.5, margin: 0 }}>
                &ldquo;{EN.quote}&rdquo;
              </p>
              <footer className="mt-4" style={{ fontFamily: FR, fontWeight: 600, fontSize: 15, color: "#a2a7b0" }}>
                Mona Ali — Mother, Future Language School
              </footer>
            </blockquote>
          </section>

          {/* ============ single-family composition ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              Q1 — a full composition in Fraunces alone (nav, label, heading, subhead, card, body, CTA)
            </p>
            <div className="mt-4 rounded-brand border p-8" style={{ borderColor: "#ffffff1a", background: "#0a0a0c", fontFamily: FR }}>
              <div className="flex items-center justify-between border-b pb-5" style={{ borderColor: "#ffffff14" }}>
                <span style={{ fontWeight: 800, fontSize: 22 }}>SafeRide</span>
                <nav className="flex gap-6" style={{ fontWeight: 500, fontSize: 15, color: "#a2a7b0" }}>
                  <span>Features</span><span>Coverage</span><span>Pricing</span><span>FAQ</span>
                </nav>
              </div>
              <p style={{ fontWeight: 600, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c9a227", marginTop: 32 }}>
                Platform
              </p>
              <h2 style={{ fontWeight: 700, fontSize: 34, lineHeight: 1.15, marginTop: 10 }}>{EN.section}</h2>
              <p style={{ fontWeight: 400, fontSize: 19, lineHeight: 1.55, color: "#c8ccd2", marginTop: 12, maxWidth: "58ch" }}>{EN.sub}</p>
              <div className="mt-8 rounded-brand border p-6" style={{ borderColor: "#ffffff14", background: "#101014", maxWidth: 460 }}>
                <h3 style={{ fontWeight: 700, fontSize: 20 }}>{EN.cardTitle}</h3>
                <p style={{ fontWeight: 400, fontSize: 15, lineHeight: 1.7, color: "#a2a7b0", marginTop: 10 }}>{EN.card}</p>
              </div>
              <span className="mt-8 inline-flex items-center rounded-brand px-6"
                    style={{ background: "#e8b04b", color: "#0a0a0c", fontWeight: 700, fontSize: 16, height: 48 }}>
                Book a demo
              </span>
            </div>
          </section>

          {/* ============ grounds ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>Light and dark</p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <Ground label="white on dark — #050506" font={FR} weight={700} bg="#050506" color="#ededef" opsz={144} />
              <Ground label="dark on light — #f8fafc" font={FR} weight={700} bg="#f8fafc" color="#020617" opsz={144} />
            </div>
          </section>

          {/* ============ wordmark ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>Wordmark, nav position and nav sizes</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[{ bg: "#050506", fg: "#ededef", sub: "#8a8f98" }, { bg: "#f8fafc", fg: "#0f172a", sub: "#64748b" }].map((t) => (
                <div key={t.bg} className="flex h-16 items-center justify-between rounded-brand border px-5"
                     style={{ background: t.bg, borderColor: "#ffffff1a" }}>
                  <span style={{ fontFamily: FR, fontWeight: 800, fontSize: 22, color: t.fg }}>SafeRide</span>
                  <span className="label-mono" style={{ color: t.sub }}>Fraunces 800</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-8 rounded-brand border p-7" style={{ background: "#050506", borderColor: "#ffffff1a" }}>
              {[16, 20, 24, 32, 44].map((s) => (
                <div key={s} className="text-center">
                  <span style={{ fontFamily: FR, fontWeight: 800, fontSize: s }}>SafeRide</span>
                  <div className="label-mono mt-2" style={{ color: "#8a8f98" }}>{s}px</div>
                </div>
              ))}
            </div>
          </section>

          {/* ============ Arabic ============ */}
          <section className="mt-16">
            <p className="label-mono" style={{ color: "#8a8f98" }}>
              Q · Arabic companion for a SERIF — real copy, same size
            </p>
            <p className="mt-2 max-w-[80ch] text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
              <strong style={{ color: "#fca5a5" }}>Fraunces has 0 Arabic codepoints</strong> — verified by
              parsing its cmap, the same method used on Synonym, not by asking the browser. So both
              finalists need a companion and this axis does not separate them.
            </p>
            <p className="mt-2 max-w-[80ch] text-sm leading-relaxed" style={{ color: "#c8ccd2" }}>
              Readex Pro is included as approved, but the skeleton argument that made it right for
              Synonym works <em>against</em> it here: it is a low-contrast humanist sans, and Fraunces
              is a high-contrast serif. The Naskh faces below carry stroke contrast the way a serif does.
            </p>
            <div className="mt-5 space-y-4">
              {ARABIC.map((a) => (
                <div key={a.name} className="rounded-brand border p-6" style={{ borderColor: "#ffffff1a", background: "#0a0a0c" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="label-mono" style={{ color: "#ededef" }}>{a.name} · {a.kind}</span>
                    <span className="label-mono" style={{ color: "#6b7280" }}>{a.note}</span>
                  </div>
                  <div className="mt-4 grid items-center gap-6 lg:grid-cols-2">
                    <p style={{ fontFamily: FR, fontWeight: 700, fontSize: 32, lineHeight: 1.15, margin: 0 }}>{EN.hero}</p>
                    <p dir="rtl" lang="ar" style={{ fontFamily: a.css, fontWeight: 700, fontSize: 32, lineHeight: 1.6, margin: 0 }}>{AR.hero}</p>
                  </div>
                  <div className="mt-5 grid gap-6 border-t pt-4 lg:grid-cols-2" style={{ borderColor: "#ffffff0f" }}>
                    <div>
                      <h3 style={{ fontFamily: FR, fontWeight: 700, fontSize: 20 }}>{EN.cardTitle}</h3>
                      <p style={{ fontFamily: FR, fontWeight: 400, fontSize: 15, lineHeight: 1.7, color: "#a2a7b0", marginTop: 8 }}>{EN.card}</p>
                    </div>
                    <div dir="rtl" lang="ar">
                      <h3 style={{ fontFamily: a.css, fontWeight: 700, fontSize: 20 }}>{AR.cardTitle}</h3>
                      <p style={{ fontFamily: a.css, fontWeight: 400, fontSize: 15, lineHeight: 1.95, color: "#a2a7b0", marginTop: 8 }}>{AR.card}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
