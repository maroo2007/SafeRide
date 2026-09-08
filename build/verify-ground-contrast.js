/**
 * Contrast against the REAL ground, measured from pixels (build spec §4a.5).
 *
 * verify-sections.js derives each ground from computed `background-color`,
 * walking up for the first opaque ancestor. A background-IMAGE lattice and a
 * radial glow are both invisible to it: it reports identical figures before
 * and after, which is a no-op guard on exactly the thing the page ground
 * changes.
 *
 * Method, with its limits stated rather than hidden:
 *
 *  - foreground is the computed `color`. It did not change, and sampling it
 *    from pixels would sample antialiased glyph edges instead of the ink.
 *  - ground is sampled from a 6px RING around each text box, never from
 *    inside it. Inside is glyphs, and "exclude the glyph pixels" has no
 *    honest definition. A grid line or the glow passes through the ring.
 *  - WORST CASE, not average: the ring pixel that minimises contrast. An
 *    average hides both a hairline and the bright end of a gradient.
 *  - ring pixels more than 40 units from the ring's median are discarded as
 *    foreign objects — a card border, a neighbouring glyph — rather than
 *    ground. Without that the worst pixel is whatever happens to be next
 *    door, which is the failure this project keeps repeating.
 *
 * Run with the ground OFF and ON in the SAME build, so the before/after is
 * one change rather than two. Comparing the old guard's numbers with this
 * one's would report the instrument change as if it were the ground change.
 *
 * Usage: node build/verify-ground-contrast.js <profile> <out> [url]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { decodePNG } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
/* --glow=30% / --grid=50% sweep the ground before the "on" measurement, so the
   guard can be proved by making the treatment too strong and watching a real
   figure cross its threshold. */
const argOf = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const GLOW = argOf("glow"), GRID = argOf("grid"), GLOWAT = argOf("glowat");
/* --ground=stretch|repeat|anchor measures a contour candidate instead of the
   shipped lattice. Everything else about the run is identical, so the two
   numbers are comparable; the ramp's dark end is 56 units below paper against
   the lattice's 9, which is why this needed to become a parameter rather than
   a second harness. */
const GROUND = argOf("ground");
const TOPOTOP = argOf("topotop"), TOPOW = argOf("topow");
/* --topo=<colour> overrides --neutral-warm on the ground layer only, which
   is the dark end of the contour ramp. The same lever as --glow and --grid:
   make the treatment too strong and watch a real figure cross 4.5, rather
   than watching the suite stay green. */
const TOPO = argOf("topo");
/* --hidetopo renders the contour layer invisible while leaving the mode, the
   band count and the resolved fills exactly as they are. That is precisely
   the state the "actually painted" check exists to catch, and the only way to
   reach it without a rebuild. */
const HIDETOPO = process.argv.includes("--hidetopo");
/* --freezeband puts a literal on the darkest band, which is what converting
   the inline SVG to a background-image data URI would do to all twelve: the
   page looks identical and the ramp stops tracking the token. The other half
   of that failure — the SVG disappearing entirely — is covered by the band
   count, since a data URI has no <use> elements to find. */
const FREEZEBAND = process.argv.includes("--freezeband");
/* Parameterised because the anchored composition scales with the viewport:
   at 800 it is 1200px wide rather than 2160, so it sits higher and the copy
   meets a different part of it. A guard fixed at one width would not see
   that. */
const VW = +(argOf("w") || 1440), VH = +(argOf("h") || 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const x = L(a[0], a[1], a[2]), y = L(b[0], b[1], b[2]);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/*
 * One CSS colour, two spellings. Chrome serialises a resolved color-mix as
 * `color(srgb 0.77 0.74 0.67)` and a hex token as `rgb(197, 191, 171)`; a
 * string compare called those a mismatch on a correct build. Parse both to
 * 0-255 and compare the numbers — which is the same lesson as spec 4a.9,
 * one scale down: compare the thing, not a representation of it.
 */
const rgbOfStr = (s) => {
  if (!s) return null;
  let m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) return m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map((v) => Math.round(+v));
  m = /color\(srgb ([^)]+)\)/.exec(s);
  if (m) return m[1].trim().split(/[\s/]+/).filter(Boolean).slice(0, 3).map((v) => Math.round(+v * 255));
  return null;
};

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!ok) fails.push(name);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=" + (argOf("port") || "9723"), "--user-data-dir=" + P, "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + (argOf("port") || "9723") + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  const q = [
    GROUND ? "ground=" + GROUND : null,
    TOPOTOP ? "topoTop=" + encodeURIComponent(TOPOTOP) : null,
    TOPOW ? "topoW=" + encodeURIComponent(TOPOW) : null,
  ].filter(Boolean).join("&");
  await send("Page.navigate", { url: URL + (q ? (URL.includes("?") ? "&" : "?") + q : "") });
  await sleep(9000);
  if (GROUND) {
    const applied = await ev(`document.querySelector('.page-ground').getAttribute('data-ground')`);
    if (applied !== GROUND) { console.error(`  ABORT — asked for ground "${GROUND}", page says "${applied}"`); process.exit(2); }
  }
  /*
   * ABORT if a knob did not land, rather than reporting the default.
   *
   * --topo-top was declared on the SVG and set on its parent, so `?topoTop=`
   * did nothing and the run came back byte-identical to the unmoved anchor —
   * which reads as "moving it changes nothing", the exact opposite of what
   * was happening. A parameter that can be ignored has to be read back.
   */
  for (const [name, want] of [["--topo-top", TOPOTOP], ["--topo-w", TOPOW]]) {
    if (!want) continue;
    const got = (await ev(`getComputedStyle(document.querySelector('.page-ground .topo-anchor')).getPropertyValue('${name}').trim()`));
    if (got !== want) { console.error(`  ABORT — ${name}: asked for "${want}", the element resolves "${got}"`); process.exit(2); }
  }
  /* The tour must be LIVE, or its "sections" are a placeholder image and the
     copy is chapter 1's at every stop. */
  for (let i = 0; i < 60; i++) { if (await ev("!!window.__phoneTour")) break; await sleep(500); }

  if (FREEZEBAND) await ev(`(() => { const u = document.querySelectorAll('#topo-stack use'); u[u.length - 1].style.fill = '#c0c0c0'; return 1; })()`);

  /*
   * WHAT GROUND IS ACTUALLY ON, and does its ramp resolve to the tokens?
   *
   * Read off the running build, not off the source. The ramp is written as
   * color-mix against --neutral-warm and --background specifically so it is
   * never twelve literals; the way that promise breaks silently is somebody
   * "optimising" the inline SVG into a background-image data URI, which
   * cannot see custom properties. Then the page looks identical and the ramp
   * is frozen. These two lines are what would notice.
   *
   * The no-op question: a build whose contour SVG paints nothing at all would
   * still report the right mode and the right endpoints. So the band count in
   * rendered pixels is checked too, further down, where the screenshot is.
   */
  const ground = JSON.parse(await ev(`(() => {
    const g = document.querySelector('.page-ground');
    const uses = [...document.querySelectorAll('#topo-stack use')];
    const cs = getComputedStyle(document.documentElement);
    const px = (v) => cs.getPropertyValue(v).trim();
    const asRgb = (hex) => {
      const d = document.createElement('div');
      d.style.color = hex; document.body.appendChild(d);
      const out = getComputedStyle(d).color; d.remove(); return out;
    };
    return JSON.stringify({
      mode: g.getAttribute('data-ground'),
      bands: uses.length,
      lightest: uses.length ? getComputedStyle(uses[0]).fill : null,
      darkest: uses.length ? getComputedStyle(uses[uses.length - 1]).fill : null,
      wantLightest: asRgb(px('--background')),
      wantDarkest: asRgb(px('--neutral-warm')),
      topoTop: uses.length ? getComputedStyle(document.querySelector('.topo-anchor')).getPropertyValue('--topo-top').trim() : null,
    });
  })()`));
  console.log(`\n   GROUND AS SHIPPED — mode "${ground.mode}", ${ground.bands} bands, anchored at ${ground.topoTop}`);
  console.log(`     lightest band ${ground.lightest}  (--background ${ground.wantLightest})`);
  console.log(`     darkest band  ${ground.darkest}  (--neutral-warm ${ground.wantDarkest})`);

  const secs = JSON.parse(await ev(`(() => JSON.stringify(
    [...document.querySelectorAll('main section[aria-labelledby]')]
      .filter((s) => !/hero-headline/.test(s.getAttribute('aria-labelledby')))
      .map((s) => ({ id: s.id || s.getAttribute('aria-labelledby'),
                     top: Math.round(s.getBoundingClientRect().top + scrollY),
                     h: Math.round(s.getBoundingClientRect().height) }))))()`));

  const inkAt = async (secId) => JSON.parse(await ev(`(() => {
    const sec = [...document.querySelectorAll('main section[aria-labelledby]')]
      .find((s) => (s.id || s.getAttribute('aria-labelledby')) === ${JSON.stringify(secId)});
    if (!sec) return '[]';
    const out = [];
    for (const el of sec.querySelectorAll('h1,h2,h3,h4,p,li,span,a,button')) {
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (txt.length < 4) continue;
      /*
       * The GLYPH box, via a Range over the element's own text nodes — not
       * the element's block box. On a filled button the block box's ring is
       * the page behind the button, so the label was compared against paper
       * instead of against the fill it actually sits on and reported 1:1.
       * The glyph box's ring lies inside the padding, on the real ground.
       */
      const rg = document.createRange();
      let r = null;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        rg.selectNodeContents(n);
        const rr = rg.getBoundingClientRect();
        if (!rr.width || !rr.height) continue;
        r = r ? { x: Math.min(r.x, rr.x), y: Math.min(r.y, rr.y),
                  right: Math.max(r.right, rr.right), bottom: Math.max(r.bottom, rr.bottom) } : rr;
      }
      if (!r) continue;
      r = { x: r.x, y: r.y, width: (r.right ?? r.x + r.width) - r.x, height: (r.bottom ?? r.y + r.height) - r.y,
            top: r.y, bottom: r.bottom ?? r.y + r.height };
      if (r.width < 8 || r.height < 8 || r.bottom < 8 || r.top > innerHeight - 8) continue;
      const cs = getComputedStyle(el);
      /*
       * EFFECTIVE opacity, walked up the tree — not the element's own.
       *
       * This read cs.opacity on the <p> itself. The phone tour fades whole
       * chapters by setting opacity on the wrapping div, so every paragraph
       * inside an invisible chapter reported 1 and was measured. At chapter
       * 3's rest point that put chapter 2's hidden copy against the phone's
       * titanium body and reported 1.63:1 — a failure on a correct build,
       * against text nobody can see. Any ancestor-driven fade does this;
       * the tour is just where it showed up.
       *
       * inert and aria-hidden are checked with it, since the tour marks the
       * outgoing chapter with both and neither means "visible".
       * (No backticks in this comment on purpose: it lives inside a template
       * literal, and one has broken a harness in this project before.)
       */
      let eff = 1, node = el;
      while (node && node !== sec.parentElement) {
        eff *= parseFloat(getComputedStyle(node).opacity);
        if (node.hasAttribute && (node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true')) { eff = 0; break; }
        node = node.parentElement;
      }
      if (eff < 0.9) continue;
      const px = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      out.push({ sample: txt.slice(0, 26), color: cs.color, size: px,
        min: (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    }
    return JSON.stringify(out);
  })()`));

  /*
   * THE TOUR NEEDS ITS OWN STOPS, one per chapter.
   *
   * Two evenly-spaced samples across an 800vh section land wherever they
   * land — mid-transition, with the copy at zero opacity and therefore
   * skipped. The three REST points are where the copy is legible, and they
   * are also the three places the text alternates between: chapter 1 left,
   * chapter 2 right, chapter 3 left. A background with a direction has to be
   * checked at each of them, because the copy meets a different part of the
   * composition every time.
   */
  const tourStops = JSON.parse(await ev(`(() => {
    const rw = document.querySelector('#parent-app [data-tour-runway]');
    if (!rw) return '[]';
    const top = Math.round(rw.getBoundingClientRect().top + scrollY);
    const span = rw.offsetHeight - innerHeight;
    return JSON.stringify([0, 0.5, 1].map((p, i) => ({ y: top + Math.round(span * p), chapter: i + 1 })));
  })()`));

  const measure = async () => {
    const rows = [];
    for (const sec of secs) {
      const isTour = sec.id === "parent-app";
      const stops = isTour && tourStops.length
        ? [sec.top + 8, ...tourStops.map((s) => s.y)]
        : (sec.h > VH * 1.6 ? [sec.top + 8, sec.top + Math.round(sec.h * 0.5)] : [sec.top + 8]);
      for (const y of stops) {
        await ev(`(async()=>{scrollTo(0,${Math.max(0, y)});await new Promise(r=>setTimeout(r,650));return 1})()`);
        const ink = await inkAt(sec.id);
        if (!ink.length) continue;
        const img = decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
        for (const e of ink) {
          const m = e.color.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (!m) continue;
          const fg = [+m[1], +m[2], +m[3]];
          const R = 6;
          const ring = [];
          for (let yy = e.y - R; yy < e.y + e.h + R; yy++) {
            for (let xx = e.x - R; xx < e.x + e.w + R; xx++) {
              const inside = xx >= e.x && xx < e.x + e.w && yy >= e.y && yy < e.y + e.h;
              if (inside || xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
              const o = (yy * img.w + xx) * img.ch;
              ring.push([img.px[o], img.px[o + 1], img.px[o + 2]]);
            }
          }
          if (ring.length < 40) continue;
          const med = [0, 1, 2].map((k) => {
            const a = ring.map((p) => p[k]).sort((x, y2) => x - y2);
            return a[a.length >> 1];
          });
          const clean = ring.filter((p) => Math.max(...p.map((v, k) => Math.abs(v - med[k]))) <= 40);
          if (clean.length < 20) continue;
          let worst = Infinity, worstPx = med;
          for (const p of clean) { const r2 = ratio(fg, p); if (r2 < worst) { worst = r2; worstPx = p; } }
          const tour = isTour ? tourStops.find((s) => s.y === y) : null;
          rows.push({ sec: sec.id, sample: e.sample, size: Math.round(e.size), min: e.min,
            at: y, chapter: tour ? tour.chapter : null,
            /* Which half of the viewport the copy is in. The tour's text
               alternates, so a background with a direction meets it
               somewhere different at every rest point. */
            side: e.x + e.w / 2 < VW / 2 ? "left" : "right",
            nominal: +ratio(fg, med).toFixed(2), worst: +worst.toFixed(2), ground: "rgb(" + worstPx.join(",") + ")" });
        }
      }
    }
    return rows;
  };

  const setGround = (on) =>
    ev(`document.querySelectorAll('.page-ground,.dark-ground').forEach((e)=>e.style.display='${on ? "" : "none"}');1`);

  console.log(`\n  GROUND CONTRAST — pixels, worst case, ${VW}x${VH}\n`);
  await setGround(false);
  const before = await measure();
  await setGround(true);
  if (GLOW) await ev(`document.querySelectorAll('.dark-ground').forEach((e)=>e.style.setProperty('--glow-strength','${GLOW}'));1`);
  if (GRID) await ev(`document.querySelectorAll('.page-ground').forEach((e)=>e.style.setProperty('--grid-ink','${GRID}'));1`);
  if (HIDETOPO) await ev(`document.querySelectorAll('.topo').forEach((e)=>e.style.display='none');1`);
  if (TOPO) await ev(`document.querySelectorAll('.page-ground').forEach((e)=>e.style.setProperty('--neutral-warm','${TOPO}'));1`);
  if (GLOWAT) await ev(`document.querySelectorAll('.dark-ground').forEach((e)=>e.style.setProperty('--glow-at','${GLOWAT}'));1`);
  if (TOPO) console.log(`   swept: contour dark end forced to ${TOPO}`);
  if (GLOW || GRID) console.log(`   swept: glow ${GLOW || "(default)"}, grid ${GRID || "(default)"}
`);
  const after = await measure();

  const worstBy = (rows) => {
    const m = {};
    for (const r of rows) if (!m[r.sec] || r.worst < m[r.sec].worst) m[r.sec] = r;
    return m;
  };
  const wb = worstBy(before), wa = worstBy(after);
  console.log("   section      ground OFF   ground ON     delta   threshold  worst sample");
  for (const secId of Object.keys(wa)) {
    const b = wb[secId], a = wa[secId];
    const d = b ? (a.worst - b.worst).toFixed(2) : "-";
    console.log(`   ${secId.padEnd(12)} ${String(b ? b.worst : "-").padStart(8)}:1 ${String(a.worst).padStart(9)}:1 ${String(d).padStart(8)}  ${String(a.min).padStart(7)}:1  "${a.sample}" ${a.ground}`);
  }

  /*
   * THE BANDS ARE ON SCREEN. The no-op defence for everything above: a
   * contour layer that renders nothing still reports the right mode and the
   * right resolved endpoints, and every contrast figure comes back looking
   * healthy because there is no contour to lower it.
   *
   * Counted over the Platform viewport, where the composition is anchored.
   * Distinct colours rather than "is it darker": the grid alone produces two
   * or three, and a twelve-step ramp cannot.
   */
  await ev(`(async()=>{scrollTo(0,${secs[0].top + 8});await new Promise(r=>setTimeout(r,700));return 1})()`);
  const bandShot = decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  /*
   * An EMPTY column, not the whole viewport. Over the whole frame the count
   * runs to 1800-odd whatever the ground is doing, because glyph antialiasing
   * and the card borders dominate — a threshold there would pass on a build
   * with no contour at all. The right-hand margin past the content column has
   * nothing on it but ground: the grid alone puts 2-4 colours there, and a
   * twelve-step ramp cannot.
   */
  /*
   * DISTINCT COLOURS ALONE DOES NOT DISCRIMINATE, and the first version of
   * this check proved it: the margin holds 227 distinct colours with the
   * contour on and 28 with it hidden, because grid-line antialiasing makes
   * dozens on its own. A threshold of 8 passed on the hidden build — a no-op
   * passing the check written to catch exactly that no-op.
   *
   * What separates them is DEPTH, not variety. The lattice is ~9 units below
   * paper at its darkest; the ramp's dark end is 56. So: distinct colours at
   * least 20 units below --background. Grid alone produces none.
   */
  const paper = rgbOfStr(ground.wantLightest) || [253, 248, 240];
  /*
   * MEASURE THE LAYER, NOT A CORNER OF THE PAGE THAT LOOKS EMPTY.
   *
   * Two earlier versions of this scan picked a rectangle by eye — the right
   * margin past the content column — and both read something else. At 1440
   * it caught the sticky header's logo (darkest R=35) until y was pushed
   * below it. At 800 the content column fills the width, so the same
   * rectangle sat INSIDE a card and reported 165 units below paper: the
   * check passed, at the wrong width, for the wrong reason.
   *
   * So: hide everything except the ground and scan the whole viewport.
   * `visibility: hidden` keeps the layout identical, so the ground's own
   * geometry is untouched — nothing about what is being measured changes,
   * only what is on top of it. That is exact at any width and needs no
   * assumption about where the page happens to be empty.
   */
  await ev(`(() => { for (const el of document.querySelectorAll('main > *:not(.relative), main .relative > *:not(.page-ground), header')) el.style.visibility = 'hidden'; return 1; })()`);
  await sleep(400);
  const bare = decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  await ev(`(() => { for (const el of document.querySelectorAll('[style*="visibility"]')) el.style.visibility = ''; return 1; })()`);
  let drop = 0;
  let darkest = 255;
  for (let y = 4; y < Math.min(bare.h, VH) - 4; y += 2) {
    for (let x = 4; x < bare.w - 4; x += 2) {
      const o = (y * bare.w + x) * bare.ch;
      const p = [bare.px[o], bare.px[o + 1], bare.px[o + 2]];
      const d = Math.max(paper[0] - p[0], paper[1] - p[1], paper[2] - p[2]);
      if (d > drop) { drop = d; darkest = p[0]; }
    }
  }
  if (ground.mode !== "grid") {
    /*
     * 32, and both populations were measured rather than assumed.
     *
     * A single lattice line is --border at 35%, which is 9 units below paper.
     * But two lines CROSS, and the pair composites to about 21 — measured, by
     * running this same scan with the contour layer hidden. The ramp reaches
     * 50. So 32 sits in the 29-unit gap between what the lattice can produce
     * on its own and what the contour produces, rather than being a number
     * that happened to pass.
     *
     * The first two attempts at this check did NOT discriminate: "distinct
     * colours" gave 227 against 28 (antialiasing makes dozens either way) and
     * a 20-unit threshold let the hidden layer through at 21. Both were
     * no-ops passing the check written to catch that exact no-op.
     */
    check("the contour ramp is actually painted, not just configured",
      ground.bands >= 12 && drop >= 32,
      `${ground.bands} bands declared, the layer alone reaches ${drop} units below paper (darkest R=${darkest}; the lattice on its own reaches 21 at a line crossing)`);
    /*
     * COMPARED AS NUMBERS. Chrome serialises a resolved color-mix as
     * `color(srgb 0.77 0.74 0.67)` and a hex token as `rgb(197, 191, 171)` —
     * the same colour, two spellings, and a string compare called it a
     * failure on a correct build. Which is the §4a.9 mistake in miniature:
     * comparing a representation instead of the thing.
     */
    const rgbOf = rgbOfStr;
    const near = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return x && y && x.every((v, i) => Math.abs(v - y[i]) <= 1); };
    check("the ramp resolves to the tokens, not to frozen literals",
      near(ground.lightest, ground.wantLightest) && near(ground.darkest, ground.wantDarkest),
      `lightest ${rgbOf(ground.lightest)} vs ${rgbOf(ground.wantLightest)}, darkest ${rgbOf(ground.darkest)} vs ${rgbOf(ground.wantDarkest)}`);
  }

  const bad = after.filter((r) => r.worst < r.min);
  check("there is ink to measure", after.length > 40, `${after.length} measured with the ground on`);
  check("every piece of ink clears its threshold against the REAL ground", bad.length === 0,
    bad.length ? `${bad.length} failing: ` + bad.map((b) => `${b.sec}:"${b.sample}" ${b.worst}:1 < ${b.min}`).join("  ") : "");

  const moved = after.filter((r) => {
    const b = before.find((x) => x.sec === r.sec && x.sample === r.sample);
    return b && Math.abs(b.worst - r.worst) > 0.5;
  });
  /*
   * THE TOUR, CHAPTER BY CHAPTER. Item 4 of the brief: the composition has a
   * direction, and the copy lands on a different part of it at every rest
   * point. A single worst-case for the whole section cannot say which
   * chapter is the bad one.
   */
  const byChapter = {};
  for (const r of after) {
    if (!r.chapter) continue;
    const k = r.chapter + "|" + r.side;
    if (!byChapter[k] || r.worst < byChapter[k].worst) byChapter[k] = r;
  }
  const chapterKeys = Object.keys(byChapter).sort();
  if (chapterKeys.length) {
    console.log("\n   THE TOUR, PER CHAPTER — worst ink at each rest point");
    console.log("   chapter  copy side   ground OFF   ground ON     delta   threshold  worst sample");
    for (const k of chapterKeys) {
      const a = byChapter[k];
      const b = before.find((x) => x.chapter === a.chapter && x.sample === a.sample);
      const d = b ? (a.worst - b.worst).toFixed(2) : "-";
      console.log(`   ${String(a.chapter).padEnd(8)} ${a.side.padEnd(11)} ${String(b ? b.worst : "-").padStart(8)}:1 ${String(a.worst).padStart(9)}:1 ${String(d).padStart(8)}  ${String(a.min).padStart(7)}:1  "${a.sample}" ${a.ground}`);
    }
  }

  console.log(`\n   ink whose worst case moved by more than 0.5:1 when the ground went on: ${moved.length} of ${after.length}`);
  for (const m of moved.slice(0, 8)) {
    const b = before.find((x) => x.sec === m.sec && x.sample === m.sample);
    console.log(`     ${m.sec.padEnd(12)} "${m.sample}"  ${b.worst}:1 -> ${m.worst}:1`);
  }

  fs.writeFileSync(path.join(OUT, "contrast.json"), JSON.stringify({ before, after }, null, 1));
  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  all checks pass\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
