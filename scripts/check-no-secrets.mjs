// Fails if any key-like string is tracked, or .dev.vars would be committed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(Boolean);
const BAD = [
  [/sb_publishable_[A-Za-z0-9_-]{8,}/, "Supabase publishable key"],
  [/sb_secret_[A-Za-z0-9_-]{8,}/, "Supabase secret key"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
  [/service_role/i, "service_role"],
];
const problems = [];
for (const f of files) {
  if (f === "package-lock.json" || f.endsWith(".ttf") || f === "scripts/check-no-secrets.mjs") continue;
  let text;
  try { text = readFileSync(root + f, "utf8"); } catch { continue; }
  for (const [re, label] of BAD) if (re.test(text)) problems.push(`${f}: ${label}`);
}
if (files.includes(".dev.vars")) problems.push(".dev.vars is not ignored");
try {
  execFileSync("git", ["check-ignore", "-q", ".dev.vars"], { cwd: root });
} catch {
  problems.push(".gitignore does not ignore .dev.vars");
}
if (problems.length) {
  console.error("check:no-secrets FAILED\n" + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log(`check:no-secrets ok (${files.length} files scanned)`);
