import test from "node:test";
import assert from "node:assert/strict";
import { ageMs, boardFromHash, isStale, medalFor, updatedText } from "../public/lib/render.js";
import { BOARDS } from "../public/lib/model.js";

const T = Date.parse("2026-01-01T12:00:00Z");
test("updatedText buckets", () => {
  assert.equal(updatedText("2026-01-01T11:59:40Z", T), "Updated just now");
  assert.equal(updatedText("2026-01-01T11:58:30Z", T), "Updated 1 minute ago");
  assert.equal(updatedText("2026-01-01T11:30:00Z", T), "Updated 30 minutes ago");
  assert.equal(updatedText("2026-01-01T10:59:00Z", T), "Updated 1 hour ago");
  assert.equal(updatedText("garbage", T), "");
});
test("future timestamps clamp to zero age", () => assert.equal(ageMs("2026-01-01T12:05:00Z", T), 0));
test("stale after 15 minutes, and when unparseable", () => {
  assert.equal(isStale("2026-01-01T11:46:00Z", T), false);
  assert.equal(isStale("2026-01-01T11:44:00Z", T), true);
  assert.equal(isStale("nope", T), true);
});
test("hash routing only accepts real boards", () => {
  assert.equal(boardFromHash("#Mining", BOARDS), "mining");
  assert.equal(boardFromHash("#<script>", BOARDS), null);
  assert.equal(boardFromHash("", BOARDS), null);
});
test("medals", () => {
  assert.equal(medalFor(1), "gold");
  assert.equal(medalFor(3), "bronze");
  assert.equal(medalFor(4), null);
});
