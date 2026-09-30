import test from "node:test";
import assert from "node:assert/strict";
import { buildBoards, UpstreamError, onRequestGet } from "../functions/api/boards.js";

const ENV = { SUPABASE_URL: "https://example.invalid", SUPABASE_KEY: "test-key-not-real" };
const row = (rank, username, xp) => ({ rank, username, xp, is_demo: false });
const okFetch = (rowsFor = () => [row(1, "a", 5)]) => async (url, init) => {
  const { p_skill } = JSON.parse(init.body);
  return new Response(JSON.stringify(rowsFor(p_skill)), { status: 200 });
};

test("happy path: seven boards, fixed shape, key sent as apikey only", async () => {
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, init });
    return okFetch()(url, init);
  };
  const out = await buildBoards(ENV, f, () => new Date("2026-01-02T03:04:05Z"));
  assert.deepEqual(Object.keys(out.boards), ["overall", "mining", "woodcutting", "smithing", "crafting", "fishing", "cooking"]);
  assert.equal(out.generated_at, "2026-01-02T03:04:05.000Z");
  assert.equal(seen.length, 7);
  for (const s of seen) {
    assert.equal(s.init.headers.apikey, ENV.SUPABASE_KEY);
    assert.equal(s.init.headers.authorization, undefined);
    assert.equal(s.init.headers.Authorization, undefined);
    assert.equal(JSON.parse(s.init.body).p_limit, 100);
  }
});

test("extra upstream fields are dropped", async () => {
  const f = okFetch(() => [{ ...row(1, "a", 5), email: "leak@example.com" }]);
  const out = await buildBoards(ENV, f);
  assert.deepEqual(Object.keys(out.boards.overall[0]).sort(), ["is_demo", "rank", "username", "xp"]);
});

test("malformed board -> whole build fails", async () => {
  const f = okFetch((b) => (b === "mining" ? { not: "an array" } : [row(1, "a", 5)]));
  await assert.rejects(buildBoards(ENV, f), UpstreamError);
});

test("xp as a string -> fails", async () => {
  const f = okFetch((b) => (b === "cooking" ? [{ ...row(1, "a", 5), xp: "5" }] : [row(1, "a", 5)]));
  await assert.rejects(buildBoards(ENV, f), UpstreamError);
});

test("negative or unsafe xp -> fails", async () => {
  await assert.rejects(buildBoards(ENV, okFetch(() => [row(1, "a", -1)])), UpstreamError);
  await assert.rejects(buildBoards(ENV, okFetch(() => [row(1, "a", 2 ** 60)])), UpstreamError);
});

test("more than 100 rows -> fails", async () => {
  const many = Array.from({ length: 101 }, (_, i) => row(i + 1, `p${i}`, 1));
  await assert.rejects(buildBoards(ENV, okFetch(() => many)), UpstreamError);
});

test("upstream 401/500 -> fails", async () => {
  for (const status of [401, 500]) {
    const f = async () => new Response("nope", { status });
    await assert.rejects(buildBoards(ENV, f), UpstreamError);
  }
});

test("missing config -> fails without calling out", async () => {
  await assert.rejects(buildBoards({}, () => assert.fail("must not fetch")), UpstreamError);
});

test("handler: 503 is no-store and leaks nothing", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("secret upstream body test-key-not-real", { status: 500 });
  const logs = [];
  const realLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    const res = await onRequestGet({ env: ENV, request: new Request("https://x.test/api/boards"), waitUntil() {} });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    assert.equal(text, '{"error":"unavailable"}');
    assert.ok(!logs.join("\n").includes("test-key-not-real"));
    assert.ok(!logs.join("\n").includes("secret upstream body"));
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});

test("handler: 200 is cacheable and body has no key", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = okFetch();
  try {
    const res = await onRequestGet({ env: ENV, request: new Request("https://x.test/api/boards"), waitUntil() {} });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control"), /s-maxage=60/);
    assert.ok(!(await res.text()).includes("test-key-not-real"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
