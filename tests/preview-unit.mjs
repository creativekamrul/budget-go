import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../lib/preview.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const previewUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const { parseAmount, money, decimalAmount, validDate } = await import(previewUrl);
const financeSource = await readFile(new URL("../lib/finance.ts", import.meta.url), "utf8");
const financeOutput = ts.transpileModule(financeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace('"./preview"', JSON.stringify(previewUrl));
const { emptyFinance, validateFinance, parseBackup, saveFinance, budgetState, MAX_BACKUP_BYTES, STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(financeOutput).toString("base64")}`);

test("strict backups reject unknown fields, wrong categories, duplicate IDs and unsafe aggregate money", () => {
  const valid = { ...emptyFinance(), transactions: [{ id: "t-1", description: "Groceries", category: "Groceries", date: "2026-11-05", type: "expense", poisha: 10 }], budgets: [{ id: "b-1", month: "2026-11", category: "Groceries", limitPoisha: 100 }] };
  assert.deepEqual(parseBackup(JSON.stringify(valid)), valid);
  for (const mutate of [data => { data.extra = true; }, data => { data.currency = "USD"; }, data => { data.transactions[0].category = "Salary"; }, data => { data.transactions.push({ ...data.transactions[0] }); }, data => { data.budgets[0].id = "t-1"; }, data => { data.transactions[0].poisha = Number.MAX_SAFE_INTEGER; data.transactions.push({ ...data.transactions[0], id: "t-2", poisha: 1 }); }, data => { data.budgets[0].limitPoisha = Number.MAX_SAFE_INTEGER; data.budgets.push({ ...data.budgets[0], id: "b-2", category: "Dining", limitPoisha: 1 }); }]) {
    const next = structuredClone(valid); mutate(next); assert.throws(() => validateFinance(next));
  }
});
test("storage persists once only after validation and authoritative stale comparison", () => {
  let current = null; let writes = 0;
  const storage = { getItem(key) { assert.equal(key, STORAGE_KEY); return current; }, setItem(key, raw) { assert.equal(key, STORAGE_KEY); writes++; current = raw; } };
  const raw = saveFinance(storage, null, emptyFinance());
  assert.equal(writes, 1); assert.equal(raw, current);
  assert.throws(() => saveFinance(storage, null, emptyFinance()), /another tab/); assert.equal(writes, 1);
  assert.throws(() => saveFinance(storage, raw, { ...emptyFinance(), currency: "USD" })); assert.equal(writes, 1);
  const quotaStorage = { getItem: () => raw, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.throws(() => saveFinance(quotaStorage, raw, emptyFinance()), /QuotaExceededError/);
});
test("near-cap canonical exports roundtrip; maximum count and description combination rejects oversized backups", () => {
  const records = Array.from({ length: 10_000 }, (_, index) => ({ id: `t-${index}`, description: "x".repeat(120), category: "Groceries", date: "2026-11-05", type: "expense", poisha: 1 }));
  const large = { ...emptyFinance(), transactions: records };
  assert.throws(() => parseBackup(JSON.stringify(large)), /2 MiB/);
  let low = 0; let high = records.length;
  while (low < high) { const count = Math.ceil((low + high) / 2); const size = Buffer.byteLength(JSON.stringify({ ...large, transactions: records.slice(0, count) })); if (size <= MAX_BACKUP_BYTES) low = count; else high = count - 1; }
  large.transactions = records.slice(0, low);
  const canonical = JSON.stringify(large);
  assert.ok(Buffer.byteLength(canonical) > MAX_BACKUP_BYTES - 512);
  const storage = { getItem: () => null, setItem: (_key, raw) => { assert.equal(raw, canonical); } };
  assert.equal(saveFinance(storage, null, large), canonical);
  assert.deepEqual(parseBackup(canonical), large);
  assert.ok(Buffer.byteLength(JSON.stringify(large, null, 2)) > MAX_BACKUP_BYTES, "Pretty printing would violate export/import roundtrip; export must remain compact");
});
test("budget threshold comparisons remain exact at safe integer boundaries", () => {
  assert.equal(budgetState(0, 100), "On track"); assert.equal(budgetState(79, 100), "On track"); assert.equal(budgetState(80, 100), "Near limit"); assert.equal(budgetState(100, 100), "Limit reached"); assert.equal(budgetState(101, 100), "Over budget"); assert.equal(budgetState(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER), "Near limit");
});
test("parses positive decimal amounts to exact safe integer poisha", () => {
  assert.equal(parseAmount("0.10") + parseAmount("0.20"), 30);
  assert.equal(parseAmount("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  for (const invalid of ["", "0", "-1", "1.001", "Infinity", "1e2", "90071992547409.92", "12,000", ".5"]) assert.equal(parseAmount(invalid), null, invalid);
});
test("formats and prefills exact cents including maximum safe integer", () => {
  assert.equal(decimalAmount(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  assert.ok(money(Number.MAX_SAFE_INTEGER).endsWith(".91"));
  assert.ok(money(-1).includes("-"));
  assert.ok(money(-1).endsWith(".01"));
  assert.ok(money(125000000).includes("৳"));
});
test("validates local calendar dates and leap boundaries", () => {
  for (const valid of ["2024-02-29", "2026-11-30", "2026-12-31"]) assert.equal(validDate(valid), true, valid);
  for (const invalid of ["2026-02-29", "2026-11-31", "2026-00-01", "2026-01-00", "2026-1-1", "0099-01-01"]) assert.equal(validDate(invalid), false, invalid);
});
