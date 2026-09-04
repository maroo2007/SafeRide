// Minimal static server with HTTP Range support.
// Range is required: without it the browser cannot seek a video, so the scrub
// test would measure nothing useful.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const PORT = Number(process.argv[2] || 8787);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".png": "image/png"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);

  // Result sink: lets a browser we cannot drive directly (Firefox) report its
  // own measurements back to us.
  if (req.method === "POST" && urlPath === "/results") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      fs.appendFileSync(path.join(ROOT, "results.jsonl"), body + "\n");
      res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end("ok");
    });
    return;
  }
  const file = path.join(ROOT, urlPath === "/" ? "/scrub-test.html" : urlPath);

  // Keep the server inside ROOT.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end("not found"); return; }

    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= st.size) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end();
        return;
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": type,
        "Cache-Control": "no-store"
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": st.size,
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(file).pipe(res);
    }
  });
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
