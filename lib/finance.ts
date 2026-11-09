import { categories, validDate, type Transaction } from "./preview";

export const STORAGE_KEY = "budget-go:v1";
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export const MAX_TRANSACTIONS = 10_000;
export const MAX_BUDGETS = 1_000;
export type Budget = { id: string; month: string; category: string; limitPoisha: number };
export type FinanceData = { schemaVersion: 1; currency: "BDT"; revision: number; transactions: Transaction[]; budgets: Budget[] };
export const emptyFinance = (): FinanceData => ({ schemaVersion: 1, currency: "BDT", revision: 0, transactions: [], budgets: [] });
export function monthValid(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function idValid(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value); }
function fail(message: string): never { throw new Error(message); }
export function validateFinance(value: unknown): FinanceData {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "currency", "revision", "transactions", "budgets"])) fail("The backup must contain only the Budget Go version, currency, revision, transactions and budgets fields.");
  if (value.schemaVersion !== 1 || value.currency !== "BDT") fail("This file is not a supported Budget Go v1 BDT backup.");
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) fail("The backup revision is invalid.");
  if (!Array.isArray(value.transactions) || value.transactions.length > MAX_TRANSACTIONS) fail("Backups support at most 10,000 transactions.");
  if (!Array.isArray(value.budgets) || value.budgets.length > MAX_BUDGETS) fail("Backups support at most 1,000 category budgets.");
  const ids = new Set<string>();
  let total = 0n;
  for (const [index, item] of value.transactions.entries()) {
    const label = `Transaction ${index + 1}`;
    if (!record(item) || !exactKeys(item, ["id", "description", "category", "date", "type", "poisha"])) fail(`${label} has missing or unexpected fields.`);
    if (!idValid(item.id) || ids.has(item.id)) fail(`${label} has an invalid or duplicate ID.`);
    ids.add(item.id);
    if (typeof item.description !== "string" || item.description.trim().length === 0 || item.description.length > 120 || item.description !== item.description.trim()) fail(`${label} needs a description of 1–120 characters without surrounding spaces.`);
    if (item.type !== "income" && item.type !== "expense") fail(`${label} has an invalid transaction type.`);
    if (typeof item.category !== "string" || !categories[item.type].includes(item.category)) fail(`${label} has a category that does not match its type.`);
    if (typeof item.date !== "string" || !validDate(item.date)) fail(`${label} has an invalid calendar date.`);
    if (!positiveInteger(item.poisha)) fail(`${label} needs a positive safe-integer poisha amount.`);
    total += BigInt(item.poisha);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail("The combined transaction amounts exceed the safe money limit.");
  }
  const budgetIds = new Set<string>();
  const tuples = new Set<string>();
  let budgetTotal = 0n;
  for (const [index, item] of value.budgets.entries()) {
    const label = `Budget ${index + 1}`;
    if (!record(item) || !exactKeys(item, ["id", "month", "category", "limitPoisha"])) fail(`${label} has missing or unexpected fields.`);
    if (!idValid(item.id) || budgetIds.has(item.id) || ids.has(item.id)) fail(`${label} has an invalid or duplicate ID.`);
    budgetIds.add(item.id);
    if (typeof item.month !== "string" || !monthValid(item.month)) fail(`${label} has an invalid month.`);
    if (typeof item.category !== "string" || !categories.expense.includes(item.category)) fail(`${label} must use a built-in expense category.`);
    const tuple = `${item.month}:${item.category}`;
    if (tuples.has(tuple)) fail("Only one budget per category and month is allowed.");
    tuples.add(tuple);
    if (!positiveInteger(item.limitPoisha)) fail(`${label} needs a positive safe-integer poisha limit.`);
    budgetTotal += BigInt(item.limitPoisha);
    if (budgetTotal > BigInt(Number.MAX_SAFE_INTEGER)) fail("The combined budget limits exceed the safe money limit.");
  }
  return value as FinanceData;
}
export function parseBackup(text: string): FinanceData {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) fail("This backup is larger than the 2 MiB safety limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { fail("This file is not valid JSON. Your current data has not changed."); }
  return validateFinance(parsed);
}
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function saveFinance(storage: StorageLike, expectedRaw: string | null, data: FinanceData): string {
  if (storage.getItem(STORAGE_KEY) !== expectedRaw) fail("Your data changed in another tab. Reload saved data before trying again.");
  validateFinance(data);
  const raw = JSON.stringify(data);
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) fail("Your data exceeds the 2 MiB safety limit. Export a backup before reducing older entries.");
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
export function budgetState(spent: number, limit: number) {
  return spent > limit ? "Over budget" : spent === limit ? "Limit reached" : BigInt(spent) * 100n >= BigInt(limit) * 80n ? "Near limit" : "On track";
}
