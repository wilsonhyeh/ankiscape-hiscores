// Small pure helpers for the page. No DOM.
export const STALE_MS = 15 * 60 * 1000;

export function ageMs(generatedAt, now = Date.now()) {
  const t = Date.parse(generatedAt);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

export function isStale(generatedAt, now = Date.now()) {
  const age = ageMs(generatedAt, now);
  return age === null || age > STALE_MS;
}

export function updatedText(generatedAt, now = Date.now()) {
  const age = ageMs(generatedAt, now);
  if (age === null) return "";
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "Updated 1 hour ago" : `Updated ${hours} hours ago`;
}

export function boardFromHash(hash, boards) {
  const id = String(hash || "").replace(/^#/, "").toLowerCase();
  return boards.includes(id) ? id : null;
}

export function medalFor(rank) {
  return { 1: "gold", 2: "silver", 3: "bronze" }[rank] || null;
}
