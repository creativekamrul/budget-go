// Actual-service PostgreSQL acceptance. Requires explicit opt-in and a migrated,
// uniquely named disposable database; never loads .env or applies migrations.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

function refuse(reason) { throw Object.assign(new Error('Workspace acceptance safety gate refused.'), { code: `WORKSPACE_GATE_${reason}` }); }
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
  const tokens = await tsImport('../lib/server/token-service.ts', import.meta.url);
  const calculations = await tsImport('../lib/workspace.ts', import.meta.url);
  const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
  const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
  client = db();
  await client.$queryRaw`SELECT 1`;
  if (await client.user.count() !== 0) refuse('NONEMPTY_DATABASE');
  const prefix = `workspace_${randomUUID().replaceAll('-', '')}`;
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
  let bank, cash, foreign;

  await check('legacy entries remain unassigned and financial accounts are tenant isolated', async () => {
    await legacy.createTransaction(a, 0, { id: `${prefix}_legacy`, description: 'Legacy entry', category: 'Groceries', date: '2026-11-05', type: 'expense', poisha: 50 });
    let state = await get();
    assert.equal(state.transactions[0].accountId, null);
    assert.equal(state.accounts.length, 0);
    state = await mutate(makeAccount('Bank', 100000)); bank = state.accounts.find(item => item.name === 'Bank').id;
    state = await mutate(makeAccount('Cash', 20000, 'cash')); cash = state.accounts.find(item => item.name === 'Cash').id;
    const other = await mutate(makeAccount('Other tenant', 99999), { owner: b }); foreign = other.accounts[0].id;
    assert.equal((await get()).accounts.length, 2);
    assert.equal((await get(b)).accounts.length, 1);
    assert.equal(calculations.accountBalance(state, bank, '2026-11-08'), 100000);
    assert.equal(calculations.accountBalance(state, bank, '2026-10-31'), 0);
    const before = await get();
    await rejects(() => mutate({ type: 'transaction_create', transaction: transaction(foreign) }), 404, 'NOT_FOUND');
    await rejects(() => mutate({ type: 'account_update', id: foreign, account: { name: 'Intrusion' } }), 404);
    assert.deepEqual(await get(), before);
    await rejects(() => mutate({ ...makeAccount('Bad owner'), userId: ids[1] }), 400);
  });

  await check('linked CRUD and legacy assignment update exact balances without counting opening income', async () => {
    let state = await mutate({ type: 'transaction_update', id: `${prefix}_legacy`, transaction: { ...transaction(bank, 50), description: 'Assigned legacy entry' } });
    assert.equal(state.transactions.find(item => item.id === `${prefix}_legacy`).accountId, bank);
    assert.equal(calculations.accountBalance(state, bank, '2026-11-08'), 99950);
    state = await mutate({ type: 'transaction_create', transaction: transaction(bank, 20000, 'income') });
    const income = state.transactions.find(item => item.type === 'income');
    state = await mutate({ type: 'transaction_create', transaction: transaction(bank, 12345) });
    const expense = state.transactions.find(item => item.poisha === 12345);
    assert.equal(calculations.accountBalance(state, bank, '2026-11-08'), 107605);
    state = await mutate({ type: 'transaction_update', id: expense.id, transaction: transaction(cash, 2345) });
    assert.equal(calculations.accountBalance(state, bank, '2026-11-08'), 119950);
    assert.equal(calculations.accountBalance(state, cash, '2026-11-08'), 17655);
    state = await mutate({ type: 'transaction_delete', id: expense.id });
    assert.equal(calculations.accountBalance(state, cash, '2026-11-08'), 20000);
    assert.equal(calculations.workspaceSummary(state, '2026-11', '2026-11-08').incomePoisha, 20000);
    assert.ok(income.id);
  });

  await check('atomic transfer moves both balances and stays outside income expense and budgets', async () => {
    let state = await mutate({ type: 'budget_create', budget: { month: '2026-11', category: 'Groceries', limitPoisha: 1000 } });
    const beforeSummary = calculations.workspaceSummary(state, '2026-11', '2026-11-08');
    const beforeBank = calculations.accountBalance(state, bank, '2026-11-08');
    const beforeCash = calculations.accountBalance(state, cash, '2026-11-08');
    state = await mutate({ type: 'transfer_create', transfer: { fromAccountId: bank, toAccountId: cash, date: '2026-11-06', description: 'Cash withdrawal', poisha: 10001 } });
    const transfer = state.transfers[0];
    assert.equal(calculations.accountBalance(state, bank, '2026-11-08'), beforeBank - 10001);
    assert.equal(calculations.accountBalance(state, cash, '2026-11-08'), beforeCash + 10001);
    const afterSummary = calculations.workspaceSummary(state, '2026-11', '2026-11-08');
    for (const key of ['incomePoisha', 'expensePoisha', 'balancePoisha']) assert.equal(afterSummary[key], beforeSummary[key]);
    assert.equal(afterSummary.budgets[0].spentPoisha, 50);
    state = await mutate({ type: 'transfer_delete', id: transfer.id });
    assert.equal(calculations.accountBalance(state, bank, '2026-11-08'), beforeBank);
    assert.equal(calculations.accountBalance(state, cash, '2026-11-08'), beforeCash);
    assert.equal(state.transfers.length, 0);
  });

  await check('invalid transfers archive and opening dates reject without rows or revision changing', async () => {
    const transfer = { fromAccountId: bank, toAccountId: cash, date: '2026-11-06', description: 'Disposable transfer', poisha: 100 };
    const unchanged = async (command, status = 400, code) => { const before = await get(); await rejects(() => mutate(command), status, code); assert.deepEqual(await get(), before); };
    await unchanged({ type: 'transfer_create', transfer: { ...transfer, toAccountId: bank } });
    await unchanged({ type: 'transfer_create', transfer: { ...transfer, toAccountId: foreign } }, 404, 'NOT_FOUND');
    await unchanged({ type: 'transfer_create', transfer: { ...transfer, date: '2026-10-31' } });
    await unchanged({ type: 'transaction_create', transaction: { ...transaction(bank), date: '2026-10-31' } });
    await unchanged({ type: 'transaction_create', transaction: { ...transaction(bank), poisha: Number.MAX_SAFE_INTEGER } });
    await mutate({ type: 'account_archive', id: cash, archived: true });
    await unchanged({ type: 'transfer_create', transfer }, 409, 'ACCOUNT_ARCHIVED');
    await unchanged({ type: 'transaction_create', transaction: transaction(cash) }, 409, 'ACCOUNT_ARCHIVED');
    assert.ok((await get()).accounts.find(item => item.id === cash).archived);
    await mutate({ type: 'account_archive', id: cash, archived: false });
  });

  await check('same-revision concurrency commits one command and rejects stale peer', async () => {
    const before = await get();
    const outcomes = await Promise.allSettled([
      mutate({ type: 'transaction_create', transaction: transaction(bank, 1) }, { revision: before.revision }),
      mutate({ type: 'transaction_create', transaction: transaction(bank, 2) }, { revision: before.revision }),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(errorMatches(409, 'REVISION_CONFLICT')(outcomes.find(result => result.status === 'rejected').reason));
    assert.equal((await get()).revision, before.revision + 1);
  });

  await check('idempotency replay applies once and mismatched reuse is rejected', async () => {
    const before = await get();
    const requestId = randomUUID();
    const command = { type: 'transfer_create', transfer: { fromAccountId: bank, toAccountId: cash, date: '2026-11-06', description: 'Replay test', poisha: 29 } };
    const first = await mutate(command, { requestId, revision: before.revision });
    const repeated = await mutate(command, { requestId, revision: before.revision });
    assert.equal(repeated.revision, first.revision);
    assert.deepEqual(repeated.transfers, first.transfers);
    await rejects(() => mutate({ ...command, transfer: { ...command.transfer, poisha: 30 } }, { requestId, revision: before.revision }), 409);
    await rejects(() => mutate(command, { requestId, revision: -1 }), 400);
    assert.deepEqual(await get(), first);
  });

  await check('real SQL failure after transfer insertion rolls back entry receipt and revision', async () => {
    const before = await get();
    const originalTransaction = client.$transaction;
    let injected = false;
    client.$transaction = (callback, options) => originalTransaction.call(client, async tx => {
      const receipts = new Proxy(tx.requestReceipt, { get(target, key) {
        if (key === 'create') return async () => { injected = true; await tx.$queryRaw`SELECT 1 / 0`; throw new Error('SQL failure not raised'); };
        return Reflect.get(target, key);
      } });
      return callback(new Proxy(tx, { get(target, key) { return key === 'requestReceipt' ? receipts : Reflect.get(target, key); } }));
    }, options);
    try { await assert.rejects(() => mutate({ type: 'transfer_create', transfer: { fromAccountId: bank, toAccountId: cash, date: '2026-11-06', description: 'Rollback probe', poisha: 123 } })); }
    finally { client.$transaction = originalTransaction; }
    assert.equal(injected, true);
    assert.deepEqual(await get(), before);
  });

  await check('scoped revoked expired and disabled actors cannot bypass authorization through replay', async () => {
    const read = await tokens.mintToken(a, { name: 'Disposable read', scopes: ['finance:read'], expiresInDays: 1 });
    const readActor = await tokens.bearerActor(read.token);
    await get(readActor);
    await rejects(() => mutate(makeAccount('Scope denied'), { owner: readActor }), 403);
    const writable = await tokens.mintToken(a, { name: 'Disposable write', scopes: ['finance:read', 'finance:write'], expiresInDays: 1 });
    const writeActor = await tokens.bearerActor(writable.token);
    const requestId = randomUUID(), command = makeAccount('Replay authorization');
    const before = await get(); await mutate(command, { owner: writeActor, requestId, revision: before.revision });
    await tokens.revokeToken(a, writable.metadata.id);
    await rejects(() => mutate(command, { owner: writeActor, requestId, revision: before.revision }), 401);
    await client.apiToken.update({ where: { id: read.metadata.id }, data: { expiresAt: new Date(0) } });
    await rejects(() => get(readActor), 401);
    await client.user.update({ where: { id: ids[0] }, data: { active: false } });
    await rejects(() => get(), 401);
    await client.user.update({ where: { id: ids[0] }, data: { active: true, sessionVersion: 2 } });
    await rejects(() => get(), 401);
    await client.user.update({ where: { id: ids[0] }, data: { sessionVersion: 1 } });
  });

  await check('legacy whole-ledger writes cannot erase upgraded account associations', async () => {
    const before = await get();
    await rejects(() => legacy.createTransaction(a, before.revision, { id: 'blocked', description: 'Blocked v1', category: 'Groceries', date: '2026-11-06', type: 'expense', poisha: 1 }), 409, 'VERSION_UPGRADE_REQUIRED');
    await rejects(() => legacy.replaceFinance(a, before.revision, { schemaVersion: 1, currency: 'BDT', revision: 0, transactions: [], budgets: [] }), 409, 'VERSION_UPGRADE_REQUIRED');
    assert.deepEqual(await get(), before);
  });
} catch (error) {
  const safeCode = /^(?:WORKSPACE_GATE_[A-Z_]+|P\d{4}|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|EPERM)$/.test(error?.code ?? '') ? error.code : 'REDACTED';
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
      await client.financialAccount.deleteMany({ where });
      await client.requestReceipt.deleteMany({ where });
      await client.user.deleteMany({ where: { id: { in: ids } } });
      console.log('Cleanup: exact generated workspace fixtures removed.');
    }
  } finally {
    if (client) await client.$disconnect();
    delete globalThis.budgetDb;
    if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
    await mkdir('artifacts/mvp', { recursive: true });
    await writeFile('artifacts/mvp/service-results.json', JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify({ groupsPassed: completed.length, failure: report.failure, scope: report.scope }, null, 2));
