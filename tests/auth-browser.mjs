import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Called only after auth-http has proved this port-3100 app uses its disposable fixture DB.
// Credentials remain in memory; never save browser storage state or traces containing tokens.
export async function runAuthenticatedBrowser({ base, account }) {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [];
  const page = await context.newPage(); page.on('pageerror', () => errors.push('browser page error'));
  page.setDefaultTimeout(20_000);
  const directory = 'artifacts/v2-auth'; await mkdir(directory, { recursive: true });
  const visibleButton = name => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
  async function geometry() { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal page overflow.'); }
  async function screenshot(name) { await geometry(); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true }); }
  async function ready() { await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeEnabled(); }
  async function state() { return page.evaluate(async () => { const response = await fetch('/api/v1/finance', { cache: 'no-store' }); if (!response.ok) throw new Error('Fixture finance read failed.'); return response.json(); }); }
  let createdId;
  try {
    await page.goto(`${base}/login`); await page.getByLabel('Email', { exact: true }).fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible(); await ready();
    const me = await page.evaluate(async () => (await fetch('/api/v1/me')).json()); assert.equal(me.id, account.id);
    await page.getByLabel('Selected month').fill('2024-02');
    await visibleButton('Add transaction').click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Description', { exact: false }).fill('Browser acceptance fixture'); await dialog.getByLabel('Amount', { exact: false }).fill('12.34'); await dialog.getByLabel('Date', { exact: false }).fill('2024-02-29');
    await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click(); await expect(dialog).not.toBeVisible();
    createdId = (await state()).transactions.find(item => item.description === 'Browser acceptance fixture')?.id; assert.ok(createdId);
    await page.reload(); await ready(); await page.getByLabel('Selected month').fill('2024-02');
    await page.getByRole('button', { name: 'Edit Browser acceptance fixture', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Amount', { exact: false }).fill('12.35'); await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.reload(); await ready(); assert.equal((await state()).transactions.find(item => item.id === createdId).poisha, 1235); await page.getByLabel('Selected month').fill('2024-02');
    for (const width of [1440, 768, 360]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const name of ['Overview', 'Transactions', 'Budgets']) { await visibleButton(name).click(); await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible(); assert.equal(await page.getByRole('button', { name: /load sample|exit preview/i }).count(), 0); await screenshot(`${name.toLowerCase()}-${width}`); }
      await visibleButton('Overview').click(); await visibleButton('Add transaction').click();
      await expect(page.getByRole('dialog')).toBeVisible(); await geometry(); await page.screenshot({ path: `${directory}/transaction-dialog-${width}.png` }); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('link', { name: 'Account & integrations', exact: true }).click(); await expect(page.getByRole('heading', { level: 1, name: 'Account & integrations', exact: true })).toBeVisible();
      await expect(page.getByLabel(/^Token name/)).toBeEnabled(); await screenshot(`settings-${width}`);
      await page.getByRole('link', { name: 'Back to budget', exact: true }).click(); await ready(); await page.getByLabel('Selected month').fill('2024-02');
    }
    // Remove only the exact UI-created fixture through the real UI; preserve prior REST/MCP state.
    await visibleButton('Transactions').click(); await page.getByRole('button', { name: 'Delete Browser acceptance fixture', exact: true }).filter({ visible: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete transaction', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    const after = await state(); assert.ok(!after.transactions.some(item => item.id === createdId));
    assert.deepEqual(errors, []);
    const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })); assert.deepEqual(storage, { local: 0, session: 0 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.goto(base); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await writeFile(`${directory}/browser-results.json`, JSON.stringify({ realCredentialsSignIn: true, realDatabaseCreateEditReloadDelete: true, signOut: true, noFinancialWebStorage: true, widths: [1440, 768, 360], screenshots: 15, pageErrors: errors, liveN8n: 'NOT RUN' }, null, 2));
    return after;
  } finally {
    await Promise.race([context.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('Isolated browser context cleanup timed out.')), 10_000))]);
    // Do not close the shared CDP browser. The parent exits explicitly after all fixture cleanup.
  }
}
