// Pure behavior checks against actual transpiled source. No database or app server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const loaded = {};
async function source(name, replacements = {}) {
  const text = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  compiled = compiled.replace(/from ["']([^"']+)["']/g, (whole, specifier) => {
    if (replacements[specifier]) return `from ${JSON.stringify(replacements[specifier])}`;
    if (specifier.startsWith('node:')) return whole;
    if (specifier.startsWith('.')) throw new Error(`Unmapped pure import ${name}: ${specifier}`);
    return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
  });
  loaded[name] = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  return import(loaded[name]);
}
await source('lib/preview.ts');
await source('lib/finance.ts', { './preview': loaded['lib/preview.ts'] });
const workspace = await source('lib/workspace.ts', { './finance': loaded['lib/finance.ts'], './preview': loaded['lib/preview.ts'] });
const checks = [];
const check = (name, action) => { action(); checks.push(name); console.log(`PASS workspace ${name}`); };
const account = (id, openingPoisha, extra = {}) => ({ id, name: id, kind: 'bank', currency: 'BDT', openingDate: '2026-11-01', openingPoisha, archived: false, ...extra });
const entry = (id, accountId, poisha, type = 'expense', extra = {}) => ({ id, accountId, categoryId: null, merchantId: null, tagIds: [], notes: '', status: 'confirmed', excluded: false, poisha, type, category: type === 'income' ? 'Salary' : 'Groceries', description: id, date: '2026-11-05', ...extra });
const data = () => ({ ...workspace.emptyWorkspace(),
  accounts: [account('bank', 100000), account('cash', 20000, { kind: 'cash', archived: true }), account('future', 30000, { openingDate: '2026-11-10', kind: 'mobile' })],
  transactions: [entry('salary', 'bank', 20000, 'income'), entry('groceries', 'bank', 12550), entry('legacy', null, 500), entry('scheduled', 'bank', 1000, 'income', { date: '2026-11-10' })],
  transfers: [{ id: 'withdrawal', fromAccountId: 'bank', toAccountId: 'cash', description: 'Internal movement', date: '2026-11-06', toDate: '2026-11-06', poisha: 10001 }],
  budgets: [{ id: 'grocery-budget', month: '2026-11', category: 'Groceries', categoryId: null, limitPoisha: 15000 }],
});

check('signed decimal parsing is exact at safe-money boundaries', () => {
  for (const [text, expected] of [['0', 0], ['0.00', 0], ['-0.01', -1], ['12.3', 1230], ['-12.34', -1234], ['90071992547409.91', Number.MAX_SAFE_INTEGER], ['-90071992547409.91', -Number.MAX_SAFE_INTEGER]]) assert.equal(workspace.parseSignedAmount(text), expected);
  for (const text of ['', '+1', '1e2', ' 1', '1 ', '1,000', '.5', '0.001', '90071992547409.92', '-90071992547409.92']) assert.equal(workspace.parseSignedAmount(text), null);
});

check('commands reject owner injection unsafe values and malformed dates', () => {
  const command = { type: 'transaction_create', transaction: { accountId: 'bank', description: 'Food', category: 'Groceries', date: '2026-11-05', type: 'expense', poisha: 1 } };
  assert.deepEqual(workspace.validateCommand(command), command);
  for (const bad of [
    { ...command, userId: 'other' },
    { ...command, transaction: { ...command.transaction, ownerId: 'other' } },
    { ...command, transaction: { ...command.transaction, accountId: null } },
    { ...command, transaction: { ...command.transaction, poisha: Number.MAX_SAFE_INTEGER + 1 } },
    { ...command, transaction: { ...command.transaction, poisha: 0 } },
    { ...command, transaction: { ...command.transaction, date: '2026-02-29' } },
    { type: 'transfer_create', transfer: { fromAccountId: 'bank', toAccountId: 'bank', description: 'Self transfer', date: '2026-11-05', toDate: '2026-11-05', poisha: 1 } },
    { type: 'account_update', id: 'bank', account: { name: 'New', openingPoisha: 999 } },
  ]) assert.throws(() => workspace.validateCommand(bad));
});

check('snapshot references chronology duplicates and aggregate amounts are validated', () => {
  assert.deepEqual(workspace.validateWorkspace(data()), data());
  for (const change of [
    value => { value.userId = 'other'; },
    value => { value.accounts[0].currency = 'USD'; },
    value => { value.accounts[0].openingDate = '2026-11-07'; },
    value => { value.transactions[0].accountId = 'foreign'; },
    value => { value.transactions[0].id = value.accounts[0].id; },
    value => { value.transfers[0].toAccountId = value.transfers[0].fromAccountId; },
    value => { value.accounts[0].openingPoisha = Number.MAX_SAFE_INTEGER; },
    value => { value.budgets.push({ ...value.budgets[0], id: 'duplicate-budget' }); },
  ]) { const value = data(); change(value); assert.throws(() => workspace.validateWorkspace(value)); }
  assert.equal(workspace.validateWorkspace({ ...workspace.emptyWorkspace(), accounts: [account('max', -Number.MAX_SAFE_INTEGER)] }).accounts[0].openingPoisha, -Number.MAX_SAFE_INTEGER);
});

check('account balances include openings and transfers but exclude future and unassigned entries', () => {
  const value = workspace.validateWorkspace(data());
  assert.equal(workspace.accountBalance(value, 'bank', '2026-11-08'), 97449);
  assert.equal(workspace.accountBalance(value, 'cash', '2026-11-08'), 30001);
  assert.equal(workspace.accountBalance(value, 'future', '2026-11-08'), 0);
  assert.equal(workspace.accountBalance(value, 'bank', '2026-10-31'), 0);
  assert.equal(workspace.accountBalance(value, 'unknown', '2026-11-08'), 0);
  assert.equal(workspace.accountBalance(value, 'bank', '2026-11-11'), 98449);
  // Archiving an account retains its historical money; it does not remove balances.
  assert.equal(value.accounts.find(item => item.id === 'cash').archived, true);
});

check('cash flow and budgets exclude openings and transfers while retaining legacy spend', () => {
  const summary = workspace.workspaceSummary(data(), '2026-11', '2026-11-08');
  assert.equal(summary.balancePoisha, 127450);
  assert.equal(summary.incomePoisha, 20000);
  assert.equal(summary.expensePoisha, 13050);
  assert.equal(summary.unassignedCount, 1);
  assert.equal(summary.budgets[0].spentPoisha, 13050);
  assert.equal(summary.budgets[0].status, 'Near limit');
  assert.equal(workspace.workspaceSummary(data(), '2026-10', '2026-11-08').expensePoisha, 0);
});

check('balance history reconciles dated events and internal transfers do not create wealth', () => {
  const history = workspace.balanceHistory(data(), '2026-11-01', '2026-11-11');
  assert.deepEqual(history, [
    { date: '2026-11-01', poisha: 120000 },
    { date: '2026-11-05', poisha: 127450 },
    { date: '2026-11-06', poisha: 127450 },
    { date: '2026-11-10', poisha: 158450 },
    { date: '2026-11-11', poisha: 158450 },
  ]);
  assert.deepEqual(workspace.balanceHistory(data(), '2026-11-08', '2026-11-08'), [{ date: '2026-11-08', poisha: 127450 }]);
  assert.deepEqual(workspace.balanceHistory(data(), '2026-11-11', '2026-11-01'), []);
  assert.deepEqual(workspace.balanceHistory(data(), '2026-02-29', '2026-11-11'), []);
});
console.log(JSON.stringify({ scope: 'Actual-source pure calculations and validation; no database or session acceptance', groupsPassed: checks.length, checks }, null, 2));
