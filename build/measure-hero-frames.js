/**
 * DOES THE HERO DROP FRAMES? Spec §2.3's bar, and a different instrument
 * from everything measured before it.
 *
 * Every earlier hero measurement in this project was rAF cadence — when the
 * COMPOSITOR presented a frame. That is the right instrument for "does the
 * page hitch" and the wrong one for "does the video decode keep up". A
 * software AV1 decoder that cannot sustain 48 fps drops frames while rAF
 * runs at a perfectly smooth 60, because the page is fine and the picture is
 * not. `getVideoPlaybackQuality()` is the only thing that separates them.
 *
 * ── What it reports ───────────────────────────────────────────────────────
 *
 *   totalVideoFrames    frames the decoder has produced for presentation
 *   droppedVideoFrames  frames the decoder produced too late to show
 *
 * The bar is dropped == 0 across the first five seconds of PLAYBACK, not of
 * page load — a video that has not started yet cannot drop anything, and
 * counting from navigation would hide the whole problem behind the loader.
 *
 * ── Both sources, on the same machine ─────────────────────────────────────
 *
 * --force=h264 strips the AV1 <source> before the media element's resource
 * selection runs, so the element falls through exactly as it would on a
 * machine with no AV1 decoder. That is a real comparison on identical
 * hardware; comparing against a remembered number from another machine is
 * not.
 *
 * NOT via Network.setBlockedURLs: that needs the Network domain, which
 * buffers every response body over the DevTools pipe and has already turned
 * a 0.24s fetch into 24s once in this project.
 *
 * ── Honest about the environment ──────────────────────────────────────────
 *
 * Headless Chrome frequently has no hardware video decode even where the
 * headed browser does, so a headless number is closer to the worst case than
 * to the median. Run --headed for the other side of that. Either way the
 * AV1-vs-H.264 comparison holds, because both are measured the same way on
 * the same machine.
 *
 * Usage: node build/measure-hero-frames.js <profile> [--force=h264] [--headed] [--port=]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const FORCE = arg("force", "");
const HEADED = process.argv.includes("--headed");
/* --reduced is the no-op case for the assertions below: under reduced motion
   the hero renders a still <img> and no video element exists at all, so a
   guard that says "0 dropped frames" without also demanding frames must pass
   on it. It is the honest way to prove that defence without breaking source. */
const REDUCED = process.argv.includes("--reduced");
const PORT = +arg("port", 9801);
const URL = arg("url", "http://localhost:3100/");
const VW = 1440, VH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/* Installed before any page script. Two jobs: optionally remove the AV1
   source, and watch both video elements from the moment they exist. */
const PROBE = `
(() => {
  const FORCE_H264 = __FORCE__;

  if (FORCE_H264) {
    /* Remove the AV1 source before the element selects a resource. Polled
       from time zero rather than observed — see the note on scan() below. */
    const strip = () => {
      if (document.querySelectorAll) {
        for (const s of document.querySelectorAll('source[src*="av1"]')) s.remove();
      }
      if (performance.now() < 20000) setTimeout(strip, 0);
    };
    strip();
  }

  /* When the loader leaves. The film starts playing BEHIND it, so its first
     five seconds and the five seconds a visitor first sees are different
     windows, and on this page they barely overlap. */
  window.__liftAt = null;
  window.__liftSeen = false;
  (function pollLift() {
    if (document.querySelector) {
      const el = document.querySelector('[data-load-screen]');
      if (el) window.__liftSeen = true;
      if (!el && window.__liftSeen && window.__liftAt === null) {
        window.__liftAt = +performance.now().toFixed(1);
        return;
      }
    }
    if (performance.now() < 40000) setTimeout(pollLift, 30);
  })();

  window.__long = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) });
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) { window.__longUnsupported = String(e); }

  /*
   * KEYED BY ELEMENT, not by a regex on currentSrc per sample.
   *
   * The first version decided "film or idle loop?" on every sample by testing
   * currentSrc for /idle/. Before resource selection resolves currentSrc is
   * the empty string, which does not match — so the IDLE element's opening
   * samples were filed under the film. The idle clip loops, so its
   * currentTime cycles, and the film's series came back non-monotonic: a
   * five-second window whose last qualifying row sat at t=1.42s, and a
   * reported 1229 frames per second.
   *
   * An element's identity does not change. Sampling waits for currentSrc to
   * resolve, and the label is attached once, to the element.
   */
  window.__vq = { els: [], filmPlayingAt: null };
  const seen = new Map();
  const watch = (v) => {
    if (seen.has(v)) return;
    const rec = { src: null, loops: v.loop === true, samples: [] };
    seen.set(v, rec);
    window.__vq.els.push(rec);
    v.addEventListener('playing', () => {
      if (!/idle/.test(v.currentSrc || '') && window.__vq.filmPlayingAt === null) {
        window.__vq.filmPlayingAt = +performance.now().toFixed(1);
      }
    });
    const sample = () => {
      if (v.currentSrc) {
        rec.src = v.currentSrc.split('/').pop();
        if (!v.paused && v.readyState >= 2 && typeof v.getVideoPlaybackQuality === 'function') {
          const q = v.getVideoPlaybackQuality();
          rec.samples.push({
            t: +v.currentTime.toFixed(3),
            wall: +performance.now().toFixed(1),
            total: q.totalVideoFrames,
            dropped: q.droppedVideoFrames,
          });
        }
      }
      if (performance.now() < 90000) setTimeout(sample, 200);
    };
    sample();
  };
  /*
   * POLLED, not observed. This script runs before document.documentElement
   * exists, so MutationObserver.observe(documentElement) throws and takes the
   * rest of the IIFE with it — measured: __vq stayed empty, __long filled,
   * and the run reported "never played" on a page whose video was playing
   * fine. measure-load.js carries the same note about the same trap.
   */
  const scan = () => {
    if (document.querySelectorAll) { for (const v of document.querySelectorAll('video')) watch(v); }
    if (performance.now() < 90000) setTimeout(scan, 200);
  };
  scan();
})();
`;

(async () => {
  const flags = ["--no-sandbox", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + P,
    "--window-size=" + VW + "," + VH, "about:blank"];
  if (!HEADED) flags.unshift("--headless=new");
  const ch = spawn(CHROME, flags, { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = (await get("http://127.0.0.1:" + PORT + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("measure-hero-frames: no debugger target on " + PORT);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (REDUCED) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  /* Cold, then the Network domain OUT of the way for the whole measurement. */
  await send("Network.enable");
  await send("Network.clearBrowserCache");
  await send("Network.disable");

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: PROBE.replace("__FORCE__", FORCE === "h264" ? "true" : "false"),
  });
  await send("Page.navigate", { url: URL });

  /*
   * Two conditions, because there are two windows.
   *
   * Five seconds of the FILM's own clock covers §2.3 as written. Six seconds
   * of wall clock past the loader's lift covers what a visitor actually
   * sees — and on this page those barely overlap, because the film starts
   * playing behind the cover. Stopping at the first alone reported the
   * visitor window as "0.00s, truncated".
   */
  let waited = 0;
  while (waited < (REDUCED ? 25000 : 120000)) {
    const st = JSON.parse(await ev("(() => { const e = (window.__vq && window.__vq.els || []).find(function (x) { return x.src && !/idle/.test(x.src); }); return JSON.stringify({ t: e && e.samples.length ? e.samples[e.samples.length-1].t : -1, lift: window.__liftAt, now: performance.now() }); })()"));
    if (st.t >= 5.2 && st.lift !== null && st.now >= st.lift + 6000) break;
    await sleep(500); waited += 500;
  }

  const out = JSON.parse(await ev("JSON.stringify(window.__vq)"));
  const long = JSON.parse(await ev("JSON.stringify(window.__long || [])"));
  const liftAt = await ev("window.__liftAt");
  const caps = JSON.parse(await ev(`(async () => {
    const q = (t) => navigator.mediaCapabilities.decodingInfo({
      type: 'file', video: { contentType: t, width: 1920, height: 1080, bitrate: 1730780, framerate: 48 },
    }).then((r) => r.supported + ' / ' + r.smooth + ' / ' + r.powerEfficient).catch(() => 'error');
    return JSON.stringify({
      av1_10bit: await q('video/mp4; codecs="av01.0.09M.10"'),
      av1_8bit: await q('video/mp4; codecs="av01.0.09M.08"'),
      h264: await q('video/mp4; codecs="avc1.640032"'),
    });
  })()`));

  const label = FORCE === "h264" ? "H.264 FORCED (AV1 source stripped)" : "as shipped (AV1 first)";
  console.log("\n  HERO DECODE — " + label + (HEADED ? ", headed" : ", headless") + ", cold cache, Network domain off");
  console.log("  elements: " + out.els.map((e) => e.src || "(unresolved)").join(", "));
  console.log("  loader lifted at: " + (liftAt === null ? "never within the run" : Math.round(liftAt) + "ms"));
  console.log("  MediaCapabilities supported / smooth / powerEfficient — ADVISORY ONLY:");
  for (const k of Object.keys(caps)) console.log("      " + k.padEnd(10) + " " + caps[k]);

  const report = (rec) => {
    const name = /idle/.test(rec.src || "") ? "idle loop" : "the film";
    const rows = rec.samples;
    if (!rows.length) { console.log("\n  " + name + " (" + rec.src + "): never played"); return; }
    const last = rows[rows.length - 1];
    /*
     * Frames dropped WITHIN the window, not the counter's absolute value: the
     * counter is cumulative and a later sample includes whatever happened
     * before playback was visible.
     *
     * A LOOPING element's currentTime is not monotonic, so its window is wall
     * clock. The film does not loop and uses its own clock, which is what
     * "the first five seconds of playback" actually means.
     */
    console.log("\n  " + name.toUpperCase() + "  (" + rec.src + (rec.loops ? ", loops" : "") + ")");

    /*
     * THE COUNTER IS CUMULATIVE AND MONOTONIC, so a window only needs its two
     * ENDS. That matters here because the sampler cannot sample during a
     * long task: a 3.9s block left a hole from t=2.47s to t=6.57s, and a
     * "last row inside the window" rule silently reported the window as
     * 0.19-2.47s and its zero dropped frames as if that were five seconds.
     *
     * So: take the first row at or past each boundary and PRINT the row's
     * real time. If the sampler was blocked across the boundary the window
     * overshoots, and the overshoot is visible rather than hidden.
     */
    const at = (key, from, len) => {
      const s = rows.find((r) => r[key] >= from);
      const e = rows.find((r) => r[key] >= from + len);
      return { s, e: e || rows[rows.length - 1], truncated: !e };
    };

    const windows = [];
    if (rec.loops) {
      windows.push(["first 5s of playback", at("wall", rows[0].wall, 5000), "wall", 1000]);
    } else {
      windows.push(["first 5s of playback  (§2.3 as written)", at("t", rows[0].t, 5.0), "t", 1]);
      if (liftAt !== null) {
        const afterLift = rows.filter((r) => r.wall >= liftAt);
        if (afterLift.length) {
          const s = afterLift[0];
          const e = rows.find((r) => r.wall >= liftAt + 5000) || rows[rows.length - 1];
          windows.push(["first 5s the VISITOR sees (from the lift)", { s, e, truncated: !rows.find((r) => r.wall >= liftAt + 5000) }, "wall", 1000]);
        }
      }
    }

    for (const [wname, w, key, div] of windows) {
      if (!w.s) { console.log("    " + wname + ": no samples"); continue; }
      const dropped = w.e.dropped - w.s.dropped;
      const total = w.e.total - w.s.total;
      const span = (w.e[key] - w.s[key]) / div;
      console.log("    " + wname);
      console.log("      window            " + (w.s[key] / div).toFixed(2) + " -> " + (w.e[key] / div).toFixed(2)
        + "  (" + span.toFixed(2) + "s" + (span > 5.4 ? ", OVERSHOT: the sampler was blocked across the boundary" : "")
        + (w.truncated ? ", truncated" : "") + ")");
      console.log("      frames presented  " + total + "   (" + (span > 0 ? (total / span).toFixed(1) : "-") + "/s)");
      console.log("      FRAMES DROPPED    " + dropped + (dropped === 0 ? "   <- clears the bar" : "   <- FAILS the bar (must be 0)"));
    }
    console.log("    cumulative at end   " + last.dropped + " dropped of " + last.total + " at t=" + last.t.toFixed(2) + "s");
    let prev = rows[0]; const bursts = [];
    for (const r of rows.slice(1)) {
      const d = r.dropped - prev.dropped;
      if (d > 0) bursts.push(d + " by t=" + r.t.toFixed(2) + "s (wall " + Math.round(r.wall) + "ms)");
      prev = r;
    }
    if (bursts.length) console.log("    losses              " + bursts.join(", "));
    /* Any gap over 400ms is the sampler being starved, i.e. a main-thread
       block, and every number above it is bounded rather than exact. */
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      const g = rows[i].wall - rows[i - 1].wall;
      if (g > 400) gaps.push(Math.round(g) + "ms at t=" + rows[i - 1].t.toFixed(2) + "s");
    }
    if (gaps.length) console.log("    sampler starved     " + gaps.join(", "));
  };
  for (const rec of out.els) report(rec);

  /* ---- assertions (spec §5, "Hero decode") ------------------------------
   *
   * The bar is the VISITOR's five seconds, not the film's. The film starts
   * playing behind the loader, so its own first five seconds are spent under
   * an opaque cover while the tour scene compiles — every codec drops frames
   * there, H.264 included, and holding that against the encode would be
   * measuring the loader.
   *
   * NO-OP DEFENCE: "0 dropped" is what a video that never played reports. So
   * the frame COUNT is asserted alongside it — a 5s window at 48 fps owes
   * about 240 frames, and anything under 200 means the window is empty
   * rather than clean.
   */
  const fails = [];
  const check = (name, ok, detail = "") => {
    console.log("   " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "   " + detail : ""));
    if (!ok) fails.push(name);
  };
  console.log("\n  ASSERTIONS");
  const film = out.els.find((e) => e.src && !/idle/.test(e.src));
  if (!film || !film.samples.length) {
    check("the film played at all", false, "no samples");
  } else {
    const rows = film.samples;
    const vs = liftAt === null ? null : rows.filter((r) => r.wall >= liftAt);
    if (!vs || !vs.length) {
      check("there is a post-lift window to measure", false, "the loader never lifted within the run");
    } else {
      const s = vs[0];
      const e = rows.find((r) => r.wall >= liftAt + 5000) || rows[rows.length - 1];
      const presented = e.total - s.total;
      const dropped = e.dropped - s.dropped;
      check("the film actually presented frames after the lift (so '0 dropped' means something)",
        presented >= 200, presented + " frames over " + ((e.wall - s.wall) / 1000).toFixed(2) + "s");
      check("no dropped frames in the first five seconds the visitor sees",
        presented >= 200 && dropped === 0, dropped + " dropped of " + presented + " presented");
    }
  }
  /* Read the bit depth off the FILE, not off the codecs string in the DOM:
     the string claimed 8-bit for weeks while the file was 10-bit, and the
     string is a declaration while the pixel format is the fact. */
  if (!FORCE) {
    try {
      const { execFileSync } = require("child_process");
      const px = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", "public/video/saferide-hero-av1.mp4"],
        { encoding: "utf8" }).trim();
      check("the AV1 the page serves is 8-bit", px === "yuv420p", "pix_fmt " + px);
    } catch (err) {
      check("the AV1 the page serves is 8-bit", false, "ffprobe failed: " + String(err).slice(0, 120));
    }
  }

  const inWindow = long.filter((l) => out.filmPlayingAt === null || l.start <= out.filmPlayingAt + 5000);
  const over200 = inWindow.filter((l) => l.dur > 200);
  console.log("\n  MAIN THREAD, navigation -> film playing + 5s");
  console.log("    long tasks over 50ms   " + inWindow.length);
  console.log("    over 200ms             " + over200.length
    + (over200.length ? "   " + over200.map((l) => Math.round(l.dur) + "ms at " + Math.round(l.start)).join(", ") : "   <- clears §2.3"));
  console.log(fails.length ? "\n  FAILED: " + fails.join("; ") + "\n" : "\n  all checks pass\n");
  ws.close(); ch.kill();
  process.exit(fails.length ? 1 : 0);
})();
