/**
 * The autoplay hero, guarded by outcome against a real engine.
 *
 * jsdom cannot play video, so everything that matters about this feature —
 * that it plays at all, that it pauses only at 100% out of view, that it
 * resumes rather than restarts, that it holds the last frame, that the
 * captions follow the FILM and not the scroll — has to be measured here.
 *
 * The old guard asserted the opposite of most of this: it checked that
 * captions tracked scroll progress. It was rewritten rather than deleted,
 * because the property it protected (captions arrive at the right moment in
 * the story) still matters; only the clock changed.
 *
 * Usage: node build/verify-hero.js <profile> <out> [url]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const URL = process.argv[4] || "http://localhost:3100/";
const VW = 1440, VH = 900;

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
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=9771", "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:9771/json/list")).find((x) => x.type === "page"); } catch {}
  }
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

  const film = `document.querySelector('section[aria-labelledby="hero-headline"] video:last-of-type')`;
  const shot = async (n) => fs.writeFileSync(path.join(OUT, n),
    Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

  console.log(`\n  AUTOPLAY HERO — ${URL}   ${VW}x${VH}\n`);

  /* ---- it plays, and the playhead really advances ---------------------- */
  const adv = JSON.parse(await ev(`(async () => {
    const v = ${film};
    const a = v.currentTime;
    await new Promise(r => setTimeout(r, 1500));
    return JSON.stringify({ paused: v.paused, from: +a.toFixed(2), to: +v.currentTime.toFixed(2),
      dur: +(v.duration || 0).toFixed(2), loop: v.loop, muted: v.muted });
  })()`));
  check("the film is playing without any interaction", adv.paused === false, `paused=${adv.paused}`);
  /* A guard on `paused` alone passes on a video with no source that reports
     itself playing forever at time 0. Require the playhead to have moved. */
  check("the playhead actually advances", adv.to - adv.from > 0.5,
    `${adv.from}s -> ${adv.to}s of ${adv.dur}s`);
  check("it is muted and does not loop", adv.muted === true && adv.loop === false,
    `muted=${adv.muted} loop=${adv.loop}`);

  /*
   * WHICH FILE is actually playing. Without this every assertion above passes
   * on a browser that cannot decode the primary source and silently fell
   * through to the fallback — the film plays, the captions run, nothing
   * complains, and the 10-bit AV1 that the whole encode decision rests on is
   * never exercised. A guard that cannot tell which of two files it measured
   * is measuring neither.
   */
  const picked = await ev(`(${film}).currentSrc.split('/').pop()`);
  check("the AV1 primary is the source actually chosen, not the H.264 fallback",
    picked === "saferide-hero-av1.mp4",
    picked === "saferide-hero-av1.mp4" ? picked : `fell back to ${picked} — 10-bit AV1 was not decodable here`);
  await shot("hero-0-playing.png");

  /* ---- the hero is ONE viewport, no runway ----------------------------- */
  const geo = JSON.parse(await ev(`(() => {
    const s = document.querySelector('section[aria-labelledby="hero-headline"]');
    return JSON.stringify({ h: Math.round(s.getBoundingClientRect().height), vh: innerHeight,
      docH: document.documentElement.scrollHeight });
  })()`));
  check("the hero is one viewport tall", Math.abs(geo.h - geo.vh) <= 2, `${geo.h}px against ${geo.vh}px`);

  /* ---- keeps playing while ANY part is on screen ----------------------- */
  const partial = JSON.parse(await ev(`(async () => {
    const v = ${film};
    /* 10% of the hero still showing: a fractional-threshold observer would
       have paused by now, which is the bug this guard exists for. */
    scrollTo(0, Math.round(innerHeight * 0.9));
    await new Promise(r => setTimeout(r, 1200));
    const mid = { paused: v.paused, t: +v.currentTime.toFixed(2) };
    scrollTo(0, Math.round(innerHeight * 1.5));
    await new Promise(r => setTimeout(r, 1200));
    return JSON.stringify({ mid, out: { paused: v.paused, t: +v.currentTime.toFixed(2) } });
  })()`));
  check("still playing with the hero 90% scrolled away", partial.mid.paused === false,
    `at ${partial.mid.t}s`);
  check("paused once the hero is fully out of view", partial.out.paused === true,
    `at ${partial.out.t}s`);

  /* ---- resumes from where it stopped, never restarts ------------------- */
  const resumed = JSON.parse(await ev(`(async () => {
    const v = ${film};
    const stoppedAt = v.currentTime;
    await new Promise(r => setTimeout(r, 900));
    scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 1400));
    return JSON.stringify({ stoppedAt: +stoppedAt.toFixed(2), now: +v.currentTime.toFixed(2), paused: v.paused });
  })()`));
  check("resumes from where it stopped rather than restarting",
    resumed.paused === false && resumed.now >= resumed.stoppedAt - 0.05,
    `stopped at ${resumed.stoppedAt}s, resumed at ${resumed.now}s`);

  /* ---- captions follow the FILM, not the scroll ------------------------ */
  const capAt = async (time) => JSON.parse(await ev(`(async () => {
    const v = ${film};
    v.pause(); v.currentTime = ${time};
    await new Promise(r => setTimeout(r, 700));
    const caps = [...document.querySelectorAll('section[aria-labelledby="hero-headline"] p')]
      .filter(p => !p.className.includes('label-mono'))
      .map(p => ({ text: p.textContent.slice(0, 22), o: +(parseFloat(getComputedStyle(p).opacity) || 0).toFixed(2) }))
      .filter(c => c.o > 0.05);
    return JSON.stringify({ t: +v.currentTime.toFixed(2), caps });
  })()`));
  const early = await capAt(adv.dur * 0.25);
  const late = await capAt(adv.dur * 0.72);
  check("captions change with the film's own clock",
    early.caps.length > 0 && late.caps.length > 0 &&
    JSON.stringify(early.caps) !== JSON.stringify(late.caps),
    `t=${early.t}s: ${early.caps.map(c => c.text).join(" / ") || "(none)"}   |   t=${late.t}s: ${late.caps.map(c => c.text).join(" / ") || "(none)"}`);

  /* And NOT with scroll: same currentTime, different scroll position. */
  const scrolled = JSON.parse(await ev(`(async () => {
    scrollTo(0, Math.round(innerHeight * 0.4));
    await new Promise(r => setTimeout(r, 700));
    const caps = [...document.querySelectorAll('section[aria-labelledby="hero-headline"] p')]
      .filter(p => !p.className.includes('label-mono'))
      .map(p => ({ text: p.textContent.slice(0, 22), o: +(parseFloat(getComputedStyle(p).opacity) || 0).toFixed(2) }))
      .filter(c => c.o > 0.05);
    scrollTo(0, 0);
    return JSON.stringify(caps);
  })()`));
  check("scrolling does not change the captions",
    JSON.stringify(scrolled) === JSON.stringify(late.caps),
    `${scrolled.map(c => c.text + "@" + c.o).join(" / ") || "(none)"}`);
  await shot("hero-1-caption.png");

  /* ---- holds the last frame -------------------------------------------- */
  const ended = JSON.parse(await ev(`(async () => {
    const v = ${film};
    v.currentTime = Math.max(0, v.duration - 0.35);
    await v.play().catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    return JSON.stringify({ ended: v.ended, t: +v.currentTime.toFixed(2), dur: +v.duration.toFixed(2), paused: v.paused });
  })()`));
  check("holds on the last frame instead of looping",
    ended.ended === true && ended.t > ended.dur - 0.5,
    `ended=${ended.ended} at ${ended.t}s of ${ended.dur}s`);
  await shot("hero-2-endcard.png");

  /* ---- autoplay refused: force it, do not assume a catch exists -------- */
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('blocked by test', 'NotAllowedError'));
    };`,
  });
  await send("Page.navigate", { url: URL });
  await sleep(9000);
  const refused = JSON.parse(await ev(`(() => {
    const s = document.querySelector('section[aria-labelledby="hero-headline"]');
    const btn = s.querySelector('button');
    return JSON.stringify({ hasButton: !!btn, label: btn ? btn.textContent.trim() : null,
      visible: btn ? getComputedStyle(btn).display !== 'none' : false });
  })()`));
  check("a refused autoplay offers a real play control",
    refused.hasButton && refused.visible,
    refused.hasButton ? `"${refused.label}"` : "no control — the visitor gets a frozen frame and no explanation");
  await shot("hero-3-autoplay-refused.png");

  console.log(fails.length ? `\n  FAILED: ${fails.join("; ")}\n` : "\n  all checks pass\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
