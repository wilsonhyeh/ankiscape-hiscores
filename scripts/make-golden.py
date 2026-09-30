#!/usr/bin/env python3
"""Generate tests/golden.json from the add-on's REAL Python, so the JS port
cannot drift from it. Run: python3 scripts/make-golden.py [addon_repo_path]

Deterministic: no clocks, no randomness. Re-running must give identical bytes.
"""
import json
import os
import sys

ADDON = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                           else "~/Documents/AnkiScape")
sys.path.insert(0, ADDON)
import evolved.ui.hiscores_model as hm  # noqa: E402

RULES = json.load(open(os.path.join(ADDON, "shared", "rules-v1.json")))
TH = RULES["thresholds"]
MICRO = RULES["micro_xp_per_xp"]

# ---- level vectors ---------------------------------------------------------
xps = {0, 1, 82 * MICRO, 83 * MICRO - 1, 83 * MICRO, 83 * MICRO + 1, -1,
       10_300_500_000, 10**15}
for t in TH:
    xps |= {t * MICRO - 1, t * MICRO, t * MICRO + 1}
levels = [{"xp": x, "level": hm.level_of(x, TH)} for x in sorted(xps)]

# ---- formatting -------------------------------------------------------------
fmt_inputs = [0, 999_999, 1_000_000, 1_999_999, 10_300_500_000, 123_456_789_012,
              "5000000", "bad", None, -5]
formatting = [{"in": v, "whole_xp": hm.format_whole_xp(v)} for v in fmt_inputs]
ordinals = [{"n": n, "ord": hm.ordinal(n)}
            for n in [1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 100, 101, 111, 112]]
notes = []
for board in hm.BOARDS:
    for c in (0, 1, 2, 7):
        notes.append({"board": board, "count": c,
                      "untrained": hm.untrained_note(board, c)})
    for pop in (0, 3):
        notes.append({"board": board, "population": pop,
                      "empty": hm.empty_board_copy(board, pop)})

# ---- rerank -----------------------------------------------------------------
def r(username, xp, level, rank=1, demo=False):
    return {"rank": rank, "username": username, "xp": xp, "is_demo": demo,
            "level": level}

rerank_inputs = {
    "level_beats_xp": [r("a", 900, 10), r("b", 100, 12)],
    "tie_level_xp_breaks": [r("a", 500, 30), r("b", 700, 30), r("c", 100, 29)],
    "tie_both_share_rank": [r("zed", 500, 30), r("amy", 500, 30), r("bob", 400, 30)],
    "mixed_case_and_unicode": [r("Éclair", 5, 5), r("apple", 5, 5), r("Zoë", 5, 5),
                               r("ßeta", 5, 5), r("STRASSE", 5, 5), r("strasse2", 5, 5)],
    "unknown_level_is_null": [r("a", 5, 3), r("b", 4, None)],
    "empty": [],
    "single": [r("solo", 1_000_000, 7)],
    "demo_flag_kept": [r("d", 1, 2, demo=True), r("e", 2, 2)],
}
rerank = [{"name": k, "rows": v, "out": hm.rerank_by_level(v)}
          for k, v in rerank_inputs.items()]

# ---- player index + Overall levels -----------------------------------------
def board(prefix_xp):
    """Rows for a board from {username: xp}, ranked by xp desc (server style)."""
    rows, last, rank = [], None, 0
    ordered = sorted(prefix_xp.items(), key=lambda kv: (-kv[1], kv[0].casefold()))
    for i, (name, xp) in enumerate(ordered, start=1):
        if xp != last:
            rank, last = i, xp
        rows.append({"rank": rank, "username": name, "xp": xp, "is_demo": False})
    return rows

def overall_from(skill_xp):
    tot = {}
    for s in hm.SKILLS:
        for n, x in skill_xp.get(s, {}).items():
            tot[n] = tot.get(n, 0) + x
    return board(tot)

cases = {}
skill_xp = {
    "mining": {"Ann": 5000 * MICRO, "Bob": 300 * MICRO, "Cy": 0},
    "woodcutting": {"Ann": 90 * MICRO, "Cy": 0},
    "smithing": {"Bob": 10 * MICRO, "Cy": 0},
    "crafting": {"Cy": 0},
    "fishing": {"Ann": 1 * MICRO, "Cy": 0},
    "cooking": {"Cy": 0},
}
cases["small_complete_boards"] = skill_xp

# a CAPPED board: exactly 100 rows, so a player not on it has unknown XP.
big = {f"P{i:03d}": (200 - i) * MICRO for i in range(100)}
big2 = dict(big)
skill_xp2 = {s: dict(big) for s in hm.SKILLS}
skill_xp2["mining"] = big2
skill_xp2["cooking"] = {"Only": 1 * MICRO}     # complete board, short
cases["capped_boards"] = skill_xp2

index_cases = []
for name, sx in cases.items():
    boards = {s: board(sx.get(s, {})) for s in hm.SKILLS}
    boards[hm.OVERALL] = overall_from(sx)
    idx = hm.player_index(boards)
    lv = {}
    for board_id in hm.BOARDS:
        lv[board_id] = hm.rows_with_levels(board_id, boards[board_id], idx, TH)
    index_cases.append({
        "name": name, "boards": boards,
        "rows_with_levels": lv,
        "reranked_overall": hm.rerank_by_level(lv[hm.OVERALL]),
        "split_overall": [len(x) for x in hm.split_trained(lv[hm.OVERALL])],
        "population": {b: list(hm.population(boards[b])) for b in hm.BOARDS},
    })

out = {
    "generated_from": "evolved/ui/hiscores_model.py + evolved/logic_pure.py",
    "thresholds_len": len(TH),
    "levels": levels, "formatting": formatting, "ordinals": ordinals,
    "notes": notes, "rerank": rerank, "index_cases": index_cases,
}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "tests", "golden.json"), "w") as f:
    json.dump(out, f, indent=1, sort_keys=True, ensure_ascii=False)
    f.write("\n")
print("levels", len(levels), "rerank", len(rerank), "index_cases", len(index_cases))
