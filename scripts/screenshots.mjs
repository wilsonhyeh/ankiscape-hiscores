// Screenshots of a RUNNING preview with real data. Usage: node scripts/screenshots.mjs [base]
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:8788";
const out = new URL("../evidence/", import.meta.url).pathname;
const browser = await chromium.launch();
for (const [w, h] of [[1280, 900], [360, 800]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById("board").getAttribute("aria-busy") === "false");
  await page.screenshot({ path: `${out}live-overall-xp-${w}.png`, fullPage: true });
  await page.click("#sort-level");
  await page.screenshot({ path: `${out}live-overall-level-${w}.png`, fullPage: true });
  await page.click("#tab-mining");
  await page.screenshot({ path: `${out}live-mining-${w}.png`, fullPage: true });
  await page.click("#tab-overall");
  await page.click("#sort-xp");
  await page.locator(".row").first().click();
  await page.screenshot({ path: `${out}live-card-${w}.png`, fullPage: true });
}
await browser.close();
console.log("done");
