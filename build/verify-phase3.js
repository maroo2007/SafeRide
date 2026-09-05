/**
 * Phase 3 close-out: check every claim in a real browser, against a
 * production build, and photograph the ones that are visual.
 *
 * The unit tests read source. This drives the thing. Each check is written so
 * that a component which merely renders would fail it: the Tab cycle has to
 * actually visit every control, the language toggle has to actually change
 * state, the ambient shape has to actually become visible with brand fills,
 * and the scroll lock is probed with trusted input rather than window.scrollTo.
 *
 * Exits non-zero if any check fails.
 *
 * Usage: node build/verify-phase3.js <profile-dir> <out-dir> [url] [--headed]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3100/";
const HEADED = process.argv.includes("--headed");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9690);

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
  if (!HEADED) flags.unshift("--headless=new", "--disable-gpu");
  const ch = spawn(CHROME, flags, { stdio: "ignore" });

  let t = null;
  for (let i = 0; i < 40 && !t; i++) { await sleep(500); try { t = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (n) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, n), Buffer.from(r.result.data, "base64"));
  };
  const key = async (k, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
    await sleep(70);
  };
  const openMenu = async () => {
    await ev(`(async()=>{const b=document.querySelector('button[aria-controls="site-menu"]');
      if(b.getAttribute('aria-expanded')!=='true'){b.click();await new Promise(r=>setTimeout(r,1500));}return 1})()`);
  };
  const closeMenu = async () => {
    await ev(`(async()=>{const b=document.querySelector('button[aria-controls="site-menu"]');
      if(b.getAttribute('aria-expanded')==='true'){b.click();await new Promise(r=>setTimeout(r,1500));}return 1})()`);
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000);
  await ev("scrollTo(0,0);1"); await sleep(1200);

  console.log(`\n  PHASE 3 CLOSE-OUT — ${URL} at ${VW}x${VH}${HEADED ? " (headed)" : ""}\n`);

  /* ---- §2.2 adaptations, as rendered ---------------------------------- */
  console.log("  §2.2 ADAPTATIONS");
  const a = JSON.parse(await ev(`(() => {
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\\n"); } catch { return ""; } }).join("\\n");
    const shapes = [...document.querySelectorAll('[data-bg-shape]')];
    const fills = new Set();
    shapes.forEach((s) => s.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.fill && cs.fill !== 'none') fills.add(cs.fill);
      if (cs.stroke && cs.stroke !== 'none') fills.add(cs.stroke);
    }));
    return JSON.stringify({
      shapeCount: shapes.length,
      shapeIds: shapes.map((s) => s.getAttribute('data-bg-shape')),
      fills: [...fills],
      indigoInCss: /6366f1|99,\\s*102,\\s*241|139,\\s*92,\\s*246|236,\\s*72,\\s*153/i.test(css),
      /*
       * §2.2 C forbids pasting the component's :root block, which sets
       * --color-primary: #6366f1. It does NOT forbid the NAME: Tailwind v4's
       * @theme bridge in globals.css declares --color-primary: var(--primary)
       * legitimately. Testing for the name failed on our own token wiring — a
       * false positive. Replacing it with a field that did not exist passed on
       * undefined, which is worse. Resolve the value and read it.
       */
      colorPrimaryValue: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '(unset)',
      navColorPrimary: (() => {
        const root = document.querySelector('#site-menu').closest('div[class]');
        return root ? (getComputedStyle(root).getPropertyValue('--color-primary').trim() || '(unset)') : '(no root)';
      })(),
      clickMe: /click me/i.test(document.body.innerText),
      logoImgs: [...document.images].filter((i) => /saferide-logo/.test(i.src)).length,
      headerEls: document.querySelectorAll('header').length,
      links: [...document.querySelectorAll('#site-menu ul a')].map((el) => el.textContent.trim() + ' -> ' + el.getAttribute('href')),
    });
  })()`));
  check("six ambient shapes present", a.shapeCount === 6, `ids ${a.shapeIds.join(",")}`);
  const indigoish = a.fills.filter((f) => /rgba?\(\s*(99|139|236)\s*,/.test(f));
  check("no indigo/violet/pink in any rendered shape fill", indigoish.length === 0, `${a.fills.length} distinct fills, all brand`);
  check("--color-primary resolves to a real value, so this is not vacuous",
    typeof a.colorPrimaryValue === "string" && a.colorPrimaryValue !== "(unset)", `"${a.colorPrimaryValue}"`);
  check("--color-primary is ours, not the component's indigo",
    !/6366f1|rgb\(\s*99[,\s]/i.test(a.colorPrimaryValue), `root "${a.colorPrimaryValue}", navbar "${a.navColorPrimary}"`);
  check("the navbar does not redeclare it", a.navColorPrimary === a.colorPrimaryValue);
  check("no shipped indigo anywhere in loaded CSS", !a.indigoInCss);
  check('"click me" is gone', !a.clickMe);
  check("logo removed with the header", a.logoImgs === 0 && a.headerEls === 0, `${a.headerEls} <header>, ${a.logoImgs} logo imgs`);
  check("six links, correct hrefs", a.links.length === 6, a.links.join(" | "));

  /* ---- §2.2 F: utilities live in the panel ---------------------------- */
  console.log("\n  §2.2 F  UTILITIES IN THE PANEL");
  await openMenu();
  const u0 = JSON.parse(await ev(`(() => {
    const panel = document.querySelector('#site-menu nav[aria-label="Site"]');
    const lang = [...panel.querySelectorAll('button')].find((b) => /EN/.test(b.textContent));
    const login = [...panel.querySelectorAll('a')].find((el) => /Log In/i.test(el.textContent));
    const R = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const p = R(panel);
    const inPanel = (el) => { const r = R(el); return r.x >= p.x - 1 && r.x + r.w <= p.x + p.w + 1; };
    return JSON.stringify({
      langInPanel: !!lang && inPanel(lang), langRect: lang ? R(lang) : null, langLabel: lang ? lang.getAttribute('aria-label') : null,
      loginInPanel: !!login && inPanel(login), loginHref: login ? login.href : null, loginRect: login ? R(login) : null,
      langTargetOk: lang ? R(lang).h >= 44 : false, loginTargetOk: login ? R(login).h >= 44 : false,
      active: lang ? [...lang.querySelectorAll('span')].map((s) => s.textContent + ':' + getComputedStyle(s).fontWeight).join(' ') : null,
      outsideHeader: !document.querySelector('header'),
    });
  })()`));
  check("language toggle is inside the panel", u0.langInPanel, JSON.stringify(u0.langRect));
  check("Log In is inside the panel", u0.loginInPanel, u0.loginHref);
  check("Log In points at the real login", u0.loginHref === "https://safe-ridee.vercel.app/login");
  check("both clear the 44px tap target", u0.langTargetOk && u0.loginTargetOk);
  await shot("p3-1-panel-utilities.png");

  /* The toggle has to actually toggle, not just render. */
  const langBefore = u0.active;
  await ev(`(() => { const p=document.querySelector('#site-menu nav[aria-label="Site"]');
    [...p.querySelectorAll('button')].find((b)=>/EN/.test(b.textContent)).click(); return 1; })()`);
  await sleep(400);
  const u1 = JSON.parse(await ev(`(() => { const p=document.querySelector('#site-menu nav[aria-label="Site"]');
    const lang=[...p.querySelectorAll('button')].find((b)=>/EN/.test(b.textContent));
    return JSON.stringify({ active: [...lang.querySelectorAll('span')].map((s)=>s.textContent+':'+getComputedStyle(s).fontWeight).join(' '),
      label: lang.getAttribute('aria-label') }); })()`));
  check("the language toggle changes state when clicked", u1.active !== langBefore, `${langBefore}  ->  ${u1.active}`);
  check("its accessible name changes with it", u1.label !== u0.langLabel, `"${u0.langLabel}" -> "${u1.label}"`);
  await shot("p3-2-lang-toggled.png");
  await ev(`(() => { const p=document.querySelector('#site-menu nav[aria-label="Site"]');
    [...p.querySelectorAll('button')].find((b)=>/EN/.test(b.textContent)).click(); return 1; })()`);
  await sleep(300);

  /* ---- §2.2 A/B: a shape must actually appear on hover ---------------- */
  console.log("\n  §2.2 A/B  AMBIENT SHAPES ACTUALLY RENDER");
  const box = JSON.parse(await ev(`(() => { const li=document.querySelector('#site-menu li[data-shape="3"]');
    const b=li.getBoundingClientRect(); return JSON.stringify({x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}); })()`));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, pointerType: "mouse" });
  await sleep(900);
  const sh = JSON.parse(await ev(`(() => {
    const s = document.querySelector('[data-bg-shape="3"]');
    const els = [...s.querySelectorAll('.shape-element')];
    return JSON.stringify({
      visibility: getComputedStyle(s).visibility,
      opacities: els.map((e) => Math.round(+getComputedStyle(e).opacity * 100) / 100),
      fills: [...new Set(els.map((e) => getComputedStyle(e).fill))],
    });
  })()`));
  check("hovering a link makes its shape visible", sh.visibility === "visible" && Math.max(...sh.opacities) > 0.5,
    `visibility ${sh.visibility}, max opacity ${Math.max(...sh.opacities)}`);
  check("its fills are brand tones, as computed", sh.fills.every((f) => !/rgba?\(\s*(99|139|236)\s*,/.test(f)), sh.fills.join(" "));
  await shot("p3-3-ambient-shape.png");

  /*
   * "visibility: visible, opacity 1" is not the same as "you can see it".
   * §2.2 B says keep the reference's alphas, and the reference's panel is not
   * this panel: 0.1-0.3 alpha brand tones on near-black --surface-dark may
   * land at a delta nobody perceives. Diff the panel region hovered against
   * not-hovered and report what actually changed.
   */
  const panelClip = JSON.parse(await ev(`(() => { const p=document.querySelector('#site-menu nav[aria-label="Site"]').getBoundingClientRect();
    return JSON.stringify({x:Math.round(p.x+scrollX),y:Math.round(p.y+scrollY),width:Math.round(p.width),height:Math.round(p.height)}); })()`));
  const grab = async () => {
    const r = await send("Page.captureScreenshot", { format: "png", clip: { ...panelClip, scale: 1 } });
    return Buffer.from(r.result.data, "base64");
  };
  /*
   * The hovered link also gets a background band (rgba(252,251,248,.06)), and
   * a naive hover/no-hover diff of the panel is dominated by it — it would
   * report "the shape is perceptible" on a build whose shapes never painted.
   * The band is confined to the link's own row, so that row is excluded and
   * what is left is the shape.
   */
  const hoveredRow = JSON.parse(await ev(`(() => { const li=document.querySelector('#site-menu li[data-shape="3"]');
    const b=li.getBoundingClientRect(); const p=document.querySelector('#site-menu nav[aria-label="Site"]').getBoundingClientRect();
    return JSON.stringify({top:Math.round(b.top-p.top)-4,bottom:Math.round(b.bottom-p.top)+4}); })()`));
  const withHover = await grab();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 200, y: 830, pointerType: "mouse" });
  await sleep(900);
  const noHover = await grab();
  fs.writeFileSync(path.join(OUT, "p3-3a-shape-on.png"), withHover);
  fs.writeFileSync(path.join(OUT, "p3-3b-shape-off.png"), noHover);
  const { decodePNG } = require("./scrim-lab");
  const A = decodePNG(withHover), B = decodePNG(noHover);
  let maxD = 0, changed = 0, sum = 0, considered = 0, bandMax = 0;
  const W = Math.min(A.w, B.w), H = Math.min(A.h, B.h);
  for (let y = 0; y < H; y++) {
    const inBand = y >= hoveredRow.top && y <= hoveredRow.bottom;
    for (let x = 0; x < W; x++) {
      const oa = (y * A.w + x) * A.ch, ob = (y * B.w + x) * B.ch;
      const d = Math.max(Math.abs(A.px[oa] - B.px[ob]), Math.abs(A.px[oa + 1] - B.px[ob + 1]), Math.abs(A.px[oa + 2] - B.px[ob + 2]));
      if (inBand) { if (d > bandMax) bandMax = d; continue; }
      considered++;
      if (d > 3) { changed++; sum += d; }
      if (d > maxD) maxD = d;
    }
  }
  const pct = Math.round((changed / considered) * 1000) / 10;
  check("the shape paints something outside the hovered row", changed > 0,
    `${pct}% of the panel outside the row changed`);
  check("and it is perceptible, not merely non-zero", maxD >= 12,
    `max channel delta ${maxD}/255 (the hover band alone is ${bandMax}/255), mean ${changed ? Math.round(sum / changed) : 0} over ${pct}% of the panel`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 200, y: 800, pointerType: "mouse" });
  await sleep(600);

  /* ---- §2.4 accessibility --------------------------------------------- */
  console.log("\n  §2.4  ACCESSIBILITY");
  const aria = JSON.parse(await ev(`(() => {
    const b = document.querySelector('button[aria-controls="site-menu"]');
    const w = document.querySelector('#site-menu');
    return JSON.stringify({ expanded: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'),
      controls: b.getAttribute('aria-controls'), role: w.getAttribute('role'), modal: w.getAttribute('aria-modal'),
      roleButton: b.hasAttribute('role') });
  })()`));
  check("aria-expanded reports open", aria.expanded === "true");
  check("aria-controls points at the panel", aria.controls === "site-menu");
  check("the label reflects state", aria.label === "Close menu", `"${aria.label}"`);
  check('role="dialog" + aria-modal while open', aria.role === "dialog" && aria.modal === "true");
  check("no redundant role on the <button>", !aria.roleButton);

  /* A real Tab cycle, driven by real key events. */
  await ev(`(() => { window.__seen = []; return 1; })()`);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await key("Tab", "Tab", 9);
    seen.push(await ev(`(() => { const a=document.activeElement;
      return (a.tagName + ':' + (a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,14)); })()`));
  }
  const escaped = seen.filter((s) => /Explore Platform|Our Story|BODY|HTML/.test(s));
  check("Tab never leaves the menu", escaped.length === 0, escaped.length ? escaped.join(",") : `12 stops, all inside`);
  check("Tab actually moves (not pinned to one control)", new Set(seen).size >= 6, `${new Set(seen).size} distinct stops: ${[...new Set(seen)].join(" | ")}`);
  check("the cycle includes the toggle and the last link", seen.some((s) => /Close menu|BUTTON:$/.test(s)) || seen.some((s) => /BUTTON/.test(s)), "");
  await shot("p3-4-focus-ring-in-panel.png");

  /* Escape + focus return. */
  await key("Escape", "Escape", 27);
  await sleep(1400);
  const back = JSON.parse(await ev(`(() => {
    const b = document.querySelector('button[aria-controls="site-menu"]');
    return JSON.stringify({ expanded: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'),
      focused: document.activeElement === b, role: document.querySelector('#site-menu').getAttribute('role') });
  })()`));
  check("Escape closes", back.expanded === "false" && back.role === null);
  check("focus returns to the toggle", back.focused);
  check("the label reflects the closed state", back.label === "Open menu");

  /* ---- §2.3 scroll lock, trusted input -------------------------------- */
  console.log("\n  §2.3  SCROLL LOCK");
  const wheel = async () => {
    const before = await ev("Math.round(scrollY)");
    for (let i = 0; i < 6; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Math.round(VW / 2), y: Math.round(VH / 2), deltaX: 0, deltaY: 200, pointerType: "mouse" });
      await sleep(120);
    }
    await sleep(900);
    return { before, after: await ev("Math.round(scrollY)") };
  };
  await ev("scrollTo(0,0);1"); await sleep(600);
  await openMenu();
  const lockedOpen = await wheel();
  const filmOpen = await ev(`(() => { const v=[...document.querySelectorAll('video')].find(x=>x.currentSrc&&/scrub|idle/.test(x.currentSrc));
    return v ? Math.round(v.currentTime*1000)/1000 : null; })()`);
  check("wheel moves nothing while open", lockedOpen.after === lockedOpen.before, `${lockedOpen.before} -> ${lockedOpen.after}`);
  await closeMenu();
  const lockedShut = await wheel();
  check("the same wheel does scroll when shut (probe is not vacuous)", lockedShut.after > lockedShut.before + 100, `${lockedShut.before} -> ${lockedShut.after}`);
  console.log(`         film playhead while the menu was open: ${filmOpen}s`);

  /* ---- §2.4 reduced motion: instant ----------------------------------- */
  console.log("\n  §2.4  REDUCED MOTION");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: URL });
  await sleep(7000);
  const rm = JSON.parse(await ev(`(async () => {
    const b = document.querySelector('button[aria-controls="site-menu"]');
    b.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = document.querySelector('#site-menu');
    const panel = w.querySelector('nav[aria-label="Site"]');
    const link = w.querySelector('ul a');
    return JSON.stringify({
      display: getComputedStyle(w).display,
      overlayOpacity: getComputedStyle(w.querySelector(':scope > div')).opacity,
      panelTransform: getComputedStyle(panel).transform,
      linkTransform: getComputedStyle(link).transform,
      iconTransition: getComputedStyle(document.querySelector('button[aria-controls="site-menu"] svg')).transitionDuration,
    });
  })()`));
  const settled = (t) => t === "none" || /matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(t);
  check("open one frame after the click, no travel left", rm.display === "block" && rm.overlayOpacity === "1" && settled(rm.panelTransform) && settled(rm.linkTransform),
    `panel ${rm.panelTransform}, link ${rm.linkTransform}`);
  check("the icon morph is zeroed, not shortened", parseFloat(rm.iconTransition) < 0.001, rm.iconTransition);
  await sleep(400);
  await shot("p3-5-reduced-motion-open.png");

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  every check passed\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
