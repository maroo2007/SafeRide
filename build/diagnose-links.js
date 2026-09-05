/**
 * Per-link entrance timing, measured rather than read off the timeline.
 *
 * The question: does the first link enter differently from the other five?
 *
 * Reading the tween config would only tell me what was requested. This records
 * every link's ACTUAL computed transform every frame, decomposes the matrix
 * into translateY and rotation, and derives each link's own start and end from
 * when its transform leaves 140%/10deg and when it reaches 0/0. If the six
 * differ by anything other than the intended 0.05 stagger, the difference is
 * in the numbers, not in my reading of them.
 *
 * It also records, per frame and per link:
 *   - the NodeList `.nav-link` resolves to, in DOM order, with each link's
 *     index, so a link being selected separately would show up
 *   - each row's scrollTop. An overflow:hidden box is still programmatically
 *     scrollable, and .focus() scrolls every ancestor to reveal its target —
 *     including overflow:hidden ones. A row scrolled by focus would move its
 *     link inside the mask without touching the transform, which looks exactly
 *     like "arrived early".
 *   - each row's height, since yPercent is relative to the element's own box
 *   - any inline style or data-menu-fade on a link
 *
 * Usage: node build/diagnose-links.js <profile-dir> <out-dir> [url] [--headed]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = (process.argv[4] && !process.argv[4].startsWith("--")) ? process.argv[4] : "http://localhost:3000/";
const HEADED = process.argv.includes("--headed");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : d; };
const VW = arg("w", 1440), VH = arg("h", 900), PORT = arg("port", 9688);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

const RECORDER = `(() => {
  const links = () => [...document.querySelectorAll('#site-menu ul a')];
  const decompose = (t) => {
    if (!t || t === 'none') return { ty: 0, deg: 0 };
    const m = /matrix\\(([^)]+)\\)/.exec(t);
    if (!m) return { ty: 0, deg: 0 };
    const n = m[1].split(',').map(Number);
    return { ty: Math.round(n[5] * 100) / 100, deg: Math.round(Math.atan2(n[1], n[0]) * 18000 / Math.PI) / 100 };
  };
  window.__L = [];
  const t0 = performance.now();
  const tick = () => {
    const now = performance.now();
    window.__L.push({
      t: Math.round(now - t0),
      links: links().map((el, i) => {
        const li = el.closest('li');
        const cs = getComputedStyle(el);
        return {
          i, label: el.textContent.trim().slice(0, 12),
          ...decompose(cs.transform),
          opacity: cs.opacity,
          rowScroll: Math.round(li.scrollTop),
          rowH: Math.round(li.getBoundingClientRect().height),
          linkH: Math.round(el.getBoundingClientRect().height),
          rowClip: getComputedStyle(li).overflow,
          inline: el.getAttribute('style') || '',
          fade: el.hasAttribute('data-menu-fade') || !!el.closest('[data-menu-fade]'),
          y: Math.round(el.getBoundingClientRect().y),
        };
      }),
    });
    if (now - t0 < 2400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 1;
})()`;

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

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(9000);
  await ev("scrollTo(0,0);1"); await sleep(1200);

  /* 1. what does the selector resolve to, at animation time? */
  const set = await ev(`(() => {
    const all = [...document.querySelectorAll('#site-menu ul a')];
    const cls = all[0] ? [...all[0].classList].find((c) => /navLink/.test(c)) : null;
    const byClass = cls ? [...document.querySelectorAll('.' + cls)] : [];
    return JSON.stringify({
      moduleClass: cls,
      countByClass: byClass.length,
      domOrder: byClass.map((el) => el.textContent.trim().slice(0, 12)),
      sameSetAsUl: byClass.length === all.length && byClass.every((el, i) => el === all[i]),
      withFadeAttr: all.filter((el) => el.hasAttribute('data-menu-fade') || !!el.closest('[data-menu-fade]')).map((el) => el.textContent.trim().slice(0, 12)),
      fadeTargets: [...document.querySelectorAll('[data-menu-fade]')].map((el) => el.tagName + '.' + (el.className || '').slice(0, 24)),
    });
  })()`);
  const s0 = JSON.parse(set);
  console.log(`\n  1. TARGET SET`);
  console.log(`     .nav-link resolves to ${s0.countByClass} elements via the module class "${s0.moduleClass}"`);
  console.log(`     DOM order: ${s0.domOrder.join(" -> ")}`);
  console.log(`     identical to the six <li> anchors: ${s0.sameSetAsUl}`);
  console.log(`  5. data-menu-fade on any link: ${s0.withFadeAttr.length ? s0.withFadeAttr.join(",") : "none"}`);
  console.log(`     fade tween targets: ${s0.fadeTargets.join(", ") || "none"}`);

  await ev(RECORDER);
  await ev(`document.querySelector('button[aria-controls="site-menu"]').click();1`);
  await sleep(2800);
  const frames = JSON.parse(await ev("JSON.stringify(window.__L)"));
  fs.writeFileSync(path.join(OUT, "links.json"), JSON.stringify(frames, null, 1));

  /* 4. the mask */
  const f0 = frames.find((f) => f.links.some((l) => Math.abs(l.ty) > 1)) || frames[0];
  console.log(`\n  4. ROWS`);
  for (const l of f0.links) {
    console.log(`     ${String(l.i)} ${l.label.padEnd(12)} row ${String(l.rowH).padStart(3)}px  link ${String(l.linkH).padStart(3)}px  overflow ${l.rowClip}  rowScroll ${l.rowScroll}  inline "${l.inline}"`);
  }
  const rowScrolled = frames.filter((f) => f.links.some((l) => l.rowScroll !== 0));
  console.log(`     frames with a row scrolled by anything (focus included): ${rowScrolled.length}/${frames.length}` +
    (rowScrolled.length ? `  FIRST at t=${rowScrolled[0].t}ms: ` + rowScrolled[0].links.filter((l) => l.rowScroll).map((l) => `${l.label}=${l.rowScroll}px`).join(" ") : ""));

  /* 2. per-link start and end, derived from the transforms actually applied */
  console.log(`\n  2. PER-LINK ENTRANCE, from the computed transform each frame`);
  console.log(`     idx  label         travel   starts   ends    duration   vs Features`);
  const times = [];
  for (let i = 0; i < f0.links.length; i++) {
    const series = frames.map((f) => ({ t: f.t, ty: f.links[i].ty, deg: f.links[i].deg }));
    const moving = series.filter((p) => Math.abs(p.ty) > 0.5 || Math.abs(p.deg) > 0.05);
    const travel = Math.max(...series.map((p) => Math.abs(p.ty)));
    /* start: last frame still at full travel. end: first frame at rest that
       stays at rest. */
    const atFull = series.filter((p) => Math.abs(p.ty) >= travel - 0.5);
    const start = atFull.length ? atFull[atFull.length - 1].t : null;
    let end = null;
    for (let k = 0; k < series.length; k++) {
      if (Math.abs(series[k].ty) <= 0.5 && Math.abs(series[k].deg) <= 0.05 && series.slice(k).every((p) => Math.abs(p.ty) <= 0.5)) { end = series[k].t; break; }
    }
    times.push({ i, label: f0.links[i].label, travel, start, end, moving: moving.length });
  }
  const base = times[0];
  for (const r of times) {
    console.log(`     ${String(r.i).padEnd(4)} ${r.label.padEnd(13)} ${String(r.travel).padStart(6)}px ${String(r.start).padStart(7)}ms ${String(r.end).padStart(7)}ms ${String((r.end ?? 0) - (r.start ?? 0)).padStart(8)}ms   start ${r.start !== null && base.start !== null ? (r.start - base.start >= 0 ? "+" : "") + (r.start - base.start) : "?"}ms`);
  }

  /* Snapshot of all six at a few instants, to see them travelling together. */
  console.log(`\n     all six, translateY(px) at a few instants:`);
  for (const f of frames) {
    if (f.t % 120 > 20) continue;
    if (f.t > 1500) continue;
    console.log(`       t=${String(f.t).padStart(4)}  ` + f.links.map((l) => `${l.label.slice(0, 3)}:${String(l.ty).padStart(6)}`).join("  "));
  }

  /* ---- assertions, so this is a guard and not a report ---------------- */
  const fails = [];

  /*
   * The one that matters. "Focus moved into the panel" is true of the broken
   * build — focus DID move, and that is what scrolled the row. What has to
   * hold is that no ancestor was scrolled to achieve it.
   */
  if (rowScrolled.length) {
    fails.push(`a row was scrolled during the entrance (${rowScrolled.length}/${frames.length} frames)`);
  }

  /* Same travel for all six: a different mask height would change it. */
  const travels = [...new Set(times.map((r) => r.travel))];
  if (travels.length !== 1) fails.push(`links travel different distances: ${travels.join(", ")}px`);

  /* Same duration for all six, within a frame and a half. */
  const durs = times.map((r) => (r.end ?? 0) - (r.start ?? 0));
  if (Math.max(...durs) - Math.min(...durs) > 50) fails.push(`durations differ by ${Math.max(...durs) - Math.min(...durs)}ms`);

  /* Monotonic stagger, first to last, and nobody starts before the first. */
  for (let i = 1; i < times.length; i++) {
    if (times[i].start < times[i - 1].start) fails.push(`${times[i].label} starts before ${times[i - 1].label}`);
  }

  /*
   * No overshoot. The link's VISIBLE position inside its row is its transform
   * minus whatever the row is scrolled by, and it must approach the resting
   * line from below and stop there — never cross it. On the broken build
   * Features reached -13px, i.e. 13px above where it lands.
   */
  let worstOver = 0, overLabel = null;
  for (const f of frames) {
    for (const l of f.links) {
      const visible = l.ty - l.rowScroll;
      if (visible < worstOver) { worstOver = visible; overLabel = `${l.label} at t=${f.t}ms`; }
    }
  }
  if (worstOver < -1) fails.push(`overshoot: ${overLabel} sits ${Math.abs(Math.round(worstOver))}px past its resting line`);
  console.log(`
  ASSERTIONS`);
  console.log(`     rows never scrolled            ${rowScrolled.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`     equal travel                   ${travels.length === 1 ? "PASS" : "FAIL"}  (${travels.join(", ")}px)`);
  console.log(`     equal duration                 ${Math.max(...durs) - Math.min(...durs) <= 50 ? "PASS" : "FAIL"}  (spread ${Math.max(...durs) - Math.min(...durs)}ms)`);
  console.log(`     stagger in DOM order           ${times.every((r, i) => i === 0 || r.start >= times[i - 1].start) ? "PASS" : "FAIL"}`);
  console.log(`     no link overshoots its slot    ${worstOver >= -1 ? "PASS" : "FAIL"}  (worst ${Math.round(worstOver * 10) / 10}px${overLabel ? ", " + overLabel : ""})`);

  /* Pictures. */
  console.log("");
  for (const ms of [420, 520, 620, 720]) {
    await ev(`(async()=>{const b=document.querySelector('button[aria-controls="site-menu"]');
      if(b.getAttribute('aria-expanded')==='true'){b.click();await new Promise(r=>setTimeout(r,1300));}
      scrollTo(0,0);return 1})()`);
    await sleep(400);
    await ev(`(()=>{window.__t0=performance.now();document.querySelector('button[aria-controls="site-menu"]').click();return 1})()`);
    await sleep(ms);
    const st = await ev(`(()=>{const links=[...document.querySelectorAll('#site-menu ul a')];
      const d=(t)=>{const m=/matrix\\(([^)]+)\\)/.exec(t||'');if(!m)return 0;return Math.round(Number(m[1].split(',')[5])*10)/10;};
      return JSON.stringify({e:Math.round(performance.now()-window.__t0),
        ty:links.map((el)=>d(getComputedStyle(el).transform))})})()`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `links-${ms}ms.png`), Buffer.from(shot.result.data, "base64"));
    const j = JSON.parse(st);
    console.log(`   t~${String(j.e).padStart(4)}ms  translateY = [${j.ty.join(", ")}]`);
  }

  console.log(fails.length ? `  FAILED: ${fails.join("; ")}` : "  all checks pass");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
