// Behavioral checks against actual reports source; no database or UI mocks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const modules = {};
async function source(name, replacements = {}) {
  const text = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  let code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from ["']([^"']+)["']/g, (whole, specifier) => {
    if (replacements[specifier]) return `from ${JSON.stringify(replacements[specifier])}`;
    if (specifier.startsWith('node:')) return whole;
    if (specifier.startsWith('.')) throw new Error(`Unmapped report source import: ${specifier}`);
    return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
  });
  modules[name] = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return import(modules[name]);
}
await source('lib/preview.ts');
await source('lib/finance.ts', { './preview': modules['lib/preview.ts'] });
const workspace = await source('lib/workspace.ts', { './finance': modules['lib/finance.ts'], './preview': modules['lib/preview.ts'] });
const reports = await source('lib/reports.ts', { './preview': modules['lib/preview.ts'], './workspace': modules['lib/workspace.ts'] });
const checks = [];
const check = (name, action) => { action(); checks.push(name); console.log(`PASS reports ${name}`); };
const account = (id, openingPoisha) => ({ id, name: id, kind: 'bank', currency: 'BDT', openingDate: '2024-02-01', openingPoisha, archived: false });
const entry = (id, date, poisha, type = 'expense', accountId = 'bank', category = type === 'income' ? 'Salary' : 'Groceries') => ({ id, date, poisha, type, accountId, category, description: id });
function fixture() { return { ...workspace.emptyWorkspace(),
  accounts: [account('bank', 100000), account('cash', 20000)],
  transactions: [entry('prior', '2024-02-29', 10000, 'income'), entry('salary', '2024-03-01', 50000, 'income'), entry('food', '2024-03-02', 1234), entry('legacy', '2024-03-03', 200, 'expense', null), entry('other', '2024-03-03', 500, 'expense', 'bank', 'Shopping'), entry('future', '2024-03-04', 700, 'expense')],
  transfers: [{ id: 'transfer', fromAccountId: 'bank', toAccountId: 'cash', description: 'Internal', date: '2024-03-02', toDate: '2024-03-02', poisha: 10001 }],
  budgets: [{ id: 'budget', month: '2024-03', category: 'Groceries', limitPoisha: 20000 }],
}; }
check('calendar periods include leap days and quarter year boundaries', () => {
  assert.deepEqual(reports.reportRange('monthly', '2024-02-15'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(reports.reportRange('quarterly', '2024-12-15'), { start: '2024-10-01', end: '2024-12-31' });
  assert.deepEqual(reports.reportRange('ytd', '2024-02-29'), { start: '2024-01-01', end: '2024-02-29' });
  assert.deepEqual(reports.reportRange('last_6_months', '2024-02-29'), { start: '2023-09-01', end: '2024-02-29' });
  assert.equal(reports.shiftReportAnchor('monthly', '2024-03-31', -1), '2024-02-29');
  assert.equal(reports.shiftReportAnchor('quarterly', '2024-01-31', -1), '2023-10-31');
  assert.equal(reports.shiftReportAnchor('ytd', '2024-02-29', -1), '2023-02-28');
  assert.equal(reports.shiftReportAnchor('monthly', '1000-01-01', -1), null);
  assert.equal(reports.shiftReportAnchor('monthly', '9999-12-31', 1), null);
});
check('inclusive previous and custom ranges preserve day count and reject invalid intervals', () => {
  const range = { start: '2024-03-01', end: '2024-03-03' };
  assert.deepEqual(reports.previousRange(range), { start: '2024-02-27', end: '2024-02-29' });
  assert.deepEqual(reports.shiftCustomRange(range, 1), { start: '2024-03-04', end: '2024-03-06' });
  assert.equal(reports.previousRange({ start: '1000-01-01', end: '1000-01-01' }), null);
  for (const bad of [{ start: '', end: '2024-01-01' }, { start: '2023-02-29', end: '2024-01-01' }, { start: '2024-03-01', end: '2024-02-29' }, { start: '1000-01-01', end: '9999-12-31' }]) assert.throws(() => reports.validateReportRange(bad));
});
check('reports keep posted legacy cash flow but exclude openings transfers and future entries', () => {
  const report = reports.buildReport(fixture(), reports.reportRange('monthly', '2024-03-03'), '2024-03-03');
  assert.equal(report.incomePoisha, 50000); assert.equal(report.expensePoisha, 1934); assert.equal(report.netPoisha, 48066);
  assert.equal(report.unassignedCount, 1); assert.equal(report.transactions.length, 4);
  assert.equal(report.balancePoisha, 178266); // opening120000 + prior10000 + salary50000 - assigned1734
  assert.equal(report.balanceChangePoisha, 48266); // legacy200 does not affect account balances
  assert.equal(report.budgetSpendPoisha, 1434); assert.equal(report.budgetLimitPoisha, 20000); // Shopping has no budget
  assert.deepEqual(report.comparison, { start: '2024-02-27', end: '2024-02-29' });
  assert.equal(report.previousIncomePoisha, 10000); assert.equal(report.incomeChange, 400);
  assert.equal(report.months[0].expensePoisha, 1934);
});
check('zero prior values and future-only ranges do not invent percentages or income', () => {
  assert.equal(reports.percentageChange(0, 0), 0); assert.equal(reports.percentageChange(1, 0), null); assert.equal(reports.percentageChange(0, 100), -100);
  const empty = reports.buildReport(workspace.emptyWorkspace(), { start: '2024-03-01', end: '2024-03-31' }, '2024-03-03');
  assert.equal(empty.savingsRate, null); assert.equal(empty.budgetUsage, null); assert.equal(empty.averageIncomePoisha, 0);
  const future = reports.buildReport(fixture(), { start: '2024-04-01', end: '2024-04-30' }, '2024-03-03');
  assert.equal(future.observed, null); assert.equal(future.comparison, null); assert.equal(future.incomePoisha, 0); assert.equal(future.balanceChangePoisha, 0);
});
check('safe-limit money and rounded monthly averages retain exact poisha', () => {
  const data = workspace.emptyWorkspace();
  data.transactions.push(entry('safe', '2024-02-10', Number.MAX_SAFE_INTEGER, 'income', null));
  const report = reports.buildReport(data, { start: '2024-01-01', end: '2024-02-29' }, '2024-03-01');
  assert.equal(report.incomePoisha, Number.MAX_SAFE_INTEGER);
  assert.equal(report.averageIncomePoisha, 4503599627370496);
  const data2 = workspace.emptyWorkspace(); data2.transactions.push(entry('small', '2024-02-10', 1, 'expense', null));
  const report2 = reports.buildReport(data2, { start: '2024-01-01', end: '2024-02-29' }, '2024-03-01');
  assert.equal(report2.averageExpensePoisha, 1); assert.equal(report2.averageNetPoisha, -1);
});
check('CSV escapes user text and formulas while preserving numeric signed amounts', () => {
  const data = fixture(); data.accounts[0].name = '=HYPERLINK("bad")';
  const rows = [entry('csv', '2024-03-01', 12550)]; rows[0].description = '  +SUM(1,2)\n"quoted"';
  const csv = reports.transactionsCsv(data, rows);
  assert.ok(csv.startsWith('Date,Description,Type,Category,Account,Merchant,Tags,Notes,Status,Excluded,Amount (BDT),Currency\r\n'));
  assert.ok(csv.includes('"\'  +SUM(1,2)\n""quoted"""'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.endsWith(',-125.50,BDT\r\n'));
  const exact = reports.transactionsCsv(data, [entry('max', '2024-03-01', Number.MAX_SAFE_INTEGER, 'income')]);
  assert.ok(exact.includes(',90071992547409.91,BDT'));
});
check('pending and excluded activity stays out of reports and hierarchical plans count each amount once', () => {
  const data = fixture();
  data.categories = [
    {id:'food-root',name:'Food plan',color:'#6471eb',icon:'utensils',parentId:null,kind:'expense',archived:false},
    {id:'food-child',name:'Groceries',color:'#6471eb',icon:'basket',parentId:'food-root',kind:'expense',archived:false},
  ];
  data.transactions = [
    {...entry('posted','2024-03-01',1000),categoryId:'food-child',status:'confirmed',excluded:false},
    {...entry('pending','2024-03-01',9000),categoryId:'food-child',status:'pending',excluded:false},
    {...entry('excluded','2024-03-01',2000),categoryId:'food-child',status:'confirmed',excluded:true},
  ];
  data.budgets = [
    {id:'parent-plan',month:'2024-03',category:'Food plan',categoryId:'food-root',limitPoisha:5000},
    {id:'child-plan',month:'2024-03',category:'Groceries',categoryId:'food-child',limitPoisha:2000},
  ];
  const result = reports.buildReport(data,{start:'2024-03-01',end:'2024-03-31'},'2024-03-03');
  assert.equal(result.expensePoisha,1000);
  assert.equal(result.budgetSpendPoisha,1000);
  assert.equal(result.budgetLimitPoisha,5000);
  assert.equal(result.budgetUsage,20);
  assert.equal(result.transactions.length,1);
  data.budgets[1].categoryId = null;
  const legacyLimit = reports.buildReport(data,{start:'2024-03-01',end:'2024-03-31'},'2024-03-03');
  assert.equal(legacyLimit.budgetLimitPoisha,5000,'A label-only child limit is already covered by its catalog parent');
  assert.equal(legacyLimit.budgetSpendPoisha,1000);
  data.transactions[0].categoryId = null;
  data.budgets = data.budgets.slice(0,1);
  const legacy = reports.buildReport(data,{start:'2024-03-01',end:'2024-03-31'},'2024-03-03');
  assert.equal(legacy.budgetSpendPoisha,1000,'Parent plan includes a legacy builtin label under its child category');
});
check('configurable fiscal YTD follows July boundaries and clamps leap-year navigation', () => {
  assert.deepEqual(reports.reportRange('fiscal_ytd','2026-06-30',undefined,7),{start:'2025-07-01',end:'2026-06-30'});
  assert.deepEqual(reports.reportRange('fiscal_ytd','2026-07-01',undefined,7),{start:'2026-07-01',end:'2026-07-01'});
  assert.deepEqual(reports.reportRange('fiscal_ytd','2024-02-29',undefined,4),{start:'2023-04-01',end:'2024-02-29'});
  assert.equal(reports.shiftReportAnchor('fiscal_ytd','2024-02-29',-1),'2023-02-28');
  assert.throws(()=>reports.reportRange('fiscal_ytd','2026-07-01',undefined,0));
  assert.throws(()=>reports.reportRange('fiscal_ytd','2026-07-01',undefined,13));
  assert.throws(()=>reports.reportRange('fiscal_ytd','1000-01-01',undefined,7));
});
console.log(JSON.stringify({ scope: 'Actual-source report calculations, period semantics and spreadsheet-safe CSV; no browser or database acceptance', groupsPassed: checks.length, checks }, null, 2));
