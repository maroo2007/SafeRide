// Static server with Range support + a shared token-bucket bandwidth limiter,
// used for the throttled behavioural gates.
//
//   node serve-throttled.js <port> <kilobytes_per_sec> <rtt_ms>
//   Fast 3G     : 1.6 Mbit/s -> 200 KB/s, RTT 562ms
//   Regular 4G  : 4.0 Mbit/s -> 500 KB/s, RTT  20ms
//
// Two things here are easy to get wrong and both silently invalidate the gate:
//
//  1. The budget must come from ACTUAL elapsed time. Windows timer granularity
//     (~15.6ms) makes a nominal 50ms setInterval fire at ~64ms, which
//     under-delivers by ~25% if you assume the nominal value.
//
//  2. Responses must be STREAMED through the limiter, never buffered-and-capped.
//     Capping the buffer and setting Content-Length to the capped size serves a
//     truncated file: the browser then stalls waiting for bytes that never
//     arrive, and you measure your own bug instead of the video.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const PORT = Number(process.argv[2] || 8788);
const KBPS = Number(process.argv[3] || 200);
const RTT = Number(process.argv[4] || 562);

const BYTES_PER_SEC = KBPS * 1024;
const active = new Set();

let last = Date.now();
let carry = 0;
setInterval(() => {
  const now = Date.now();
  carry += BYTES_PER_SEC * (now - last) / 1000;
  last = now;
  // Cap the bucket. Without this, carry accumulates without bound while the
  // server is idle, and the first request after a quiet period is served at
  // effectively unlimited speed off the banked credit.
  const MAX_BURST = BYTES_PER_SEC * 0.1;
  if (carry > MAX_BURST) carry = MAX_BURST;
  let budget = Math.floor(carry);
  if (budget <= 0 || active.size === 0) return;
  carry -= budget;

  // Round-robin the budget across in-flight responses so a big sequential
  // read cannot starve the range requests a seeking video issues.
  for (const job of [...active]) {
    if (budget <= 0) break;
    const share = Math.max(1, Math.floor(budget / active.size)) || budget;
    const chunk = job.stream.read(Math.min(share, budget));
    if (chunk) { job.res.write(chunk); budget -= chunk.length; }
  }
  carry += budget; // return anything undistributed
}, 20);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(ROOT, urlPath === "/" ? "/scrub-test.html" : urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end("not found"); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";

    let start = 0, end = st.size - 1, code = 200;
    const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
    if (req.headers.range) {
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= st.size) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end(); return;
      }
      code = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    }
    // Always the true length of what we will actually send.
    headers["Content-Length"] = end - start + 1;

    setTimeout(() => {
      res.writeHead(code, headers);
      const stream = fs.createReadStream(file, { start, end });
      const job = { res, stream };
      stream.on("readable", () => {});
      stream.on("end", () => { active.delete(job); res.end(); });
      res.on("close", () => { active.delete(job); stream.destroy(); });
      active.add(job);
    }, RTT / 2);
  });
}).listen(PORT, () =>
  console.log(`throttled: ${ROOT} on http://localhost:${PORT} @ ${KBPS} KB/s, RTT ${RTT}ms`));
