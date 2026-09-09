/**
 * LOOK AT THE REVEAL. Frame by frame, with the gaps written on the frames.
 *
 * Every number in this round has been a summary, and summaries are what let
 * this run twice already: a median of 18ms and a worst of 510ms average out
 * to a frame rate that reads as merely mediocre, when what is actually
 * happening is a smooth animation with a freeze in the middle of it. The
 * two look nothing alike and score almost the same.
 *
 * So this writes the frames out as a contact sheet, in order, each labelled
 * with when it arrived and how long the screen had been showing the previous
 * one. A screencast frame is emitted when the page PRESENTS something, so:
 *
 *   - a large delta is a visible hitch, and it is written on the frame that
 *     ended it, so its position in the reveal is readable at a glance;
 *   - two frames with identical bytes mean the compositor presented the same
 *     picture twice, which is a stall the interval alone would not show.
 *
 * JPEG at reduced width, deliberately. PNG full-size throttles the screencast
 * to about one frame per 70ms on this machine, which is coarser than the
 * thing being measured; the point here is temporal resolution, not fidelity.
 *
 * Usage: node build/watch-reveal.js <profile> <out> [--revealMode=] [--reveal=] [--hold=] [--port=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const MODE = arg("revealMode", "");
const REVEAL = arg("reveal", "");
const HOLD = arg("hold", "");
const PORT = +arg("port", 9871);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const qs = [
  MODE ? "revealMode=" + MODE : null,
  REVEAL ? "reveal=" + REVEAL : null,
  HOLD !== "" ? "hold=" + HOLD : null,
].filter(Boolean).join("&");
/*
 * --url points this at a control page instead of the site. The control is a
 * single div doing one 900ms transform on an otherwise empty document: it
 * establishes what THIS harness, on THIS machine, reports for an animation
 * that costs nothing. Without that number a measured 36fps cannot be told
 * apart from a harness whose ceiling is 36fps.
 *
 * A control page logs its own phases, so the probe is not injected over it.
 */
const CONTROL = arg("url", "");
const URL = CONTROL || ("http://localhost:3100/" + (qs ? "?" + qs : ""));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/* No backticks anywhere inside this string: it is a template literal and one
   would end it. That mistake has cost this project three files. */
const PROBE = `
  window.__phases = []; window.__scale = []; let last = null;
  (function tick() {
    const el = document.querySelector('[data-load-screen]');
    const p = el ? (el.dataset.phase || '?') : 'gone';
    if (p !== last) { window.__phases.push({ p: p, at: +performance.now().toFixed(1) }); last = p; }
    /*
     * HOW BIG THE APERTURE ACTUALLY IS, each frame.
     *
     * The reveal's duration and the duration of its VISIBLE part are not the
     * same number. The hexagon stops covering the viewport once its inscribed
     * radius passes the half-diagonal, and after that the transition is still
     * running, the overlay is still composited, and nothing is on screen.
     * Reading the rendered matrix is the only way to know when that happens,
     * because it depends on the easing curve and not on the duration.
     */
    if (el && (p === 'opening' || p === 'open')) {
      const hive = el.querySelector('.loader-hive');
      const cover = el.querySelector('.loader-cover');
      const m = hive ? new DOMMatrixReadOnly(getComputedStyle(hive).transform) : null;
      const c = cover ? new DOMMatrixReadOnly(getComputedStyle(cover).transform) : null;
      if (m) {
        window.__scale.push({
          at: +performance.now().toFixed(1),
          k: +(m.a * (c ? c.a : 1)).toFixed(3)
        });
      }
    }
    if (performance.now() < 40000) requestAnimationFrame(tick);
  })();
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + PORT + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("watch-reveal: no debugger target");
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 30 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const frames = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Page.screencastFrame") {
      frames.push({ ts: x.params.metadata.timestamp, data: x.params.data });
      ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: x.params.sessionId } }));
    }
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Network.enable"); await send("Network.clearBrowserCache"); await send("Network.disable");
  if (!CONTROL) await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  await send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 640, maxHeight: 400, everyNthFrame: 1 });
  await send("Page.navigate", { url: URL });

  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const ph = JSON.parse(await ev("JSON.stringify(window.__phases || [])"));
    const g = ph.find((x) => x.p === "gone" && x.at > 500);
    if (g && (await ev("performance.now()")) > g.at + 1200) break;
    await sleep(200);
  }
  const phases = JSON.parse(await ev("JSON.stringify(window.__phases || [])"));
  const navStart = await ev("performance.timeOrigin");
  await send("Page.stopScreencast");
  await sleep(300);

  /*
   * The probe starts before React mounts, so its first tick finds no overlay
   * and logs "gone" at ~100ms. Taking the first "gone" therefore ends the
   * reveal window before it begins - it produced a window of 8511ms to 103ms
   * and zero frames. Everything before the first "loading" is pre-history.
   */
  const li = phases.findIndex((x) => x.p === "loading");
  const phz = li >= 0 ? phases.slice(li) : phases;
  const at = (p) => { const e = phz.find((x) => x.p === p); return e ? e.at : null; };
  const opening = at("opening"), open = at("open"), gone = at("gone");
  if (opening === null || gone === null) {
    console.log("\n  ABORT — the loader never reached the reveal; nothing to watch\n");
    ws.close(); ch.kill(); process.exit(1);
  }

  /* Screencast metadata is seconds since the epoch; the phase log is
     performance.now(). timeOrigin is the bridge. */
  const all = frames.map((f) => ({ at: f.ts * 1000 - navStart, data: f.data }));
  const win = all.filter((f) => f.at >= opening - 120 && f.at <= gone + 260);
  if (win.length < 4) {
    console.log("\n  ABORT — only " + win.length + " frames in the reveal window; the screencast did not keep up");
    console.log("  screencast delivered " + all.length + " frames"
      + (all.length ? ", spanning " + Math.round(all[0].at) + "ms to " + Math.round(all[all.length - 1].at) + "ms" : "")
      + "; the reveal was " + Math.round(opening) + "ms to " + Math.round(gone) + "ms\n");
    ws.close(); ch.kill(); process.exit(1);
  }

  const phaseAt = (ms) => { let p = "pre"; for (const x of phz) if (x.at <= ms) p = x.p; return p; };
  const rows = win.map((f, i) => {
    const prev = i ? win[i - 1] : null;
    return {
      i,
      at: f.at,
      d: prev ? f.at - prev.at : 0,
      rel: f.at - opening,
      phase: phaseAt(f.at),
      hash: crypto.createHash("md5").update(f.data).digest("hex").slice(0, 8),
      file: "f" + String(i).padStart(3, "0") + ".jpg",
    };
  });
  rows.forEach((r, i) => fs.writeFileSync(path.join(OUT, r.file), Buffer.from(win[i].data, "base64")));

  const dup = rows.filter((r, i) => i && r.hash === rows[i - 1].hash);
  const deltas = rows.slice(1).map((r) => r.d);
  const worst = rows.slice(1).sort((a, b) => b.d - a.d).slice(0, 5);

  console.log("\n  WATCHING THE REVEAL — " + URL);
  console.log("  phases: " + phz.map((x) => x.p + "@" + Math.round(x.at)).join(" -> "));
  console.log("  plate fade " + Math.round(open - opening) + "ms, scale " + Math.round(gone - open)
    + "ms, whole reveal " + Math.round(gone - opening) + "ms");
  console.log("  frames presented in the window: " + rows.length
    + "   (" + (rows.length / ((gone + 260 - (opening - 120)) / 1000)).toFixed(1) + "/s)");
  /*
   * The aperture's inscribed radius is 12 units times the rendered scale. It
   * covers the viewport once that passes the half-diagonal, and everything
   * after that instant is an overlay nobody can see, still on the compositor,
   * competing with a page that has just started its hero video.
   */
  const scale = JSON.parse(await ev("JSON.stringify(window.__scale || [])"));
  /*
   * 10.8167, not 12. The hexagon's points put a VERTEX at (0,12) but the
   * nearest point on its boundary is the midpoint of a slanted edge at (6,9),
   * hypot(6,9). Dividing by 12 here overstates the aperture by about 10% and
   * declares the screen covered while there is still a dark wedge in each
   * corner — which is exactly what a captured frame showed, 12ms after this
   * line said it was covered. Mirrors HEX_INRADIUS in load-screen.tsx.
   */
  const need = Math.hypot(VW, VH) / 2 / Math.hypot(6, 9);
  const covered = scale.find((s) => s.k >= need);
  if (covered && open !== null) {
    const vis = covered.at - open;
    const total = gone - open;
    console.log("  aperture covers the viewport " + Math.round(vis) + "ms into the "
      + Math.round(total) + "ms scale  (" + Math.round((vis / total) * 100) + "% of it)");
    console.log("  dead time afterwards: " + Math.round(total - vis)
      + "ms of overlay nobody can see, still compositing");
  } else if (open !== null) {
    console.log("  aperture NEVER reached covering scale (needed " + need.toFixed(1)
      + ", peaked at " + (scale.length ? Math.max(...scale.map((s) => s.k)).toFixed(1) : "no samples") + ")");
  }
  console.log("  identical consecutive frames: " + dup.length
    + (dup.length ? "   <- the screen showed the same picture twice" : ""));
  console.log("  slowest frames:");
  for (const w of worst) {
    console.log("    " + String(Math.round(w.d)).padStart(5) + "ms  arriving "
      + String(Math.round(w.rel)).padStart(5) + "ms into the reveal   (" + w.phase + ")");
  }

  /* ---- the contact sheet ------------------------------------------------ */
  const COLS = 8;
  const CW = 220;
  const CH = Math.round(CW * VH / VW) + 26;
  const cells = rows.map((r) => {
    const hot = r.d > 32 ? " hot" : "";
    return '<div class="c' + hot + '"><img src="' + r.file + '">'
      + '<div class="l">' + Math.round(r.rel) + 'ms <b>+' + Math.round(r.d) + '</b> ' + r.phase + '</div></div>';
  }).join("");
  const html = "<style>"
    + "body{margin:0;background:#111;font:11px/1.3 ui-monospace,monospace;color:#ccc}"
    + ".g{display:grid;grid-template-columns:repeat(" + COLS + ",1fr);gap:2px}"
    + ".c{background:#000}.c.hot .l{background:#7a1020;color:#fff}"
    + "img{display:block;width:100%;height:auto}"
    + ".l{padding:3px 4px}.l b{color:#fff}"
    + ".h{padding:6px 8px;background:#000;font-size:13px}"
    + "</style>"
    + '<div class="h">' + URL + " &mdash; " + rows.length + " frames, "
    + Math.round(gone - opening) + "ms reveal. Red = the screen held that picture for more than 32ms.</div>"
    + '<div class="g">' + cells + "</div>";
  fs.writeFileSync(path.join(OUT, "sheet.html"), html);

  const sheetH = Math.ceil(rows.length / COLS) * CH + 40;
  await send("Emulation.setDeviceMetricsOverride", { width: COLS * CW, height: sheetH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "file:///" + path.join(OUT, "sheet.html").replace(/\\/g, "/") });
  await sleep(1500);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "reveal-sheet.png"), Buffer.from(shot.result.data, "base64"));

  console.log("  -> " + path.join(OUT, "reveal-sheet.png") + "\n");
  ws.close(); ch.kill();
  process.exit(0);
})();
