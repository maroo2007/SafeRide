/**
 * The section ground, checked as rendered.
 *
 * The menu panel shipped with a correct rect and no paint. So this reads the
 * COMPUTED background of every content section and the space between them,
 * rather than checking that a class name is present:
 *
 *   1. every section's ground is fully opaque — nothing inherits the page's
 *   2. adjacent sections are actually distinguishable: either the grounds
 *      differ by >= 3:1, or there is enough vertical space between the two
 *      blocks of content that the eye reads a break
 *   3. every heading and eyebrow clears 4.5:1 on the ground it is actually on
 *   4. the dark section resolves the DARK token scope, not just a dark
 *      background — the hero wore a light --accent-edge over footage for weeks
 *      because bg-surface-dark was applied without the `dark` class
 *
 * Exits non-zero on failure.
 *
 * Usage: node build/verify-sections.js <profile-dir> <out-dir> [url] [--w=] [--h=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9698);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!ok) fails.push(name);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${P}`, `--window-size=${VW},${VH}`, "about:blank"], { stdio: "ignore" });

  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500); try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000);

  const data = JSON.parse(await ev(`(() => {
    const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null;
      const n = m[1].split(',').map(parseFloat); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
    const ratio = (a, b) => { const x = L(a.r, a.g, a.b), y = L(b.r, b.g, b.b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

    /* Content sections only: the hero and the token scaffolding are not §4. */
    /*
     * "main section", not "main > section" — NO BACKTICKS IN HERE, this
     * comment lives inside a template literal and a backtick ends the string.
     * The page ground (§4a) wraps
     * everything after the hero in a positioned div, so the direct-child form
     * matched nothing and this guard reported zero sections — caught only by
     * its own no-op half, which is why that half exists.
     */
    const secs = [...document.querySelectorAll('main section')].filter(
      (s) => s.getAttribute('aria-labelledby') && !/hero-headline|states/.test(s.getAttribute('aria-labelledby')));

    return JSON.stringify(secs.map((s) => {
      const cs = getComputedStyle(s);
      /*
       * OWN alpha for the tenancy question, EFFECTIVE ground for every
       * luminance question. Paper sections are transparent now (they sit on
       * the page layer), and parsing "rgba(0,0,0,0)" as a colour made them
       * read as pure black: the heading contrast collapsed to 1.06:1 and the
       * "find the dark section" search picked the first paper section and
       * then complained its token scope was light. Both were the transparent
       * ground being taken literally.
       */
      const ownAlpha = parse(cs.backgroundColor);
      const painted = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c && c.a >= 0.999) return c;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };
      const bg = painted(s);
      const b = s.getBoundingClientRect();
      const h2 = s.querySelector('h2');
      /*
       * The section's OWN eyebrow, not any .label-mono inside it.
       *
       * The Scroll Stack has no eyebrow — the brief removed Platform's with
       * the grid — but each of its cards carries a .label-mono counter, and
       * this picked the first of those and measured it against the SECTION's
       * paper ground. It sits on a photograph behind a scrim, so it came back
       * as 1:1 and failed a section that is correct. Its real ground is
       * measured by verify-stack, which hides the copy and photographs what
       * is under it.
       */
      const eyebrow = [...s.querySelectorAll('.label-mono')]
        .find((e) => !e.closest('[data-stack-card]')) || null;
      const inner = s.firstElementChild;
      const ics = inner ? getComputedStyle(inner) : null;
      const txt = (el) => {
        if (!el) return null;
        const c = parse(getComputedStyle(el).color);
        const r = el.getBoundingClientRect();
        return { color: getComputedStyle(el).color, contrast: bg ? +ratio(c, bg).toFixed(2) : null,
          top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) };
      };
      return {
        id: s.id || '(none)',
        label: s.getAttribute('aria-labelledby'),
        bg: cs.backgroundColor,
        alpha: ownAlpha ? ownAlpha.a : null,
        lum: bg ? +L(bg.r, bg.g, bg.b).toFixed(4) : null,
        top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY), h: Math.round(b.height),
        padTop: ics ? ics.paddingTop : null, padBottom: ics ? ics.paddingBottom : null,
        darkScope: cs.getPropertyValue('--ring').trim(),
        heading: txt(h2), eyebrow: txt(eyebrow),
      };
    }));
  })()`));

  console.log(`\n  SECTION GROUND — ${URL} at ${VW}x${VH}\n`);
  console.log("   id           ground                 lum      pad top/bottom     heading   eyebrow");
  for (const s of data) {
    console.log(`   ${s.id.padEnd(12)} ${s.bg.padEnd(22)} ${String(s.lum).padEnd(8)} ${String(s.padTop + " / " + s.padBottom).padEnd(18)} ` +
      `${String(s.heading ? s.heading.contrast + ":1" : "-").padEnd(9)} ${s.eyebrow ? s.eyebrow.contrast + ":1" : "-"}`);
  }

  /*
   * NARROWED, not weakened (build spec §4a.4).
   *
   * What this rule protects against is a section with NO ground at all, which
   * is what the menu panel shipped. A section sitting on ONE named, deliberate
   * page-level layer is not that — and the layer has to be page-level, because
   * a per-section lattice re-origins its 6rem x 4rem rhythm at every boundary
   * and shows a seam between two paper sections.
   *
   * So the exemption is BY NAME. It cannot spread by accident: a new section
   * that forgets its ground and is not on this list still fails, and dark
   * sections keep the requirement in full.
   */
  /* Added 2026-09-09 with §4.6-§4.9. Each name is a deliberate decision that
     this section stands on the page layer rather than painting its own — the
     list is the record of those decisions, which is the whole reason the
     exemption is by name and not by a rule that would let the next section in
     silently. */
  const ON_PAGE_GROUND = [
    "features", "parent-app", "journey",
    "difference", "coverage", "testimonials",
    /* Added with 4.10-4.12. Same decision as the seven above: they stand on
       the page's ground layer and do not paint one of their own. The footer is
       NOT here — it is dark and paints its own. */
    "faq", "contact", "final-cta",
  ];
  const groundless = data.filter((s) => s.alpha !== 1 && !ON_PAGE_GROUND.includes(s.id));
  check("every section either declares an opaque ground or is a named tenant of the page layer",
    data.length > 0 && groundless.length === 0,
    data.map((s) => `${s.id}=${s.alpha === 1 ? "own" : ON_PAGE_GROUND.includes(s.id) ? "page-layer" : "NONE"}`).join(" "));
  check("the page layer itself exists and is opaque",
    (await ev(`(() => { const e = document.querySelector('.page-ground');
      return e ? getComputedStyle(e).backgroundColor : 'missing'; })()`)).startsWith("rgb("),
    await ev("document.querySelector('.page-ground') ? getComputedStyle(document.querySelector('.page-ground')).backgroundColor : 'missing'"));
  /* By measured luminance, not by a class list: any section whose ground is
     dark must have painted it itself rather than relying on the page layer. */
  /*
   * THE FOOTER IS THE DARK GROUND NOW.
   *
   * The Intelligence Layer was deleted, and it was the only dark <section> on
   * the page — so a check that requires at least one, scanning sections only,
   * would fail on a page whose one dark ground is a <footer>. It is included
   * by name, and the requirement that a dark ground be painted by the element
   * itself rather than inherited from the page layer is unchanged.
   */
  const darkSecs = data.filter((s) => s.lum !== null && s.lum < 0.05);
  const footRaw = await ev(`(() => {
    const f = document.querySelector('footer');
    if (!f) return '';
    const cs = getComputedStyle(f);
    return cs.backgroundColor + '|' + cs.getPropertyValue('--ring').trim();
  })()`);
  /* Parsed HERE rather than in the page. The in-page version needed a regex
     inside a template literal inside a JS string, the backslashes did not
     survive the trip, and it silently reported "no dark ground found" on a
     page whose footer is #030302. Node has no escaping problem. */
  const parseRgb = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || "");
    if (!m) return null;
    const n = m[1].split(",").map((x) => parseFloat(x));
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  };
  const linOf = (v) => { const t = v / 255; return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4); };
  const footBg = parseRgb((footRaw || "").split("|")[0]);
  const footRing = (footRaw || "").split("|")[1] || "";
  const footer = footBg
    ? { id: "footer", alpha: footBg.a,
        lum: 0.2126 * linOf(footBg.r) + 0.7152 * linOf(footBg.g) + 0.0722 * linOf(footBg.b) }
    : null;
  const darks = footer && footer.lum !== null && footer.lum < 0.05
    ? [...darkSecs, footer] : darkSecs;
  check("the dark ground is painted by the element itself, not inherited",
    darks.length > 0 && darks.every((s) => s.alpha === 1),
    darks.map((s) => `${s.id}=${s.alpha === 1 ? "own" : "TENANT"}`).join(" ") || "(no dark ground found)");
  // NO-OP HALF: a page with no content sections would satisfy "all opaque".
  check("there are content sections to check at all", data.length >= 3, `${data.length} found`);

  const contrastOk = data.every((s) => (!s.heading || s.heading.contrast >= 4.5) && (!s.eyebrow || s.eyebrow.contrast >= 4.5));
  check("every heading and eyebrow clears 4.5:1 on its own ground", contrastOk,
    data.map((s) => `${s.id} ${s.heading ? s.heading.contrast : "-"}/${s.eyebrow ? s.eyebrow.contrast : "-"}`).join("  "));

  /*
   * Neighbours must be separable. Either the grounds differ, or the gap does
   * the work — because paper -> card is 1.06:1 and cannot.
   */
  console.log("\n   neighbours\n");
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  let separable = true;
  for (let i = 1; i < data.length; i++) {
    const a = data[i - 1], b = data[i];
    const r = (Math.max(a.lum, b.lum) + 0.05) / (Math.min(a.lum, b.lum) + 0.05);
    /* Gap between the two blocks of INK, which is what the eye reads. */
    const gap = (b.eyebrow ? b.eyebrow.top : b.top) - (a.heading ? a.heading.bottom : a.bottom);
    const ok = r >= 3 || gap >= 144;
    if (!ok) separable = false;
    console.log(`   ${a.id} -> ${b.id}: grounds ${r.toFixed(2)}:1, ${gap}px between their content   ${ok ? "separable" : "NEITHER"}`);
  }
  check("adjacent sections are separable by ground or by space", separable);

  /* The footer is the page's only dark ground since the Intelligence Layer
     was deleted, so it is what this reads the dark token scope from. */
  const darkSec = data.find((s) => s.lum !== null && s.lum < 0.05)
    || (footer && footer.lum < 0.05 ? { id: "footer", darkScope: footRing } : undefined);
  check("the dark section resolves the dark token scope, not just a dark background",
    !!darkSec && /fae6b7/i.test(darkSec.darkScope),
    darkSec ? `--ring resolves to "${darkSec.darkScope}"` : "no dark section found");

  /*
   * EVERY piece of ink in every section, against the surface it is actually
   * on — not against the section ground.
   *
   * The live indicator on the first Platform card used `text-accent-edge` and
   * `bg-accent-edge`. Neither resolves, because --color-accent-edge is not in
   * the @theme bridge: the dot had no background at all and the label fell
   * back to inherited ink. It looked almost right in a screenshot. Checking
   * only the heading and eyebrow, as the first version of this rig did, walks
   * straight past it.
   *
   * "The surface it is actually on" matters: the Intelligence panel has its
   * own --card background, so its text must be measured against #24211b and
   * not against the section's #030302. Walking up to the nearest painted
   * ancestor is the difference between measuring the thing and measuring its
   * neighbour.
   */
  const ink = JSON.parse(await ev(`(() => {
    const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    /* \\( not \(: this string is a JS template literal, so a single backslash
       is swallowed and the page would receive /rgba?(([^)]+))/ — which matches
       "rgb(3, 9, 23)" with group 1 = "(3, 9, 23", parseFloat gives NaN, and
       every contrast in the report comes back null. It did. */
    const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null;
      const n = m[1].split(',').map(parseFloat); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
    const ratio = (a, b) => { const x = L(a.r, a.g, a.b), y = L(b.r, b.g, b.b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const painted = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a >= 0.999) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const out = [];
    /*
     * "main section", not "main > section" — NO BACKTICKS IN HERE, this
     * comment lives inside a template literal and a backtick ends the string.
     * The page ground (§4a) wraps
     * everything after the hero in a positioned div, so the direct-child form
     * matched nothing and this guard reported zero sections — caught only by
     * its own no-op half, which is why that half exists.
     */
    const secs = [...document.querySelectorAll('main section')].filter(
      (s) => s.getAttribute('aria-labelledby') && !/hero-headline|states/.test(s.getAttribute('aria-labelledby')));
    for (const sec of secs) {
      /* Text: elements whose own text is their only child content. */
      for (const el of sec.querySelectorAll('h2, h3, p, dt, dd, figcaption, a, span')) {
        const txt = (el.textContent || '').trim();
        if (!txt || el.children.length > 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const fg = parse(cs.color); if (!fg) continue;
        const px = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = px >= 24 || (px >= 18.66 && bold);
        out.push({ sec: sec.id, kind: 'text', large, min: large ? 3 : 4.5,
          sample: txt.slice(0, 28), size: Math.round(px),
          /*
           * painted(el), NOT painted(el.parentElement) — and no backticks in
           * this comment, per the warning twenty lines up, which I ignored
           * once already and broke the file.
           *
           * Starting at the parent skips the element's OWN background, which
           * is right for a transparent p and wrong for anything that paints
           * its own ground. The Pricing badge is ink on paper at 18.82:1 and
           * this reported it as 1:1, because the walk stepped straight past
           * the pill to the card behind it and compared near-white text with
           * near-white paper.
           *
           * Starting at the element is strictly better: a transparent element
           * fails the alpha test and the walk continues to the parent exactly
           * as before, so nothing that passed changes.
           *
           * verify-ground-contrast.js carries the same note about the same
           * symptom: on a filled button the ring is the page behind the
           * button, so the label was compared against paper and reported 1:1.
           * It was fixed there and not here.
           */
          contrast: +ratio(fg, painted(el)).toFixed(2) });
      }
      /* Indicators: non-text graphics that carry meaning. 1.4.11 -> 3:1. */
      for (const el of sec.querySelectorAll('[data-live-dot]')) {
        const bg = parse(getComputedStyle(el).backgroundColor);
        out.push({ sec: sec.id, kind: 'indicator', min: 3, sample: 'live dot', size: 0,
          contrast: bg && bg.a >= 0.999 ? +ratio(bg, painted(el.parentElement)).toFixed(2) : 0 });
      }
    }
    return JSON.stringify(out);
  })()`));

  const bad = ink.filter((i) => i.contrast < i.min);
  const byKind = (k) => ink.filter((i) => i.kind === k).length;
  console.log(`
   ink checked: ${byKind('text')} text runs, ${byKind('indicator')} indicators
`);
  const worstPer = {};
  for (const i of ink) if (!worstPer[i.sec] || i.contrast < worstPer[i.sec].contrast) worstPer[i.sec] = i;
  for (const sec of Object.keys(worstPer)) {
    const w = worstPer[sec];
    console.log(`   ${sec.padEnd(10)} worst ${String(w.contrast).padStart(6)}:1  (${w.kind}, ${w.size}px) "${w.sample}"`);
  }
  // NO-OP HALF: an empty page has no failing ink either.
  check("there is ink to check", ink.length > 40, `${ink.length} measured`);
  check("every piece of ink clears its threshold on the surface it is on",
    bad.length === 0,
    bad.length ? `${bad.length} failing: ` + bad.map((b) => `${b.sec}:"${b.sample}" ${b.contrast}:1 < ${b.min}`).join("  ") : "");

  /* Captures. */
  for (const s of data) {
    await ev(`(async()=>{scrollTo(0,${Math.max(0, s.top)});await new Promise(r=>setTimeout(r,900));return 1})()`);
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `sec-${s.id}.png`), Buffer.from(r.result.data, "base64"));
  }
  /* The paper -> dark join, which is the one real seam in 5a. */
  if (darkSec) {
    await ev(`(async()=>{scrollTo(0,${Math.max(0, darkSec.top - Math.round(VH / 2))});await new Promise(r=>setTimeout(r,900));return 1})()`);
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, "sec-join-paper-to-dark.png"), Buffer.from(r.result.data, "base64"));
  }

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  ground verified\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
