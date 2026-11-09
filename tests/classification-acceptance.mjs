// Actual-service PostgreSQL acceptance. Requires explicit opt-in and a migrated,
// uniquely named disposable database; never loads .env or applies migrations.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

function refuse(reason) { throw Object.assign(new Error('Classification acceptance safety gate refused.'), { code: `CLASSIFICATION_GATE_${reason}` }); }
function identity(value, target = false) {
  let url; try { url = new URL(value); } catch { refuse('URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) refuse('URL');
  let name; try { name = decodeURIComponent(url.pathname.slice(1)); } catch { refuse('NAME'); }
  if (!name || name.includes('/')) refuse('NAME');
  if (target) {
    if (!/^budget_go_test_[a-f0-9]{16}$/.test(name) || process.env.BUDGET_GO_TEST_DATABASE_NAME !== name) refuse('TARGET_NAME');
    for (const key of url.searchParams.keys()) if (!['schema', 'sslmode', 'connect_timeout', 'connection_limit'].includes(key)) refuse('OPTIONS');
    if (url.searchParams.getAll('schema').some(schema => schema !== 'public')) refuse('SCHEMA');
  }
  const host = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase()) ? 'loopback' : url.hostname.toLowerCase();
  return `${host}/${name}`;
}

const completed = [];
let client;
const ids = [];
const originalURL = process.env.DATABASE_URL;
const report = { scope: 'Actual isolated PostgreSQL service acceptance; not authenticated browser or external n8n acceptance', completed, failure: null };
const errorMatches = (status, code) => error => error?.status === status && (!code || error.code === code);
const rejects = (action, status, code) => assert.rejects(action, errorMatches(status, code));
async function check(name, action) { console.log(`RUN workspace ${name}`); await action(); completed.push(name); console.log(`PASS workspace ${name}`); }

try {
  if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1') refuse('OPT_IN');
  if (!originalURL || !process.env.TEST_DATABASE_URL) refuse('CONFIGURATION');
  const applicationReference = process.env.BUDGET_GO_APP_DATABASE_URL ?? originalURL;
  if (identity(applicationReference) === identity(process.env.TEST_DATABASE_URL, true)) refuse('APPLICATION_TARGET');
  if (globalThis.budgetDb) refuse('INITIALIZED_CLIENT');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { tsImport } = await import('tsx/esm/api');
  const service = await tsImport('../lib/server/workspace-service.ts', import.meta.url);
  const legacy = await tsImport('../lib/server/finance-service.ts', import.meta.url);
  const calculations = await tsImport('../lib/workspace.ts', import.meta.url);
  const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
  const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
  client = db();
  await client.$queryRaw`SELECT 1`;
  if (await client.user.count() !== 0) refuse('NONEMPTY_DATABASE');
  const prefix = `classification_${randomUUID().replaceAll('-', '')}`;
  const passwordHash = await hashPassword(randomUUID() + randomUUID());
  for (const suffix of ['a', 'b']) {
    const id = `${prefix}_${suffix}`;
    await client.user.create({ data: { id, name: 'Disposable workspace fixture', email: `${id}@example.invalid`, passwordHash } });
    ids.push(id);
  }
  const actor = userId => ({ kind: 'session', userId, sessionVersion: 1, scopes: ['finance:read', 'finance:write'] });
  const a = actor(ids[0]), b = actor(ids[1]);
  const get = (owner = a) => service.getWorkspace(owner);
  const mutate = async (command, { owner = a, revision, requestId = randomUUID() } = {}) => service.mutateWorkspace(owner, revision ?? (await get(owner)).revision, requestId, command);
  const makeAccount = (name, openingPoisha = 0, kind = 'bank') => ({ type: 'account_create', account: { name, kind, openingDate: '2026-11-01', openingPoisha } });
  const transaction = (accountId, poisha = 12550, type = 'expense') => ({ accountId, poisha, type, description: 'Disposable entry', category: type === 'income' ? 'Salary' : 'Groceries', date: '2026-11-05' });
  let bank;
  let state = await mutate(makeAccount('Classification bank', 100000)); bank = state.accounts[0].id;

  const categoryCommand = (name, parentId = null, kind = 'expense') => ({ type: 'category_create', category: { name, parentId, kind, color: '#22c55e', icon: 'folder' } });
  const createCategory = async (name, parentId = null, kind = 'expense', owner = a) => { const value = await mutate(categoryCommand(name, parentId, kind), { owner }); return value.categories.find(item => item.name === name).id; };
  const unchanged = async (command, status, owner = a) => { const before = await get(owner); await rejects(() => mutate(command, { owner }), status); assert.deepEqual(await get(owner), before); };
  const food = await createCategory('Food'), child = await createCategory('Produce', food), foreign = await createCategory('Foreign category', null, 'expense', b);
  const categoryEdit = (value, extra = {}) => ({ type: 'category_update', id: value.id, category: { name: value.name, parentId: value.parentId, kind: value.kind, color: value.color, icon: value.icon, ...extra } });

  await check('hierarchy cannot cycle cross tenants or reference unknown parents', async () => {
    const parent = (await get()).categories.find(item => item.id === food);
    await unchanged(categoryEdit(parent, { parentId: child }), 400);
    await unchanged(categoryEdit(parent, { parentId: foreign }), 404);
    await unchanged(categoryCommand('Foreign child', foreign), 404);
    await unchanged({ type: 'category_archive', id: foreign, archived: true }, 404);
    assert.equal((await get(b)).categories.length, 1);
  });

  let tag, merchant, txId, budgetId;
  await check('metadata assignments persist exactly and foreign references leave revision unchanged', async () => {
    let value = await mutate({ type: 'tag_create', tag: { name: 'Essential', color: '#22c55e' } }); tag = value.tags[0].id;
    value = await mutate({ type: 'merchant_create', merchant: { name: 'Local shop', color: '#22c55e', website: 'https://example.invalid' } }); merchant = value.merchants[0].id;
    const foreignTag = (await mutate({ type: 'tag_create', tag: { name: 'Private tag', color: '#22c55e' } }, { owner: b })).tags[0].id;
    const foreignMerchant = (await mutate({ type: 'merchant_create', merchant: { name: 'Private merchant', color: '#22c55e', website: '' } }, { owner: b })).merchants[0].id;
    const custom = { ...transaction(bank, 1234), category: 'Produce', categoryId: child, merchantId: merchant, tagIds: [tag], notes: 'Fresh weekly produce', status: 'confirmed', excluded: false };
    for (const extra of [{ categoryId: foreign }, { merchantId: foreignMerchant }, { tagIds: [foreignTag] }]) await unchanged({ type: 'transaction_create', transaction: { ...custom, ...extra } }, 404);
    await unchanged({ type: 'transaction_create', transaction: { ...custom, type: 'income' } }, 400);
    value = await mutate({ type: 'transaction_create', transaction: custom }); txId = value.transactions[0].id;
    const saved = value.transactions.find(item => item.id === txId);
    for (const key of ['categoryId', 'merchantId', 'notes', 'status', 'excluded']) assert.equal(saved[key], custom[key]);
    assert.deepEqual(saved.tagIds, [tag]);
    value = await mutate({ type: 'budget_create', budget: { month: '2026-11', category: 'Produce', categoryId: child, limitPoisha: 5000 } }); budgetId = value.budgets[0].id;
    assert.equal(calculations.workspaceSummary(value, '2026-11', '2026-11-08').budgets[0].spentPoisha, 1234);
    assert.equal((await get(b)).transactions.length, 0);
  });

  await check('category rename updates budget and transaction labels without changing identities or money', async () => {
    const before = await get(); const existing = before.categories.find(item => item.id === child);
    await mutate(categoryEdit(existing, { name: 'Fresh produce' }));
    const after = await get();
    assert.equal(after.transactions.find(item => item.id === txId).category, 'Fresh produce');
    assert.equal(after.budgets.find(item => item.id === budgetId).category, 'Fresh produce');
    assert.equal(after.transactions.find(item => item.id === txId).poisha, 1234);
    assert.equal(after.budgets.find(item => item.id === budgetId).limitPoisha, 5000);
    assert.equal(calculations.accountBalance(after, bank, '2026-11-08'), calculations.accountBalance(before, bank, '2026-11-08'));
  });

  await check('updates preserve omitted metadata while explicit empty values clear assignments', async () => {
    const before = await get();
    const prior = before.transactions.find(item => item.id === txId);
    let value = await mutate({ type: 'transaction_update', id: txId, transaction: { ...transaction(bank, 1234), category: 'Fresh produce', description: 'Updated description only' } });
    const retained = value.transactions.find(item => item.id === txId);
    for (const key of ['categoryId', 'merchantId', 'notes', 'status', 'excluded']) assert.equal(retained[key], prior[key]);
    assert.deepEqual(retained.tagIds, prior.tagIds);
    const input = { ...transaction(bank, 1234), categoryId: null, merchantId: null, tagIds: [], notes: '' };
    value = await mutate({ type: 'transaction_update', id: txId, transaction: input });
    const cleared = value.transactions.find(item => item.id === txId);
    assert.equal(cleared.categoryId, null); assert.equal(cleared.merchantId, null); assert.equal(cleared.notes, ''); assert.deepEqual(cleared.tagIds, []);
    await mutate({ type: 'transaction_update', id: txId, transaction: { ...input, category: 'Fresh produce', categoryId: child, merchantId: merchant, tagIds: [tag], notes: prior.notes } });
    const childCategory = (await get()).categories.find(item => item.id === child);
    await unchanged(categoryEdit(childCategory, { kind: 'income', parentId: null }), 400);
  });

  await check('archived classification retains history but blocks newly assigned records', async () => {
    for (const [type, id] of [['category', child], ['tag', tag], ['merchant', merchant]]) await mutate({ type: `${type}_archive`, id, archived: true });
    const value = await get(); const existing = value.transactions.find(item => item.id === txId);
    assert.equal(existing.categoryId, child); assert.deepEqual(existing.tagIds, [tag]); assert.equal(existing.merchantId, merchant);
    const edited = await mutate({ type: 'transaction_update', id: txId, transaction: { ...transaction(bank, 1234), category: 'Fresh produce', notes: 'History edited with retained archive references' } });
    const retained = edited.transactions.find(item => item.id === txId); assert.equal(retained.categoryId, child); assert.equal(retained.merchantId, merchant); assert.deepEqual(retained.tagIds, [tag]);
    const input = { ...transaction(bank, 1), category: 'Fresh produce', categoryId: child };
    await unchanged({ type: 'transaction_create', transaction: input }, 409);
    await unchanged({ type: 'transaction_create', transaction: { ...transaction(bank, 1), tagIds: [tag] } }, 409);
    await unchanged({ type: 'transaction_create', transaction: { ...transaction(bank, 1), merchantId: merchant } }, 409);
    for (const [type, id] of [['category', child], ['tag', tag], ['merchant', merchant]]) await mutate({ type: `${type}_archive`, id, archived: false });
  });

  await check('pending and excluded flags reconcile posted balance cash flow and budgets after confirmation', async () => {
    const before = await get(); const beforeBalance = calculations.accountBalance(before, bank, '2026-11-08');
    let value = await mutate({ type: 'transaction_create', transaction: { ...transaction(bank, 222), status: 'pending' } });
    const pending = value.transactions.find(item => item.status === 'pending');
    assert.equal(calculations.accountBalance(value, bank, '2026-11-08'), beforeBalance);
    value = await mutate({ type: 'transaction_create', transaction: { ...transaction(bank, 333), excluded: true } });
    assert.equal(calculations.accountBalance(value, bank, '2026-11-08'), beforeBalance - 333);
    assert.equal(calculations.workspaceSummary(value, '2026-11', '2026-11-08').expensePoisha, 1234);
    value = await mutate({ type: 'transaction_update', id: pending.id, transaction: { ...transaction(bank, 222), status: 'confirmed' } });
    assert.equal(calculations.accountBalance(value, bank, '2026-11-08'), beforeBalance - 555);
    assert.equal(calculations.workspaceSummary(value, '2026-11', '2026-11-08').expensePoisha, 1456);
  });

  await check('legacy writers refuse metadata upgrades without losing records', async () => {
    const before = await get();
    await rejects(() => legacy.replaceFinance(a, before.revision, { schemaVersion: 1, currency: 'BDT', revision: 0, transactions: [], budgets: [] }), 409, 'VERSION_UPGRADE_REQUIRED');
    assert.deepEqual(await get(), before);
  });
} catch (error) {
  const safeCode = /^(?:CLASSIFICATION_GATE_[A-Z_]+|P\d{4}|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|EPERM)$/.test(error?.code ?? '') ? error.code : 'REDACTED';
  report.failure = `Acceptance failed (${safeCode}); last group is printed above. No credentials or raw database error serialized.`;
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  try {
    if (client && ids.length) {
      // Restrict-linked account rows are removed explicitly; only THIS run's IDs qualify.
      const where = { userId: { in: ids } };
      await client.transfer.deleteMany({ where });
      await client.transaction.deleteMany({ where });
      await client.budget.deleteMany({ where });
      await client.financialAccount.deleteMany({ where });
      await client.category.updateMany({ where, data: { parentId: null } });
      await client.category.deleteMany({ where });
      await client.tag.deleteMany({ where });
      await client.merchant.deleteMany({ where });
      await client.requestReceipt.deleteMany({ where });
      await client.user.deleteMany({ where: { id: { in: ids } } });
      console.log('Cleanup: exact generated workspace fixtures removed.');
    }
  } finally {
    if (client) await client.$disconnect();
    delete globalThis.budgetDb;
    if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
    await mkdir('artifacts/classification', { recursive: true });
    await writeFile('artifacts/classification/service-results.json', JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify({ groupsPassed: completed.length, failure: report.failure, scope: report.scope }, null, 2));
