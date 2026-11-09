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
const check = (name, action) => { action(); checks.push(name); console.log(`PASS classification ${name}`); };
const category = (id, name, parentId = null, kind = 'expense', extra = {}) => ({ id, name, parentId, kind, color: '#22c55e', icon: 'folder', archived: false, ...extra });
const entry = (id, poisha, extra = {}) => ({ id, accountId: 'bank', description: id, category: 'Groceries', categoryId: null, merchantId: null, tagIds: [], notes: '', status: 'confirmed', excluded: false, date: '2026-11-05', type: 'expense', poisha, ...extra });
const fixture = () => ({ ...workspace.emptyWorkspace(), accounts: [{ id: 'bank', name: 'Bank', kind: 'bank', currency: 'BDT', openingDate: '2026-11-01', openingPoisha: 100000, archived: false }], categories: [category('food', 'Food'), category('produce', 'Produce', 'food')], tags: [{ id: 'tag', name: 'Essential', color: '#22c55e', archived: false }], merchants: [{ id: 'shop', name: 'Shop', color: '#22c55e', website: '', archived: false }], transactions: [entry('posted', 1000), entry('pending', 2000, { status: 'pending' }), entry('excluded', 3000, { excluded: true }), entry('future', 4000, { date: '2026-11-12' })], budgets: [{ id: 'budget', month: '2026-11', category: 'Groceries', categoryId: null, limitPoisha: 10000 }] });

check('pending leaves posted balances unchanged; confirmed exclusions remain in balance only', () => {
  const value = workspace.validateWorkspace(fixture());
  assert.equal(value.schemaVersion, 4);
  assert.equal(workspace.accountBalance(value, 'bank', '2026-11-08'), 96000);
  const summary = workspace.workspaceSummary(value, '2026-11', '2026-11-08');
  assert.equal(summary.expensePoisha, 1000);
  assert.equal(summary.budgets[0].spentPoisha, 1000);
  assert.equal(workspace.balanceHistory(value, '2026-11-01', '2026-11-08').at(-1).poisha, 96000);
  assert.equal(workspace.accountBalance(value, 'bank', '2026-11-13'), 92000);
});

check('category references hierarchy cycles and kind mismatches reject invalid snapshots', () => {
  for (const change of [
    x => { x.categories[0].parentId = 'produce'; },
    x => { x.categories[0].parentId = 'food'; },
    x => { x.categories[0].parentId = 'foreign'; },
    x => { x.transactions[0].categoryId = 'foreign'; },
    x => { x.transactions[0].categoryId = 'food'; x.transactions[0].category = 'Food'; x.transactions[0].type = 'income'; },
    x => { x.transactions[0].merchantId = 'foreign'; },
    x => { x.transactions[0].tagIds = ['foreign']; },
    x => { x.transactions[0].tagIds = ['tag', 'tag']; },
    x => { x.budgets[0].categoryId = 'foreign'; },
  ]) { const value = fixture(); change(value); assert.throws(() => workspace.validateWorkspace(value)); }
});

check('archived classification retains valid historical references', () => {
  const value = fixture();
  value.categories[1].archived = true; value.tags[0].archived = true; value.merchants[0].archived = true;
  value.transactions[0] = entry('posted', 1000, { categoryId: 'produce', category: 'Produce', merchantId: 'shop', tagIds: ['tag'], notes: 'Retained note' });
  assert.deepEqual(workspace.validateWorkspace(value), value);
});

check('parent budgets include descendants once and category IDs avoid label collisions', () => {
  const value = fixture();
  value.transactions = [entry('child', 1234, { categoryId: 'produce', category: 'Produce' })];
  value.budgets = [{ id: 'parent-budget', month: '2026-11', category: 'Food', categoryId: 'food', limitPoisha: 5000 }];
  assert.equal(workspace.workspaceSummary(workspace.validateWorkspace(value), '2026-11', '2026-11-08').budgets[0].spentPoisha, 1234);
});

check('classification command fields reject owner injection malformed flags and unsafe metadata', () => {
  const base = { type: 'transaction_create', transaction: { ...entry('ignored', 1) } }; delete base.transaction.id;
  for (const extra of [{ userId: 'foreign' }, { status: 'cleared' }, { excluded: 'false' }, { notes: 'x'.repeat(10001) }, { tagIds: ['tag', 'tag'] }]) assert.throws(() => workspace.validateCommand({ ...base, transaction: { ...base.transaction, ...extra } }));
});
console.log(JSON.stringify({ scope: 'Actual-source classification calculations and validators; no PostgreSQL or session evidence', groupsPassed: checks.length, checks }, null, 2));
