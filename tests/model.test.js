import test from "node:test";
import assert from "node:assert/strict";
import * as m from "../public/lib/model.js";

test("casefold handles sharp s like Python", () => {
  assert.equal(m.casefold("STRASSE"), m.casefold("Straße"));
});
test("splitTrained separates zero XP", () => {
  const [t, u] = m.splitTrained([{ xp: 5 }, { xp: 0 }, { xp: "0" }, { xp: "bad" }]);
  assert.equal(t.length, 1);
  assert.equal(u.length, 3);
});
test("demo accounts are always labelled", () => {
  assert.equal(m.displayName({ username: "x", is_demo: true }), "x  [Demo]");
  assert.equal(m.displayName({ username: "x", is_demo: false }), "x");
});
test("level label", () => {
  assert.equal(m.levelLabel("overall", 12), "Total 12");
  assert.equal(m.levelLabel("mining", 12), "Lv 12");
  assert.equal(m.levelLabel("mining", null), "—");
});
