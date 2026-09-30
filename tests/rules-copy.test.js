import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const rules = JSON.parse(readFileSync(new URL("../public/lib/rules.json", import.meta.url), "utf8"));
const src = `${homedir()}/Documents/AnkiScape/shared/rules-v1.json`;

test("rules.json is self-consistent", () => {
  assert.equal(rules.thresholds.length, 99);
  assert.equal(rules.thresholds[0], 0);
  assert.equal(rules.micro_xp_per_xp, 1000000);
  for (let i = 1; i < rules.thresholds.length; i += 1) assert.ok(rules.thresholds[i] > rules.thresholds[i - 1]);
});

test("rules.json equals the add-on's shared rules (when the checkout exists)", (t) => {
  if (!existsSync(src)) return t.skip(`no add-on checkout at ${src}`);
  const raw = readFileSync(src);
  const live = JSON.parse(raw);
  assert.deepEqual(rules.thresholds, live.thresholds);
  assert.equal(rules.micro_xp_per_xp, live.micro_xp_per_xp);
  assert.equal(createHash("sha256").update(raw).digest("hex"), rules.source.file_sha256,
    "add-on rules file changed since this copy was made; regenerate rules.json and golden.json");
});
