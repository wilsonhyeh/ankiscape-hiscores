// Browser checks with the function stubbed by fixtures. Chromium via Playwright.
// Writes screenshots to evidence/ as it goes. Run: npm run check:page
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { serve } from "./_serve.mjs";

const EVIDENCE = new URL("../evidence/", import.meta.url).pathname;
mkdirSync(EVIDENCE, { recursive: true });
const MICRO = 1_000_000;
const SKILLS = ["mining", "woodcutting", "smithing", "crafting", "fishing", "cooking"];
const BOARDS = ["overall", ...SKILLS];

// ---- fixtures -------------------------------------------------------------
function rankRows(entries) {
  const sorted = [...entries].sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
  let last = null, rank = 0;
  return sorted.map((e, i) => {
    if (e.xp !== last) { rank = i + 1; last = e.xp; }
    return { rank, username: e.username, xp: e.xp, is_demo: !!e.is_demo };
  });
}
function fixture(players, generatedAt = new Date().toISOString()) {
  // players: {username, xp:{skill:xpWhole}}
  const boards = {};
  for (const s of SKILLS) boards[s] = rankRows(players.map((p) => ({ username: p.username, xp: (p.xp[s] || 0) * MICRO, is_demo: p.is_demo })));
  boards.overall = rankRows(players.map((p) => ({ username: p.username, xp: SKILLS.reduce((a, s) => a + (p.xp[s] || 0), 0) * MICRO, is_demo: p.is_demo })));
  return { generated_at: generatedAt, boards };
}
const HOSTILE = ['<img src=x onerror="window.__pwned=1">', '"><script>window.__pwned=1</script>'];
const populated = fixture([
  { username: "Ann", xp: { mining: 9000, woodcutting: 40, smithing: 0, crafting: 0, fishing: 0, cooking: 0 } },
  // Bob has lower total XP than Ann but a higher total LEVEL (spread across skills).
  { username: "Bob", xp: { mining: 1500, woodcutting: 1500, smithing: 1500, crafting: 1500, fishing: 1500, cooking: 1500 } },
  { username: "Cy", xp: { mining: 500 } },
  { username: "Dee", xp: { mining: 500 } },
  { username: HOSTILE[0], xp: { mining: 200, fishing: 20 } },
  { username: HOSTILE[1], xp: { mining: 100 } },
  { username: "Eli", xp: { woodcutting: 50 } },
  { username: "Ünï Çödé ✓", xp: { cooking: 30 } },
  { username: "Demo Dan", is_demo: true, xp: { mining: 10 } },
  { username: "Idle1", xp: {} },
  { username: "Idle2", xp: {} },
]);
const two = fixture([{ username: "Ann", xp: { mining: 100 } }, { username: "Bob", xp: { mining: 50 } }]);
const emptyAll = fixture([{ username: "Idle1", xp: {} }, { username: "Idle2", xp: {} }]);
const noPlayers = { generated_at: new Date().toISOString(), boards: Object.fromEntries(BOARDS.map((b) => [b, []])) };
// A capped (100-row) mining board that does not contain the overall leader: their level is unknown.
const capped = (() => {
  const players = Array.from({ length: 100 }, (_, i) => ({ username: `P${String(i).padStart(3, "0")}`, xp: { mining: 1000 - i } }));
  const f = fixture(players);
  f.boards.overall = [{ rank: 1, username: "Ghost", xp: 5000 * MICRO, is_demo: false }, ...f.boards.overall.slice(0, 99).map((r) => ({ ...r, rank: r.rank + 1 }))];
  return f;
})();

// ---- harness --------------------------------------------------------------
const failures = [];
let passed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`  ok   ${name}`); }
  else { failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

const { server, base } = await serve();
const browser = await chromium.launch();

async function open(fixtureOrHandler, { width = 1280, height = 900, reducedMotion = "no-preference", delay = 0, hash = "" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  const problems = { console: [], external: [], csp: [] };
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.console.push(m.text()); });
  page.on("pageerror", (e) => problems.console.push(`pageerror: ${e.message}`));
  page.on("request", (r) => { if (!r.url().startsWith(base)) problems.external.push(r.url()); });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => (window.__csp = (window.__csp || []).concat(e.violatedDirective)));
  });
  await page.route("**/api/boards", async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const out = typeof fixtureOrHandler === "function" ? fixtureOrHandler() : fixtureOrHandler;
    if (out === "error") return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
  });
  await page.goto(`${base}/${hash}`);
  return { page, context, problems };
}
const ready = (page) => page.waitForFunction(() => document.getElementById("board").getAttribute("aria-busy") === "false");
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));

// ---- 1. populated, Overall ------------------------------------------------
console.log("populated / Overall");
{
  const { page, context, problems } = await open(populated);
  await ready(page);
  check("seven tabs", (await page.$$('[role="tab"]')).length === 7);
  check("exactly one tab selected", (await page.$$('[role="tab"][aria-selected="true"]')).length === 1);
  check("Overall is selected first", (await page.getAttribute("#tab-overall", "aria-selected")) === "true");
  const pod = await texts(page, ".pod .who");
  check("podium is top three by XP", pod.length === 3 && pod[0] === "Ann", JSON.stringify(pod));
  check("idle players counted, not listed", (await page.textContent("#note")).includes("2 players haven't started playing yet."));
  check("demo account is labelled", (await page.textContent("body")).includes("Demo Dan  [Demo]"));
  check("hostile usernames render as literal text", (await page.textContent("body")).includes('<img src=x onerror="window.__pwned=1">'));
  check("hostile usernames did not execute", (await page.evaluate(() => window.__pwned)) === undefined);
  check("no <img> elements in the board", (await page.$$("#board img")).length === 0);
  await page.screenshot({ path: EVIDENCE + "fixture-overall-xp-1280.png", fullPage: true });

  await page.click("#sort-level");
  await page.waitForFunction(() => document.getElementById("sort-level").getAttribute("aria-pressed") === "true");
  const byLevel = await texts(page, ".pod .who");
  check("Total level re-ranks (Bob's spread beats Ann's single skill)", byLevel[0] === "Bob", JSON.stringify(byLevel));
  await page.screenshot({ path: EVIDENCE + "fixture-overall-level-1280.png", fullPage: true });
  await page.click("#sort-xp");

  // tabs: keyboard
  await page.focus("#tab-overall");
  await page.keyboard.press("ArrowRight");
  check("ArrowRight selects Mining and moves focus", (await page.getAttribute("#tab-mining", "aria-selected")) === "true" && (await page.evaluate(() => document.activeElement.id)) === "tab-mining");
  await page.keyboard.press("End");
  check("End selects Cooking", (await page.getAttribute("#tab-cooking", "aria-selected")) === "true");
  await page.keyboard.press("ArrowRight");
  check("ArrowRight wraps to Overall", (await page.getAttribute("#tab-overall", "aria-selected")) === "true");
  await page.keyboard.press("Home");
  check("Home selects Overall", (await page.getAttribute("#tab-overall", "aria-selected")) === "true");
  check("hash follows the board", (await page.evaluate(() => location.hash)) === "#overall");
  await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: EVIDENCE + "fixture-mining-1280.png", fullPage: true });
  check("skill board shows skill levels", (await page.textContent("#body")).includes("Lv "));
  check("sort control hidden off Overall", await page.$eval("#sort-row", (e) => e.hidden));

  // keyboard traversal reaches every control
  await page.click("#tab-overall");
  await page.focus(".skip");
  const stops = [];
  const badOutline = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { id: a.id || a.className || a.tagName, outline: `${cs.outlineStyle} ${cs.outlineWidth}` }; });
    stops.push(s.id);
    if (!/solid 3px/.test(s.outline)) badOutline.push(`${s.id}: ${s.outline}`);
  }
  check("Tab reaches the selected tab, both sort buttons and Refresh", stops[0] === "tab-overall" && stops.includes("sort-xp") && stops.includes("sort-level") && stops.includes("refresh"), JSON.stringify(stops));
  check("every focus stop shows a 3px outline", badOutline.length === 0, JSON.stringify(badOutline));

  // structure
  const hs = await page.$$eval("h1, h2, h3", (els) => els.map((e) => e.tagName));
  check("heading order h1 then h2", JSON.stringify(hs) === '["H1","H2"]', JSON.stringify(hs));
  check("one main landmark", (await page.$$("main")).length === 1);
  const snap = await page.locator("body").ariaSnapshot();
  check("a11y tree exposes tablist, tabs, tabpanel, headings", /tablist/.test(snap) && /tab "Overall"/.test(snap) && /tabpanel/.test(snap) && /heading "AnkiScape Hiscores" \[level=1\]/.test(snap), snap.slice(0, 200));
  check("no console errors/warnings", problems.console.length === 0, JSON.stringify(problems.console));
  check("no request left the origin", problems.external.length === 0, JSON.stringify(problems.external));
  check("no CSP violations", ((await page.evaluate(() => window.__csp)) || []).length === 0);

  // refresh cooldown
  await page.click("#refresh");
  check("Refresh disables itself", await page.$eval("#refresh", (b) => b.disabled));
  await context.close();
}

// ---- 2. contrast ----------------------------------------------------------
console.log("contrast");
{
  const { page, context } = await open(populated);
  await ready(page);
  const result = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(",").map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); let acc = { r: 33, g: 30, b: 25, a: 1 }; for (const c of chain.reverse()) if (c.a > 0) acc = blend(c, acc); return acc; };
    const sels = ["h1", ".lede", ".updated", ".tab", ".tab[aria-selected=true]", ".seg", ".seg[aria-pressed=true]", ".board-title", ".pod .who", ".pod .stat", ".pod .stat b", ".pod[data-medal=gold] .medal", ".pod[data-medal=silver] .medal", ".pod[data-medal=bronze] .medal", ".row .rank", ".row .name", ".row .lvl", ".row .xp", ".head-row span", ".note", ".btn", ".foot p"];
    const rows = [];
    for (const s of sels) for (const el of document.querySelectorAll(s)) {
      const fg = parse(getComputedStyle(el).color); const bg = bgOf(el);
      const l1 = lum(blend(fg, bg)), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      rows.push({ s, ratio: Math.round(ratio * 100) / 100 });
      break;
    }
    return rows;
  });
  const low = result.filter((r) => r.ratio < 4.5);
  console.log("  " + result.map((r) => `${r.s}=${r.ratio}`).join("  "));
  check(`body text contrast >= 4.5:1 on ${result.length} element kinds`, low.length === 0, JSON.stringify(low));
  await context.close();
}

// ---- 3. other states -------------------------------------------------------
console.log("states");
{
  let { page, context } = await open(two); await ready(page);
  check("fewer than 3 players: podium of 2, no list", (await page.$$(".pod")).length === 2 && (await page.$$(".list")).length === 0);
  await page.screenshot({ path: EVIDENCE + "fixture-two-players-1280.png", fullPage: true });
  await context.close();

  ({ page, context } = await open(emptyAll)); await ready(page);
  check("empty Overall copy", (await page.textContent("#body")).includes("No one has earned XP yet. Answer some cards and be the first."));
  await page.screenshot({ path: EVIDENCE + "fixture-empty-1280.png", fullPage: true });
  await context.close();

  ({ page, context } = await open(noPlayers, { hash: "#mining" })); await ready(page);
  check("hash #mining opens Mining", (await page.getAttribute("#tab-mining", "aria-selected")) === "true");
  check("no players copy", (await page.textContent("#body")).includes("No players yet."));
  await context.close();

  ({ page, context } = await open("error")); await ready(page);
  check("error state says so plainly", (await page.textContent("#body")).includes("Scores are unavailable right now."));
  check("error state has a retry button", (await page.$("#retry")) !== null);
  await page.screenshot({ path: EVIDENCE + "fixture-error-1280.png", fullPage: true });
  await context.close();

  const old = fixture([{ username: "Ann", xp: { mining: 100 } }], new Date(Date.now() - 40 * 60000).toISOString());
  ({ page, context } = await open(old)); await ready(page);
  check("stale banner after 15+ minutes", (await page.textContent("#banner")).includes("may be out of date") && !(await page.$eval("#banner", (b) => b.hidden)));
  check("age shown", /Updated \d+ minutes ago/.test(await page.textContent("#updated")));
  await context.close();

  ({ page, context } = await open(capped)); await ready(page);
  check("Total-level toggle disabled when a level is unknown", await page.$eval("#sort-level", (b) => b.disabled));
  await context.close();

  // refresh failure keeps the last good scores
  let calls = 0;
  ({ page, context } = await open(() => (++calls === 1 ? populated : "error"))); await ready(page);
  await page.click("#refresh");
  await page.waitForFunction(() => !document.getElementById("banner").hidden);
  check("failed refresh keeps last scores and says so", (await page.textContent("#banner")).includes("Couldn't refresh") && (await page.$$(".pod")).length === 3);
  await context.close();

  // loading skeleton + reduced motion
  ({ page, context } = await open(populated, { delay: 1200 }));
  await page.waitForSelector(".skel");
  const anim = await page.$eval(".skel span", (e) => getComputedStyle(e).animationName);
  check("skeleton animates by default", anim !== "none", anim);
  await page.screenshot({ path: EVIDENCE + "fixture-loading-1280.png" });
  await context.close();
  ({ page, context } = await open(populated, { delay: 1200, reducedMotion: "reduce" }));
  await page.waitForSelector(".skel");
  check("reduced motion turns the skeleton animation off", (await page.$eval(".skel span", (e) => getComputedStyle(e).animationName)) === "none");
  await context.close();
}

// ---- 4. responsive -----------------------------------------------------------
console.log("responsive");
for (const w of [640, 360, 320]) {
  const { page, context } = await open(populated, { width: w, height: 800 }); await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no horizontal scroll at ${w}px`, overflow <= 0, `overflow ${overflow}`);
  if (w === 360) {
    await page.screenshot({ path: EVIDENCE + "fixture-overall-360.png", fullPage: true });
    await page.click("#tab-mining");
    await page.screenshot({ path: EVIDENCE + "fixture-mining-360.png", fullPage: true });
  }
  await context.close();
}

// ---- 5. unknown path -> 404 ------------------------------------------------------
{
  const res = await fetch(`${base}/nope`);
  check("unknown path is a real 404 (no SPA fallback)", res.status === 404);
  const ok = await fetch(`${base}/`);
  check("X-Robots-Tag noindex on the page", (ok.headers.get("x-robots-tag") || "").includes("noindex"));
  check("CSP header present", (ok.headers.get("content-security-policy") || "").includes("default-src 'none'"));
}

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error("check:page FAILED\n" + failures.map((f) => "  " + f).join("\n")); process.exit(1); }
