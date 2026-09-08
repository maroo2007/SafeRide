/**
 * The load screen's contract, as four separate claims.
 *
 *   1. DESKTOP HOLDS FOR THE SCENE. The screen is still up when the tour
 *      scene settles, and comes off after it. The point of the hold is that
 *      the expensive work — PMREM, shader compilation, texture upload — is
 *      paid behind an opaque cover instead of over a playing film.
 *
 *   2. AFTER THE LIFT, NOTHING BLOCKS. The claim the hold exists to make.
 *      Measured from the page's own rAF clock, not from a screencast: the
 *      screencast's encode-and-ack costs more than the thing it would be
 *      measuring, and reported 8.8 frames per second over a stretch that rAF
 *      put at 52.
 *
 *   3. MOBILE DOES NOT WAIT. Below 768px no scene is built and the GLB is
 *      never fetched, so a screen that waited for one would sit for the full
 *      desktop timeout on every phone. Asserted as a NETWORK fact plus a
 *      time, because "it looked fine" cannot tell the two apart.
 *
 *   4. THE CAP IS REAL. With the model held open forever — a stalled request,
 *      not a failed one — the screen still comes off and the placeholder
 *      covers the tour. A slow connection must never be trapped behind it.
 *
 * Each check is written against the no-op question. "The screen went away"
 * passes on a screen that never appeared; "no long gaps after the lift"
 * passes on a page that renders nothing at all. So the first is paired with
 * "it was there in the first place" and the second with a frame count.
 *
 * Usage: node build/verify-loadscreen.js <profile-dir> [url]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const URL = (process.argv[3] && !process.argv[3].startsWith("--")) ? process.argv[3] : "http://localhost:3100/";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? +a.split("=")[1] : d; };
const PORT = arg("port", 9841);

/* Mirrors of the shipped constants. Read from the source rather than typed,
   so a change to either one cannot silently leave this asserting the old
   contract — the failure mode that let "at most 620px" pass on a 652px
   phone for weeks. */
const src = fs.readFileSync("components/ui/load-screen.tsx", "utf8");
const constant = (name) => {
  const m = src.match(new RegExp("export const " + name + "\\s*=\\s*(\\d+)"));
  if (!m) throw new Error("verify-loadscreen: cannot find " + name + " in load-screen.tsx");
  return +m[1];
};
const HERO_TIMEOUT_MS = constant("HERO_TIMEOUT_MS");
const SCENE_TIMEOUT_MS = constant("SCENE_TIMEOUT_MS");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!ok) fails.push(name);
};

const PROBE = `
  window.__loadScreenSeen = false;
  window.__loadScreenGone = null;
  (function poll() {
    const el = document.querySelector('[data-load-screen]');
    if (el) window.__loadScreenSeen = true;
    if (!el && window.__loadScreenSeen && window.__loadScreenGone === null) {
      window.__loadScreenGone = +performance.now().toFixed(1); return;
    }
    if (performance.now() < 40000) setTimeout(poll, 25);
  })();
  window.__raf = [];
  (function tick(t) { window.__raf.push(+t.toFixed(1)); if (t < 40000) requestAnimationFrame(tick); })(0);
  window.__long = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) });
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) { window.__longUnsupported = String(e); }
`;

let portSeq = 0;
async function session({ width, height, stallGlb }) {
  /* A fresh port per session: the previous headless Chrome has not always
     released the last one by the time the next launches, and the failure is
     a null target rather than a bind error. */
  const port = PORT + (portSeq++);
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + port, "--user-data-dir=" + P + "-" + width + (stallGlb ? "-stall" : ""),
    "--window-size=" + width + "," + height, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + port + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("verify-loadscreen: no debugger target on port " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const glb = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Network.requestWillBeSent" && /\.glb(\?|$)/.test(x.params.request.url)) glb.push(x.params.request.url);
    /* Paused and never continued: the request stays open forever, which is
       what a slow connection looks like from the page's side. A blocked or
       failed request is a DIFFERENT test — it takes the error path and
       declares ready immediately. */
    if (x.method === "Fetch.requestPaused") { /* held */ }
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  if (stallGlb) await send("Fetch.enable", { patterns: [{ urlPattern: "*.glb" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  await send("Page.navigate", { url: URL });

  /* Long enough to pass the cap under every path, plus a margin. */
  const budget = stallGlb ? SCENE_TIMEOUT_MS + 6000 : 20000;
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    if (await ev("window.__loadScreenGone !== null")) break;
    await sleep(200);
  }
  await sleep(2500);   /* keep watching AFTER the lift */
  const out = JSON.parse(await ev(`JSON.stringify({
    seen: window.__loadScreenSeen,
    gone: window.__loadScreenGone,
    hero: document.documentElement.hasAttribute('data-hero-playing'),
    tourReady: document.documentElement.hasAttribute('data-tour-ready'),
    mode: document.querySelector('#parent-app') ? document.querySelector('#parent-app').getAttribute('data-mode') : null,
    marks: window.__tourMarks || {},
    raf: window.__raf || [],
    long: window.__long || [],
  })`));
  out.glb = glb;
  ws.close(); ch.kill();
  await sleep(300);
  return out;
}

(async () => {
  console.log(`\n  LOAD SCREEN — ${URL}   hero cap ${HERO_TIMEOUT_MS}ms, scene cap ${SCENE_TIMEOUT_MS}ms\n`);

  /* ---- 1 & 2: desktop ------------------------------------------------- */
  const d = await session({ width: 1440, height: 900 });
  const settled = d.marks.settled ?? d.marks.deferredEnvDone ?? d.marks.firstFrame ?? null;
  console.log("   DESKTOP 1440x900");
  check("the load screen was actually there (so 'it went away' means something)", d.seen === true);
  check("the scene settled", settled !== null, settled === null ? "no settled mark" : `${Math.round(settled)}ms`);
  check("the screen held UNTIL the scene had settled",
    d.gone !== null && settled !== null && d.gone > settled,
    `lifted ${d.gone === null ? "never" : Math.round(d.gone)}ms, settled ${settled === null ? "-" : Math.round(settled)}ms`);
  check("...and then it did lift", d.gone !== null, d.gone === null ? "still up" : `${Math.round(d.gone)}ms`);

  /*
   * THE CHECK ABOVE IS A CONTRACT CHECK AND BARELY DISCRIMINATES. Said
   * plainly because it was proved so.
   *
   * With the environment built before the first render, `settled` resolves
   * one frame after createScene returns — so a build that raises the flag
   * the moment createScene resolves, skipping `settled` entirely, lifts
   * about 20ms earlier and passes. It was measured doing exactly that
   * (7388 against a settled of 7066). It still earns its place, because it
   * is the check that fails if the environment ever moves back behind the
   * first frame; it is just not evidence on its own.
   *
   * That bypass could not be made to fail even in the deferred mode, where
   * there IS a 5s gap between the two — because the deferred work is one
   * unbroken task, and a task that would freeze the page also blocks the
   * rAF chain that performs the lift. The cover stays up through its own
   * worst moment whether or not anything asked it to. Recorded rather than
   * dressed up: `settled` is the ordering stated explicitly instead of
   * inherited from a coincidence, and that is the whole of its claim.
   *
   * THIS is the behavioural claim: the expensive work is BEHIND the cover.
   * A long task that ends after the lift is a freeze the visitor watched.
   */
  const biggest = [...d.long].sort((a, b) => b.dur - a.dur)[0];
  check("the load HAD something worth hiding (so 'nothing leaked out' means something)",
    biggest !== undefined && biggest.dur >= 150,
    biggest ? `biggest task ${Math.round(biggest.dur)}ms at ${Math.round(biggest.start)}ms` : "no long tasks at all");
  const leaked = d.long.filter((l) => l.dur >= 150 && d.gone !== null && l.start + l.dur > d.gone);
  check("every long task over 150ms finished BEHIND the load screen",
    leaked.length === 0,
    leaked.length ? leaked.map((l) => `${Math.round(l.dur)}ms ending ${Math.round(l.start + l.dur)}ms, after the ${Math.round(d.gone)}ms lift`).join("; ")
      : `${d.long.filter((l) => l.dur >= 150).length} task(s) over 150ms, all before the ${Math.round(d.gone)}ms lift`);

  const after = d.raf.filter((x) => d.gone !== null && x >= d.gone);
  let worst = 0, worstAt = 0, over100 = 0;
  for (let i = 1; i < after.length; i++) {
    const g = after[i] - after[i - 1];
    if (g > worst) { worst = g; worstAt = after[i - 1]; }
    if (g > 100) over100++;
  }
  check("the page kept rendering after the lift (so 'no gaps' means something)",
    after.length > 60, `${after.length} frames in ${Math.round((after[after.length - 1] ?? 0) - (after[0] ?? 0))}ms`);
  check("no frame took over 100ms after the lift",
    after.length > 60 && over100 === 0,
    `worst ${Math.round(worst)}ms at ${Math.round(worstAt)}ms, ${over100} over 100ms`);

  /* ---- 3: mobile ------------------------------------------------------- */
  const m = await session({ width: 390, height: 844 });
  console.log("\n   MOBILE 390x844");
  check("the load screen was actually there", m.seen === true);
  check("the model is never fetched", m.glb.length === 0, `${m.glb.length} GLB request(s)`);
  check("the tour is the stacked list", m.mode === "stacked", String(m.mode));
  check("the screen did NOT wait for a scene that is never built",
    m.gone !== null && m.gone < HERO_TIMEOUT_MS + 1500,
    `lifted ${m.gone === null ? "never" : Math.round(m.gone)}ms, budget here is ${HERO_TIMEOUT_MS}ms (the desktop cap is ${SCENE_TIMEOUT_MS}ms)`);

  /* ---- 4: the cap ------------------------------------------------------ */
  const s = await session({ width: 1440, height: 900, stallGlb: true });
  console.log("\n   DESKTOP with the model request HELD OPEN — a slow connection");
  check("the scene never settled, so this is testing the cap and not the happy path",
    (s.marks.settled ?? s.marks.firstFrame ?? null) === null && s.tourReady === false,
    `settled=${s.marks.settled ?? "-"}, tourReady=${s.tourReady}`);
  check("the screen lifted anyway, at the cap",
    s.gone !== null && s.gone >= SCENE_TIMEOUT_MS - 500 && s.gone < SCENE_TIMEOUT_MS + 2500,
    `lifted ${s.gone === null ? "never" : Math.round(s.gone)}ms against a ${SCENE_TIMEOUT_MS}ms cap`);

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  all checks passed\n");
  process.exit(fails.length ? 1 : 0);
})();
