// GET /api/boards -> all seven Hiscores boards in one cached JSON body.
//
// Why this exists: the Supabase project is on the Free plan, so a public page
// must not be able to load it in proportion to traffic. The merged body is
// cached at the edge for 60 s; Supabase sees a bounded number of calls no
// matter how many people open the page. The key stays server-side.

const BOARDS = ["overall", "mining", "woodcutting", "smithing", "crafting", "fishing", "cooking"];
const LIMIT = 100;
const TTL_SECONDS = 60;

export class UpstreamError extends Error {}

function validRow(row) {
  return (
    row !== null &&
    typeof row === "object" &&
    Number.isInteger(row.rank) &&
    typeof row.username === "string" &&
    Number.isInteger(row.xp) &&
    row.xp >= 0 &&
    row.xp <= Number.MAX_SAFE_INTEGER &&
    typeof row.is_demo === "boolean"
  );
}

async function fetchBoard(board, env, fetchImpl) {
  const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/hiscores`, {
    method: "POST",
    // No Authorization header: publishable keys are not JWTs.
    headers: { apikey: env.SUPABASE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ p_skill: board, p_limit: LIMIT }),
  });
  if (!res.ok) throw new UpstreamError(`${board}: upstream ${res.status}`);
  let rows;
  try {
    rows = await res.json();
  } catch {
    throw new UpstreamError(`${board}: not JSON`);
  }
  if (!Array.isArray(rows) || rows.length > LIMIT || !rows.every(validRow)) {
    throw new UpstreamError(`${board}: unexpected shape`);
  }
  // Only the four public fields, in a fixed shape.
  return rows.map(({ rank, username, xp, is_demo }) => ({ rank, username, xp, is_demo }));
}

// One bad board fails the whole response: never serve a partly trusted body.
export async function buildBoards(env, fetchImpl = fetch, now = () => new Date()) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_KEY) throw new UpstreamError("not configured");
  const results = await Promise.all(BOARDS.map((b) => fetchBoard(b, env, fetchImpl)));
  const boards = {};
  BOARDS.forEach((b, i) => {
    boards[b] = results[i];
  });
  return { generated_at: now().toISOString(), boards };
}

function json(body, status, cacheControl, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, ...extra },
  });
}

export async function onRequestGet({ env, request, waitUntil }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL("/api/boards", request.url).toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set("x-cache", "HIT");
      return res;
    }
  }
  try {
    const body = await buildBoards(env);
    const res = json(body, 200, `public, max-age=30, s-maxage=${TTL_SECONDS}`, { "x-cache": "MISS" });
    if (cache) waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    // Status only. Never the response body, never the key.
    console.log(`boards: ${err instanceof UpstreamError ? err.message : "failure"}`);
    return json({ error: "unavailable" }, 503, "no-store");
  }
}
