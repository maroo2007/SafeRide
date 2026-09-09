/**
 * The moving ground's contract (build spec §4b).
 *
 * ── The two guards the brief names, and why they are shaped this way ──────
 *
 * SEAMLESS LOOP. Not `video.loop === true`, which is a property that is true
 * on every looping video including one that jumps. This decodes the LAST
 * frame and the FIRST frame of the file the server actually served, diffs
 * them, and compares that against the diff of an ordinary adjacent pair from
 * the middle of the clip. A seam is only a seam if the wraparound is worse
 * than a normal step; the control is what makes the number mean anything.
 *
 * WORST-FRAME CONTRAST PER SECTION, ANCESTORS WALKED. The ground is a video,
 * so there is no `background-color` to read anywhere — computing contrast
 * from styles would report the same figure for every frame of the clip and
 * for a video that failed to load. This seeks the video across its whole
 * duration and, at each time, samples a 6px ring of REAL PIXELS around every
 * text box, taking the ring pixel that minimises contrast. That is the same
 * method as verify-ground-contrast.js and for the same reason: this project
 * has repeatedly shipped guards that read a property next to the subject.
 *
 * "Ancestors walked" is satisfied by construction rather than by traversal —
 * a screenshot pixel already IS every ancestor composited, including the
 * video, the card fill over it and any opacity on the way up.
 *
 * ── The network assertion is causal, not chronological ────────────────────
 *
 * "Loads last" is checked by HOLDING the video request with Fetch and asking
 * the page, at that instant, whether the tour has declared itself ready.
 * Comparing two timestamps afterwards would pass if the request merely
 * happened to be slow.
 *
 * Usage: node build/verify-background.js <profile> [--port=] [--w=1440] [--h=900]
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
const PORT0 = +arg("port", 9700);
const VW = +arg("w", 1440), VH = +arg("h", 900);
const VIDEO_URL = "ground-av1.mp4";
/* --strength= sweeps --ground-strength before measuring, so the value that
   ships is the one a contrast sweep chose rather than one that looked right. */
const STRENGTH = arg("strength", "");
/* --sweep=1,0.7,0.55 measures ONLY the contrast, at each of those strengths,
   in a single browser session. Re-running the whole suite per value costs a
   network session, a seek-heavy loop check and a scroll test that none of the
   values change. */
const SWEEP = arg("sweep", "").split(",").filter(Boolean);
/* --noground hides the whole layer and measures anyway: the control for every
   contrast figure here. A section that is already marginal WITHOUT the video
   is not a section the video broke, and without this the guard would blame it
   for whatever it found. */
const NOGROUND = process.argv.includes("--noground");
/* Below the breakpoint the tour builds no scene and raises no ready flag, so
   the correct gate there is the hero. Asserting the desktop gate on a phone
   fails a build that is behaving exactly as designed. */
const NARROW = VW < 768;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getRaw = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log("   " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "   " + detail : ""));
  if (!ok) fails.push(name);
};

/* sRGB relative luminance, WCAG 2.x. */
const lum = (c) => {
  const f = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

let seq = 0;
async function session({ reduced, w = VW, h = VH, holdVideo = false }) {
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
  if (!t) throw new Error("verify-background: no debugger target on " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  const requests = [];
  /* Filled when the held video request is intercepted: what the page's
     readiness looked like at the instant the request went out. */
  let atRequest = null;
  ws.on("message", async (m) => {
    const x = JSON.parse(m.toString());
    if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); return; }
    if (x.method === "Network.requestWillBeSent") requests.push(x.params.request.url);
    if (x.method === "Fetch.requestPaused") {
      const r = await send("Runtime.evaluate", {
        expression: "JSON.stringify({ready:document.documentElement.hasAttribute('data-tour-ready'),"
          + "hero:document.documentElement.hasAttribute('data-hero-playing'),"
          + "loader:!!document.querySelector('[data-load-screen]'),t:Math.round(performance.now())})",
        returnByValue: true,
      });
      try { atRequest = JSON.parse(r.result.result.value); } catch { atRequest = { parseFailed: true }; }
      await send("Fetch.continueRequest", { requestId: x.params.requestId });
    }
  });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async () => decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (holdVideo) await send("Fetch.enable", { patterns: [{ urlPattern: "*" + VIDEO_URL + "*" }] });
  await send("Page.navigate", { url: BASE });
  return { ws, ch, ev, send, shot, requests, at: () => atRequest, close: () => { ws.close(); ch.kill(); } };
}

const waitFor = async (s, expr, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await s.ev(expr)) return true; await sleep(250); }
  return false;
};

(async () => {
  console.log("\n  THE MOVING GROUND — " + BASE + "   " + VW + "x" + VH + "\n");

  /* ---- 1. what the SERVER sends -------------------------------------- */
  const html = await getRaw(BASE);
  console.log("   SERVER-RENDERED GROUND");
  check("the still frame is the ground in the initial HTML",
    /ground-still\.webp/.test(html) && /bg-video-still/.test(html));
  check("the VIDEO is not in the markup at all (it cannot start early if it does not exist)",
    !new RegExp(VIDEO_URL).test(html));

  /* ---- 2. loads last, asserted at the moment the request goes out ----- */
  console.log("\n   WHEN THE VIDEO LOADS");
  const s = await session({ holdVideo: true });
  const got = await waitFor(s, "!!document.querySelector('.bg-video-film')", 40000);
  check("the video is attached at all", got);
  /*
   * WAIT FOR THE REQUEST, not just for the element.
   *
   * Setting src and appending the element is synchronous; the fetch it starts
   * is not. Reading the interception the moment the element appeared reported
   * "the request was never intercepted" on a build that requests the file
   * perfectly well - the harness was simply looking before it happened.
   */
  for (let i = 0; i < 80 && s.at() === null; i++) await sleep(250);
  const at = s.at();
  check(NARROW
    ? "the hero was already playing when the video's first byte was requested (no tour scene at this width)"
    : "the tour scene was ALREADY ready when the video's first byte was requested",
    !!(at && (NARROW ? at.hero === true : at.ready === true)),
    at ? "at request: tour-ready=" + at.ready + ", loader still up=" + at.loader + ", t=" + at.t + "ms" : "the request was never intercepted");

  /* The video must be the LAST of the page's heavy assets. */
  const heavy = s.requests.filter((u) => /\.(mp4|glb|webm)(\?|$)/.test(u));
  const idx = heavy.findIndex((u) => u.includes(VIDEO_URL));
  check("it is the last heavy asset requested",
    idx === heavy.length - 1 && idx >= 0,
    heavy.map((u) => u.split("/").pop()).join(" -> "));

  /* ---- 3. the loop, diffed either side of the wraparound -------------- */
  console.log("\n   THE LOOP, DIFFED ACROSS THE WRAPAROUND");
  /* No backticks inside this string: it is a template literal. */
  const seamRaw = await s.ev(`(async () => {
    const v = document.querySelector('.bg-video-film');
    if (!v) return JSON.stringify({ err: 'no video element' });
    /* Metadata first. The element exists as soon as it is appended, and
       seeking it before duration is a number throws "non-finite value" - which
       is a harness race reported as a seam failure. */
    for (let i = 0; i < 120 && !(v.readyState >= 1 && isFinite(v.duration)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!isFinite(v.duration)) return JSON.stringify({ err: 'video metadata never loaded' });
    v.pause();
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d', { willReadFrequently: true });
    const grab = (t) => new Promise((res) => {
      const done = () => { v.removeEventListener('seeked', done); g.drawImage(v, 0, 0, c.width, c.height);
        res(g.getImageData(0, 0, c.width, c.height).data); };
      v.addEventListener('seeked', done);
      v.currentTime = t;
    });
    const diff = (a, b) => {
      let s = 0, n = 0;
      for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]); n += 3; }
      return s / n;
    };
    const D = v.duration, F = 1 / 30;
    /* Either side of the wraparound: the final frame, and the frame that
       follows it, which is the first. */
    const last = await grab(Math.max(0, D - F * 0.5));
    const first = await grab(0);
    /* The control: an ordinary adjacent pair from the middle of the clip. */
    const midA = await grab(D * 0.5);
    const midB = await grab(D * 0.5 + F);
    return JSON.stringify({
      wrap: +diff(last, first).toFixed(3),
      normal: +diff(midA, midB).toFixed(3),
      duration: +D.toFixed(3),
    });
  })()`);
  let seam;
  try { seam = JSON.parse(seamRaw); }
  catch { seam = { err: "the page returned " + JSON.stringify(seamRaw) }; }
  if (seam.err) check("the wraparound is no worse than an ordinary frame step", false, seam.err);
  else {
    check("the wraparound is no worse than an ordinary frame step",
      seam.wrap <= seam.normal * 1.6,
      "wraparound " + seam.wrap + " vs a normal step " + seam.normal
        + " (mean abs channel difference; lower is more similar), duration " + seam.duration + "s");
  }

  /* ---- 4. paused while the tour is on screen ------------------------- */
  console.log("\n   PAUSED BEHIND THE TOUR");
  const tour = JSON.parse(await s.ev(`(async () => {
    const v = document.querySelector('.bg-video-film');
    const rw = document.querySelector('[data-tour-runway]');
    if (!v || !rw) return JSON.stringify({ err: 'missing video or runway' });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    v.play().catch(() => {});
    await wait(600);
    const before = v.paused;
    const top = Math.round(rw.getBoundingClientRect().top + scrollY);
    scrollTo(0, top + Math.round((rw.offsetHeight - innerHeight) * 0.5));
    await wait(900);
    const during = v.paused;
    scrollTo(0, top + rw.offsetHeight + innerHeight);
    await wait(900);
    const after = v.paused;
    scrollTo(0, 0);
    await wait(400);
    return JSON.stringify({ before, during, after });
  })()`));
  if (tour.err && NARROW) {
    /* Not a skip that hides a failure: at this width there IS no runway, and
       a pause test for a section that does not exist would be measuring
       nothing. The DOM claim is asserted instead. */
    check("there is no tour runway at this width, so there is nothing to pause behind",
      !(await s.ev("!!document.querySelector('[data-tour-runway]')")));
  } else if (tour.err) check("the video pauses over the tour and resumes past it", false, tour.err);
  else check("the video pauses over the tour and resumes past it",
    tour.before === false && tour.during === true && tour.after === false,
    "above the tour paused=" + tour.before + ", over it paused=" + tour.during + ", past it paused=" + tour.after);

  /* ---- 5. worst-frame contrast per section, across the whole clip ----- */
  console.log("\n   WORST-FRAME CONTRAST PER SECTION, across the whole clip");
  const secs = JSON.parse(await s.ev(`JSON.stringify(
    Array.from(document.querySelectorAll('main section[id], main div[id]'))
      .filter((e) => e.offsetHeight > 200)
      .map((e) => ({ id: e.id, top: Math.round(e.getBoundingClientRect().top + scrollY), h: e.offsetHeight })))`));

  /* Text worth measuring: real copy, not icons or empty nodes. */
  const inkAt = (id) => s.ev(`JSON.stringify((() => {
    const host = document.getElementById('${id}');
    if (!host) return [];
    const out = [];
    for (const e of host.querySelectorAll('h1,h2,h3,p,li,td,th,span,a,button,figcaption,dt,dd')) {
      if (e.children.length && !Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const txt = (e.textContent || '').trim();
      if (txt.length < 4) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 24 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      /*
       * AN ELEMENT THAT PAINTS ITS OWN OPAQUE GROUND IS MEASURED AGAINST IT.
       *
       * The ring is sampled OUTSIDE the element box, which is the right
       * ground for text that has none of its own. For a filled pill it is the
       * card behind the pill - adjacent, not underneath. The badge measured
       * 1.00:1 that way, which is the guard reading the wrong surface and not
       * a contrast failure, and it is the same defect this project has
       * already fixed twice elsewhere.
       */
      const own = cs.backgroundColor;
      const oa = own.match(/rgba?\(([^)]+)\)/);
      const parts = oa ? oa[1].split(',').map(Number) : null;
      const opaqueOwn = parts && (parts.length < 4 || parts[3] === 1) ? own : null;
      out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        color: cs.color, ownBg: opaqueOwn, size: parseFloat(cs.fontSize), weight: cs.fontWeight, sample: txt.slice(0, 26) });
    }
    return out;
  })())`);

  const seekTo = (t) => s.ev(`(async () => {
    const v = document.querySelector('.bg-video-film');
    if (!v) return 0;
    v.pause();
    await new Promise((res) => { const d = () => { v.removeEventListener('seeked', d); res(); }; v.addEventListener('seeked', d); v.currentTime = ${t}; });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return v.currentTime;
  })()`);

  const dur = seam.duration || 8.93;
  /* Stops across the clip. The ribbons are slow, so the worst moment for a
     given piece of copy is not near a cut - it is wherever a dark band happens
     to drift under it, and that has to be swept for. */
  /*
   * The SAME resolution as the verdict run, deliberately.
   *
   * The sweep used 6 stops to be quick and chose 0.4 on the strength of the
   * tour measuring 4.63; the 12-stop verdict run then found a worse moment in
   * the same clip and the same section, at 4.47. A sweep that samples more
   * coarsely than the check it is feeding will keep choosing values that fail
   * the check.
   */
  const nTimes = 12;
  const TIMES = Array.from({ length: nTimes }, (_, i) => +(i * (dur / nTimes)).toFixed(2));

  const setStrength = async (v) => {
    await s.ev(`document.querySelectorAll('.bg-video').forEach((e)=>e.style.setProperty('--ground-strength','${v}'));1`);
    const applied = await s.ev("getComputedStyle(document.querySelector('.bg-video')).opacity");
    /* Never measure a strength that did not land. */
    if (Math.abs(parseFloat(applied) - parseFloat(v)) > 0.001) {
      throw new Error("ground strength " + v + " did not apply (computed " + applied + ")");
    }
  };

  const measureContrast = async () => {
    const worstBySec = new Map();
    for (const sec of secs) {
      await s.ev(`(async()=>{scrollTo(0,${Math.max(0, sec.top + 8)});await new Promise(r=>setTimeout(r,500));return 1})()`);
      const ink = JSON.parse(await inkAt(sec.id));
      if (!ink.length) continue;
      for (const t of TIMES) {
        await seekTo(t);
        const img = await s.shot();
        for (const e of ink) {
          const m = e.color.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (!m) continue;
          const fg = [+m[1], +m[2], +m[3]];
          const large = e.size >= 24 || (e.size >= 18.66 && +e.weight >= 700);
          const need = large ? 3 : 4.5;
          const keep = (worst, ground) => {
            const prev = worstBySec.get(sec.id);
            if (!prev || worst < prev.worst) {
              worstBySec.set(sec.id, { worst: +worst.toFixed(2), need, at: t, sample: e.sample,
                size: Math.round(e.size), ground });
            }
          };
          /* Its own fill is what is directly under its glyphs. Exact, and not
             a neighbour - the ring would find the card behind a filled pill. */
          if (e.ownBg) {
            const bm = e.ownBg.match(/(\d+),\s*(\d+),\s*(\d+)/);
            if (bm) { keep(ratio(fg, [+bm[1], +bm[2], +bm[3]]), "own fill " + e.ownBg); continue; }
          }
          const R = 6, ring = [];
          for (let yy = e.y - R; yy < e.y + e.h + R; yy++) {
            for (let xx = e.x - R; xx < e.x + e.w + R; xx++) {
              const inside = xx >= e.x && xx < e.x + e.w && yy >= e.y && yy < e.y + e.h;
              if (inside || xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
              const o = (yy * img.w + xx) * img.ch;
              ring.push([img.px[o], img.px[o + 1], img.px[o + 2]]);
            }
          }
          if (ring.length < 40) continue;
          const med = [0, 1, 2].map((k) => { const a = ring.map((p) => p[k]).sort((x, y2) => x - y2); return a[a.length >> 1]; });
          /* Foreign objects - a card border, a neighbouring glyph - are not
             the ground. Without this the worst pixel is whatever is next door. */
          const clean = ring.filter((p) => Math.max(...p.map((v, k) => Math.abs(v - med[k]))) <= 40);
          if (clean.length < 20) continue;
          let worst = Infinity, px = med;
          for (const p of clean) { const r2 = ratio(fg, p); if (r2 < worst) { worst = r2; px = p; } }
          keep(worst, "rgb(" + px.join(",") + ")");
        }
      }
    }
    return worstBySec;
  };

  if (SWEEP.length) {
    console.log("\n   SWEEPING --ground-strength (worst text contrast per section)\n");
    const head = "     " + "section".padEnd(14) + SWEEP.map((v) => ("s=" + v).padStart(9)).join("");
    const rows = new Map();
    for (const v of SWEEP) {
      await setStrength(v);
      const w = await measureContrast();
      for (const [id, r] of w) {
        if (!rows.has(id)) rows.set(id, {});
        rows.get(id)[v] = r;
      }
    }
    console.log(head);
    for (const [id, byV] of rows) {
      const need = byV[SWEEP[0]].need;
      console.log("     " + id.padEnd(14) + SWEEP.map((v) => {
        const r = byV[v];
        return ((r ? r.worst.toFixed(2) : "-") + (r && r.worst >= r.need ? " " : "!")).padStart(9);
      }).join("") + "   needs " + need);
    }
    console.log("\n     ! = below the threshold for that text size\n");
    s.close();
    process.exit(0);
  }

  if (STRENGTH) await setStrength(STRENGTH);
  if (NOGROUND) {
    await s.ev("document.querySelectorAll('.bg-video').forEach((e)=>e.style.display='none');1");
    const gone = await s.ev("getComputedStyle(document.querySelector('.bg-video')).display");
    if (gone !== "none") throw new Error("--noground did not take (display " + gone + ")");
    console.log("     (CONTROL RUN — the ground layer is hidden)");
  }
  const worstBySec = await measureContrast();

  let contrastOk = true;
  for (const [id, r] of worstBySec) {
    const ok = r.worst >= r.need;
    if (!ok) contrastOk = false;
    console.log("     " + (ok ? "ok  " : "LOW ") + id.padEnd(14) + r.worst.toFixed(2).padStart(6) + ":1"
      + "  (needs " + r.need + ")  worst at t=" + r.at + "s on " + JSON.stringify(r.sample)
      + " " + r.size + "px over " + r.ground);
  }
  check("every section clears WCAG AA against the worst video frame under it", contrastOk,
    worstBySec.size + " sections measured at " + TIMES.length + " points across the clip");
  s.close();

  /* ---- 6. reduced motion, and mobile --------------------------------- */
  console.log("\n   REDUCED MOTION");
  const rm = await session({ reduced: true });
  await waitFor(rm, "document.documentElement.hasAttribute('data-tour-ready')", 40000);
  await sleep(3000);
  check("no video element is ever created", !(await rm.ev("!!document.querySelector('.bg-video-film')")));
  check("and the file is never requested", !rm.requests.some((u) => u.includes(VIDEO_URL)),
    rm.requests.filter((u) => u.includes(VIDEO_URL)).length + " requests for it");
  check("the still is still the ground", !!(await rm.ev("!!document.querySelector('.bg-video-still')")));
  rm.close();

  console.log("\n   MOBILE (390)");
  const mob = await session({ w: 390, h: 844 });
  await sleep(12000);
  const mobHasVideo = await mob.ev("!!document.querySelector('.bg-video-film')");
  const mobFetched = mob.requests.some((u) => u.includes(VIDEO_URL));
  check("the mobile decision is applied consistently in DOM and on the network",
    mobHasVideo === mobFetched,
    "video element=" + mobHasVideo + ", file requested=" + mobFetched);
  check("the still is the ground at 390", !!(await mob.ev("!!document.querySelector('.bg-video-still')")));
  mob.close();

  console.log("\n  " + (fails.length ? "FAILED: " + fails.join(" | ") : "all checks pass") + "\n");
  process.exit(fails.length ? 1 : 0);
})();
