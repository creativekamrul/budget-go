import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Connect to an independently launched browser: never spawn captured child stdio.
const browser = await chromium.connectOverCDP(process.env.BROWSER_CDP_URL ?? "http://127.0.0.1:9222");
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const evidence = "artifacts/preview";
await mkdir(evidence, { recursive: true });
const checks = [];
try {
  await page.goto(process.env.PREVIEW_URL ?? "http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "No transactions this month" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page.screenshot({ path: `${evidence}/empty-1440.png`, fullPage: true });
  checks.push("Empty initial preview; no localStorage writes");
  await page.getByRole("button", { name: "Load sample data" }).click();
  await page.getByText("Sample data — not your finances", { exact: true }).waitFor();
  await page.getByText("Near limit", { exact: true }).waitFor();
  await page.getByText("Over budget", { exact: true }).waitFor();
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({ path: `${evidence}/dashboard-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No page overflow at ${width}`);
    for (const name of ["Previous month", "Next month", "Edit Weekly groceries & household essentials"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${name} touch target at ${width}`);
    }
    for (const selector of [".transaction-description p", ".transaction-amount span", ".budget-status", ".budget-spent", ".budget-remaining", ".panel-footer"]) {
      assert.ok(await page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 12, `${selector} readable at ${width}`);
    }
    assert.equal(await page.locator(".transaction-description h3").first().evaluate(el => getComputedStyle(el).fontSize), "14px");
  }
  checks.push("Sample banner, long income/description, budget statuses, 1440/768/360 screenshots; no horizontal overflow");
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: `${evidence}/dialog-360.png`, fullPage: false });
  await page.getByRole("button", { name: "Add to preview" }).click();
  assert.equal(await page.locator("#description").evaluate(el => el === document.activeElement), true);
  await page.getByText("Enter a description.", { exact: true }).waitFor();
  await page.getByText("Enter an amount greater than zero, with at most 2 decimal places.", { exact: true }).waitFor();
  await page.screenshot({ path: `${evidence}/validation-360.png`, fullPage: false });
  await page.locator("#description").fill("Preview test expense");
  await page.locator("#amount").fill("0.10");
  await page.getByRole("button", { name: "Add to preview" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Preview test expense" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add transaction", exact: true }).evaluate(el => el === document.activeElement), true);
  checks.push("Dialog invalid submit, linked errors, first-error focus, successful in-memory addition, trigger focus restoration");
  await page.getByRole("button", { name: "Edit Preview test expense" }).click();
  assert.equal(await page.locator("#amount").inputValue(), "0.10");
  await page.locator("#amount").fill("0.20");
  await page.getByRole("button", { name: "Save preview changes" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Preview transaction updated. Not saved to your device.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Edit Preview test expense" }).evaluate(el => el === document.activeElement), true);
  checks.push("Edit dialog updates preview transaction, feedback and restores edit-invoker focus");
  await page.getByText("Preview testing controls", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Simulate recoverable save failure" }).check();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.locator("#description").fill("Retained on failure");
  await page.locator("#amount").fill("100.00");
  await page.getByRole("button", { name: "Add to preview" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("#description").inputValue(), "Retained on failure");
  await page.screenshot({ path: `${evidence}/save-error-360.png`, fullPage: false });
  await page.getByRole("button", { name: "Add to preview" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Retained on failure" }).waitFor();
  checks.push("Recoverable one-shot failure retains input; same-dialog retry succeeds");
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("heading", { name: "No transactions this month" }).waitFor();
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("heading", { name: "November salary" }).waitFor();
  checks.push("Monthly navigation filters sample transactions");
  await page.getByRole("button", { name: "Exit preview" }).click();
  await page.getByRole("heading", { name: "No transactions this month" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page.getByRole("button", { name: "Add your first transaction" }).click();
  await page.locator("#description").fill("Empty state trigger removal");
  await page.locator("#amount").fill("1.00");
  await page.getByRole("button", { name: "Add to preview" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Add transaction", exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole("button", { name: "Edit Empty state trigger removal" }).click();
  await page.locator("#date").fill("2026-12-05");
  await page.getByRole("button", { name: "Save preview changes" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Add transaction", exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  checks.push("Exit removes samples; removed empty/edit trigger focus falls back to header; Escape; no localStorage writes or browser page errors");
  await writeFile(`${evidence}/smoke-results.json`, JSON.stringify({ checks, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, pageErrors: errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
