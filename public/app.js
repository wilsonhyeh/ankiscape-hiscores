import {
  BOARDS, OVERALL, SORT_LEVEL, SORT_XP, boardTitle, displayName, emptyBoardCopy, formatWholeXp,
  levelLabel, ordinal, playerIndex, rerankByLevel, rowsWithLevels, splitTrained, untrainedNote,
} from "./lib/model.js";
import { boardFromHash, isStale, medalFor, updatedText } from "./lib/render.js";

const REFRESH_MS = 60_000;
const COOLDOWN_MS = 10_000;

const $ = (id) => document.getElementById(id);
const state = {
  board: boardFromHash(location.hash, BOARDS) || OVERALL,
  sort: SORT_XP,
  data: null,
  thresholds: null,
  failed: false,
  refreshFailed: false,
  loading: true,
  lastFetch: 0,
};

// Text only. Usernames are user-chosen strings and are never parsed as HTML.
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids) if (kid) node.append(kid);
  return node;
}

// ---------------------------------------------------------------- tabs --

function buildTabs() {
  const tabs = $("tabs");
  for (const board of BOARDS) {
    const b = el("button", {
      type: "button", role: "tab", id: `tab-${board}`, class: "tab", "data-board": board,
      "aria-controls": "board", text: boardTitle(board),
    });
    b.addEventListener("click", () => selectBoard(board, false));
    b.addEventListener("keydown", onTabKey);
    tabs.append(b);
  }
}

function onTabKey(e) {
  const i = BOARDS.indexOf(state.board);
  let next = null;
  if (e.key === "ArrowRight") next = BOARDS[(i + 1) % BOARDS.length];
  else if (e.key === "ArrowLeft") next = BOARDS[(i + BOARDS.length - 1) % BOARDS.length];
  else if (e.key === "Home") next = BOARDS[0];
  else if (e.key === "End") next = BOARDS[BOARDS.length - 1];
  if (next) {
    e.preventDefault();
    selectBoard(next, true);
  }
}

function selectBoard(board, focus) {
  state.board = board;
  if (location.hash.replace(/^#/, "") !== board) history.replaceState(null, "", `#${board}`);
  render();
  if (focus) $(`tab-${board}`).focus();
}

// -------------------------------------------------------------- render --

function skeleton() {
  const s = el("div", { class: "skel", "aria-hidden": "true" });
  for (let i = 0; i < 6; i += 1) s.append(el("span"));
  return s;
}

function podiumCard(row, board) {
  const medal = medalFor(row.rank);
  const card = el("li", { class: "pod", ...(medal ? { "data-medal": medal } : {}) });
  card.append(
    el("span", { class: "medal", text: `${medal ? medal[0].toUpperCase() + medal.slice(1) : "Rank"} ${ordinal(row.rank)}` }),
    el("span", { class: "who", text: displayName(row) }),
    el("span", { class: "stat" }, el("b", { text: levelLabel(board, row.level) }), ` · ${formatWholeXp(row)} XP`),
  );
  return card;
}

function listRow(row, board) {
  return el("li", { class: "row" },
    el("span", { class: "rank", text: ordinal(row.rank) }),
    el("span", { class: "name", text: displayName(row) }),
    el("span", { class: "lvl", text: levelLabel(board, row.level) }),
    el("span", { class: "xp", text: `${formatWholeXp(row)} XP` }),
  );
}

function view() {
  const { board, data, thresholds } = state;
  const rows = data.boards[board] || [];
  const index = playerIndex(data.boards);
  const enriched = rowsWithLevels(board, rows, index, thresholds);
  let levelSortAvailable = false;
  let shown = enriched;
  if (board === OVERALL) {
    const reranked = rerankByLevel(enriched);
    levelSortAvailable = reranked !== null;
    if (state.sort === SORT_LEVEL && reranked) shown = reranked;
  }
  return { rows, shown, levelSortAvailable };
}

function render() {
  for (const b of BOARDS) {
    const t = $(`tab-${b}`);
    t.setAttribute("aria-selected", String(b === state.board));
    t.tabIndex = b === state.board ? 0 : -1;
  }
  const panel = $("board");
  panel.setAttribute("aria-labelledby", `tab-${state.board}`);
  panel.setAttribute("aria-busy", String(state.loading));
  $("board-title").textContent = boardTitle(state.board);
  $("sort-row").hidden = state.board !== OVERALL;
  document.title = `${boardTitle(state.board)} · AnkiScape Hiscores`;

  const body = $("body");
  const banner = $("banner");
  banner.hidden = true;
  banner.className = "banner";
  $("note").textContent = "";

  if (!state.data) {
    body.replaceChildren();
    if (state.failed) {
      body.append(el("div", { class: "empty" },
        el("p", { text: "Scores are unavailable right now." }),
        Object.assign(el("button", { type: "button", class: "btn", id: "retry", text: "Try again" }),
          { onclick: () => load(true) })));
    } else {
      body.append(skeleton());
    }
    $("updated").textContent = "";
    return;
  }

  const { rows, shown, levelSortAvailable } = view();
  $("sort-xp").setAttribute("aria-pressed", String(!(state.sort === SORT_LEVEL && levelSortAvailable)));
  $("sort-level").setAttribute("aria-pressed", String(state.sort === SORT_LEVEL && levelSortAvailable));
  $("sort-level").disabled = !levelSortAvailable;
  $("sort-level").title = levelSortAvailable ? "" : "Not every player's level is known yet";

  $("updated").textContent = updatedText(state.data.generated_at);
  if (state.refreshFailed) {
    banner.hidden = false;
    banner.classList.add("error");
    banner.textContent = "Couldn't refresh. Showing the last scores that loaded.";
  } else if (isStale(state.data.generated_at)) {
    banner.hidden = false;
    banner.textContent = "These scores may be out of date.";
  }

  const [trained, untrained] = splitTrained(shown);
  body.replaceChildren();
  if (trained.length === 0) {
    body.append(el("p", { class: "empty", text: emptyBoardCopy(state.board, rows.length) }));
  } else {
    const podium = el("ol", { class: "podium", "aria-label": "Top three" });
    for (const row of trained.slice(0, 3)) podium.append(podiumCard(row, state.board));
    body.append(podium);
    const rest = trained.slice(3);
    if (rest.length) {
      const list = el("ol", { class: "list", start: "4", "aria-label": "Other players" });
      list.append(el("li", { class: "row head-row", "aria-hidden": "true" },
        el("span", { text: "Rank" }), el("span", { text: "Player" }),
        el("span", { text: "Level" }), el("span", { class: "xp", text: "XP" })));
      for (const row of rest) list.append(listRow(row, state.board));
      body.append(list);
    }
  }
  $("note").textContent = untrainedNote(state.board, untrained.length);
}

// ---------------------------------------------------------------- data --

let inflight = null;

async function load(manual = false) {
  if (inflight) return inflight;
  state.loading = true;
  if (!state.data) {
    state.failed = false;
    render();
  }
  inflight = (async () => {
    try {
      if (!state.thresholds) {
        const r = await fetch("/lib/rules.json", { cache: "no-cache" });
        if (!r.ok) throw new Error("rules");
        state.thresholds = (await r.json()).thresholds;
      }
      const res = await fetch("/api/boards", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`boards ${res.status}`);
      const data = await res.json();
      if (!data || typeof data.boards !== "object" || !BOARDS.every((b) => Array.isArray(data.boards[b]))) {
        throw new Error("shape");
      }
      state.data = data;
      state.failed = false;
      state.refreshFailed = false;
    } catch {
      if (state.data) state.refreshFailed = true;
      else state.failed = true;
    } finally {
      state.loading = false;
      state.lastFetch = Date.now();
      inflight = null;
      render();
    }
  })();
  return inflight;
}

function manualRefresh() {
  const btn = $("refresh");
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, COOLDOWN_MS);
  load(true);
}

// ---------------------------------------------------------------- wire --

buildTabs();
$("sort-xp").addEventListener("click", () => { state.sort = SORT_XP; render(); });
$("sort-level").addEventListener("click", () => { state.sort = SORT_LEVEL; render(); });
$("refresh").addEventListener("click", manualRefresh);
window.addEventListener("hashchange", () => {
  const b = boardFromHash(location.hash, BOARDS);
  if (b && b !== state.board) selectBoard(b, false);
});
setInterval(() => {
  if (document.visibilityState === "visible") load();
  else if (state.data) render();
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - state.lastFetch >= REFRESH_MS) load();
});
render();
load();
