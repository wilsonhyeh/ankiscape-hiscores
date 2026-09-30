import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelFromXpMicro } from "../public/lib/levels.js";
import * as m from "../public/lib/model.js";

const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));
const rules = JSON.parse(readFileSync(new URL("../public/lib/rules.json", import.meta.url), "utf8"));
const TH = rules.thresholds;

test("golden file is the size we expect", () => {
  assert.equal(golden.thresholds_len, 99);
  assert.ok(golden.levels.length >= 40);
  assert.ok(golden.rerank.length >= 6);
});

test("level vectors match the add-on", () => {
  for (const v of golden.levels) {
    assert.equal(levelFromXpMicro(v.xp, TH), v.level, `xp ${v.xp}`);
    assert.equal(m.levelOf(v.xp, TH), v.level, `levelOf ${v.xp}`);
  }
});

test("whole-XP formatting and ordinals match the add-on", () => {
  for (const v of golden.formatting) assert.equal(m.formatWholeXp(v.in), v.whole_xp, JSON.stringify(v.in));
  for (const v of golden.ordinals) assert.equal(m.ordinal(v.n), v.ord);
});

test("board copy matches the add-on word for word", () => {
  for (const v of golden.notes) {
    if ("untrained" in v) assert.equal(m.untrainedNote(v.board, v.count), v.untrained);
    else assert.equal(m.emptyBoardCopy(v.board, v.population), v.empty);
  }
});

test("rerankByLevel matches the add-on on every case", () => {
  for (const c of golden.rerank) assert.deepEqual(m.rerankByLevel(c.rows), c.out, c.name);
});

test("player index, Overall levels and population match the add-on", () => {
  for (const c of golden.index_cases) {
    const index = m.playerIndex(c.boards);
    for (const board of m.BOARDS) {
      assert.deepEqual(m.rowsWithLevels(board, c.boards[board], index, TH), c.rows_with_levels[board], `${c.name}/${board}`);
      assert.deepEqual(m.population(c.boards[board]), c.population[board], `${c.name}/pop/${board}`);
    }
    assert.deepEqual(m.rerankByLevel(c.rows_with_levels.overall), c.reranked_overall, `${c.name}/rerank`);
    const [trained, untrained] = m.splitTrained(c.rows_with_levels.overall);
    assert.deepEqual([trained.length, untrained.length], c.split_overall, `${c.name}/split`);
  }
});
