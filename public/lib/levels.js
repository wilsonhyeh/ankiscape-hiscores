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
