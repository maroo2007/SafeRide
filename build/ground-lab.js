/**
 * GRID vs CONTOURS, on the real page, at the same places.
 *
 * The question the brief asks is not answerable from the SVG on its own: a
 * fixed 1920x1080 composition on a 1440 x 10954 ground behaves completely
 * differently depending on how it is placed, and the only honest way to
 * compare is to put the same sections next to each other under each option.
 *
 * Two outputs per option:
 *
 *   pair-<place>.png    grid on the left, the contour option on the right,
 *                       same scroll position, same build, one navigation
 *                       apart. Side by side because a difference this quiet
 *                       does not survive being remembered between two files.
 *   strip-<mode>.png    twelve viewport shots down the WHOLE page, stacked.
 *                       This is the one that answers "is it a tile": a
 *                       recurrence is invisible in any single frame and
 *                       obvious in the column.
 *
 * The composites are made by screenshotting an HTML page that lays the PNGs
 * out, rather than by compositing pixels here — there is no image library in
 * this project, and a browser is already running.
 *
 * Usage: node build/ground-lab.js <profile> <out> [--modes=a,b] [--url=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const BASE = arg("url", "http://localhost:3100/");
const MODES = arg("modes", "grid,stretch,repeat,anchor").split(",");
const EXTRA = arg("extra", "");
const VW = +arg("w", 1440), VH = +arg("h", 900), PORT = +arg("port", 9951);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + PORT + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const shot = async (file) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, "base64"));
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

  /*
   * SCROLL, THEN CHECK IT LANDED.
   *
   * A flat sleep after scrollTo produced four "identical" captures that were
   * not: on the first (cold) navigation the page was still busy and two tour
   * positions came back showing the same frame, so the grid column of the
   * comparison was a different scroll position from the other three. A
   * side-by-side whose sides are not the same place is worse than no
   * comparison at all, because it looks like evidence.
   */
  const goto = async (y, what) => {
    for (let i = 0; i < 8; i++) {
      await ev(`(async()=>{scrollTo(0,${y});await new Promise(r=>setTimeout(r,${450 + i * 250}));return 1})()`);
      const at = await ev("Math.round(scrollY)");
      if (Math.abs(at - y) <= 2) return at;
    }
    throw new Error(`ground-lab: ${what} would not settle at y=${y} (last ${await ev("Math.round(scrollY)")})`);
  };

  const load = async (mode) => {
    const q = "ground=" + mode + (EXTRA ? "&" + EXTRA : "");
    await send("Page.navigate", { url: BASE + "?" + q });
    await sleep(9000);
    /* Confirm the mode LANDED. The switch is a DOM write in an effect, so a
       hydration failure would leave every capture on the default and the
       comparison would be four copies of the same picture. */
    const applied = await ev(`document.querySelector('.page-ground').getAttribute('data-ground')`);
    if (applied !== mode) throw new Error(`ground-lab: asked for "${mode}", page says "${applied}"`);
    return applied;
  };

  /* Where to look. Derived from the live page, not typed: the tour's runway
     moves whenever TOUR_RUNWAY_VH does. A page has to be open first — this
     ran against about:blank and died on a null #features. */
  await load(MODES[0]);
  const places = JSON.parse(await ev(`(() => {
    const y = (sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return Math.round(r.top + scrollY); };
    const rw = document.querySelector('#parent-app [data-tour-runway]');
    const out = [];
    out.push({ label: 'features', y: y('#features') });
    if (rw) {
      const top = Math.round(rw.getBoundingClientRect().top + scrollY);
      const span = rw.offsetHeight - innerHeight;
      out.push({ label: 'tour-ch1', y: top });
      out.push({ label: 'tour-mid1', y: top + Math.round(span * 0.25) });
      out.push({ label: 'tour-ch2', y: top + Math.round(span * 0.5) });
      out.push({ label: 'tour-mid2', y: top + Math.round(span * 0.75) });
      out.push({ label: 'tour-ch3', y: top + span });
    }
    out.push({ label: 'journey', y: y('#journey') });
    out.push({ label: 'ai', y: y('#ai') });
    return JSON.stringify(out);
  })()`));
  const docH = await ev("document.documentElement.scrollHeight");

  console.log("\n  GROUND LAB — " + VW + "x" + VH + "   " + BASE + (EXTRA ? "  (" + EXTRA + ")" : ""));
  console.log("  page height " + docH + "px; places: " + places.map((p) => p.label + "@" + p.y).join(", ") + "\n");

  const STRIP_N = 12;
  const states = [];
  const ONLY = process.argv.includes("--composites-only");
  for (const mode of ONLY ? [] : MODES) {
    await load(mode);
    /*
     * THE TOUR HAS TO BE LIVE BEFORE ANY OF THIS MEANS ANYTHING.
     *
     * The first comparison had the grid column showing the 40%-opacity
     * PLACEHOLDER and chapter 1's copy while the other three showed the real
     * scene at chapter 2 — same verified scrollY, different picture, because
     * the scene had not finished loading in that run. Four grounds compared
     * against two different page states is not a comparison of grounds.
     */
    for (let i = 0; i < 60; i++) {
      if (await ev("!!window.__phoneTour")) break;
      await sleep(500);
    }
    if (!(await ev("!!window.__phoneTour"))) throw new Error(`ground-lab: ${mode}: the tour scene never came up`);
    for (const p of places) {
      await goto(p.y, `${mode}/${p.label}`);
      const st = JSON.parse(await ev(`JSON.stringify({
        y: Math.round(scrollY),
        ready: !document.querySelector('#parent-app [data-tour-runway] img'),
        ch: (document.querySelector('#parent-app [data-chapter][data-active="true"]') || {}).dataset
            ? document.querySelector('#parent-app [data-chapter][data-active="true"]').dataset.chapter : null
      })`));
      if (p.label.startsWith("tour") && !st.ready) throw new Error(`ground-lab: ${mode}/${p.label}: still showing the placeholder`);
      states.push(`${mode}/${p.label}: y=${st.y} chapter=${st.ch}`);
      await shot(`${mode}-${p.label}.png`);
    }
    /* The whole page, sampled evenly. Not one tall screenshot: a clip that
       size has misreported this page before, and stacking real viewport
       frames cannot. */
    for (let i = 0; i < STRIP_N; i++) {
      const y = Math.round((docH - VH) * (i / (STRIP_N - 1)));
      await goto(y, `${mode}/strip${i}`);
      await shot(`strip-${mode}-${String(i).padStart(2, "0")}.png`);
    }
    console.log("   captured " + mode + "   " + states.filter((x) => x.startsWith(mode + "/tour")).map((x) => x.split(": ")[1]).join("  |  "));
  }

  /* ---- composites ------------------------------------------------------ */
  const css = `body{margin:0;background:#111;font:12px/1.4 ui-monospace,monospace;color:#ddd}
    .row{display:flex;gap:2px}.cell{flex:1}.cap{padding:4px 6px;background:#000}
    img{display:block;width:100%;height:auto}
    .col{display:flex;flex-direction:column;gap:1px}`;

  const write = (name, html, w, h) => {
    fs.writeFileSync(path.join(OUT, name + ".html"), `<style>${css}</style>${html}`);
    return { name, w, h };
  };

  /*
   * TWO ACROSS, NOT FOUR. The first version put all four options in one row
   * at 1440 total and each frame came out 360px wide — a comparison nobody
   * can read is not a comparison. Two per row at 720 keeps the type legible
   * at the size it will actually be judged.
   */
  const jobs = [];
  const cell = 720;
  const cap = 22;
  const contourModes = MODES.filter((m) => m !== "grid");
  if (MODES.includes("grid")) {
    for (const p of places) {
      const order = ["grid", ...contourModes];
      const rows = [];
      for (let i = 0; i < order.length; i += 2) {
        rows.push('<div class="row">' + order.slice(i, i + 2).map((m) =>
          `<div class="cell"><div class="cap">${m} &mdash; ${p.label}</div><img src="${m}-${p.label}.png"></div>`).join("") + "</div>");
      }
      jobs.push(write(`compare-${p.label}`, rows.join(""),
        cell * 2 + 2, Math.ceil(order.length / 2) * (Math.round(cell * VH / VW) + cap) + 4));
    }
  }
  for (const mode of MODES) {
    const imgs = Array.from({ length: STRIP_N }, (_, i) =>
      `<img src="strip-${mode}-${String(i).padStart(2, "0")}.png">`).join("");
    jobs.push(write(`strip-${mode}`, `<div class="cap">${mode} — the whole page, ${STRIP_N} frames top to bottom</div><div class="col">${imgs}</div>`,
      420, Math.round(420 * VH / VW * STRIP_N) + 24));
  }

  for (const j of jobs) {
    await send("Emulation.setDeviceMetricsOverride", { width: j.w, height: j.h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: "file:///" + path.join(OUT, j.name + ".html").replace(/\\/g, "/") });
    await sleep(1200);
    await shot(j.name + ".png");
    fs.unlinkSync(path.join(OUT, j.name + ".html"));
  }
  console.log("   composites: " + jobs.map((j) => j.name).join(", "));
  console.log("\n  " + OUT + "\n");
  ws.close(); ch.kill();
  process.exit(0);
})();
