// Level math, a direct port of evolved/logic_pure.py level_from_xp_micro.
// XP is micro-XP (1,000,000 per XP) everywhere; thresholds are whole XP.
export const MICRO = 1_000_000;

export function levelFromXpMicro(xpMicro, thresholds) {
  if (xpMicro < 0) return 1;
  let level = 1;
  const top = Math.min(thresholds.length, 99);
  for (let idx = 1; idx < top; idx += 1) {
    if (xpMicro >= thresholds[idx] * MICRO) level = idx + 1;
    else break;
  }
  return Math.max(1, Math.min(99, level));
}

// Progress toward the next level in [0, 1]; 1 at level 99. Port of
// evolved/ui/theme.py xp_progress (same float division, so results are identical).
export function xpProgress(currentMicro, thresholds, level) {
  let lvl = Math.trunc(level);
  if (lvl >= 99) return 1;
  if (lvl < 1) lvl = 1;
  const current = Math.max(0, Math.trunc(currentMicro));
  const base = thresholds.length ? thresholds[lvl - 1] * MICRO : 0;
  const nxt = thresholds.length && lvl < thresholds.length ? thresholds[lvl] * MICRO : base;
  const span = nxt - base;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (current - base) / span));
}

// Whole XP still needed for the next level (0 at level 99). Same arithmetic as
// the add-on's XpBar.set_xp caption.
export function xpToNext(currentMicro, thresholds, level) {
  const lvl = Math.trunc(level);
  if (lvl >= 99 || lvl < 1 || lvl >= thresholds.length) return 0;
  const remaining = Math.max(0, thresholds[lvl] * MICRO - Math.max(0, Math.trunc(currentMicro)));
  return Math.floor(remaining / MICRO);
}
