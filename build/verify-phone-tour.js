/**
 * Phone tour guards (spec §8), run in a real browser against a production
 * build. Exits non-zero on failure.
 *
 * Every check here is written against the no-op question. "The texture
 * changed" passes on a build that swaps at the wrong moment; "the phone moved"
 * passes on a build that moves it nowhere useful; counting frames passes on a
 * build that runs the loop and throws the output away. So each one asserts the
 * thing that would actually be wrong.
 *
 * Usage:
 *   node build/verify-phone-tour.js <profile-dir> <out-dir> [url] [--headed]
 *                                   [--w=] [--h=] [--reduced] [--keep-transmission]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URLBASE = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const HEADED = process.argv.includes("--headed");
const REDUCED = process.argv.includes("--reduced");
const KEEPT = process.argv.includes("--keep-transmission");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9702);
const URL = KEEPT ? URLBASE + "?keepTransmission=1" : URLBASE;

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
  const flags = ["--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${P}`, `--window-size=${VW},${VH}`, "about:blank"];
  if (!HEADED) flags.unshift("--headless=new");
  const ch = spawn(CHROME, flags, { stdio: "ignore" });

  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500); try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const events = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); }
    else if (x.method) events.push(x);
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (n) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, n), Buffer.from(r.result.data, "base64"));
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (REDUCED) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  /* Count WebGL contexts without touching the page's own code. */
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__glContexts = 0;
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/i.test(String(type))) window.__glContexts++;
        return orig.call(this, type, ...rest);
      };
    })()`,
  });

  const label = `${VW}x${VH}${REDUCED ? " reduced-motion" : ""}${KEEPT ? " keep-transmission" : ""}`;
  console.log(`\n  PHONE TOUR — ${URL}   ${label}\n`);

  await send("Page.navigate", { url: URL });
  await sleep(9000);

  const glbRequests = () => events
    .filter((e) => e.method === "Network.requestWillBeSent" && /\.glb(\?|$)/.test(e.params.request.url))
    .map((e) => e.params.request.url);

  /* ---- the fetch gate -------------------------------------------------- */
  const heroOnScreen = await ev(`(() => {
    const h = document.querySelector('section[aria-labelledby="hero-headline"]');
    const r = h.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  })()`);
  check("the hero is still on screen at this point (so the gate means something)", heroOnScreen === true);
  check("the GLB has NOT been fetched while the hero is on screen", glbRequests().length === 0,
    glbRequests().join(" ") || "0 requests");

  const mode0 = await ev(`document.querySelector('#parent-app').getAttribute('data-mode')`);
  console.log(`   section mode: ${mode0}`);

  /* ---- scroll to the section ------------------------------------------ */
  const geo = JSON.parse(await ev(`(() => {
    const s = document.querySelector('#parent-app');
    const runway = s.querySelector('[style*="300vh"]') || s;
    const r = runway.getBoundingClientRect();
    return JSON.stringify({ top: Math.round(r.top + scrollY), h: Math.round(r.height), vh: innerHeight,
      mode: s.getAttribute('data-mode') });
  })()`));
  const at = async (p) => {
    const span = geo.h - geo.vh;
    const y = Math.round(geo.top + Math.max(0, span) * p);
    await ev(`(async()=>{scrollTo(0,${y});await new Promise(r=>setTimeout(r,900));return 1})()`);
  };
  /*
   * CONTINUOUS. `at()` jumps, and a jump is not a scroll: it skips the
   * back-facing window entirely, so testing swap timing with it measures the
   * rig's step size rather than the design. The first run reported swaps at
   * dot -0.07 and a texture stuck on chapter 2 — both artifacts of stepping.
   * A jump is worth testing too, but as its own case, below.
   */
  const scrubTo = async (from, to, ms = 2200) => {
    const span = geo.h - geo.vh;
    const y0 = Math.round(geo.top + span * from);
    const y1 = Math.round(geo.top + span * to);
    await ev(`(async()=>{
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const k = Math.min(1, (performance.now() - t0) / ${ms});
          scrollTo(0, Math.round(${y0} + (${y1} - ${y0}) * k));
          if (k < 1) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      await new Promise((r) => setTimeout(r, 400));
      return 1;
    })()`);
  };
  const waitReady = async () => {
    for (let i = 0; i < 40; i++) { if ((await dbgSafe()).ready) return true; await sleep(500); }
    return false;
  };
  const dbgSafe = async () =>
    JSON.parse(await ev(`JSON.stringify(window.__phoneTour ? window.__phoneTour.debug() : {ready:false})`));

  if (REDUCED || geo.mode === "stacked") {
    await at(0);
    const gl = await ev("window.__glContexts|0");
    check("no WebGL context is created at all", gl === 0, `${gl} contexts`);
    check("the GLB is never fetched", glbRequests().length === 0, `${glbRequests().length} requests`);
    const stackedImgs = await ev(`document.querySelectorAll('#parent-app li img').length`);
    check("the stacked fallback rendered", stackedImgs >= 3, `${stackedImgs} images`);
    await shot("pt-stacked.png");
    console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  all checks pass\n");
    ws.close(); ch.kill(); process.exit(fails.length ? 1 : 0);
  }

  await at(0);
  await sleep(2500);
  check("the GLB IS fetched once the hero has left", glbRequests().length === 1, `${glbRequests().length} requests`);

  const dbg = async () => JSON.parse(await ev(`JSON.stringify(window.__phoneTour ? window.__phoneTour.debug() : {ready:false})`));
  /*
   * WAIT for readiness rather than assume it. The first version of this
   * checked 2.5s after scrolling and reported "scene never became ready" on a
   * scene that was simply still fetching 7.8 MB of model and 3 MB of texture.
   * An impatient guard reports a defect that is not there, which is its own
   * kind of wrong answer.
   */
  let d = await dbg();
  for (let i = 0; i < 40 && !d.ready; i++) { await sleep(500); d = await dbg(); }
  check("the scene is live", d.ready === true);
  if (!d.ready) { console.log("\n  FAILED: scene never became ready\n"); ws.close(); ch.kill(); process.exit(1); }

  /* ---- colour pipeline ------------------------------------------------- */
  check("tone mapping is ACES", d.toneMapping === "ACESFilmic", d.toneMapping);
  check("output colour space is sRGB", d.outputColorSpace === "srgb", d.outputColorSpace);
  check("screen textures are sRGB", d.screenTextureColorSpace === "srgb", d.screenTextureColorSpace);
  check("all three textures uploaded at mount", d.texturesUploaded === 3, `${d.texturesUploaded}`);
  console.log(`   transmissionFactor on glass.002: ${d.transmissionFactor}`);

  /* ---- rest scale ------------------------------------------------------ */
  check("the phone is at most 620 CSS px tall", d.phoneHeightPx <= 620.5, `${Math.round(d.phoneHeightPx)}px`);

  /* ---- side alternation ------------------------------------------------ */
  const xs = [];
  for (const p of [0, 0.5, 1]) { await at(p); xs.push((await dbg()).phoneCentreXPx); }
  const half = VW / 2;
  const sides = xs.map((x) => (x > half ? "right" : "left"));
  check("the phone alternates sides: right, left, right",
    sides[0] === "right" && sides[1] === "left" && sides[2] === "right",
    `x = ${xs.map((x) => Math.round(x)).join(", ")}  -> ${sides.join(", ")}`);
  check("it travels a real distance, not a nudge",
    Math.abs(xs[0] - xs[1]) > VW * 0.2 && Math.abs(xs[1] - xs[2]) > VW * 0.2,
    `${Math.round(Math.abs(xs[0] - xs[1]))}px and ${Math.round(Math.abs(xs[1] - xs[2]))}px of a ${VW}px viewport`);

  /* ---- text sync at rest points ---------------------------------------- */
  const HEADINGS = ["The whole morning, on one screen", "The route, as it happens", "See inside, whenever it matters"];
  let synced = true;
  const seen = [];
  await at(0);
  for (let i = 0; i < 3; i++) {
    if (i > 0) await scrubTo((i - 1) / 2, i / 2);
    const st = JSON.parse(await ev(`(() => {
      const active = [...document.querySelectorAll('#parent-app [data-chapter]')].filter((e) => e.dataset.active === 'true');
      return JSON.stringify({
        count: active.length,
        heading: active[0] ? active[0].querySelector('h3').textContent.trim() : null,
        bound: window.__phoneTour.debug().boundChapter,
      });
    })()`));
    seen.push(`ch${i}: bound=${st.bound} text="${(st.heading || "").slice(0, 22)}"`);
    if (st.count !== 1 || st.bound !== i || st.heading !== HEADINGS[i]) synced = false;
  }
  check("text matches the bound screen texture at every rest point", synced, seen.join("  |  "));

  /* The facing curve, printed. A screen turning through 720 degrees should
     read close to +1 at each rest point and close to -1 at each half-turn; if
     it does not, the facing axis is wrong however plausible the swaps look. */
  {
    const curve = [];
    for (let i = 0; i <= 8; i++) { await at(i / 8); curve.push(`p=${(i / 8).toFixed(3)} ${(await dbg()).screenDotCamera.toFixed(2)}`); }
    console.log(`
   facing curve: ${curve.join("  ")}`);
  }

  /* ---- the swap lands mid-back, reached by SCROLLING -------------------- */
  await ev("location.reload()"); await sleep(9000);
  await at(0); await waitReady();
  /* Count only what happens DURING the scrub. Reloading restores the browser's
     scroll position and `at(0)` jumps back, so two legitimate jump-recoveries
     happen before it — counting those measured the rig's setup, not the run. */
  const before = (await dbg()).swaps.length;
  await scrubTo(0, 1, 4000);
  d = await dbg();
  const during = d.swaps.slice(before);
  const swaps = during.filter((x) => x.kind === "swap");
  const recoveries = during.filter((x) => x.kind === "recovery");
  console.log(`\n   binds: ${d.swaps.map((x) => `${x.kind}:ch${x.chapter}@p=${x.progress} dot=${x.dot.toFixed(3)}`).join("  ")}`);
  check("a swap happened for each transition", swaps.length >= 2, `${swaps.length} swaps`);
  check("no recovery was needed during a continuous scroll", recoveries.length === 0,
    `${recoveries.length} recoveries`);
  check("every swap fired MID-BACK, not at the edge-on crossing",
    swaps.length > 0 && swaps.every((x) => x.dot < -0.5),
    swaps.length ? `worst dot ${Math.max(...swaps.map((x) => x.dot)).toFixed(3)}  (0 is edge-on, -1 is dead back)` : "none");

  /* A jump is the other case: it skips the back window entirely, so the
     texture must still end up right. Late and visible beats wrong forever. */
  await ev("location.reload()"); await sleep(9000);
  await at(0); await waitReady();
  await at(1); await sleep(900);
  const jumped = await dbg();
  check("a scroll that JUMPS past the back window still ends on the right screen",
    jumped.boundChapter === 2,
    `bound=${jumped.boundChapter}, via ${jumped.swaps.filter((x) => x.kind === "recovery").length} recovery bind(s)`);

  /* ---- text a11y: inert, not opacity ----------------------------------- */
  await at(0);
  const a11y = JSON.parse(await ev(`(() => {
    const blocks = [...document.querySelectorAll('#parent-app [data-chapter]')];
    const inactive = blocks.find((b) => b.dataset.active !== 'true');
    const before = document.activeElement;
    /* Give it something focusable and try to focus it. inert refuses. */
    const probe = document.createElement('button');
    probe.textContent = 'probe';
    inactive.appendChild(probe);
    probe.focus();
    const moved = document.activeElement === probe;
    probe.remove();
    return JSON.stringify({ moved, hidden: inactive.getAttribute('aria-hidden'), had: !!before });
  })()`));
  check("focus cannot enter the inactive chapter", a11y.moved === false,
    `activeElement moved: ${a11y.moved}, aria-hidden="${a11y.hidden}"`);

  /* ---- context loss: force it, do not check that a try/catch exists ----- */
  await ev("location.reload()"); await sleep(9000);
  await at(0); await waitReady();
  const lost = JSON.parse(await ev(`(async () => {
    const c = document.querySelector('#parent-app canvas');
    const gl = c && c.getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return JSON.stringify({ forced: false });
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 1500));
    const s = document.querySelector('#parent-app');
    return JSON.stringify({
      forced: true,
      mode: s.getAttribute('data-mode'),
      images: s.querySelectorAll('li img').length,
    });
  })()`));
  check("a lost WebGL context falls back to the stacked list",
    lost.forced === true && lost.mode === "stacked" && lost.images >= 3,
    lost.forced ? `mode=${lost.mode}, ${lost.images} images` : "could not force loss");
  await shot("pt-context-lost.png");

  /* ---- frame timing ---------------------------------------------------- */
  await ev("location.reload()"); await sleep(9000);
  await at(0); await waitReady();
  await at(0);
  const timing = JSON.parse(await ev(`(async () => {
    const d = []; let last = performance.now(); const t0 = last;
    const runway = document.querySelector('#parent-app [style*="300vh"]');
    const span = runway.getBoundingClientRect().height - innerHeight;
    const start = runway.getBoundingClientRect().top + scrollY;
    await new Promise((res) => {
      const tick = () => {
        const n = performance.now(); d.push(Math.round((n - last) * 100) / 100); last = n;
        const k = Math.min(1, (n - t0) / 2600);
        scrollTo(0, start + span * k);
        if (n - t0 < 2600) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    return JSON.stringify(d.slice(2));
  })()`));
  const sorted = [...timing].sort((a, b) => a - b);
  const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  console.log(`\n   frame intervals scrubbing the section (${sorted.length} frames): p50 ${pct(0.5)}ms  p95 ${pct(0.95)}ms  max ${sorted[sorted.length - 1]}ms`);
  console.log(`   frames over 32ms: ${sorted.filter((x) => x > 32).length}`);

  /* ---- captures --------------------------------------------------------- */
  for (const [n, p] of [["pt-0-chapter1.png", 0], ["pt-1-mid.png", 0.25], ["pt-2-chapter2.png", 0.5], ["pt-3-mid.png", 0.75], ["pt-4-chapter3.png", 1]]) {
    await at(p); await shot(n);
  }

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  all checks pass\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
