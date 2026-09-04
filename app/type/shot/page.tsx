/**
 * Capture panels — rendered at fixed sizes so headless Chrome can screenshot
 * them into real image files. Not part of the site; dev specimen only.
 *
 *   /type/shot?panel=whiteout        Fraunces vs Synonym over the bright grounds
 *   /type/shot?panel=arabic-body     all four Arabic faces at BODY size
 *   /type/shot?panel=arabic-whiteout Amiri Arabic over white + the orange fill
 *   /type/shot?panel=arabic-compare  four Arabic faces against one Latin line
 */

import { FAQ_AR } from "@/lib/faq-ar";
import { FAQ_EN } from "@/lib/faq-en";

export const metadata = { title: "specimen shot" };

/** Arabic body column at a realistic measure. */
const MEASURE = 620;

function FaqColumn({
  headFont, bodyFont, title, sub,
}: { headFont: string; bodyFont: string; title: string; sub: string }) {
  return (
    <div style={{ width: MEASURE }}>
      <div style={{ ...LBL, color: "#ededef" }}>{title}</div>
      <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{sub}</div>
      <div dir="rtl" lang="ar" style={{ marginTop: 16 }}>
        {FAQ_AR.map((f, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid #ffffff12" : "none", padding: "16px 0" }}>
            <h3 style={{ margin: 0, fontFamily: headFont, fontWeight: 700, fontSize: 19, lineHeight: 1.6 }}>{f.q}</h3>
            <p style={{ margin: "8px 0 0", fontFamily: bodyFont, fontWeight: 400, fontSize: 16, lineHeight: 1.95, color: "#c8ccd2" }}>{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const FR = "'Fraunces', Georgia, serif";
const SYN = "'Synonym', ui-sans-serif, system-ui, sans-serif";

const EN_HERO = "Because every child deserves a safe ride home";
const EN_CARD_T = "AI Incident Detection";
const EN_CARD =
  "Computer vision watches every trip for unsafe behavior and flags it in seconds, before it becomes an incident report.";

const AR_HERO = "لأن كل طفل يستحق رحلة آمنة إلى المنزل";
const AR_Q = "كيف يحمي حضور التعرف على الوجه خصوصية طفلي؟";
/* Real FAQ answer from the live site — full body length, with diacritics. */
const AR_FAQ =
  "تُخزَّن بيانات الوجه كبصمة رياضية مشفّرة، وليس كصورة، وتُستخدم فقط لتأكيد الصعود والنزول. تتحكم المدرسة في مدة الاحتفاظ بالبيانات، ويمكن للأسر اختيار الحضور اليدوي أو عبر رمز QR بدلًا من ذلك.";

const ARABIC = [
  { name: "Amiri", css: "'Amiri', serif", kind: "classical Naskh", styles: "4 static" },
  { name: "Markazi Text", css: "'Markazi Text', serif", kind: "modern Naskh", styles: "4 variable" },
  { name: "Noto Naskh Arabic", css: "'Noto Naskh Arabic', serif", kind: "Naskh", styles: "4 variable" },
  { name: "Readex Pro", css: "'Readex Pro', sans-serif", kind: "humanist sans", styles: "6 variable" },
];

const CARD = { border: "1px solid #ffffff1a", background: "#0a0a0c", borderRadius: 16 };
const LBL: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains), monospace",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#8a8f98",
};

function Hero({ font, weight, opsz, bg, image, color, label }: {
  font: string; weight: number; opsz?: number; bg?: string; image?: string; color: string; label: string;
}) {
  return (
    <div>
      <div style={{ ...LBL, marginBottom: 6 }}>{label}</div>
      <div style={{
        border: "1px solid #ffffff1a", borderRadius: 16, padding: 22, overflow: "hidden",
        background: bg, backgroundImage: image ? `url(${image})` : undefined,
        backgroundSize: "cover", backgroundPosition: "center",
      }}>
        <p style={{
          margin: 0, fontFamily: font, fontWeight: weight, fontSize: 34, lineHeight: 1.08, color,
          fontVariationSettings: opsz ? `"opsz" ${opsz}` : undefined,
        }}>{EN_HERO}</p>
      </div>
    </div>
  );
}

export default async function Shot({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const { panel = "whiteout" } = await searchParams;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/specimen/deep.css" />
      <div style={{ background: "#050506", color: "#ededef", padding: 28, minHeight: "100dvh" }}>

        {panel === "whiteout" && (
          <div style={{ display: "grid", gap: 20 }}>
            <div>
              <div style={{ ...LBL, color: "#c9a227" }}>The white-out test · Fraunces vs Synonym · hero headline</div>
              <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                Grounds are real frames from the video. Orange fill = rgb(188,92,42) at 16.75s. White-out = the hold at 32.6–34.0s.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Hero label="Fraunces 700 · opsz 144 · flat white" font={FR} weight={700} opsz={144} bg="#ffffff" color="#020617" />
              <Hero label="Synonym 700 · flat white" font={SYN} weight={700} bg="#ffffff" color="#020617" />
              <Hero label="Fraunces 700 · real white-out frame" font={FR} weight={700} opsz={144} image="/images/type-test-whiteout.jpg" color="#020617" />
              <Hero label="Synonym 700 · real white-out frame" font={SYN} weight={700} image="/images/type-test-whiteout.jpg" color="#020617" />
              <Hero label="Fraunces 700 · real ORANGE fill — 4.52:1" font={FR} weight={700} opsz={144} image="/images/type-test-orange.jpg" color="#020617" />
              <Hero label="Synonym 700 · real ORANGE fill — 4.52:1" font={SYN} weight={700} image="/images/type-test-orange.jpg" color="#020617" />
            </div>
            <div style={{ ...CARD, padding: 18 }}>
              <div style={{ ...LBL, color: "#6ee7a0" }}>Fraunces opsz axis — the lever Synonym has no equivalent for</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 12 }}>
                <Hero label="opsz 144 — finest hairlines" font={FR} weight={700} opsz={144} image="/images/type-test-orange.jpg" color="#020617" />
                <Hero label="opsz 48" font={FR} weight={700} opsz={48} image="/images/type-test-orange.jpg" color="#020617" />
                <Hero label="opsz 9 — sturdiest" font={FR} weight={700} opsz={9} image="/images/type-test-orange.jpg" color="#020617" />
              </div>
            </div>
          </div>
        )}

        {panel === "arabic-body" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={{ ...LBL, color: "#c9a227" }}>Arabic at BODY size — real FAQ answer from the live site</div>
              <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                16px body, 1.95 line-height. This copy carries diacritics (تُخزَّن, مشفّرة) — the exact place a calligraphic face strains.
              </div>
            </div>
            {ARABIC.map((a) => (
              <div key={a.name} style={{ ...CARD, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ ...LBL, color: "#ededef" }}>{a.name} · {a.kind}</span>
                  <span style={{ ...LBL, color: "#6b7280" }}>{a.styles}</span>
                </div>
                <div dir="rtl" lang="ar" style={{ marginTop: 12 }}>
                  <h3 style={{ margin: 0, fontFamily: a.css, fontWeight: 700, fontSize: 19 }}>{AR_Q}</h3>
                  <p style={{ margin: "10px 0 0", fontFamily: a.css, fontWeight: 400, fontSize: 16, lineHeight: 1.95, color: "#c8ccd2" }}>
                    {AR_FAQ}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {panel === "arabic-whiteout" && (
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ ...LBL, color: "#c9a227" }}>Arabic over the bright frames — does Naskh survive the white-out?</div>
              <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                Same grounds as the Latin test. Amiri is the highest-contrast of the four, so it is the one most at risk.
              </div>
            </div>
            {["Amiri", "Markazi Text", "Noto Naskh Arabic"].map((n) => {
              const a = ARABIC.find((x) => x.name === n)!;
              return (
                <div key={n} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {[
                    { label: `${n} · real white-out frame`, img: "/images/type-test-whiteout.jpg" },
                    { label: `${n} · real ORANGE fill`, img: "/images/type-test-orange.jpg" },
                  ].map((g) => (
                    <div key={g.label}>
                      <div style={{ ...LBL, marginBottom: 6 }}>{g.label}</div>
                      <div style={{
                        border: "1px solid #ffffff1a", borderRadius: 16, padding: 20, overflow: "hidden",
                        backgroundImage: `url(${g.img})`, backgroundSize: "cover", backgroundPosition: "center",
                      }}>
                        <p dir="rtl" lang="ar" style={{ margin: 0, fontFamily: a.css, fontWeight: 700, fontSize: 30, lineHeight: 1.7, color: "#020617" }}>
                          {AR_HERO}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {panel === "cta" && (
          <div style={{ background: "#fdf8f0", margin: -28, padding: 40, minHeight: "100dvh" }}>
            <div style={{ ...LBL, color: "#8a6b2a" }}>CTA prominence on paper · #fdf8f0 · fill stays #FB8A00</div>
            <div style={{ ...LBL, color: "#6b6257", marginTop: 6, textTransform: "none", letterSpacing: 0, fontSize: 13, lineHeight: 1.6, maxWidth: 780 }}>
              The fill is 2.27:1 against this ground. WCAG 1.4.11 needs 3:1 for a UI component boundary,
              so the baseline is not merely quiet — it is non-compliant. Each treatment below keeps
              #FB8A00 and changes only what carries the edge.
            </div>

            {[
              { t: "A · baseline (current)", n: "flat fill, no boundary — edge 2.27:1 FAILS 3:1",
                st: { background: "#fb8a00", color: "#030917" } },
              { t: "B · film-orange hairline", n: "2px #B9551A — 4.54:1 vs paper. On-brand: the film's own orange, which cannot be a fill, becomes the edge",
                st: { background: "#fb8a00", color: "#030917", border: "2px solid #b9551a" } },
              { t: "C · ink hairline", n: "2px #030917 — 18.82:1 vs paper. Unambiguous, reads as stamped",
                st: { background: "#fb8a00", color: "#030917", border: "2px solid #030917" } },
              { t: "D · elevation", n: "warm-tinted shadow. Perceptual separation, NOT a measurable 3:1 boundary",
                st: { background: "#fb8a00", color: "#030917", boxShadow: "0 10px 20px rgba(120,60,10,.22), 0 2px 6px rgba(120,60,10,.18)" } },
              { t: "E · size + weight only", n: "larger, heavier, more padding. More presence — but the edge is still 2.27:1",
                st: { background: "#fb8a00", color: "#030917" }, big: true },
              { t: "F · film hairline + elevation", n: "B and D together — compliant edge AND lift",
                st: { background: "#fb8a00", color: "#030917", border: "2px solid #b9551a", boxShadow: "0 10px 20px rgba(120,60,10,.20)" } },
            ].map((v) => (
              <div key={v.t} style={{ marginTop: 30 }}>
                <div style={{ ...LBL, color: "#3d3830" }}>{v.t}</div>
                <div style={{ ...LBL, color: "#6b6257", marginTop: 3, textTransform: "none", letterSpacing: 0, fontSize: 12.5 }}>{v.n}</div>
                <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 12 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontFamily: FR, fontWeight: v.big ? 800 : 700,
                    fontSize: v.big ? 20 : 17,
                    height: v.big ? 62 : 52, padding: v.big ? "0 40px" : "0 28px",
                    borderRadius: 16, ...v.st,
                  }}>Explore Platform</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontFamily: FR, fontWeight: 700, fontSize: 17, height: 52, padding: "0 28px",
                    borderRadius: 16, border: "1px solid #e3dccd", color: "#030917", background: "transparent",
                  }}>Our Story</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {panel === "whiteout-brand" && (
          <div style={{ display: "grid", gap: 20 }}>
            <div>
              <div style={{ ...LBL, color: "#c9a227" }}>White-out test · Fraunces vs Synonym · hero headline over white and #FB8A00</div>
              <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                Dark ink on white = 20.17:1. Dark ink on #FB8A00 = 8.39:1. White on #FB8A00 = 2.40:1 (unusable, shown last for proof).
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Hero label="Fraunces 700 · opsz 144 · WHITE" font={FR} weight={700} opsz={144} bg="#ffffff" color="#020617" />
              <Hero label="Synonym 700 · WHITE" font={SYN} weight={700} bg="#ffffff" color="#020617" />
              <Hero label="Fraunces 700 · opsz 144 · #FB8A00 — 8.39:1" font={FR} weight={700} opsz={144} bg="#FB8A00" color="#020617" />
              <Hero label="Synonym 700 · #FB8A00 — 8.39:1" font={SYN} weight={700} bg="#FB8A00" color="#020617" />
            </div>
            <div style={{ ...CARD, padding: 18 }}>
              <div style={{ ...LBL, color: "#6ee7a0" }}>Fraunces opsz over #FB8A00 — the hairline dial</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 12 }}>
                <Hero label="opsz 144 — finest" font={FR} weight={700} opsz={144} bg="#FB8A00" color="#020617" />
                <Hero label="opsz 48" font={FR} weight={700} opsz={48} bg="#FB8A00" color="#020617" />
                <Hero label="opsz 9 — sturdiest" font={FR} weight={700} opsz={9} bg="#FB8A00" color="#020617" />
              </div>
            </div>
            <div style={{ ...CARD, padding: 18, borderColor: "#fca5a555" }}>
              <div style={{ ...LBL, color: "#fca5a5" }}>Proof that white text on #FB8A00 is not an option — 2.40:1</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
                <Hero label="Fraunces · WHITE on #FB8A00" font={FR} weight={700} opsz={144} bg="#FB8A00" color="#ffffff" />
                <Hero label="Synonym · WHITE on #FB8A00" font={SYN} weight={700} bg="#FB8A00" color="#ffffff" />
              </div>
            </div>
          </div>
        )}

        {panel === "latin-faq" && (
          <div>
            <div style={{ ...LBL, color: "#c9a227" }}>Latin body face · all seven FAQ answers · Fraunces headings throughout</div>
            <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              Same test as the Arabic one. 16px body, 1.7 leading, 620px measure. Only the body face changes.
            </div>
            <div style={{ display: "flex", gap: 28, marginTop: 18, alignItems: "flex-start" }}>
              {[
                { t: "A · Fraunces body, opsz 144", s: "display optical size — wrong for body, shown to prove it", f: FR, o: 144 },
                { t: "B · Fraunces body, opsz 9", s: "text optical size — the correct way to use one family", f: FR, o: 9 },
                { t: "C · Source Serif 4 body", s: "dedicated text serif, 16 styles", f: "'Source Serif 4', Georgia, serif", o: 0 },
              ].map((c) => (
                <div key={c.t} style={{ width: 620 }}>
                  <div style={{ ...LBL, color: "#ededef" }}>{c.t}</div>
                  <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{c.s}</div>
                  <div style={{ marginTop: 16 }}>
                    {FAQ_EN.map((f, i) => (
                      <div key={i} style={{ borderTop: i ? "1px solid #ffffff12" : "none", padding: "16px 0" }}>
                        <h3 style={{ margin: 0, fontFamily: FR, fontWeight: 700, fontSize: 19, lineHeight: 1.3 }}>{f.q}</h3>
                        <p style={{ margin: "8px 0 0", fontFamily: c.f, fontWeight: 400, fontSize: 16, lineHeight: 1.7, color: "#c8ccd2",
                                    fontVariationSettings: c.o ? `"opsz" ${c.o}` : undefined }}>{f.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {panel === "faq-amiri" && (
          <div>
            <div style={{ ...LBL, color: "#c9a227" }}>All seven FAQ answers · Amiri throughout · 16px body, 1.95 leading</div>
            <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              Real copy from the live site. Read it top to bottom — the question is whether the tenth paragraph is as comfortable as the first.
            </div>
            <div style={{ marginTop: 18 }}>
              <FaqColumn headFont="'Amiri', serif" bodyFont="'Amiri', serif" title="Amiri — headings AND body" sub="classical Naskh, 4 static styles" />
            </div>
          </div>
        )}

        {panel === "faq-split" && (
          <div>
            <div style={{ ...LBL, color: "#c9a227" }}>All-Amiri vs the split option — same seven answers, same measure</div>
            <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              Amiri keeps the headings in every column, so the brand voice is identical. Only the body face changes.
            </div>
            <div style={{ display: "flex", gap: 28, marginTop: 18, alignItems: "flex-start" }}>
              <FaqColumn headFont="'Amiri', serif" bodyFont="'Amiri', serif"
                title="A · all Amiri" sub="headings + body both Amiri" />
              <FaqColumn headFont="'Amiri', serif" bodyFont="'Noto Naskh Arabic', serif"
                title="B · Amiri headings + Noto Naskh body" sub="body x-height 0.84x vs Amiri 0.67x" />
              <FaqColumn headFont="'Amiri', serif" bodyFont="'Markazi Text', serif"
                title="C · Amiri headings + Markazi body" sub="body x-height 0.73x" />
            </div>
          </div>
        )}

        {panel === "arabic-compare" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={{ ...LBL, color: "#c9a227" }}>Four Arabic candidates against the same Fraunces line</div>
              <div style={{ ...LBL, color: "#6b7280", marginTop: 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                Latin is Fraunces 700 throughout. Judge: matching colour on the page, stroke contrast, and whether they read as one voice.
              </div>
            </div>
            {ARABIC.map((a) => (
              <div key={a.name} style={{ ...CARD, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ ...LBL, color: "#ededef" }}>{a.name} · {a.kind}</span>
                  <span style={{ ...LBL, color: "#6b7280" }}>{a.styles}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center", marginTop: 12 }}>
                  <p style={{ margin: 0, fontFamily: FR, fontWeight: 700, fontSize: 27, lineHeight: 1.15 }}>{EN_HERO}</p>
                  <p dir="rtl" lang="ar" style={{ margin: 0, fontFamily: a.css, fontWeight: 700, fontSize: 27, lineHeight: 1.65 }}>{AR_HERO}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 16, borderTop: "1px solid #ffffff0f", paddingTop: 14 }}>
                  <div>
                    <h4 style={{ margin: 0, fontFamily: FR, fontWeight: 700, fontSize: 16 }}>{EN_CARD_T}</h4>
                    <p style={{ margin: "8px 0 0", fontFamily: FR, fontWeight: 400, fontSize: 13.5, lineHeight: 1.7, color: "#a2a7b0" }}>{EN_CARD}</p>
                  </div>
                  <div dir="rtl" lang="ar">
                    <h4 style={{ margin: 0, fontFamily: a.css, fontWeight: 700, fontSize: 16 }}>رصد الحوادث بالذكاء الاصطناعي</h4>
                    <p style={{ margin: "8px 0 0", fontFamily: a.css, fontWeight: 400, fontSize: 13.5, lineHeight: 1.95, color: "#a2a7b0" }}>
                      تراقب الرؤية الحاسوبية كل رحلة لرصد أي سلوك غير آمن والتنبيه عليه خلال ثوانٍ، قبل أن يتحول إلى بلاغ حادث.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
