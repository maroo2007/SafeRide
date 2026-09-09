/**
 * THE WHOLE PAGE, at one width, on the production build.
 *
 * Three things that can only be asked of the finished page rather than of a
 * section:
 *
 *   axe          the complete document, after the loader has gone and every
 *                section has mounted. Run per width, because a violation can
 *                exist at 390 and not at 1440 — a heading order that only
 *                collapses when a grid stacks, a target that is only too
 *                small on a phone.
 *
 *   the keyboard the page walked with nothing but Tab, from the first stop to
 *                the last. Reported as what was REACHED against what is
 *                focusable, so an element that exists and cannot be got to is
 *                named rather than inferred from a passing count. A trap is
 *                visible in the same walk: focus that stops advancing.
 *
 *   reduced      no requestAnimationFrame, no WebGL context, no video
 *   motion       request. All three hooked BEFORE any page script runs, so
 *                what is counted is what the page actually asked for and not
 *                what it left behind afterwards.
 *
 * Usage: node build/verify-page.js <profile> [--w=1440] [--h=900] [--port=]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const BASE = arg("url", "http://localhost:3100/");
const PORT0 = +arg("port", 9410);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const AXE = fs.readFileSync(path.join(__dirname, "..", "node_modules", "axe-core", "axe.min.js"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log("   " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "   " + detail : ""));
  if (!ok) fails.push(name + " @" + VW);
};

/* Hooked before any page script. Counting after the fact cannot tell a page
   that never asked for a frame from one that asked and stopped. */
const PROBE = `
  window.__rafCalls = 0;
  window.__webgl = [];
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) { window.__rafCalls++; return raf.call(window, cb); };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    window.__webgl.push(String(type));
    return gc.call(this, type, ...rest);
  };
`;

let seq = 0;
async function session({ reduced } = {}) {
  const port = PORT0 + seq++;
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + port, "--user-data-dir=" + P + "-" + port,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + port + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("verify-page: no debugger target on " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 30 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const requests = [];
  ws.on("message", (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Network.requestWillBeSent") requests.push(x.params.request.url);
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      throw new Error("in-page: " + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails).slice(0, 400));
    }
    return r.result?.result?.value;
  };
  const tab = async (shift) => {
    for (const type of ["rawKeyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
        modifiers: shift ? 8 : 0,
      });
    }
    await sleep(70);
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 768 });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  await send("Page.navigate", { url: BASE });
  for (let i = 0; i < 150; i++) {
    if (await ev("!document.querySelector('[data-load-screen]')")) break;
    await sleep(500);
  }
  await sleep(2000);
  return { ev, send, tab, requests, close: () => { ws.close(); ch.kill(); } };
}

(async () => {
  console.log("\n  THE WHOLE PAGE — " + BASE + "   " + VW + "x" + VH + "\n");
  const s = await session();

  /* ---- axe ------------------------------------------------------------- */
  console.log("   AXE, on the complete document");
  await s.ev(AXE + "; 1");
  check("axe-core is actually loaded (a run that never ran reports no violations)",
    (await s.ev("typeof window.axe")) === "object" || (await s.ev("typeof window.axe")) === "function",
    "typeof axe = " + (await s.ev("typeof window.axe")));

  const report = JSON.parse(await s.ev(`(async () => {
    const r = await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }
    });
    return JSON.stringify({
      violations: r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
        where: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("  |  ")
      })),
      passes: r.passes ? r.passes.length : null,
      testedNodes: r.testEngine ? 1 : 1
    });
  })()`));
  const serious = report.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  for (const v of report.violations) {
    console.log("     " + (v.impact || "?").padEnd(9) + v.id.padEnd(30) + v.n + "x  " + v.help);
    console.log("       " + v.where);
  }
  check("no critical or serious accessibility violations", serious.length === 0,
    report.violations.length + " violations total, " + serious.length + " critical/serious");

  /* ---- the keyboard walk ----------------------------------------------- */
  console.log("\n   A KEYBOARD-ONLY WALK, top to bottom");
  const describe = `(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'BODY';
    const label = (a.getAttribute('aria-label') || a.textContent || a.value || '').trim().replace(/\\s+/g, ' ').slice(0, 34);
    const sec = a.closest('section[id], footer, [id]');
    return (a.tagName.toLowerCase()) + '|' + label + '|' + (sec && sec.id ? sec.id : (sec ? sec.tagName.toLowerCase() : '-'));
  })()`;

  /* What SHOULD be reachable: visible, enabled, not inside an inert subtree,
     not tabindex -1. Collapsed accordion panels are inert on purpose, and
     their contents are correctly excluded. */
  const candidates = JSON.parse(await s.ev(`JSON.stringify((() => {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';
    return [...document.querySelectorAll(sel)].filter((el) => {
      if (el.closest('[inert]')) return false;
      if (el.getAttribute('tabindex') === '-1') return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return true;
    }).map((el) => {
      const label = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 34);
      const sec = el.closest('section[id], footer, [id]');
      return el.tagName.toLowerCase() + '|' + label + '|' + (sec && sec.id ? sec.id : (sec ? sec.tagName.toLowerCase() : '-'));
    });
  })())`));

  await s.ev("document.body.focus(); window.scrollTo(0,0); 1");
  const seen = [];
  const LIMIT = candidates.length + 40;
  for (let i = 0; i < LIMIT; i++) {
    await s.tab(false);
    const d = await s.ev(describe);
    if (d === "BODY" && seen.length > 3) break;
    if (seen.length && seen[seen.length - 1] === d && seen[seen.length - 2] === d) break;
    seen.push(d);
  }
  const reached = new Set(seen);
  const unreachable = candidates.filter((c) => !reached.has(c));
  console.log("     " + seen.length + " stops, " + candidates.length + " focusable elements on the page");
  console.log("     route: " + seen.slice(0, 8).map((x) => x.split("|")[1] || x.split("|")[0]).join(" -> ") + " ...");
  if (unreachable.length) {
    for (const u of unreachable.slice(0, 12)) console.log("     UNREACHABLE  " + u);
  }
  check("every focusable element can be reached with Tab alone", unreachable.length === 0,
    unreachable.length + " unreachable");
  /* A trap shows up as a walk that ends far short of the page. */
  check("the walk reaches the footer (no trap on the way down)",
    seen.some((d) => d.endsWith("|footer")),
    "last stop: " + (seen[seen.length - 1] || "none"));
  s.close();

  /* ---- reduced motion --------------------------------------------------- */
  console.log("\n   REDUCED MOTION — nothing animates, nothing renders, nothing downloads");
  const rm = await session({ reduced: true });
  await sleep(3000);
  const rafCalls = await rm.ev("window.__rafCalls");
  const webgl = JSON.parse(await rm.ev("JSON.stringify(window.__webgl || [])"));
  const webglCtx = webgl.filter((t) => /webgl/i.test(t));
  const videoReqs = rm.requests.filter((u) => /\.(mp4|webm)(\?|$)/.test(u));
  check("no WebGL context is ever created", webglCtx.length === 0,
    webglCtx.length ? webglCtx.join(", ") : "canvas contexts asked for: " + (webgl.join(", ") || "none"));
  check("no video is fetched at all", videoReqs.length === 0,
    videoReqs.map((u) => u.split("/").pop()).join(", ") || "none");
  /* §4.4: reduced motion renders no BlurReveal component at all, so there is
     nothing to animate rather than something animating quickly. */
  const chars = await rm.ev("document.querySelectorAll('[data-blur-char]').length");
  check("no per-character reveal spans exist", chars === 0, chars + " found");
  /* §5.3: the finished state, not a half-drawn line. */
  const lit = await rm.ev("document.querySelectorAll('[data-j-node][data-active]').length");
  const tot = await rm.ev("document.querySelectorAll('[data-j-node]').length");
  check("the journey line is fully drawn and every node lit", tot > 0 && lit === tot, lit + " of " + tot);
  check("the scroll stack is not pinned",
    (await rm.ev("document.querySelector('.stack')?.dataset.pinned === undefined")) === true);
  /* rAF is not zero on any real page — React and Lenis both schedule one.
     What must not happen is a page still animating every frame. */
  await rm.ev("window.__rafBase = window.__rafCalls; 1");
  await sleep(3000);
  const growth = (await rm.ev("window.__rafCalls - window.__rafBase"));
  check("nothing is still animating three seconds later", growth < 12,
    growth + " new requestAnimationFrame calls in 3s (total " + rafCalls + ")");
  rm.close();

  /* ---- below 768 ------------------------------------------------------- */
  if (VW < 768) {
    console.log("\n   BELOW 768");
    const m = await session();
    check("the tour's 3D model is never fetched",
      !m.requests.some((u) => /\.glb(\?|$)/.test(u)),
      m.requests.filter((u) => /\.glb/.test(u)).length + " GLB requests");
    check("the scroll stack is not pinned",
      (await m.ev("document.querySelector('.stack')?.dataset.pinned === undefined")) === true);
    check("the stack is a plain vertical list",
      (await m.ev("getComputedStyle(document.querySelector('.stack-viewport')).flexDirection")) === "column");
    const jd = await m.ev("getComputedStyle(document.querySelector('.journey')).display");
    check("the journey timeline is vertical", jd !== "grid", "display: " + jd);
    m.close();
  }

  console.log("\n  " + (fails.length ? "FAILED: " + fails.join(" | ") : "all checks pass") + "\n");
  process.exit(fails.length ? 1 : 0);
})();
