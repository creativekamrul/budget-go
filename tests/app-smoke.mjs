import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Safe pre-database V2 checks only: never signs in or mutates any database.
// Financial, tenant, token and authenticated UI acceptance require a dedicated test database.
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.connectOverCDP(process.env.BROWSER_CDP_URL ?? "http://127.0.0.1:9222");
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce", colorScheme: "light" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
const checks = [];
const evidence = "artifacts/v2-public";
let exitCode = 0;
try {
  await mkdir(evidence, { recursive: true });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Email", { exact: true }).getAttribute("autocomplete"), "username");
  assert.equal(await page.getByLabel("Password", { exact: true }).getAttribute("type"), "password");
  assert.equal(await page.getByLabel("Password", { exact: true }).getAttribute("autocomplete"), "current-password");
  assert.equal(await page.getByRole("button", { name: /sample|theme|light mode/i }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  checks.push("Unauthenticated root redirects to real Auth.js sign-in; labeled credentials; no sample/theme controls or browser finance storage");
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Login no overflow at ${width}`);
    const style = await page.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, canvas: getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() }));
    assert.equal(style.scheme, "dark", "Dark-only despite emulated light OS");
    const box = await page.getByRole("button", { name: "Sign in", exact: true }).boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44);
    await page.screenshot({ path: `${evidence}/login-${width}.png`, fullPage: true });
  }
  checks.push("Actual dark-only login renders at 360/768/1440 on light OS, no overflow and >=44px sign-in target");
  await page.getByLabel("Email", { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByLabel("Password", { exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("button", { name: "Sign in", exact: true }).evaluate(element => element === document.activeElement), true);
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await page.waitForURL("**/login");
  checks.push("Credential keyboard order and unauthenticated integration-settings route guard");
  for (const path of ["/api/v2/workspace", "/api/v1/finance", "/api/v1/transactions", "/api/v1/budgets", "/api/v1/tokens", "/api/v1/me"]) {
    const response = await context.request.get(`${base}${path}`);
    assert.equal(response.status(), 401, `${path} rejects missing credentials`);
    assert.match(response.headers()["cache-control"] ?? "", /no-store/);
    const value = await response.json();
    assert.ok(value.error?.message && !JSON.stringify(value).includes("postgresql://"));
  }
  const invalidBearer = await context.request.get(`${base}/api/v1/finance`, { headers: { Authorization: "Bearer invalid" } });
  assert.equal(invalidBearer.status(), 401);
  const mcp = await context.request.post(`${base}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, headers: { Accept: "application/json, text/event-stream" } });
  assert.equal(mcp.status(), 401);
  checks.push("Live REST routes and MCP reject unauthenticated access without exposing database URLs; REST no-store");
  assert.deepEqual(pageErrors, []);
  await writeFile(`${evidence}/smoke-results.json`, JSON.stringify({ scope: "V2 public unauthenticated checks only; not database/authenticated acceptance", checks, pageErrors }, null, 2));
} catch (error) { console.error(error); exitCode = 1; }
finally {
  try { await Promise.race([context.close(), new Promise((_, reject) => setTimeout(() => reject(new Error("Context cleanup exceeded 10 seconds")), 10_000))]); }
  catch (error) { console.error(error); exitCode = 1; }
  if (!exitCode) console.log(JSON.stringify({ passed: checks.length, scope: "public unauthenticated checks only", checks, pageErrors }, null, 2));
  process.exit(exitCode);
}
