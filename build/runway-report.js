/**
 * Is "too fast" the crossing, or the whole section?
 *
 * Four rounds of "too fast" have each been answered by a bigger number on
 * the same knob. That pattern is itself evidence the knob is wrong: the
 * crossing has gone 297 -> 533 -> 743px and the complaint has not moved.
 *
 * TOUR_RUNWAY_VH scales everything in the section proportionally — rotation,
 * descent and crossing together — so if the section as a whole reads rushed,
 * this is the dial, and no value of crossFraction will substitute for it.
 *
 * Also measures what exposure 1.6 does to the whole canvas, not just to the
 * metal edge, since exposure is renderer-wide.
 *
 * Usage: node build/runway-report.js <profile> <out>
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { decodePNG } = require("./scrim-lab");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const VW = 1440, VH = 900;
/* A deliberate reading scroll. Wheel notch is 100px in Chrome on Windows. */
/* A steady wheel scroll: ~4 notches a second at Chrome's 100px notch. This
   is the basis for the seconds column and it is stated, not implied. */
const READING_PX_PER_SEC = 400;
const NOTCH_PX = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=9817", "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9817/json/list")).find((x) => x.type === "page"); } catch {}
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

  const load = async (q) => {
    await send("Page.navigate", { url: "http://localhost:3100/?" + q });
    await sleep(6500);
    const top = await ev(`(() => {
      const rw = document.querySelector('#parent-app [data-tour-runway]');
      if (!rw) throw new Error('no [data-tour-runway]');
      return Math.round(rw.getBoundingClientRect().top + scrollY);
    })()`);
    await ev(`(async()=>{scrollTo(0,${top});await new Promise(r=>setTimeout(r,800));return 1})()`);
    for (let i = 0; i < 60; i++) { if (await ev("!!window.__phoneTour")) break; await sleep(500); }
    await sleep(600);
    return top;
  };

  console.log(`\n  SECTION PACE — crossFraction held at 0.85, ${VW}x${VH}\n`);
  console.log("   runway   section     crossing    notches   SECONDS   descent   dwell after 1 notch");
  for (const vh of [400, 600, 800, 1000]) {
    const top = await load(`runway=${vh}`);
    const r = JSON.parse(await ev(`(async () => {
      const rw = document.querySelector('#parent-app [data-tour-runway]');
      const span = rw.offsetHeight - innerHeight;
      const out = [];
      for (let i = 0; i <= 200; i++) {
        const p = (i / 200) * 0.5;
        scrollTo(0, ${top} + Math.round(span * p));
        await new Promise(r2 => requestAnimationFrame(r2));
        await new Promise(r2 => requestAnimationFrame(r2));
        out.push({ local: i / 200, x: +window.__phoneTour.debug().phoneCentreXPx.toFixed(1) });
      }
      return JSON.stringify({ span, height: rw.offsetHeight, out });
    })()`));
    const moving = r.out.filter((s, i) => i > 0 && Math.abs(s.x - r.out[i - 1].x) > 0.5);
    const crossSpan = moving.length ? moving[moving.length - 1].local - moving[0].local : 0;
    const crossPx = Math.round(crossSpan * r.span * 0.5);

    /* Descent across the whole section. */
    const ys = [];
    for (const p of [0, 1]) {
      await ev(`(async()=>{scrollTo(0,${top}+Math.round(${r.span}*${p}));await new Promise(r2=>setTimeout(r2,700));return 1})()`);
      ys.push(await ev("window.__phoneTour.debug().phoneCentreYPx"));
    }

    /* Dwell: one trusted wheel notch from chapter 2's rest point. */
    await ev(`(async()=>{scrollTo(0,${top}+Math.round(${r.span}*0.5));await new Promise(r2=>setTimeout(r2,900));return 1})()`);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: VW / 2, y: VH / 2, deltaX: 0, deltaY: NOTCH_PX, pointerType: "mouse" });
    await sleep(500);
    const after = await ev(`(() => {
      const el = document.querySelector('#parent-app [data-chapter][data-active="true"]');
      return +(parseFloat(getComputedStyle(el).opacity) || 0).toFixed(2);
    })()`);

    console.log(
      `   ${String(vh).padStart(4)}vh   ${(r.height / VH).toFixed(1).padStart(4)} scr` +
      `   ${String(crossPx).padStart(7)}px` +
      `   ${(crossPx / NOTCH_PX).toFixed(1).padStart(7)}` +
      `   ${(crossPx / READING_PX_PER_SEC).toFixed(2).padStart(7)}s` +
      `   ${String(Math.round(ys[1] - ys[0])).padStart(6)}px` +
      `   ${String(after).padStart(14)}`,
    );
    await ev(`(async()=>{scrollTo(0,${top}+Math.round(${r.span}*0.25));await new Promise(r2=>setTimeout(r2,800));return 1})()`);
    fs.writeFileSync(path.join(OUT, `runway-${vh}-mid.png`),
      Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  }

  /* ---- exposure, across the WHOLE canvas ------------------------------- */
  console.log(`\n  EXPOSURE — the whole canvas, not just the metal edge\n`);
  const GROUND = [253, 248, 240];
  const canvasStats = async (q, tag, atP = 0) => {
    const top = await load(q);
    /*
     * AT REST the phone is mostly SCREEN, and the screen is toneMapped:false
     * and immune — so a whole-silhouette average there is dominated by the one
     * surface exposure cannot touch and moves by [1,1,1] however far exposure
     * is pushed. Edge-on (p=0.125) the metal and back fill the frame, which is
     * where the body's brightness is actually the thing being looked at.
     */
    await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');
      scrollTo(0,${top}+Math.round((rw.offsetHeight-innerHeight)*${atP}));
      await new Promise(r=>setTimeout(r,900));return 1})()`);
    const d = JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
    const c = JSON.parse(await ev(`(() => { const b = document.querySelector('#parent-app canvas').getBoundingClientRect();
      return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }); })()`));
    const png = Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64");
    fs.writeFileSync(path.join(OUT, `${tag}.png`), png);
    const img = decodePNG(png);
    const isG = (o) => Math.abs(img.px[o] - GROUND[0]) <= 6 && Math.abs(img.px[o + 1] - GROUND[1]) <= 6 && Math.abs(img.px[o + 2] - GROUND[2]) <= 6;
    /*
     * INSIDE THE SILHOUETTE, scanned per row.
     *
     * "Non-ground pixels inside the canvas" was wrong: the canvas is
     * alpha:true, so the page's GRID LINES show through it. That sample was
     * 10,590 pixels of DOM grid — which exposure cannot touch — and it
     * reported a delta of exactly zero, nearly producing the conclusion that
     * exposure does nothing to the body when the metal edge moves 109 -> 133.
     */
    let br = 0, bg = 0, bb = 0, bn = 0;
    const pr = d.phoneRect, sr = d.screenRect;
    for (let y = c.y + pr.y; y < c.y + pr.y + pr.h; y += 2) {
      if (y < 0 || y >= img.h) continue;
      let left = -1, right = -1;
      for (let x = Math.max(0, c.x + pr.x); x < Math.min(img.w, c.x + pr.x + pr.w); x++) {
        if (!isG((y * img.w + x) * img.ch)) { if (left < 0) left = x; right = x; }
      }
      if (left < 0 || right - left < 20) continue;
      /* Inset, so the antialiased rim against the page is not counted. */
      for (let x = left + 3; x <= right - 3; x += 2) {
        const o = (y * img.w + x) * img.ch;
        br += img.px[o]; bg += img.px[o + 1]; bb += img.px[o + 2]; bn++;
      }
    }
    /* The screen centre, which must not move. */
    let s1 = 0, s2 = 0, s3 = 0, sn = 0;
    for (let y = c.y + sr.y + Math.round(sr.h * 0.35); y < c.y + sr.y + Math.round(sr.h * 0.55); y += 2)
      for (let x = c.x + sr.x + Math.round(sr.w * 0.3); x < c.x + sr.x + Math.round(sr.w * 0.7); x += 2) {
        const o = (y * img.w + x) * img.ch; s1 += img.px[o]; s2 += img.px[o + 1]; s3 += img.px[o + 2]; sn++;
      }
    /* Page pixels OUTSIDE the canvas — exposure must not reach these at all. */
    let p1 = 0, p2 = 0, p3 = 0, pn = 0;
    for (let y = 40; y < 200; y += 2) for (let x = 40; x < 400; x += 2) {
      const o = (y * img.w + x) * img.ch; p1 += img.px[o]; p2 += img.px[o + 1]; p3 += img.px[o + 2]; pn++;
    }
    return {
      body: bn ? [br / bn, bg / bn, bb / bn].map(Math.round) : null, bodyPx: bn,
      screen: [s1 / sn, s2 / sn, s3 / sn].map(Math.round),
      page: [p1 / pn, p2 / pn, p3 / pn].map(Math.round),
    };
  };
  for (const [label, atP] of [["at rest", 0], ["edge-on", 0.125]]) {
    const a = await canvasStats("exposure=1", `exposure-1.0-${atP}`, atP);
    const b = await canvasStats("exposure=1.6", `exposure-1.6-${atP}`, atP);
    const c2 = await canvasStats("exposure=2.4", `exposure-2.4-${atP}`, atP);
    console.log(`   ${label}`);
    console.log(`     exposure 1.0   phone rgb(${a.body.join(", ")}) over ${a.bodyPx}px   screen rgb(${a.screen.join(", ")})`);
    console.log(`     exposure 1.6   phone rgb(${b.body.join(", ")})                    screen rgb(${b.screen.join(", ")})`);
    console.log(`     exposure 2.4   phone rgb(${c2.body.join(", ")})                    screen rgb(${c2.screen.join(", ")})`);
    console.log(`     page outside the canvas at 1.6: rgb(${b.page.join(", ")})`);
  }
  const at1 = { body: [0, 0, 0], screen: [0, 0, 0], page: [0, 0, 0] };
  const at16 = at1;
  const dd = (a, b) => a.map((v, i) => v - b[i]);
  console.log(`\n   body delta    [${dd(at16.body, at1.body).join(", ")}]`);
  console.log(`   screen delta  [${dd(at16.screen, at1.screen).join(", ")}]   (must be zero — toneMapped:false)`);
  console.log(`   page delta    [${dd(at16.page, at1.page).join(", ")}]   (must be zero — the renderer draws only the phone)`);
  console.log("");
  ws.close(); ch.kill();
  process.exit(0);
})();
