/**
 * The Scroll Stack's contract (§2).
 *
 * ── The scrim is measured EXACTLY, not approximated ───────────────────────
 *
 * Cream text on a photograph is the one place on this site where the ground
 * under a glyph is genuinely unknown until it is rendered. Sampling a ring
 * around each text box — the method used everywhere else — would work, but
 * there is a better one available here: hide the copy with `visibility:
 * hidden`, which leaves the layout untouched, photograph the scrim, and then
 * sample the precise rectangle each text element occupied. That is the actual
 * background under the actual glyphs, with no ring and no estimate.
 *
 * WORST CASE, per card, over every pixel behind the text.
 *
 * Also checked: that the pin exists at 1440 and does NOT at 390 or under
 * reduced motion, and that all three cards' copy is real DOM in the server's
 * HTML at every size.
 *
 * Usage: node build/verify-stack.js <profile> [--port=] [--w=1440]
 */
const { spawn } = require("child_process");
const http = require("http");
const { decodePNG } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const BASE = arg("url", "http://localhost:3100/");
const PORT0 = +arg("port", 9660);
const VW = +arg("w", 1440), VH = +arg("h", 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getRaw = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log("   " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "   " + detail : ""));
  if (!ok) fails.push(name);
};

const lum = (c) => {
  const f = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

let seq = 0;
async function session({ reduced, w = VW, h = VH } = {}) {
  const port = PORT0 + seq++;
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + port, "--user-data-dir=" + P + "-" + port,
    "--window-size=" + w + "," + h, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = JSON.parse(await getRaw("http://127.0.0.1:" + port + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("verify-stack: no debugger target on " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async () => decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: BASE });
  let lifted = false;
  for (let i = 0; i < 200; i++) {
    lifted = (await ev("document.querySelector('[data-load-screen]') === null")) === true;
    if (lifted) break;
    await sleep(400);
  }
  if (!lifted) throw new Error("verify-stack: the load screen never lifted");
  /* And wait for the effect that pins it. Reading dataset.pinned the instant
     the loader goes reported "not pinned" once on a build that pins fine. */
  for (let i = 0; i < 40; i++) {
    if (await ev("document.querySelector('.stack') === null || document.querySelector('.stack').dataset.pinned !== undefined")) break;
    await sleep(250);
  }
  /*
   * AND WAIT FOR THE PHOTOGRAPHS.
   *
   * Two of the three are lazy. Measuring the scrim before they paint samples
   * the card's own --surface-dark background and reports 19.51:1 — a pass, on
   * a card whose image has not arrived. That is the guard measuring the thing
   * next to the subject, and it passed twice before it was caught.
   */
  for (let i = 0; i < 60; i++) {
    const done = await ev("[...document.querySelectorAll('.stack-img')].every(im => im.complete && im.naturalWidth > 0)");
    if (done === true) break;
    /* Lazy images only load once they are near the viewport. */
    await ev("document.querySelector('.stack')?.scrollIntoView({ block: 'center' }); 1");
    await sleep(300);
  }
  await sleep(1200);
  return { ev, shot, close: () => { ws.close(); ch.kill(); } };
}

(async () => {
  console.log("\n  THE SCROLL STACK — " + BASE + "\n");

  const html = await getRaw(BASE);
  console.log("   THE COPY IS REAL DOM");
  const lines = ["Every frame, scored", "A fault, before it is one", "Every number, traceable",
    "On-device computer vision samples", "flags a service window", "resolves to the events behind it"];
  const missing = lines.filter((l) => !html.includes(l));
  check("all three cards' headings and bodies are server-rendered", missing.length === 0,
    missing.length ? "missing: " + missing.join(" | ") : "6 of 6 strings in the initial HTML");
  check("the two cut cards are gone from the site entirely",
    !html.includes("Multi-language Support") && !html.includes("Dark &amp; Light Mode") && !html.includes("Dark & Light Mode"),
    "Multi-language Support / Dark & Light Mode");

  /* ---- the pin, and the scrim ------------------------------------------ */
  console.log("\n   THE PIN");
  const s = await session();
  /*
   * SCROLL TO IT FIRST, then ask.
   *
   * This checked data-pinned straight after the loader lifted and reported
   * "not pinned" with a 2134px runway, on a build the live browser pins
   * perfectly at 2700px. The effect had simply not run yet at that point in
   * the page's life. Putting the section on screen before asking about it is
   * both what a visitor does and what makes the answer meaningful.
   */
  await s.ev("document.querySelector('.stack')?.scrollIntoView({ block: 'start' }); 1");
  await sleep(1500);
  check("the stack is pinned at " + VW, (await s.ev("document.querySelector('.stack')?.dataset.pinned !== undefined")) === true);
  const runway = await s.ev("document.querySelector('.stack')?.offsetHeight");
  check("its runway is one viewport per card", runway >= VH * 2.5,
    runway + "px of runway for " + VH + "px of viewport");

  console.log("\n   THE SCRIM, worst pixel behind every glyph");
  const geo = JSON.parse(await s.ev(`(() => {
    const h = document.querySelector('.stack');
    return JSON.stringify({ top: Math.round(h.getBoundingClientRect().top + scrollY), h: h.offsetHeight });
  })()`));
  const seg = (geo.h - VH) / 3;
  let scrimOk = true;

  for (let i = 0; i < 3; i++) {
    /*
     * PARK EACH CARD WHERE IT HAS ACTUALLY LANDED.
     *
     * A card finishes rising at p = (i+1)/3 and only starts being covered
     * after that, so this is the one moment it is both complete and
     * unobscured. Parking at 0.82 of its own segment — which is what this did
     * first — leaves it still 18% below its resting place, with the copy
     * block hanging below the card over the page behind it. That measured
     * card 2's body at 1.03:1 against near-white, which was the page showing
     * through and not a scrim failure.
     */
    const y = geo.top + seg * 3 * ((i + 1) / 3);
    await s.ev(`(async()=>{scrollTo(0,${Math.round(y)});await new Promise(r=>setTimeout(r,700));return 1})()`);

    /*
     * DID THE PHOTOGRAPH ACTUALLY LOAD? Asked of the DOM, not inferred from
     * the pixels. An earlier version called any box whose brightest pixel was
     * under 4 "not painted", which condemned card 1 — whose lower third is a
     * dark bus aisle under an 88% scrim, and is legitimately that dark.
     */
    const imgOk = await s.ev(`(() => { const im = document.querySelectorAll('.stack-img')[${i}];
      return !!im && im.complete && im.naturalWidth > 0; })()`);
    if (!imgOk) { check("card " + (i + 1) + "'s photograph loaded", false); continue; }

    /* The exact boxes, and the colours, BEFORE anything is hidden. */
    const boxes = JSON.parse(await s.ev(`JSON.stringify((() => {
      const card = document.querySelectorAll('[data-stack-card]')[${i}];
      const out = [];
      for (const el of card.querySelectorAll('.stack-eyebrow, .stack-heading, .stack-body, .stack-counter')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        out.push({ cls: (el.className.match(/stack-[a-z]+/) || ['?'])[0], x: Math.round(r.left), y: Math.round(r.top),
          w: Math.round(r.width), h: Math.round(r.height),
          color: cs.color, opacity: parseFloat(cs.opacity),
          size: Math.round(parseFloat(cs.fontSize)), weight: cs.fontWeight });
      }
      return out;
    })())`));

    /* Hide the copy only. visibility keeps the layout identical, so the
       rectangles above still describe exactly where the glyphs were. */
    await s.ev(`(() => { const c = document.querySelectorAll('[data-stack-card]')[${i}];
      for (const el of c.querySelectorAll('.stack-copy, .stack-counter')) el.style.visibility = 'hidden';
      return 1; })()`);
    await sleep(350);
    const img = await s.shot();
    await s.ev(`(() => { const c = document.querySelectorAll('[data-stack-card]')[${i}];
      for (const el of c.querySelectorAll('.stack-copy, .stack-counter')) el.style.visibility = '';
      return 1; })()`);

    for (const b of boxes) {
      const m = b.color.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      let fg = [+m[1], +m[2], +m[3]];
      let worst = Infinity, px = null;
      for (let yy = Math.max(0, b.y); yy < Math.min(img.h, b.y + b.h); yy++) {
        for (let xx = Math.max(0, b.x); xx < Math.min(img.w, b.x + b.w); xx++) {
          const o = (yy * img.w + xx) * img.ch;
          const p = [img.px[o], img.px[o + 1], img.px[o + 2]];
          /* The element's own opacity composites its colour toward the
             ground before any of this is read by an eye. */
          const eff = b.opacity < 1
            ? fg.map((v, k) => Math.round(v * b.opacity + p[k] * (1 - b.opacity)))
            : fg;
          const r = ratio(eff, p);
          if (r < worst) { worst = r; px = p; }
        }
      }
      if (px === null) continue;
      const large = b.size >= 24 || (b.size >= 18.66 && +b.weight >= 700);
      /* The counter is decorative and aria-hidden, so it carries no text
         requirement — reported, not enforced. */
      const need = b.cls === "stack-counter" ? 0 : (large ? 3 : 4.5);
      const ok = worst >= need;
      if (!ok) scrimOk = false;
      console.log("     " + (need === 0 ? "--  " : ok ? "ok  " : "LOW ")
        + ("card " + (i + 1) + " " + b.cls.replace("stack-", "")).padEnd(20)
        + worst.toFixed(2).padStart(6) + ":1  " + String(b.size).padStart(2) + "px"
        + (need ? "  (needs " + need + ")" : "  (decorative)")
        + "  brightest ground rgb(" + px.join(",") + ")");
    }
  }
  check("every piece of copy clears AA against the brightest pixel behind it", scrimOk);
  s.close();

  /* ---- mobile and reduced motion --------------------------------------- */
  console.log("\n   NOT PINNED WHERE IT SHOULD NOT BE");
  const m = await session({ w: 390, h: 844 });
  check("no pin at 390", (await m.ev("document.querySelector('.stack')?.dataset.pinned === undefined")) === true);
  check("and the cards are a plain vertical list",
    (await m.ev("getComputedStyle(document.querySelector('.stack-viewport')).flexDirection")) === "column");
  check("no card carries a transform at 390",
    (await m.ev("[...document.querySelectorAll('[data-stack-card]')].every(e => !e.style.transform)")) === true);
  m.close();

  const r = await session({ reduced: true });
  check("no pin under reduced motion", (await r.ev("document.querySelector('.stack')?.dataset.pinned === undefined")) === true);
  check("no card carries a transform under reduced motion",
    (await r.ev("[...document.querySelectorAll('[data-stack-card]')].every(e => !e.style.transform)")) === true);
  r.close();

  console.log("\n  " + (fails.length ? "FAILED: " + fails.join(" | ") : "all checks pass") + "\n");
  process.exit(fails.length ? 1 : 0);
})();
