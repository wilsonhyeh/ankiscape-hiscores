// Pure Hiscores presentation logic, a port of evolved/ui/hiscores_model.py.
// No DOM here. Parity with the add-on is enforced by tests/golden.json,
// which is generated from the add-on's real Python.
import { MICRO, levelFromXpMicro } from "./levels.js";

export const SKILLS = ["mining", "woodcutting", "smithing", "crafting", "fishing", "cooking"];
export const OVERALL = "overall";
export const BOARDS = [OVERALL, ...SKILLS];
export const BOARD_LIMIT = 100;
export const SORT_XP = "xp";
export const SORT_LEVEL = "level";

export function boardTitle(board) {
  return board === OVERALL ? "Overall" : board.charAt(0).toUpperCase() + board.slice(1);
}

// Python's str.casefold() for the cases that differ from toLowerCase() in
// practice (German sharp s, final sigma). Usernames are almost always ASCII.
export function casefold(value) {
  return String(value ?? "").toLowerCase().replace(/ß/g, "ss").replace(/ς/g, "σ");
}

export function xpInt(rowOrMicro) {
  const value = rowOrMicro !== null && typeof rowOrMicro === "object" ? rowOrMicro.xp : rowOrMicro;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function formatWholeXp(micro) {
  return Math.floor(xpInt(micro) / MICRO).toLocaleString("en-US");
}

export function levelOf(micro, thresholds) {
  if (!thresholds || thresholds.length === 0) return 1;
  return levelFromXpMicro(xpInt(micro), thresholds);
}

export function splitTrained(rows) {
  const trained = [];
  const untrained = [];
  for (const row of rows || []) (xpInt(row) > 0 ? trained : untrained).push(row);
  return [trained, untrained];
}

export function untrainedNote(board, count) {
  if (count <= 0) return "";
  const who = count === 1 ? "1 player hasn't" : `${count} players haven't`;
  const where = board === OVERALL ? "started playing yet" : `trained ${boardTitle(board)} yet`;
  return `${who} ${where}.`;
}

export function emptyBoardCopy(board, population) {
  if (board === OVERALL) return "No one has earned XP yet. Answer some cards and be the first.";
  if (population <= 0) return "No players yet.";
  return `No one has trained ${boardTitle(board)} yet. Be the first on the board.`;
}

// [player count, exact]. `exact` is false when the board hit the server cap.
export function population(rows) {
  const n = (rows || []).length;
  return [n, n < BOARD_LIMIT];
}

export function ordinal(n) {
  n = Math.trunc(n);
  let suffix;
  const m100 = n % 100;
  if (m100 >= 10 && m100 <= 20) suffix = "th";
  else suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${suffix}`;
}

// casefold name -> { name, xp: {skill: micro|null}, ranks: {board: rank}, is_demo }.
// A player missing from a *complete* skill board (shorter than the cap) has 0
// XP there. Missing from a capped board means unknown (null): a level is never
// invented.
export function playerIndex(boards) {
  const index = new Map();
  for (const [board, rows] of Object.entries(boards)) {
    for (const row of rows || []) {
      const key = casefold(row.username);
      if (!key) continue;
      if (!index.has(key)) index.set(key, { name: row.username, xp: {}, ranks: {}, is_demo: false });
      const entry = index.get(key);
      entry.ranks[board] = row.rank;
      if (row.is_demo === true) entry.is_demo = true;
      if (board !== OVERALL) entry.xp[board] = xpInt(row);
    }
  }
  for (const skill of SKILLS) {
    const rows = boards[skill];
    if (rows === undefined || rows === null) continue;
    const [, exact] = population(rows);
    for (const entry of index.values()) {
      if (!(skill in entry.xp)) entry.xp[skill] = exact ? 0 : null;
    }
  }
  return index;
}

// Sum of the six skill levels, or null if any skill is unknown.
export function totalLevel(xpBySkill, thresholds) {
  let total = 0;
  for (const skill of SKILLS) {
    const value = xpBySkill[skill];
    if (value === undefined || value === null) return null;
    total += levelOf(value, thresholds);
  }
  return total;
}

export function rowsWithLevels(board, rows, index, thresholds) {
  if (board === OVERALL) {
    return (rows || []).map((row) => {
      const entry = index.get(casefold(row.username));
      return { ...row, level: entry ? totalLevel(entry.xp, thresholds) : null };
    });
  }
  return (rows || []).map((row) => ({ ...row, level: levelOf(row, thresholds) }));
}

// Overall ordered by total level, ties broken by XP. Equal (level, xp) share a
// rank. Returns null while any total level is unknown.
export function rerankByLevel(rows) {
  const list = [...(rows || [])];
  if (list.some((r) => r.level === null || r.level === undefined)) return null;
  const name = (r) => casefold(r.username);
  list.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    const dx = xpInt(b) - xpInt(a);
    if (dx !== 0) return dx;
    return name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0;
  });
  const out = [];
  let last = null;
  let rank = 0;
  list.forEach((row, i) => {
    const key = `${row.level}:${xpInt(row)}`;
    if (key !== last) {
      rank = i + 1;
      last = key;
    }
    out.push({ ...row, rank });
  });
  return out;
}

export function displayName(row) {
  const name = String(row.username ?? "?");
  return row.is_demo ? `${name}  [Demo]` : name;
}

export function levelLabel(board, level) {
  if (level === null || level === undefined) return "—";
  return board === OVERALL ? `Total ${level}` : `Lv ${level}`;
}
