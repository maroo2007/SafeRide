/**
 * DOES THE PHONE TOUCH THE CANVAS EDGE?
 *
 * Two instruments, deliberately, because they fail in different directions.
 *
 *   phoneRect   the model's world AABB, projected. Cheap, but it is the box
 *               around a rotated box, so it OVER-states the silhouette. Good
 *               for "how far out" but not for "did it clip".
 *   alpha scan  gl.readPixels on the outermost row and column of the drawing
 *               buffer. The renderer is alpha:true and nothing but the phone
 *               is drawn, so a non-zero alpha at an edge pixel IS the phone
 *               touching the boundary. Ground truth.
 *
 * The readback happens in the SAME task as the render, before the compositor
 * has had the buffer, which is the only window in which a non-preserved
 * drawing buffer is readable.
 *
 * A no-op passes an "edge is clear" test trivially — a scene that draws
 * nothing has a clear edge. So every sample also reports the interior's max
 * alpha, and a sample with an empty interior is a FAILURE, not a pass.
 *
 * Usage: node build/probe-clip.js <profile> [--w=1440] [--h=900] [--n=201] [--url=]
 */
const { spawn } = require("child_process");
const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const VW = +arg("w", 1440), VH = +arg("h", 900), N = +arg("n", 201);
const URL = arg("url", "http://localhost:3100/");
const PORT = +arg("port", 9811);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const SCAN = `(() => {
  const cv = document.querySelector('#parent-app canvas');
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const rowT = new Uint8Array(W * 4), rowB = new Uint8Array(W * 4);
  const colL = new Uint8Array(H * 4), colR = new Uint8Array(H * 4);
  const mid  = new Uint8Array(W * 4);
  const maxA = (buf) => { let m = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] > m) m = buf[i]; return m; };
  const rows = [];
  const N = __N__;
  for (let i = 0; i <= N; i++) {
    const p = i / N;
    window.__phoneTour.setProgress(p);
    gl.readPixels(0, H - 1, W, 1, gl.RGBA, gl.UNSIGNED_BYTE, rowT);
    gl.readPixels(0, 0,     W, 1, gl.RGBA, gl.UNSIGNED_BYTE, rowB);
    gl.readPixels(0, 0,     1, H, gl.RGBA, gl.UNSIGNED_BYTE, colL);
    gl.readPixels(W - 1, 0, 1, H, gl.RGBA, gl.UNSIGNED_BYTE, colR);
    gl.readPixels(0, (H >> 1), W, 1, gl.RGBA, gl.UNSIGNED_BYTE, mid);
    const d = window.__phoneTour.debug();
    rows.push({
      p: +p.toFixed(4),
      top: maxA(rowT), bottom: maxA(rowB), left: maxA(colL), right: maxA(colR),
      interior: maxA(mid),
      rect: d.phoneRect,
    });
  }
  return JSON.stringify({ W, H, cssW: cv.clientWidth, cssH: cv.clientHeight,
    dpr: devicePixelRatio, phoneHeightPx: Math.round(window.__phoneTour.debug().phoneHeightPx), rows });
})()`;

(async () => {
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
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
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(8000);
  const mode = await ev("document.querySelector('#parent-app').getAttribute('data-mode')");
  console.log("\n  CLIP PROBE — " + VW + "x" + VH + "   " + URL + "   mode=" + mode);
  if (mode !== "scene") {
    console.log("  stacked: there is no canvas at this width, so there is no canvas edge to clip against.\n");
    ws.close(); ch.kill(); process.exit(0);
  }
  for (let i = 0; i < 80; i++) { if (await ev("!!window.__phoneTour")) break; await sleep(500); }

  const out = JSON.parse(await ev(SCAN.replace("__N__", String(N))));
  const { W, H, cssW, cssH, dpr, phoneHeightPx, rows } = out;
  console.log("  drawing buffer " + W + "x" + H + " (css " + cssW + "x" + cssH + ", dpr " + dpr + ")   phoneHeightPx " + phoneHeightPx + "\n");

  const blank = rows.filter((r) => r.interior === 0);
  console.log("  samples with an EMPTY interior scanline: " + blank.length + " of " + rows.length +
    (blank.length ? "   <-- readback is not seeing the phone; every edge result below is meaningless"
                  : "   (the phone is on screen at every sample)"));

  const worst = { top: 0, bottom: 0, left: 0, right: 0 };
  const worstAt = { top: -1, bottom: -1, left: -1, right: -1 };
  let touching = 0;
  for (const r of rows) {
    let any = false;
    for (const k of ["top", "bottom", "left", "right"]) {
      if (r[k] > worst[k]) { worst[k] = r[k]; worstAt[k] = r.p; }
      if (r[k] > 8) any = true;
    }
    if (any) touching++;
  }
  console.log("\n  ALPHA AT THE CANVAS EDGE  (max over the whole strip; >8 means the phone is cut)");
  for (const k of ["top", "bottom", "left", "right"])
    console.log("    " + k.padEnd(7) + " worst alpha " + String(worst[k]).padStart(3) +
      "   at p=" + worstAt[k] + "   " + (worst[k] > 8 ? "CLIPPED" : "clear"));
  console.log("    " + touching + " of " + rows.length + " scroll positions have the phone touching a boundary");

  const ov = { top: 0, bottom: 0, left: 0, right: 0 };
  const ovAt = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const r of rows) {
    const o = {
      top: -r.rect.y, left: -r.rect.x,
      bottom: (r.rect.y + r.rect.h) - cssH, right: (r.rect.x + r.rect.w) - cssW,
    };
    for (const k of ["top", "bottom", "left", "right"]) if (o[k] > ov[k]) { ov[k] = o[k]; ovAt[k] = r.p; }
  }
  console.log("\n  PROJECTED AABB OVERFLOW  (over-states the silhouette; read it as an upper bound)");
  for (const k of ["top", "bottom", "left", "right"])
    console.log("    " + k.padEnd(7) + String(Math.round(ov[k])).padStart(5) + "px beyond the edge   at p=" + ovAt[k]);
  const hs = rows.map((r) => r.rect.h), wsx = rows.map((r) => r.rect.w);
  const maxH = Math.max(...hs), minH = Math.min(...hs), maxW = Math.max(...wsx), minW = Math.min(...wsx);
  console.log("\n  projected box across the full turn:  h " + minH + ".." + maxH + "px   w " + minW + ".." + maxW + "px");
  console.log("  the layout solved for " + phoneHeightPx + "px; the tallest the projected box gets is " + maxH +
    "px  (" + ((maxH / phoneHeightPx - 1) * 100).toFixed(1) + "% more)\n");

  /*
   * THE SILHOUETTE ITSELF, from every drawn pixel rather than from a box.
   *
   * The AABB above is the box around a rotated box, so it is loose by
   * however much the phone leans — 17px per side horizontally at 800, where
   * the alpha scan says the edge is clear. This reads the actual extent of
   * what was rasterised, which is the number the layout has to fit.
   */
  const SIL = +arg("sil", 41);
  const sil = JSON.parse(await ev(`(() => {
    const cv = document.querySelector('#parent-app canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    const out = [];
    const N = ${SIL};
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      window.__phoneTour.setProgress(p);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let r0 = H, r1 = -1, c0 = W, c1 = -1, n = 0;
      for (let y = 0; y < H; y++) {
        const base = y * W * 4;
        for (let x = 0; x < W; x++) {
          if (buf[base + x * 4 + 3] > 8) {
            n++;
            if (y < r0) r0 = y;
            if (y > r1) r1 = y;
            if (x < c0) c0 = x;
            if (x > c1) c1 = x;
          }
        }
      }
      /* GL rows are bottom-up; convert to CSS-style top-down. */
      out.push({ p: +p.toFixed(3), drawn: n,
        top: H - 1 - r1, bottom: H - 1 - r0, left: c0, right: c1,
        h: r1 - r0 + 1, w: c1 - c0 + 1 });
    }
    return JSON.stringify({ W, H, out });
  })()`));
  const empty = sil.out.filter((s) => s.drawn === 0);
  console.log("  SILHOUETTE  (every drawn pixel, " + sil.out.length + " scroll positions)");
  console.log("    samples that drew NOTHING: " + empty.length +
    (empty.length ? "   <-- the scan is not seeing the phone" : ""));
  const sh = Math.max(...sil.out.map((s) => s.h)), sw = Math.max(...sil.out.map((s) => s.w));
  const tallest = sil.out.find((s) => s.h === sh);
  const widest = sil.out.find((s) => s.w === sw);
  console.log("    tallest silhouette " + sh + "px at p=" + tallest.p +
    "   (" + ((sh / phoneHeightPx - 1) * 100).toFixed(1) + "% over the " + phoneHeightPx + "px the layout solved for)");
  console.log("    widest  silhouette " + sw + "px at p=" + widest.p);
  const overTop = Math.max(...sil.out.map((s) => -s.top));
  const overBot = Math.max(...sil.out.map((s) => s.bottom - (sil.H - 1)));
  const overL = Math.max(...sil.out.map((s) => -s.left));
  const overR = Math.max(...sil.out.map((s) => s.right - (sil.W - 1)));
  /* A clipped silhouette cannot report a negative clearance — the pixels past
     the boundary were never rasterised — so 0 means TOUCHING, i.e. cut off.
     How far past is the AABB overflow above, not this. */
  /* Captures at the poses that matter, driven through the real scroll so the
     picture is of the page and not of a scene poked from outside. */
  const SHOTS = arg("shots", "");
  if (SHOTS) {
    const fs2 = require("fs"), path2 = require("path");
    fs2.mkdirSync(SHOTS, { recursive: true });
    const at = [["ch1-rest", 0], ["mid-1", 0.25], ["ch2-rest", 0.5], ["mid-2", 0.75], ["ch3-rest", 1]];
    for (const [label, p] of at) {
      await ev(`(async () => {
        const rw = document.querySelector('#parent-app [data-tour-runway]');
        const top = Math.round(rw.getBoundingClientRect().top + scrollY);
        scrollTo(0, top + Math.round((rw.offsetHeight - innerHeight) * ${p}));
        await new Promise((r) => setTimeout(r, 700));
        return 1;
      })()`);
      const r = await send("Page.captureScreenshot", { format: "png" });
      fs2.writeFileSync(path2.join(SHOTS, `tour-${VW}-${label}.png`), Buffer.from(r.result.data, "base64"));
    }
    console.log("    captures written to " + SHOTS);
  }

  console.log("    clearance to each edge (0 = touching the boundary, i.e. cut):  top " + (-overTop) +
    "   bottom " + (-overBot) + "   left " + (-overL) + "   right " + (-overR) + "\n");
  ws.close(); ch.kill(); process.exit(0);
})();
