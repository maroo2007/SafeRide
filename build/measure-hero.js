/**
 * Measure the REAL composited contrast of the hero copy.
 *
 * Sampling the source video is not enough any more: the hero now sits on top of
 * a scrim, so what matters is video + scrim as actually rendered. This hides the
 * text, screenshots the page, and samples the exact pixels each text element
 * occupies — the true ground behind the copy.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const zlib = require("zlib");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.argv[2];
const URL = process.argv[3] || "http://localhost:3000/";
const PORT = 9333;
const POSITIONS = [0, 0.05, 0.1, 0.2, 0.25, 0.3, 0.5, 0.7];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

/* --- minimal PNG decode (no deps): we only need average colour of a region --- */
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`unsupported png ${bitDepth}/${colorType}`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0, v = line[x];
      let val;
      switch (filter) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error("bad filter " + filter);
      }
      cur[x] = val & 0xff;
    }
  }
  return { w, h, ch, px: out };
}

const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const cr = (a, b) => { const la = L(a), lb = L(b), hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); };

/** Worst (lightest for dark text / darkest for light text) 5% of the region. */
function regionStats(img, r) {
  const { w, ch, px } = img;
  const lums = [];
  const x0 = Math.max(0, Math.round(r.x)), x1 = Math.min(w, Math.round(r.x + r.width));
  const y0 = Math.max(0, Math.round(r.y)), y1 = Math.min(img.h, Math.round(r.y + r.height));
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = y * w * ch + x * ch;
      lums.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (!lums.length) return null;
  lums.sort((a, b) => L(a) - L(b));
  return { darkest: lums[Math.floor(lums.length * 0.05)], lightest: lums[Math.floor(lums.length * 0.95)], n: lums.length };
}

(async () => {
  const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${PROFILE}`,"--window-size=1440,900","about:blank"], { stdio: "ignore" });
  let target = null;
  for (let i = 0; i < 40 && !target; i++) { await sleep(500);
    try { target = (await get(`http://127.0.0.1:${PORT}/json/list`)).find((t) => t.type === "page"); } catch {} }
  const WebSocket = require("ws");
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pending = new Map();
  ws.on("message", (m) => { const msg = JSON.parse(m.toString()); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(7000);

  console.log("  progress  element     text        composited ground      contrast   verdict");
  for (const p of POSITIONS) {
    const setup = `(async () => {
      const runway = document.querySelector('section[aria-labelledby="hero-headline"]');
      const max = runway.getBoundingClientRect().height - window.innerHeight;
      window.scrollTo(0, Math.round(max * ${p}));
      await new Promise(r => setTimeout(r, 900));
      const h1 = document.getElementById('hero-headline');
      const eyebrow = h1 ? h1.previousElementSibling : null;
      const caps = [...document.querySelectorAll('p')].filter(e => /Face recognition|reaches the parent|Live coverage/.test(e.textContent||''));
      const vis = (el) => { if(!el) return null; const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
        return { o:+cs.opacity, color:cs.color, x:r.x, y:r.y, width:r.width, height:r.height }; };
      const out = { headline: vis(h1), eyebrow: vis(eyebrow), caption: caps.length ? vis(caps[0]) : null,
                    captionText: caps.length ? caps[0].textContent.slice(0,22) : null };
      // hide ALL hero text so we sample the true ground
      document.querySelectorAll('#hero-headline, #hero-headline ~ *, .label-mono, p').forEach(e => e.style.visibility='hidden');
      return JSON.stringify(out);
    })()`;
    const resp = await send("Runtime.evaluate", { expression: setup, awaitPromise: true, returnByValue: true });
    if (!resp.result || resp.result.exceptionDetails || resp.result.result?.value === undefined) {
      console.error("evaluate failed:", JSON.stringify(resp).slice(0, 1200));
      process.exit(1);
    }
    const info = JSON.parse(resp.result.result.value);
    await sleep(400);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const img = decodePNG(Buffer.from(shot.result.data, "base64"));
    await send("Runtime.evaluate", { expression: `document.querySelectorAll('[style*="visibility"]').forEach(e=>e.style.visibility='')` });

    for (const key of ["eyebrow", "headline", "caption"]) {
      const el = info[key];
      if (!el || el.width < 5 || el.o < 0.5) continue;
      const s = regionStats(img, el);
      if (!s) continue;
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(el.color);
      const text = [ +m[1], +m[2], +m[3] ];
      const isLight = L(text) > 0.4;
      const ground = isLight ? s.lightest : s.darkest;  // the hard case
      const ratio = cr(text, ground);
      const v = ratio >= 4.5 ? "PASS" : ratio >= 3 ? "large-only" : "FAIL";
      console.log(`   ${String(p).padEnd(8)} ${key.padEnd(11)} rgb(${text.join(",")})`.padEnd(46)
        + `rgb(${ground.join(",")})`.padEnd(22) + `${ratio.toFixed(2)}:1`.padEnd(11) + v);
    }
  }
  ws.close(); chrome.kill(); process.exit(0);
})();
