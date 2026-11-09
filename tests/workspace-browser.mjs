// Real authenticated MVP browser acceptance, restricted to the disposable port3100 app.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const target = new URL(process.env.TEST_DATABASE_URL ?? '');
const reference = new URL(process.env.BUDGET_GO_APP_DATABASE_URL ?? '');
const databaseName = process.env.BUDGET_GO_TEST_DATABASE_NAME;
if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1' || !/^budget_go_test_[a-f0-9]{16}$/.test(databaseName ?? '') || target.pathname !== `/${databaseName}` || (target.hostname === reference.hostname && target.pathname === reference.pathname) || process.env.DATABASE_URL !== target.href || process.env.APP_URL !== 'http://127.0.0.1:3100') throw new Error('Refusing unsafe browser fixture configuration.');
const base = 'http://127.0.0.1:3100';
const { tsImport } = await import('tsx/esm/api');
const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
const { accountBalance, workspaceSummary } = await tsImport('../lib/workspace.ts', import.meta.url);
const database = db();
const id = `browser_${randomUUID().replaceAll('-', '')}`;
const email = `${id}@example.invalid`;
const password = randomBytes(30).toString('base64url');
const checks = [], errors = [], geometry = [];
let context, page, created = false, failure;
const check = async (name, action) => { console.log(`RUN browser ${name}`); await action(); checks.push(name); console.log(`PASS browser ${name}`); };
try {
  assert.equal(await database.user.count(), 0, 'Disposable browser database must be empty before fixture creation.');
  await database.user.create({ data: { id, email, name: 'Disposable MVP browser fixture', passwordHash: await hashPassword(password) } });
  created = true;
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', () => errors.push('Browser page error'));
  page.setDefaultTimeout(20_000);
  await mkdir('artifacts/mvp', { recursive: true });
  const navigate = async name => {
    if (name === 'Accounts') { await page.goto(`${base}/?view=accounts`, { waitUntil: 'networkidle' }); return; }
    await page.getByRole('complementary', { name: 'Main navigation' }).getByRole('link', { name: name === 'Overview' ? 'Home' : name, exact: true }).click();
  };
  const dialog = () => page.getByRole('dialog');
  const state = async () => {
    const response = await context.request.get(`${base}/api/v3/workspace`);
    assert.equal(response.status(), 200);
    return response.json();
  };
  const command = async value => {
    const current = await state();
    const response = await context.request.post(`${base}/api/v3/workspace`, { headers: { origin: base }, data: { expectedRevision: current.revision, requestId: randomUUID(), command: value } });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const closed = async () => { await expect(dialog()).toHaveCount(0); };
  let today, month, bank, cash;
  await check('real sign-in and honest initial empty state', async () => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.getByText('Start with a real account', { exact: true }).waitFor();
    assert.equal((await state()).accounts.length, 0);
    today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
    month = today.slice(0, 7);
    await page.screenshot({ path: 'artifacts/mvp/empty-1440.png', fullPage: true });
  });
  async function createAccount(name, kind, opening) {
    await navigate('Accounts');
    await page.getByRole('button', { name: 'Add account', exact: true }).first().click();
    await dialog().getByLabel('Account name', { exact: true }).fill(name);
    await dialog().getByLabel('Account type', { exact: true }).selectOption(kind);
    await dialog().getByLabel('Opening date', { exact: true }).fill(`${month}-01`);
    await dialog().getByLabel('Opening balance (BDT)', { exact: true }).fill(opening);
    await dialog().getByRole('button', { name: 'Create account', exact: true }).click();
    await closed();
  }
  async function addEntry(description, amount, type = 'expense') {
    await navigate('Transactions');
    await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
    await dialog().getByLabel('Description', { exact: true }).fill(description);
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill(amount);
    await dialog().getByLabel('Transaction type', { exact: true }).selectOption(type);
    await dialog().getByLabel('Account', { exact: true }).selectOption(bank);
    await dialog().getByLabel('Date', { exact: true }).fill(today);
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click();
    await closed();
  }
  await check('account income expense and atomic transfer forms persist exact balances', async () => {
    await createAccount('Daily bank', 'bank', '1000.00');
    await createAccount('Cash wallet', 'cash', '200.00');
    let saved = await state(); bank = saved.accounts.find(a => a.name === 'Daily bank').id; cash = saved.accounts.find(a => a.name === 'Cash wallet').id;
    await addEntry('Salary fixture', '500.00', 'income');
    await addEntry('Groceries fixture', '125.50');
    await page.getByRole('button', { name: 'Transfer', exact: true }).click();
    await dialog().getByLabel('Description', { exact: true }).fill('Cash withdrawal fixture');
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('250.00');
    await dialog().getByLabel('From account', { exact: true }).selectOption(bank);
    await dialog().getByLabel('To account', { exact: true }).selectOption(cash);
    await dialog().getByLabel('Date', { exact: true }).fill(today);
    await dialog().getByRole('button', { name: 'Create transfer', exact: true }).click(); await closed();
    saved = await state();
    assert.equal(accountBalance(saved, bank, today), 112450);
    assert.equal(accountBalance(saved, cash, today), 45000);
    assert.equal(workspaceSummary(saved, month, today).incomePoisha, 50000);
    assert.equal(workspaceSummary(saved, month, today).expensePoisha, 12550);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await expect(page.getByText('Salary fixture', { exact: true })).toBeVisible();
  });
  await check('editing budgeting search filters and complete JSON export work', async () => {
    await navigate('Transactions');
    await page.getByRole('button', { name: 'Edit Groceries fixture', exact: true }).click();
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('175.75');
    await dialog().getByRole('button', { name: 'Save changes', exact: true }).click(); await closed();
    await page.getByLabel('Search entries', { exact: true }).fill('no-match-fixture');
    await page.getByRole('heading', { name: 'No matching entries' }).waitFor();
    await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
    await page.getByLabel('Account', { exact: true }).selectOption(cash);
    await expect(page.getByText('1 of 3 entries', { exact: true })).toBeVisible();
    await navigate('Budgets');
    await page.getByRole('button', { name: 'Set budget', exact: true }).first().click();
    await dialog().getByLabel('Expense category', { exact: true }).selectOption('Groceries');
    await dialog().getByLabel('Monthly limit (BDT)', { exact: true }).fill('100.00');
    await dialog().getByRole('button', { name: 'Save budget', exact: true }).click(); await closed();
    await expect(page.getByText('Over budget', { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export workspace', exact: true }).filter({ visible: true }).first().click();
    const download = await downloadPromise;
    const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(exported.schemaVersion, 3); assert.equal(exported.accounts.length, 2); assert.equal(exported.transfers.length, 1);
    assert.equal(accountBalance(exported, bank, today), 107425);
    assert.ok(!JSON.stringify(exported).includes(password));
    await download.delete();
  });
  await check('conflict reload retains the draft and unknown response retry never duplicates a save', async () => {
    await navigate('Transactions');
    await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
    await dialog().getByLabel('Description', { exact: true }).fill('Retained conflict fixture');
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('1.00');
    await dialog().getByLabel('Account', { exact: true }).selectOption(bank);
    await command({ type: 'account_update', id: bank, account: { name: 'Daily bank revised' } });
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(dialog().getByRole('alert')).toContainText('changed');
    await dialog().getByRole('button', { name: 'Reload saved data', exact: true }).click();
    await expect(dialog().getByLabel('Description', { exact: true })).toHaveValue('Retained conflict fixture');
    await expect(dialog().getByRole('button', { name: 'Add transaction', exact: true })).toBeEnabled();
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click(); await closed();
    let dropped = false;
    const loseResponse = async route => {
      if (route.request().method() === 'POST' && !dropped) { dropped = true; await route.fetch(); await route.abort('failed'); }
      else await route.continue();
    };
    await page.route('**/api/v3/workspace', loseResponse);
    await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
    await dialog().getByLabel('Description', { exact: true }).fill('Unknown result fixture');
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('2.00');
    await dialog().getByLabel('Account', { exact: true }).selectOption(bank);
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(dialog().getByRole('button', { name: 'Retry same save safely' })).toBeVisible();
    const before = await state(); assert.equal(before.transactions.filter(t => t.description === 'Unknown result fixture').length, 1);
    await dialog().getByRole('button', { name: 'Retry same save safely' }).click(); await closed();
    const after = await state(); assert.equal(after.transactions.filter(t => t.description === 'Unknown result fixture').length, 1); assert.equal(after.revision, before.revision);
    await page.unroute('**/api/v3/workspace', loseResponse);
  });
  await check('actual populated layouts and dialog at phone tablet desktop have no overflow', async () => {
    for (const width of [1440, 768, 360]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const view of ['Overview', 'Accounts', 'Transactions', 'Budgets']) {
        await navigate(view);
        const content = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(content <= width, `${view} overflows at ${width}: ${content}`);
        const smallControls = await page.locator('button, a, input, select, summary').evaluateAll(elements => elements.flatMap(el => {
          const ownBox = el.getBoundingClientRect();
          if (ownBox.width <= 0 || ownBox.height <= 0 || getComputedStyle(el).visibility === 'hidden') return [];
          // A checkbox's associated label is also its native clickable target. Measure it
          // when present rather than mistaking the smaller visual mark for the target.
          const label = el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)
            ? [...(el.labels ?? [])].find(item => { const box = item.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(item).visibility !== 'hidden'; })
            : undefined;
          const target = label ?? el;
          const box = target.getBoundingClientRect();
          return box.width < 43.9 || box.height < 43.9
            ? [{ tag: el.tagName, target: target.tagName, text: target.textContent.trim().slice(0,80), width: box.width, height: box.height }]
            : [];
        }));
        assert.deepEqual(smallControls, [], `${view} controls below 44px at ${width}`);
        geometry.push({ width, view, content });
        await page.screenshot({ path: `artifacts/mvp/${view.toLowerCase()}-${width}.png`, fullPage: true });
      }
    }
    await navigate('Transactions');
    await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
    await dialog().getByLabel('Description', { exact: true }).fill('Long description '.repeat(8).slice(0,120));
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('1.001');
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(dialog().getByRole('alert')).toContainText('two decimal');
    await expect(dialog().getByLabel('Amount (BDT)', { exact: true })).toBeFocused();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'artifacts/mvp/transaction-error-360.png', fullPage: true });
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('1.00');
    await dialog().getByLabel('Account', { exact: true }).selectOption(bank);
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click(); await closed();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'artifacts/mvp/transactions-long-360.png', fullPage: true });
  });
  await check('archive restore deletion and unavailable-read recovery preserve finances', async () => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await navigate('Accounts');
    await page.getByRole('button', { name: 'Archive Cash wallet', exact: true }).click();
    await dialog().getByRole('button', { name: 'Archive account', exact: true }).click(); await closed();
    let saved = await state(); assert.equal(saved.accounts.find(a => a.id === cash).archived, true); assert.equal(accountBalance(saved, cash, today), 45000);
    await page.getByRole('button', { name: 'Restore Cash wallet', exact: true }).click();
    await dialog().getByRole('button', { name: 'Restore account', exact: true }).click(); await closed();
    await navigate('Transactions');
    await page.getByRole('button', { name: 'Delete Cash withdrawal fixture', exact: true }).click();
    await dialog().getByRole('button', { name: 'Delete transfer', exact: true }).click(); await closed();
    saved = await state(); assert.equal(saved.transfers.length, 0); assert.equal(accountBalance(saved, cash, today), 20000);
    await expect(page.locator('#workspace-main')).toBeFocused();
    const before = await state();
    const outage = async route => { if (route.request().method() === 'GET') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_OUTAGE', message: 'Temporary test outage.' } }) }); else await route.continue(); };
    await page.route('**/api/v3/workspace', outage); await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#workspace-main').getByRole('alert')).toContainText('Temporary test outage');
    assert.equal(await page.getByText('Start with a real account', { exact: true }).count(), 0);
    await page.unroute('**/api/v3/workspace', outage);
    await page.getByRole('button', { name: 'Reload saved data', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Salary fixture', exact: true })).toBeVisible();
    await expect(page.locator('#workspace-main').getByRole('alert')).toHaveCount(0);
    assert.deepEqual(await state(), before);
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [] });
    assert.deepEqual(errors, []);
  });
  await check('classification settings and transaction metadata persist through real forms and filters', async () => {
    const catalog = async (section, label, name, extra = async () => {}) => {
      await page.goto(`${base}/settings/${section}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: `New ${label}`, exact: true }).click();
      const form = page.getByRole('form', { name: `New ${label}`, exact: true });
      await form.getByLabel('Name', { exact: true }).fill(name); await extra(form);
      await form.getByRole('button', { name: `Create ${label}`, exact: true }).click();
      await expect(form).toHaveCount(0);
    };
    await catalog('categories', 'category', 'Browser food');
    const parentId = (await state()).categories.find(item => item.name === 'Browser food').id;
    await catalog('categories', 'category', 'Browser produce', async form => { await form.getByLabel('Parent category', { exact: true }).selectOption(parentId); });
    await page.getByRole('button', { name: 'Edit Browser produce', exact: true }).click();
    const editCategory = page.getByRole('form', { name: 'Edit category', exact: true });
    await editCategory.getByLabel('Name', { exact: true }).fill('Browser fresh produce');
    await editCategory.getByRole('button', { name: 'Save category', exact: true }).click(); await expect(editCategory).toHaveCount(0);
    await catalog('tags', 'tag', 'Browser weekly');
    await catalog('merchants', 'merchant', 'Browser market', async form => { await form.getByLabel('Website (optional)', { exact: true }).fill('https://example.invalid'); });
    for (const [section, name] of [['categories', 'Browser fresh produce'], ['tags', 'Browser weekly'], ['merchants', 'Browser market']]) {
      await page.goto(`${base}/settings/${section}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click();
      await page.getByLabel('Show archived', { exact: true }).check();
      await page.getByRole('button', { name: `Restore ${name}`, exact: true }).click();
      await expect(page.getByRole('button', { name: `Archive ${name}`, exact: true })).toBeVisible();
    }
    let saved = await state(); const categoryId = saved.categories.find(item => item.name === 'Browser fresh produce').id;
    const merchantId = saved.merchants.find(item => item.name === 'Browser market').id;
    const tagId = saved.tags.find(item => item.name === 'Browser weekly').id;
    const beforeBalance = accountBalance(saved, bank, today);
    await page.goto(`${base}/?view=transactions`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
    await dialog().getByLabel('Description', { exact: true }).fill('Browser classified pending');
    await dialog().getByLabel('Amount (BDT)', { exact: true }).fill('12.34');
    await dialog().getByLabel('Account', { exact: true }).selectOption(bank);
    await dialog().getByLabel('Category', { exact: true }).selectOption({ label: 'Browser fresh produce' });
    await dialog().getByLabel('Merchant', { exact: true }).selectOption(merchantId);
    await dialog().getByLabel('Browser weekly', { exact: true }).check();
    await dialog().getByLabel('Notes', { exact: true }).fill('Browser metadata note');
    await dialog().getByLabel('Status', { exact: true }).selectOption('pending');
    await dialog().getByRole('button', { name: 'Add transaction', exact: true }).click(); await closed();
    saved = await state(); let entry = saved.transactions.find(item => item.description === 'Browser classified pending');
    assert.equal(entry.categoryId, categoryId); assert.equal(entry.merchantId, merchantId); assert.deepEqual(entry.tagIds, [tagId]); assert.equal(entry.notes, 'Browser metadata note');
    assert.equal(accountBalance(saved, bank, today), beforeBalance);
    await page.getByRole('button', { name: 'Edit Browser classified pending', exact: true }).click();
    await dialog().getByLabel('Status', { exact: true }).selectOption('confirmed');
    await dialog().getByLabel('Exclude from cash flow, budgets and reports', { exact: true }).check();
    await dialog().getByRole('button', { name: 'Save changes', exact: true }).click(); await closed();
    await page.reload({ waitUntil: 'networkidle' });
    saved = await state(); entry = saved.transactions.find(item => item.id === entry.id);
    assert.equal(entry.excluded, true); assert.equal(entry.status, 'confirmed'); assert.equal(accountBalance(saved, bank, today), beforeBalance - 1234);
    await page.getByLabel('Search entries', { exact: true }).fill('Browser metadata note');
    await expect(page.getByRole('button', { name: 'Edit Browser classified pending', exact: true })).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('pending');
    await page.getByRole('heading', { name: 'No matching entries', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
    await page.goto(`${base}/?view=budgets`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Set budget', exact: true }).first().click();
    await dialog().getByLabel('Expense category', { exact: true }).selectOption({ label: 'Browser food' });
    await dialog().getByLabel('Monthly limit (BDT)', { exact: true }).fill('50.00');
    await dialog().getByRole('button', { name: 'Save budget', exact: true }).click(); await closed();
    saved = await state(); const parentBudget = saved.budgets.find(item => item.categoryId === parentId);
    assert.ok(parentBudget); assert.equal(workspaceSummary(saved, month, today).budgets.find(item => item.id === parentBudget.id).spentPoisha, 0);
    await page.screenshot({ path: 'artifacts/mvp/classification-budget-1440.png', fullPage: true });
    await page.goto(`${base}/settings/categories`, { waitUntil: 'networkidle' });
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const railBounds = await page.getByRole('complementary',{name:'Main navigation'}).evaluate(el => ({viewport:document.documentElement.clientWidth,rail:el.getBoundingClientRect().toJSON(),settings:el.querySelector('a[href="/settings"] span').getBoundingClientRect().toJSON()}));
      if (width === 360) assert.ok(railBounds.settings.right <= railBounds.viewport,JSON.stringify(railBounds));
      await page.screenshot({ path: `artifacts/mvp/classification-settings-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
  });

  await check('reports share the new shell and exclude flagged activity from totals and CSV', async () => {
    await page.setViewportSize({width:1440,height:1100});
    await page.goto(`${base}/reports`, {waitUntil:'networkidle'});
    await expect(page.getByRole('heading',{name:'Reports',exact:true})).toBeVisible();
    const { money } = await tsImport('../lib/preview.ts', import.meta.url);
    const expected = workspaceSummary(await state(),month,today);
    const expenses = page.locator('section').filter({has:page.getByRole('heading',{name:'Total expenses',exact:true})});
    await expect(expenses.locator(':scope > strong')).toHaveText(money(expected.expensePoisha));
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button',{name:'CSV',exact:true}).click();
    const download = await downloaded;
    const csv = await readFile(await download.path(),'utf8');
    assert.ok(csv.includes('Merchant,Tags,Notes,Status,Excluded'));
    assert.ok(!csv.includes('Browser classified pending'));
    assert.ok(!csv.includes('Cash withdrawal fixture'));
    await page.getByRole('button',{name:'Hide amounts',exact:true}).click();
    assert.equal(await expenses.locator(':scope > strong').evaluate(el => getComputedStyle(el).filter),'blur(8px)');
    await page.getByRole('button',{name:'Show amounts',exact:true}).click();
    for (const width of [360,768,1440]) {
      await page.setViewportSize({width,height:1100});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({path:`artifacts/mvp/classification-reports-${width}.png`,fullPage:true});
    }
    assert.deepEqual(errors,[]);
  });
} catch (error) {
  failure = error;
  if (page) await page.screenshot({ path: 'artifacts/mvp/browser-failure.png', fullPage: true }).catch(() => {});
} finally {
  await context?.close().catch(() => {});
  if (created) {
    const where = { userId: id };
    await database.transfer.deleteMany({ where }); await database.transaction.deleteMany({ where }); await database.budget.deleteMany({ where });
    await database.financialAccount.deleteMany({ where }); await database.category.updateMany({ where, data: { parentId: null } });
    await database.category.deleteMany({ where }); await database.tag.deleteMany({ where }); await database.merchant.deleteMany({ where });
    await database.user.delete({ where: { id } });
  }
  await database.$disconnect();
  await mkdir('artifacts/mvp', { recursive: true });
  await writeFile('artifacts/mvp/browser-results.json', JSON.stringify({ scope: 'Actual authenticated disposable PostgreSQL browser acceptance; no production fixture writes', checks, geometry, errors, cleaned: created, failure: failure?.message ?? null }, null, 2));
}
console.log(JSON.stringify({ groupsPassed: checks.length, failure: failure?.message ?? null }, null, 2));
process.exit(failure ? 1 : 0);
