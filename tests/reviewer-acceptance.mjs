// Independent Reviewer ownership. Builder-owned smoke/unit tests remain separate.
// Run with node tests/reviewer-acceptance.mjs after app scenarios are registered.
// Connects to existing approved Chrome; never launches or closes the external browser.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import ts from 'typescript';

const baseURL = process.env.REVIEW_URL ?? 'http://127.0.0.1:3000';
const cdpURL = process.env.BROWSER_CDP_URL ?? 'http://127.0.0.1:9222';
const outputDirectory = 'artifacts/review';
const scenarios = [];

export function scenario(name, run, options = {}) {
  scenarios.push({ name, run, options });
}

// Runs before any app code. Seed first, then fail reads/writes independently.
// Exact key comes from source review rather than guessing a persistence contract.
export function installStorageFault({ key, raw = null, readError = null, writeError = null }) {
  if (typeof key !== 'string' || !key) throw new Error('An explicit reviewed storage key is required');
  if (raw !== null && !sessionStorage.getItem('__review_seeded')) { localStorage.setItem(key, raw); sessionStorage.setItem('__review_seeded', 'yes'); }
  const get = Storage.prototype.getItem;
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  window.__reviewStorage = {
    raw: () => get.call(localStorage, key),
    writes: [],
    clearFault: () => {
      Storage.prototype.getItem = get;
      Storage.prototype.setItem = set;
      Storage.prototype.removeItem = remove;
    },
  };
  Storage.prototype.getItem = function (requestedKey) {
    if (this === localStorage && requestedKey === key && readError) {
      throw new DOMException('Independent reviewer injected storage read failure', readError);
    }
    return get.call(this, requestedKey);
  };
  Storage.prototype.setItem = function (requestedKey, value) {
    if (this === localStorage && requestedKey === key) {
      window.__reviewStorage.writes.push({ operation: 'set', value: String(value) });
      if (writeError) throw new DOMException('Independent reviewer injected storage write failure', writeError);
    }
    return set.call(this, requestedKey, value);
  };
  Storage.prototype.removeItem = function (requestedKey) {
    if (this === localStorage && requestedKey === key) {
      window.__reviewStorage.writes.push({ operation: 'remove' });
      if (writeError) throw new DOMException('Independent reviewer injected storage removal failure', writeError);
    }
    return remove.call(this, requestedKey);
  };
}

export async function readDownload(download) {
  const failure = await download.failure();
  assert.equal(failure, null, 'Browser download succeeds');
  const stream = await download.createReadStream();
  assert.ok(stream, 'Downloaded contents are readable');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function uploadJSON(input, value, name = 'review-backup.json') {
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}

export async function storageSnapshot(page, key) {
  return page.evaluate(key => window.__reviewStorage ? window.__reviewStorage.raw() : localStorage.getItem(key), key);
}

// Proposed contract fixtures; reconcile with actual implementation before enabling scenarios.
export const storageKey = 'budget-go:v1';
export function validBackup() {
  return {
    schemaVersion: 1, currency: 'BDT', revision: 3,
    transactions: [
      { id: '11111111-1111-4111-8111-111111111111', description: 'Private salary sentinel', category: 'Salary', date: '2026-11-01', type: 'income', poisha: 1000000 },
      { id: '22222222-2222-4222-8222-222222222222', description: 'Private groceries sentinel', category: 'Groceries', date: '2026-11-02', type: 'expense', poisha: 8000 },
    ],
    budgets: [{ id: '33333333-3333-4333-8333-333333333333', month: '2026-11', category: 'Groceries', limitPoisha: 10000 }],
  };
}
export function invalidBackups() {
  const mutate = fn => { const value = validBackup(); fn(value); return value; };
  return [
    ['malformed JSON', '{not json'],
    ['unknown root key', mutate(v => { v.unexpected = true; })],
    ['unsupported version', mutate(v => { v.schemaVersion = 2; })],
    ['wrong currency', mutate(v => { v.currency = 'USD'; })],
    ['negative revision', mutate(v => { v.revision = -1; })],
    ['unsafe revision', mutate(v => { v.revision = Number.MAX_SAFE_INTEGER + 1; })],
    ['duplicate transaction IDs', mutate(v => { v.transactions[1].id = v.transactions[0].id; })],
    ['duplicate budget IDs', mutate(v => { v.budgets.push({ ...v.budgets[0], category: 'Dining' }); })],
    ['duplicate month-category budgets', mutate(v => { v.budgets.push({ ...v.budgets[0], id: '44444444-4444-4444-8444-444444444444' }); })],
    ['nonexistent calendar date', mutate(v => { v.transactions[0].date = '2026-02-29'; })],
    ['ambiguous date', mutate(v => { v.transactions[0].date = '11/01/2026'; })],
    ['income expense-category mismatch', mutate(v => { v.transactions[0].category = 'Groceries'; })],
    ['unknown category', mutate(v => { v.transactions[1].category = 'Untrusted custom category'; })],
    ['unknown transaction type', mutate(v => { v.transactions[0].type = 'transfer'; })],
    ['fractional poisha', mutate(v => { v.transactions[1].poisha = 1.5; })],
    ['zero poisha', mutate(v => { v.transactions[1].poisha = 0; })],
    ['negative poisha', mutate(v => { v.transactions[1].poisha = -1; })],
    ['string poisha', mutate(v => { v.transactions[1].poisha = '8000'; })],
    ['unsafe transaction aggregate', mutate(v => { v.transactions[0].poisha = Number.MAX_SAFE_INTEGER; })],
    ['zero budget', mutate(v => { v.budgets[0].limitPoisha = 0; })],
    ['income budget', mutate(v => { v.budgets[0].category = 'Salary'; })],
    ['invalid budget month', mutate(v => { v.budgets[0].month = '2026-13'; })],
    ['unsafe budget aggregate', mutate(v => { v.budgets[0].limitPoisha = Number.MAX_SAFE_INTEGER; v.budgets.push({ id: '44444444-4444-4444-8444-444444444444', month: '2026-11', category: 'Dining', limitPoisha: 1 }); })],
    ['description cap', mutate(v => { v.transactions[0].description = 'x'.repeat(121); })],
    ['unknown nested key', mutate(v => { v.transactions[0].secret = 'not a supported field'; })],
    ['transaction count cap', mutate(v => { v.transactions = Array.from({ length: 10001 }, (_, i) => ({ ...v.transactions[0], id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}` })); })],
    ['oversized input', ' '.repeat(2 * 1024 * 1024 + 1)],
  ];
}

export const acceptancePlan = [
  'Empty first load, reload persistence, and no hydration overwrite of seeded valid finances',
  'Corrupt JSON, invalid schema/version and SecurityError reads preserve original raw data and show recovery warning',
  'QuotaExceededError writes retain form and stored data, report no success, then recover after fault clears',
  'Add/edit/delete income and expense; type category integrity; cancelled actions unchanged; month/date-moving edits update affected totals',
  '80%, exactly100%, and >100% budget labels with clamped visual progress; month-category uniqueness; edit/remove does not delete transactions',
  'JSON export round trip and privacy content; isolated samples never leak into saved real finances or exported backup',
  'Malformed/duplicate IDs, duplicate month-category budgets, bad version/currency/type/category/date/poisha and unsafe aggregates rejected atomically',
  'Valid import previews counts, cancel unchanged, explicit replacement removes old records, quota failure leaves old raw data intact',
  'Leap-day/year/month boundaries, safe-integer money precision and overflow, responsive keyboard/error/focus regression',
];

async function runCoreReview() {
  const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  const preview = moduleURL(compile(await readFile(new URL('../lib/preview.ts', import.meta.url), 'utf8')));
  const source = await readFile(new URL('../lib/finance.ts', import.meta.url), 'utf8');
  const finance = await import(moduleURL(compile(source).replace('from "./preview"', `from "${preview}"`)));
  assert.equal(finance.STORAGE_KEY, storageKey);
  assert.deepEqual(finance.parseBackup(JSON.stringify(validBackup())), validBackup());
  const matrix = invalidBackups();
  matrix.push(['duplicate cross-entity ID', (() => { const v = validBackup(); v.budgets[0].id = v.transactions[0].id; return v; })()]);
  matrix.push(['budget count cap', (() => { const v = validBackup(); v.budgets = Array.from({ length: 1001 }, (_, i) => ({ ...v.budgets[0], id: `budget_${i}` })); return v; })()]);
  for (const [name, fixture] of matrix) {
    const raw = typeof fixture === 'string' ? fixture : JSON.stringify(fixture);
    assert.throws(() => finance.parseBackup(raw), undefined, name);
  }
  for (const [spent, limit, expected] of [[7999, 10000, 'On track'], [8000, 10000, 'Near limit'], [9999, 10000, 'Near limit'], [10000, 10000, 'Limit reached'], [10001, 10000, 'Over budget'], [7205759403792793, Number.MAX_SAFE_INTEGER, 'Near limit']]) {
    assert.equal(finance.budgetState(spent, limit), expected);
  }
  const original = JSON.stringify(validBackup());
  let stored = original, writes = 0;
  const storage = { getItem: () => stored, setItem: (_key, value) => { writes++; stored = value; } };
  assert.throws(() => finance.saveFinance(storage, 'stale', validBackup()), /another tab/);
  assert.equal(writes, 0);
  const invalid = validBackup(); invalid.transactions[0].poisha = 0;
  assert.throws(() => finance.saveFinance(storage, original, invalid));
  assert.equal(writes, 0);
  assert.equal(stored, original);
  const quota = { getItem: () => original, setItem: () => { throw new DOMException('review quota', 'QuotaExceededError'); } };
  assert.throws(() => finance.saveFinance(quota, original, validBackup()), { name: 'QuotaExceededError' });
  const next = validBackup(); next.revision++;
  const committed = finance.saveFinance(storage, original, next);
  assert.equal(stored, committed);
  assert.equal(writes, 1);
  console.log(JSON.stringify({ coreReview: 'passed', invalidBackupCases: matrix.length, budgetBoundaryCases: 6, checks: ['valid roundtrip', 'strict validation matrix', 'save stale rejects before write', 'save invalid rejects before write', 'quota failure propagates', 'single successful write'] }, null, 2));
}

const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const seeded = (extra = {}) => ({ storage: { key: storageKey, raw: JSON.stringify(validBackup()), ...extra } });
async function openBackups(page) { await page.locator('.backup-panel > summary').click(); }
async function navigate(page, name) { await button(page, name).click(); }
async function fillTransaction(page, description, amount, date = '2026-11-05') {
  await page.locator('#description').fill(description); await page.locator('#amount').fill(amount); await page.locator('#date').fill(date);
}

scenario('empty start, precise CRUD, month move, persistence and confirmed deletion', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled();
  assert.equal(await storageSnapshot(page, storageKey), null);
  await page.locator('#active-month').fill('2026-11');
  await button(page, 'Add transaction').click(); await fillTransaction(page, 'Reviewer 0.29', '0.29');
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let data = JSON.parse(await storageSnapshot(page, storageKey)); assert.equal(data.transactions[0].poisha, 29);
  await page.reload(); await expect(button(page, 'Edit Reviewer 0.29')).toBeVisible();
  await button(page, 'Edit Reviewer 0.29').click(); await expect(page.locator('#amount')).toHaveValue('0.29');
  await page.locator('#date').fill('2026-12-01'); await button(page, 'Save changes').click();
  await expect(button(page, 'Edit Reviewer 0.29')).toHaveCount(0);
  await expect(button(page, 'Add transaction')).toBeFocused();
  await page.locator('#active-month').fill('2026-12'); await navigate(page, 'Transactions');
  await button(page, 'Delete Reviewer 0.29').click(); await expect(button(page, 'Cancel')).toBeFocused();
  await button(page, 'Cancel').click(); assert.equal(JSON.parse(await storageSnapshot(page, storageKey)).transactions.length, 1);
  await button(page, 'Delete Reviewer 0.29').click(); await button(page, 'Delete transaction').click();
  data = JSON.parse(await storageSnapshot(page, storageKey)); assert.equal(data.transactions.length, 0);
});
scenario('quota save retains draft and raw, same-dialog retry succeeds', async ({ page }) => {
  const before = await storageSnapshot(page, storageKey);
  await expect(button(page, 'Add transaction')).toBeEnabled(); await button(page, 'Add transaction').click();
  await fillTransaction(page, 'Quota draft', '0.01'); await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); await expect(page.locator('#description')).toHaveValue('Quota draft');
  assert.equal(await storageSnapshot(page, storageKey), before);
  await page.evaluate(() => window.__reviewStorage.clearFault());
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(JSON.parse(await storageSnapshot(page, storageKey)).transactions.length, 3);
}, seeded({ writeError: 'QuotaExceededError' }));
scenario('backup contents, invalid import matrix, cancel, confirmed replacement', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); await openBackups(page);
  const before = await storageSnapshot(page, storageKey);
  const download = page.waitForEvent('download'); await button(page, 'Export backup').click(); assert.deepEqual(await readDownload(await download), validBackup());
  for (const [name, fixture] of invalidBackups()) {
    await uploadJSON(page.getByLabel('Backup JSON file'), fixture, `${name}.json`);
    await expect(page.locator('.backup-content > .save-error')).toBeVisible();
    assert.equal(await storageSnapshot(page, storageKey), before, name); await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const replacement = validBackup(); replacement.transactions = []; replacement.budgets = []; replacement.revision = 100;
  await uploadJSON(page.getByLabel('Backup JSON file'), replacement); await expect(button(page, 'Cancel')).toBeFocused();
  await button(page, 'Cancel').click(); assert.equal(await storageSnapshot(page, storageKey), before);
  await uploadJSON(page.getByLabel('Backup JSON file'), replacement); await button(page, 'Replace all finances').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.deepEqual(JSON.parse(await storageSnapshot(page, storageKey)), { ...replacement, revision: 4 });
}, seeded());
scenario('import quota failure never replaces old data', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); await openBackups(page); const before = await storageSnapshot(page, storageKey);
  const replacement = validBackup(); replacement.transactions = []; await uploadJSON(page.getByLabel('Backup JSON file'), replacement);
  await button(page, 'Replace all finances').click(); await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  assert.equal(await storageSnapshot(page, storageKey), before);
  await page.evaluate(() => window.__reviewStorage.clearFault()); await button(page, 'Replace all finances').click();
  await expect(page.getByRole('dialog')).toHaveCount(0); assert.equal(JSON.parse(await storageSnapshot(page, storageKey)).transactions.length, 0);
}, seeded({ writeError: 'QuotaExceededError' }));
scenario('sample edits never affect saved finances or expose backup controls', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); const before = await storageSnapshot(page, storageKey);
  await button(page, 'Try sample data').click(); await button(page, 'Add transaction').click(); await fillTransaction(page, 'Sample isolated', '1.01');
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await openBackups(page); await expect(button(page, 'Export backup')).toHaveCount(0); await expect(button(page, 'Import backup')).toHaveCount(0);
  assert.equal(await storageSnapshot(page, storageKey), before); await button(page, 'Exit sample').click();
  await expect(button(page, 'Edit Sample isolated')).toHaveCount(0); assert.equal(await storageSnapshot(page, storageKey), before);
}, seeded());
scenario('monthly budgets duplicate validation, edit and remove preserve transactions', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); await page.locator('#active-month').fill('2026-11'); await navigate(page, 'Budgets');
  await expect(page.getByText('Near limit', { exact: true })).toBeVisible(); await button(page, 'Set budget').click();
  await page.locator('#budget-category').selectOption('Groceries'); await page.locator('#budget-amount').fill('120');
  await page.getByRole('dialog').getByRole('button', { name: 'Set budget', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('already exists');
  await button(page, 'Cancel').click(); await button(page, 'Edit Groceries budget').click(); await page.locator('#budget-amount').fill('80'); await button(page, 'Save budget').click();
  await expect(page.getByText('Limit reached', { exact: true })).toBeVisible();
  await button(page, 'Edit Groceries budget').click(); await page.locator('#budget-amount').fill('79.99'); await button(page, 'Save budget').click();
  await expect(page.getByText('Over budget', { exact: true })).toBeVisible(); await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await button(page, 'Remove Groceries budget').click(); await expect(button(page, 'Cancel')).toBeFocused(); await button(page, 'Remove budget').click();
  const data = JSON.parse(await storageSnapshot(page, storageKey)); assert.equal(data.budgets.length, 0); assert.equal(data.transactions.length, 2);
  await page.locator('#active-month').fill('2026-12'); await button(page, 'Set budget').click(); await page.locator('#budget-category').selectOption('Groceries'); await page.locator('#budget-amount').fill('100');
  await page.getByRole('dialog').getByRole('button', { name: 'Set budget', exact: true }).click();
  assert.equal(JSON.parse(await storageSnapshot(page, storageKey)).budgets[0].month, '2026-12');
}, seeded());
scenario('corrupt storage recovery download preserves bytes and confirmed reset', async ({ page }) => {
  const raw = '{private damaged recovery sentinel'; await expect(button(page, 'Download raw recovery file')).toBeVisible();
  assert.equal(await storageSnapshot(page, storageKey), raw);
  const pending = page.waitForEvent('download'); await button(page, 'Download raw recovery file').click(); const file = await pending;
  const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk); assert.equal(Buffer.concat(chunks).toString(), raw);
  await button(page, 'Start fresh').click(); await button(page, 'Cancel').click(); assert.equal(await storageSnapshot(page, storageKey), raw);
  await button(page, 'Start fresh').click(); await button(page, 'Replace with empty budget').click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = JSON.parse(await storageSnapshot(page, storageKey)); assert.equal(data.transactions.length, 0); assert.equal(data.budgets.length, 0);
}, { storage: { key: storageKey, raw: '{private damaged recovery sentinel' } });
scenario('blocked reads do not overwrite data and retry loading recovers', async ({ page }) => {
  await expect(page.locator('.storage-warning[role="alert"]')).toContainText('couldn’t load'); assert.equal(await storageSnapshot(page, storageKey), JSON.stringify(validBackup()));
  await expect(button(page, 'Add transaction')).toBeDisabled(); await page.evaluate(() => window.__reviewStorage.clearFault()); await button(page, 'Retry loading').click();
  await expect(button(page, 'Add transaction')).toBeEnabled(); assert.equal(await storageSnapshot(page, storageKey), JSON.stringify(validBackup()));
}, seeded({ readError: 'SecurityError' }));
scenario('external corrupt change, reload and reset recovery', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled();
  await page.evaluate(key => { const oldValue = localStorage.getItem(key); const raw = '{external corruption'; localStorage.setItem(key, raw); dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: raw, storageArea: localStorage })); }, storageKey);
  await button(page, 'Reload saved data').click(); await expect(button(page, 'Start fresh')).toBeVisible();
  await button(page, 'Start fresh').click(); await button(page, 'Replace with empty budget').click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(JSON.parse(await storageSnapshot(page, storageKey)).transactions.length, 0);
}, seeded());

const maxRevisionBackup = validBackup(); maxRevisionBackup.revision = Number.MAX_SAFE_INTEGER;
scenario('maximum revision recovers through explicit backup replacement', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); const before = await storageSnapshot(page, storageKey);
  await button(page, 'Add transaction').click(); await fillTransaction(page, 'Revision blocked draft', '1.01');
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('revision'); assert.equal(await storageSnapshot(page, storageKey), before);
  await button(page, 'Cancel').click(); await openBackups(page); await uploadJSON(page.getByLabel('Backup JSON file'), maxRevisionBackup);
  await button(page, 'Replace all finances').click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = JSON.parse(await storageSnapshot(page, storageKey)); assert.equal(data.revision, 1); assert.deepEqual(data.transactions, maxRevisionBackup.transactions);
}, { storage: { key: storageKey, raw: JSON.stringify(maxRevisionBackup) } });
const nearCap = validBackup(); nearCap.budgets = []; nearCap.transactions = [];
const capEntry = { ...validBackup().transactions[0], id: `t${'0'.repeat(60)}`, description: 'x'.repeat(120), poisha: 1 };
const capCount = Math.floor((2 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(nearCap)) + 1) / (Buffer.byteLength(JSON.stringify(capEntry)) + 1));
nearCap.transactions = Array.from({ length: capCount }, (_, i) => ({ ...capEntry, id: `t${String(i).padStart(60, '0')}` }));
scenario('near-cap exported backup roundtrips through actual import', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); await openBackups(page);
  const pending = page.waitForEvent('download'); await button(page, 'Export backup').click(); const file = await pending;
  const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks);
  assert.ok(bytes.length <= 2 * 1024 * 1024, 'Own exported file meets import byte cap'); assert.deepEqual(JSON.parse(bytes.toString()), nearCap);
  await page.getByLabel('Backup JSON file').setInputFiles({ name: 'near-cap-export.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.getByRole('dialog')).toBeVisible(); await button(page, 'Replace all finances').click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(JSON.parse(await storageSnapshot(page, storageKey)).transactions.length, nearCap.transactions.length);
}, { storage: { key: storageKey, raw: JSON.stringify(nearCap) } });

scenario('mobile filtering, leap date and keyboard validation regression', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); await page.locator('#active-month').fill('2026-11'); await navigate(page, 'Transactions');
  await page.getByLabel('Transaction type', { exact: true }).selectOption('income'); await expect(page.locator('.filter-count')).toHaveText('1 of 2 transactions');
  await page.getByLabel('Filter category', { exact: true }).selectOption('Salary');
  await page.getByLabel('Transaction type', { exact: true }).selectOption('expense'); await expect(page.getByLabel('Filter category', { exact: true })).toHaveValue('all');
  await expect(page.locator('.filter-count')).toHaveText('1 of 2 transactions');
  const before = await storageSnapshot(page, storageKey); await button(page, 'Add transaction').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click(); await expect(page.locator('#description')).toBeFocused();
  await expect(page.locator('#description')).toHaveAttribute('aria-invalid', 'true');
  assert.ok(await page.locator('#description').evaluate(el => !!document.getElementById(el.getAttribute('aria-describedby'))?.textContent));
  await fillTransaction(page, 'Leap reviewer', '1e3', '2024-02-29'); await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.locator('#amount')).toBeFocused(); assert.equal(await storageSnapshot(page, storageKey), before);
  for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true); }
  await page.locator('#amount').fill('0.10'); await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = JSON.parse(await storageSnapshot(page, storageKey)); assert.equal(data.transactions.find(t => t.description === 'Leap reviewer').date, '2024-02-29');
  await page.locator('#active-month').fill('2024-02'); await expect(button(page, 'Edit Leap reviewer')).toBeVisible();
  await button(page, 'Edit Leap reviewer').click(); await expect(page.locator('#date')).toHaveValue('2024-02-29'); await page.keyboard.press('Escape'); await expect(button(page, 'Edit Leap reviewer')).toBeFocused();
  await button(page, 'Next month').click(); await expect(page.locator('#active-month')).toHaveValue('2024-03'); await expect(button(page, 'Edit Leap reviewer')).toHaveCount(0);
  await page.locator('#active-month').fill('2026-12'); await button(page, 'Next month').click(); await expect(page.locator('#active-month')).toHaveValue('2027-01');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { ...seeded(), context: { viewport: { width: 360, height: 800 }, timezoneId: 'America/Los_Angeles' } });
scenario('read-before-write catches external change even without storage event', async ({ page }) => {
  await expect(button(page, 'Add transaction')).toBeEnabled(); await button(page, 'Add transaction').click(); await fillTransaction(page, 'Stale draft', '1.00');
  const external = validBackup(); external.revision = 4; external.transactions = []; const raw = JSON.stringify(external);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw });
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('another tab');
  await expect(page.locator('#description')).toHaveValue('Stale draft'); assert.equal(await storageSnapshot(page, storageKey), raw);
  await button(page, 'Cancel').click(); await expect(button(page, 'Add transaction')).toBeDisabled(); await button(page, 'Reload saved data').click(); await expect(button(page, 'Add transaction')).toBeEnabled();
  assert.equal(await storageSnapshot(page, storageKey), raw);
}, seeded());

async function main() {
  if (process.argv.includes('--core')) { await runCoreReview(); return; }
  if (process.argv.includes('--plan')) {
    console.log(acceptancePlan.map((item, index) => `${index + 1}. ${item}`).join('\n'));
    return;
  }
  assert.ok(scenarios.length, 'Acceptance scenarios await review of actual full-app schema/selectors; use --plan for prepared scope');
  const browser = await chromium.connectOverCDP(cdpURL);
  const results = [];
  await mkdir(outputDirectory, { recursive: true });
  for (const { name, run, options } of scenarios) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...options.context });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      if (options.storage) await context.addInitScript(installStorageFault, options.storage);
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      await run({ page, context, assert, pageErrors });
      assert.deepEqual(pageErrors, [], 'No unhandled browser exceptions');
      results.push({ name, status: 'passed' });
    } catch (error) {
      const screenshot = `${outputDirectory}/${String(results.length + 1).padStart(2, '0')}-failure.png`;
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      results.push({ name, status: 'failed', error: String(error.stack ?? error), pageErrors, screenshot });
    } finally {
      await context.close();
    }
  }
  await writeFile(`${outputDirectory}/review-results.json`, JSON.stringify({ baseURL, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  process.exitCode = results.some(result => result.status === 'failed') ? 1 : 0;
  // Playwright CDP has no disconnect API: process termination detaches this client.
  // Do not browser.close(): the approved external Chrome is shared with other roles.
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(error => { console.error(error); process.exit(1); });
