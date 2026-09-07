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
    /* By data attribute, and it THROWS. The old form matched an inline
       height and fell back to the section, so a runway change left this
       measuring a different element and printing plausible numbers. */
    const runway = s.querySelector('[data-tour-runway]');
    if (!runway) throw new Error('no [data-tour-runway] — refusing to measure the section instead');
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
  console.log(`   runway top ${geo.top}, height ${geo.h}, scrollY now ${await ev("scrollY")}, hero visible ${await ev("(()=>{const h=document.querySelector('section[aria-labelledby=\'hero-headline\']');if(!h)return 'no hero';const r=h.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})()")}`);
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

  /* ---- one side, and a descent (spec §5.1, §5.2a) ---------------------- */
  const xs = [], ys = [], textRects = [];
  for (const p of [0, 0.5, 1]) {
    await at(p);
    const dp = await dbg();
    xs.push(dp.phoneCentreXPx); ys.push(dp.phoneCentreYPx);
    /* VIEWPORT coordinates, deliberately. The three blocks are absolutely
       positioned inside the pin, so their rects match each other at any
       scroll position whether or not the pin works. What distinguishes a
       working pin is that the ACTIVE block occupies the same place ON SCREEN
       at two different scroll positions. */
    textRects.push(JSON.parse(await ev(`(() => {
      const el = document.querySelector('#parent-app [data-chapter][data-active="true"]');
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    })()`)));
  }
  check("the phone holds ONE side, it does not alternate",
    xs.every((x) => x > VW / 2) && Math.max(...xs) - Math.min(...xs) < 2,
    `x = ${xs.map((x) => Math.round(x)).join(", ")}`);
  check("the phone DESCENDS between rest points",
    ys[0] < ys[1] && ys[1] < ys[2],
    `y = ${ys.map((y) => Math.round(y)).join(" -> ")}`);
  check("the descent is a real distance, not a nudge",
    ys[2] - ys[0] > VH * 0.3,
    `${Math.round(ys[2] - ys[0])}px of a ${VH}px viewport`);

  /*
   * The text is pinned — by outcome, in viewport coordinates, and with the
   * phone as the control. Asserting "position is sticky" passes on a build
   * where nothing moves at all; asserting the rect alone passes on a build
   * where the whole section is frozen.
   */
  const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  check("the text block holds the SAME viewport position at every rest point",
    sameRect(textRects[0], textRects[1]) && sameRect(textRects[1], textRects[2]),
    textRects.map((r) => `${r.x},${r.y} ${r.w}x${r.h}`).join("  |  "));
  check("...while the phone moved, so the page was not simply frozen",
    Math.abs(ys[2] - ys[0]) > 40, `phone y moved ${Math.round(ys[2] - ys[0])}px`);
  check("the text is on the LEFT, the phone on the right",
    textRects[0].x + textRects[0].w < VW / 2 && xs[0] > VW / 2,
    `text ends at ${textRects[0].x + textRects[0].w}, phone centre ${Math.round(xs[0])}`);

  /* Released at both boundaries. Without this, position:fixed passes every
     assertion above — it would hold the same viewport position forever. */
  const release = JSON.parse(await ev(`(async () => {
    const rw = document.querySelector('#parent-app [data-tour-runway]');
    const el = () => document.querySelector('#parent-app [data-chapter][data-active="true"]');
    const at = async (y) => { scrollTo(0, y); await new Promise(r => setTimeout(r, 700)); return Math.round(el().getBoundingClientRect().y); };
    const top = Math.round(rw.getBoundingClientRect().top + scrollY);
    const above = await at(Math.max(0, top - innerHeight * 0.9));
    const below = await at(top + rw.offsetHeight + innerHeight * 0.4);
    const inside = await at(top + innerHeight);
    return JSON.stringify({ above, inside, below });
  })()`));
  check("the text releases above and below the runway, it is not fixed",
    release.above !== release.inside && release.below !== release.inside,
    `y above ${release.above}, inside ${release.inside}, below ${release.below}`);

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
  /*
   * The fade dead zone, guarded directly (spec §5.5a).
   *
   * FIRST VERSION OF THIS WAS A NO-OP and is recorded here rather than
   * quietly replaced. It asserted that no two blocks are both visible — but
   * the ticker hard-sets every inactive block to opacity "0", so the
   * second-highest opacity is 0 by construction at every scroll position on
   * every build. It reported "worst 0 over 61 positions" and could not have
   * failed.
   *
   * The thing that can actually go wrong is a visible HARD CUT: the chapter
   * index flips at the half-turn, the outgoing block vanishes instantly and
   * the incoming one appears at whatever the fade curve says. That is
   * invisible only while the curve is at zero AT THE FLIP. So the measurement
   * is the opacity on either side of each index change.
   */
  const fade = JSON.parse(await ev(`(async () => {
    const rw = document.querySelector('#parent-app [data-tour-runway]');
    const top = Math.round(rw.getBoundingClientRect().top + scrollY);
    const span = rw.offsetHeight - innerHeight;
    const trace = [];
    for (let i = 0; i <= 120; i++) {
      scrollTo(0, top + Math.round(span * (i / 120)));
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const el = document.querySelector('#parent-app [data-chapter][data-active="true"]');
      trace.push({ p: i / 120, id: el.dataset.chapter, o: parseFloat(getComputedStyle(el).opacity) || 0 });
    }
    const cuts = [];
    for (let i = 1; i < trace.length; i++) {
      if (trace[i].id !== trace[i - 1].id) {
        cuts.push({ p: +trace[i].p.toFixed(3), from: trace[i - 1].id, to: trace[i].id,
          before: +trace[i - 1].o.toFixed(4), after: +trace[i].o.toFixed(4) });
      }
    }
    return JSON.stringify({ cuts, peak: +Math.max(...trace.map(t => t.o)).toFixed(3) });
  })()`));
  const worstCut = fade.cuts.length ? Math.max(...fade.cuts.map((c) => Math.max(c.before, c.after))) : 1;
  check("the text is invisible at the moment the chapter changes",
    fade.cuts.length === 2 && worstCut <= 0.02,
    fade.cuts.map((c) => `${c.from}->${c.to} at p=${c.p}: ${c.before} then ${c.after}`).join("  |  "));
  check("...and it does return to full opacity in between",
    fade.peak > 0.98, `peak ${fade.peak}`);

  /* ---- the screen renders the texture, at every rest point ------------- */
  /*
   * Spec §4 as amended. Sample the rendered screen and compare it with the
   * SOURCE PNG, per chapter, at that chapter's rest point.
   *
   * The no-op test, twice over:
   *
   *   A guard reading material.toneMapped, or textures[0].colorSpace, passes
   *   on a build where the swap never sets the colour space on textures 2 and
   *   3 — and passes on a build where the screen is not drawn at all. This
   *   project shipped exactly that second build: the display plane was
   *   back-face culled, nothing was rasterised, and every settings-level
   *   assertion still read correct.
   *
   *   So this reads pixels, and it refuses to compute a delta unless it has
   *   actually found the landmark. "Most orange pixel in the crop" always
   *   returns something; on the culled build it returned the titanium frame,
   *   scored 31 against the source's 246, and a delta built on it would have
   *   been a number about the frame.
   */
  const { decodePNG } = require("./scrim-lab");
  const orangeness = (r, g, b) => r - b - Math.abs(r - g * 1.55) * 0.5;
  const landmark = (img, bx0, by0, bx1, by1, R) => {
    let best = -Infinity, mx = 0, my = 0;
    for (let y = by0; y < by1; y += 2) for (let x = bx0; x < bx1; x += 2) {
      const o = (y * img.w + x) * img.ch;
      const v = orangeness(img.px[o], img.px[o + 1], img.px[o + 2]);
      if (v > best) { best = v; mx = x; my = y; }
    }
    /* Average the CARD, not the box: a square around the best pixel straddles
       its edge, and averaging the white UI beyond it lifts blue hardest, which
       is indistinguishable from a wash. Same rule on both images. */
    /*
     * MEDIAN, not mean. The mean of a box straddling the card's edge is pulled
     * by the white UI beyond it, and it is pulled by MORE in the render, where
     * the GPU has already blended those edges — which reads as a wash on the
     * chapters whose landmark is small. The median of the qualifying pixels is
     * the card's own colour and does not move when a few edge pixels are in
     * the box.
     */
    const floor = best * 0.6;
    const ch = [[], [], []];
    for (let y = my - R; y <= my + R; y++) for (let x = mx - R; x <= mx + R; x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const o = (y * img.w + x) * img.ch;
      if (orangeness(img.px[o], img.px[o + 1], img.px[o + 2]) < floor) continue;
      ch[0].push(img.px[o]); ch[1].push(img.px[o + 1]); ch[2].push(img.px[o + 2]);
    }
    const med = (a) => { a.sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; };
    return { score: Math.round(best), n: ch[0].length, x: mx, y: my, rgb: ch.map((a) => Math.round(med(a))) };
  };

  /*
   * Downsample the SOURCE to the rendered screen's size before comparing.
   *
   * Without this the guard fails chapters 2 and 3 and passes chapter 1, which
   * looks like a wash on two textures and is not. The source is 1080 px wide;
   * the screen renders about 350. Chapter 1's landmark is a large orange card
   * and survives a 3x minification; chapters 2 and 3 land on small UI elements
   * that the GPU averages with their surroundings, so the render reads paler
   * than a full-resolution sample of the same element — a resolution
   * difference showing up as colour. Chapter 2 measured 53 units apart that
   * way, and nothing in the material differs between the three.
   *
   * Minifying the source with a box filter puts both images through the same
   * loss, so what is left to measure is colour.
   */
  const downsample = (img, w, h) => {
    const out = { w, h, ch: 3, px: new Uint8Array(w * h * 3) };
    const sx = img.w / w, sy = img.h / h;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1 && yy < img.h; yy++) {
          for (let xx = x0; xx < x1 && xx < img.w; xx++) {
            const o = (yy * img.w + xx) * img.ch;
            r += img.px[o]; g += img.px[o + 1]; b += img.px[o + 2]; n++;
          }
        }
        const o2 = (y * w + x) * 3;
        out.px[o2] = r / n; out.px[o2 + 1] = g / n; out.px[o2 + 2] = b / n;
      }
    }
    return out;
  };

  const SCREENS = [
    "public/models/screens/screen_01_home.png",
    "public/models/screens/screen_02_tracking.png",
    "public/models/screens/screen_03_cameras.png",
  ];

  /*
   * WHY A MEAN OVER THE WHOLE DISPLAY, AND NOT A LANDMARK.
   *
   * Matching one feature works only while that feature survives being drawn at
   * a third of its authored size. Chapter 1's orange card does: 35 px in the
   * render, and it matches the source exactly, rgb(254, 151, 0) both sides.
   * Chapter 2's most saturated element is a small badge that lands on FOUR
   * pixels, fully blended with what is behind it — 69 units apart, and none of
   * that is colour. Three different samplers reported three different figures
   * for it, which is the signature of an instrument measuring itself.
   *
   * Minification is an average, so the average survives it: the mean of a
   * large region of the render estimates the same quantity as the mean of the
   * matching region of the texture, whatever the scale. A wash lifts every
   * channel toward white and moves that mean; a blurred badge does not.
   *
   * The no-op test. Would this pass on a build where nothing changed?
   *   - screen not drawn at all (the back-face culling this section shipped):
   *     the samples land on the titanium body and the paper ground. Fails.
   *   - textures 2 and 3 never given a colour space: sRGB read as linear
   *     shifts every channel. Fails on the chapters that lost it, which is
   *     exactly what an assertion on textures[0].colorSpace cannot do.
   *   - the swap binding the wrong texture: fails, because chapter 2's mean is
   *     not chapter 1's.
   * It reads pixels off the screen at each rest point and nothing else.
   */
  console.log("");
  for (let i = 0; i < 3; i++) {
    await at(i / 2);
    await sleep(700);
    const dd = JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
    const vb = JSON.parse(await ev(`(() => { const b = document.querySelector('#parent-app canvas').getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y) }); })()`));
    const full = decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
    const src = decodePNG(fs.readFileSync(SCREENS[i]));

    const q = dd.screenQuad;
    const c00 = q.find((c) => c.u < 0.5 && c.v < 0.5), c10 = q.find((c) => c.u >= 0.5 && c.v < 0.5);
    const c01 = q.find((c) => c.u < 0.5 && c.v >= 0.5), c11 = q.find((c) => c.u >= 0.5 && c.v >= 0.5);
    const map = (u, v, k) => (1 - u) * (1 - v) * c00[k] + u * (1 - v) * c10[k]
      + (1 - u) * v * c01[k] + u * v * c11[k];

    /* Inset, so the sample never strays off the display onto the bezel. */
    const LO = 0.08, HI = 0.92, NU = 60, NV = 120;
    let rr = 0, rg = 0, rb = 0, rn = 0;
    for (let a = 0; a < NU; a++) {
      for (let b2 = 0; b2 < NV; b2++) {
        const u = LO + ((HI - LO) * a) / (NU - 1);
        const v = LO + ((HI - LO) * b2) / (NV - 1);
        const x = Math.round(vb.x + map(u, v, "x")), y = Math.round(vb.y + map(u, v, "y"));
        if (x < 0 || y < 0 || x >= full.w || y >= full.h) continue;
        const o = (y * full.w + x) * full.ch;
        rr += full.px[o]; rg += full.px[o + 1]; rb += full.px[o + 2]; rn++;
      }
    }
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let y = Math.round(src.h * LO); y < Math.round(src.h * HI); y++) {
      for (let x = Math.round(src.w * LO); x < Math.round(src.w * HI); x++) {
        const o = (y * src.w + x) * src.ch;
        sr += src.px[o]; sg += src.px[o + 1]; sb += src.px[o + 2]; sn++;
      }
    }
    /*
     * Compare against the source TIMES THE TINT. §4 as amended dims the
     * screens with the material colour, and a flat "within 8 units of the
     * source" bar would call that deliberate dim a failure — the guard would
     * be measuring the design decision instead of the reproduction. The
     * multiply happens in linear space, which is where the GPU does it.
     */
    const toLin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const toSrgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const hex = dd.material.colorHex;
    const tint = [0, 2, 4].map((k) => toLin(parseInt(hex.slice(k, k + 2), 16)));
    const rmean = [rr / rn, rg / rn, rb / rn].map(Math.round);
    const smean = [sr / sn, sg / sn, sb / sn]
      .map((v, k) => Math.round(toSrgb(toLin(v) * tint[k])));
    const delta = rmean.map((v, k) => v - smean[k]);
    const worst = Math.max(...delta.map(Math.abs));
    check(`chapter ${i + 1}: the rendered screen is within 8 units of the source texture`,
      worst <= 8,
      `rendered rgb(${rmean.join(", ")}) vs source x 0x${hex} rgb(${smean.join(", ")}), worst ${worst}, ${rn} samples`);
    check(`chapter ${i + 1}: the bound texture is the chapter's own`,
      dd.boundChapter === i, `bound ${dd.boundChapter}`);
  }

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
    const runway = document.querySelector('#parent-app [data-tour-runway]');
    if (!runway) throw new Error('no [data-tour-runway]');
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
