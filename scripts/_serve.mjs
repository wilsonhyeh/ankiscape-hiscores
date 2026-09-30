// Tiny static server for checks: serves public/ with the same headers as _headers
// (so the real CSP is enforced), and 404s like Pages does.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = new URL("../public/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".txt": "text/plain" };

function globalHeaders() {
  const out = {};
  let inStar = false;
  for (const line of readFileSync(root + "_headers", "utf8").split("\n")) {
    if (/^\S/.test(line)) inStar = line.trim() === "/*";
    else if (inStar && line.trim()) {
      const i = line.indexOf(":");
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

export function serve() {
  const headers = globalHeaders();
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    let file = join(root, path === "/" ? "index.html" : path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { ...headers, "content-type": TYPES[".html"] });
      res.end(readFileSync(root + "404.html"));
      return;
    }
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    server, base: `http://127.0.0.1:${server.address().port}`, headers,
  })));
}
