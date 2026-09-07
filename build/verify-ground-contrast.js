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
const VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const x = L(a[0], a[1], a[2]), y = L(b[0], b[1], b[2]);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!ok) fails.push(name);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=9723", "--user-data-dir=" + P, "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9723/json/list")).find((x) => x.type === "page"); } catch {}
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
  await send("Page.navigate", { url: URL });
  await sleep(9000);

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
      if (parseFloat(cs.opacity) < 0.9) continue;
      const px = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      out.push({ sample: txt.slice(0, 26), color: cs.color, size: px,
        min: (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    }
    return JSON.stringify(out);
  })()`));

  const measure = async () => {
    const rows = [];
    for (const sec of secs) {
      const stops = [sec.top + 8];
      if (sec.h > VH * 1.6) stops.push(sec.top + Math.round(sec.h * 0.5));
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
          rows.push({ sec: sec.id, sample: e.sample, size: Math.round(e.size), min: e.min,
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
  if (GLOWAT) await ev(`document.querySelectorAll('.dark-ground').forEach((e)=>e.style.setProperty('--glow-at','${GLOWAT}'));1`);
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

  const bad = after.filter((r) => r.worst < r.min);
  check("there is ink to measure", after.length > 40, `${after.length} measured with the ground on`);
  check("every piece of ink clears its threshold against the REAL ground", bad.length === 0,
    bad.length ? bad.slice(0, 4).map((b) => `${b.sec}:"${b.sample}" ${b.worst}:1 < ${b.min}`).join("  ") : "");

  const moved = after.filter((r) => {
    const b = before.find((x) => x.sec === r.sec && x.sample === r.sample);
    return b && Math.abs(b.worst - r.worst) > 0.5;
  });
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
