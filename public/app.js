import {
  BOARDS, OVERALL, SORT_LEVEL, SORT_XP, barState, boardTitle, cardRows, cardSummary, casefold,
  displayName, emptyBoardCopy, formatWholeXp, levelLabel, playerIndex, rerankByLevel, rowsWithLevels,
  splitTrained, untrainedNote,
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
  card: null, // casefolded username while a player card is open
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
  state.card = null;
  if (location.hash.replace(/^#/, "") !== board) history.replaceState(null, "", `#${board}`);
  render();
  if (focus) $(`tab-${board}`).focus();
}

// -------------------------------------------------------------- render --

// A refresh rebuilds the list or card. Keep keyboard focus on the same control.
function captureFocus() {
  const a = document.activeElement;
  if (!a || !$("body").contains(a)) return null;
  return a.dataset.key ? { key: a.dataset.key } : a.id ? { id: a.id } : null;
}

function restoreFocus(saved) {
  if (!saved) return;
  const node = saved.key
    ? [...document.querySelectorAll(".row")].find((b) => b.dataset.key === saved.key)
    : document.getElementById(saved.id);
  if (node) node.focus();
}

function skeleton() {
  const s = el("div", { class: "skel", "aria-hidden": "true" });
  for (let i = 0; i < 6; i += 1) s.append(el("span"));
  return s;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// The medal "bar": an original ingot icon in the add-on's gold/silver/bronze.
// (The add-on uses the game's own bar art; that art is not cleared for
// redistribution, see docs/ASSET-RIGHTS.md in the add-on repo.)
function medalBar(medal) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 16");
  svg.setAttribute("class", "medal-bar");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const top = document.createElementNS(SVG_NS, "path");
  top.setAttribute("class", "bar-top");
  top.setAttribute("d", "M6 1h12l5 6H1z");
  const front = document.createElementNS(SVG_NS, "path");
  front.setAttribute("class", "bar-front");
  front.setAttribute("d", "M1 7h22v8H1z");
  svg.append(top, front);
  svg.dataset.medal = medal;
  return svg;
}

function rowLabel(row, board, medal) {
  const parts = [`Rank ${row.rank}`, displayName(row), levelLabel(board, row.level), `${formatWholeXp(row)} XP`];
  if (medal) parts.splice(1, 0, `${medal} medal`);
  return parts.join(", ") + ". Open player card.";
}

function listRow(row, board) {
  const medal = medalFor(row.rank);
  const btn = el("button", {
    type: "button", class: "row", "data-key": casefold(row.username),
    ...(medal ? { "data-medal": medal } : {}),
    "aria-label": rowLabel(row, board, medal),
  });
  const name = el("span", { class: "name" }, el("span", { class: "name-text", text: displayName(row) }));
  if (medal) name.append(medalBar(medal));
  btn.append(
    el("span", { class: "rank", text: `#${row.rank}` }),
    name,
    el("span", { class: "lvl", text: levelLabel(board, row.level) }),
    el("span", { class: "xp", text: `${formatWholeXp(row)} XP` }),
  );
  btn.addEventListener("click", () => openCard(btn.dataset.key));
  return el("li", {}, btn);
}

// ------------------------------------------------------------ player card --

function skillRow(r, thresholds) {
  const bar = barState(r, thresholds);
  const pct = Math.round(bar.fraction * 100);
  const fill = el("div", { class: "fill" });
  fill.style.setProperty("--p", `${bar.fraction * 100}%`); // CSSOM, allowed under the strict CSP
  const track = el("div", {
    class: "xpbar", role: "progressbar", "aria-label": `${r.title} progress`,
    "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-valuetext": bar.caption,
  }, fill);
  return el("li", { class: "skill", "data-kind": bar.kind },
    el("span", { class: "s-name", text: r.title }),
    el("span", { class: "s-lvl", text: r.level === null ? "—" : `Lv ${r.level}` }),
    el("div", { class: "s-bar" }, track, el("span", { class: "s-cap", text: bar.caption })),
    el("span", { class: "s-xp", text: r.xp === null ? "" : `${formatWholeXp(r.xp)} XP` }),
    el("span", { class: "s-rank", text: r.rank ? `#${r.rank}` : "" }),
  );
}

function renderCard(entry) {
  const th = state.thresholds;
  const sum = cardSummary(entry, th);
  const rows = cardRows(entry, th);
  const parts = [sum.total_level !== null ? `Total level ${sum.total_level}` : "Total level unavailable"];
  if (sum.total_xp !== null) parts.push(`${formatWholeXp(sum.total_xp)} XP`);
  if (sum.overall_rank) parts.push(`Overall #${sum.overall_rank}`);
  if (sum.best) parts.push(`Best at ${boardTitle(sum.best)}`);
  const list = el("ol", { class: "skills", "aria-label": "Skills" });
  for (const r of rows) list.append(skillRow(r, th));
  const back = el("button", { type: "button", class: "btn back", id: "card-back", text: "◀ Back to rankings" });
  back.addEventListener("click", closeCard);
  const wrap = el("div", { class: "card" }, back, el("p", { class: "card-summary", text: parts.join("  ·  ") }), list);
  if (rows.some((r) => r.xp === null)) {
    wrap.append(el("p", { class: "note", text: "Skills marked unknown are outside the top 100 on their board." }));
  }
  return { node: wrap, title: displayName({ username: sum.name, is_demo: sum.is_demo }) };
}

function openCard(key) {
  state.card = key;
  render();
  $("board-title").focus();
}

function closeCard() {
  const key = state.card;
  state.card = null;
  render();
  const back = key ? [...document.querySelectorAll(".row")].find((b) => b.dataset.key === key) : null;
  (back || $(`tab-${state.board}`)).focus();
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
  $("board-title").classList.remove("is-card");
  $("board-title").removeAttribute("tabindex");
  $("sort-row").hidden = state.board !== OVERALL || state.card !== null;
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

  if (state.card !== null) {
    const entry = playerIndex(state.data.boards).get(state.card);
    const open = body.querySelector(".card");
    if (entry && open && open.dataset.key === state.card && open.dataset.stamp === state.data.generated_at) {
      return; // same card, same data: keep it (and the keyboard focus inside it) as is
    }
    if (entry) {
      const { node, title } = renderCard(entry);
      node.dataset.key = state.card;
      node.dataset.stamp = state.data.generated_at;
      const heading = $("board-title");
      heading.textContent = title;
      heading.classList.add("is-card");
      heading.setAttribute("tabindex", "-1");
      document.title = `${title} · AnkiScape Hiscores`;
      const saved = captureFocus();
      body.replaceChildren(node);
      restoreFocus(saved);
      $("note").textContent = "";
      return;
    }
    state.card = null; // the player left the board since the card was opened
  }

  const [trained, untrained] = splitTrained(shown);
  const savedFocus = captureFocus();
  body.replaceChildren();
  if (trained.length === 0) {
    body.append(el("p", { class: "empty", text: emptyBoardCopy(state.board, rows.length) }));
  } else {
    const list = el("ol", { class: "list", "aria-label": `${boardTitle(state.board)} rankings` });
    list.append(el("li", { class: "head-row", "aria-hidden": "true" },
      el("span", { text: "Rank" }), el("span", { text: "Player" }), el("span", { text: "Level" }),
      el("span", { class: "xp", text: "XP" })));
    for (const row of trained) list.append(listRow(row, state.board));
    body.append(list);
  }
  restoreFocus(savedFocus);
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.card !== null) {
    e.preventDefault();
    closeCard();
  }
});
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
