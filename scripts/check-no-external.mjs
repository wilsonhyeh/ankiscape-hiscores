// The page must load only its own files: no absolute http(s) URLs, no protocol-relative URLs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../public/", import.meta.url).pathname;
const exts = new Set([".html", ".css", ".js"]);
// XML namespace identifiers look like URLs but are never requested.
const NAMESPACES = ["http://www.w3.org/2000/svg"];
const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (exts.has(name.slice(name.lastIndexOf(".")))) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"')]*/g)) {
        if (m[0] === NAMESPACES[0]) continue; // an identifier string, never fetched
        problems.push(`${p.slice(root.length)}: ${m[0]}`);
      }
    }
  }
}
walk(root);
const html = readFileSync(root + "index.html", "utf8");
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push("index.html: inline <script>");
if (/<style[\s>]/i.test(html) || /\sstyle=/i.test(html)) problems.push("index.html: inline style");
if (problems.length) {
  console.error("check:no-external FAILED\n" + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log("check:no-external ok");
