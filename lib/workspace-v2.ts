import { z } from "zod";
import { budgetState, monthValid, type Budget } from "./finance";
import { categories, validDate, type Transaction } from "./preview";

export type AccountKind = "bank" | "cash" | "mobile";
export type FinancialAccount = { id: string; name: string; kind: AccountKind; currency: "BDT"; openingDate: string; openingPoisha: number; archived: boolean };
export type AccountTransaction = Transaction & { accountId: string | null };
export type Transfer = { id: string; fromAccountId: string; toAccountId: string; description: string; date: string; poisha: number };
export type WorkspaceData = { schemaVersion: 2; currency: "BDT"; revision: number; accounts: FinancialAccount[]; transactions: AccountTransaction[]; transfers: Transfer[]; budgets: Budget[] };
export const emptyWorkspace = (): WorkspaceData => ({ schemaVersion: 2, currency: "BDT", revision: 0, accounts: [], transactions: [], transfers: [], budgets: [] });

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const date = z.string().refine(validDate, "Use a real calendar date in years 1000–9999.");
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedMoney = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const positiveMoney = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const name = z.string().trim().min(1).max(80);
const description = z.string().trim().min(1).max(120);
const transactionInput = z.object({ accountId: id, description, type: z.enum(["income", "expense"]), category: z.string(), date, poisha: positiveMoney }).strict().refine(t => categories[t.type].includes(t.category), "Choose a category matching the transaction type.");
const transferInput = z.object({ fromAccountId: id, toAccountId: id, description, date, poisha: positiveMoney }).strict().refine(t => t.fromAccountId !== t.toAccountId, "Choose two different accounts.");
const budgetInput = z.object({ month: z.string().refine(monthValid, "Use a YYYY-MM month."), category: z.string().refine(v => categories.expense.includes(v), "Choose an expense category."), limitPoisha: positiveMoney }).strict();
export const workspaceCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("account_create"), account: z.object({ name, kind: z.enum(["bank", "cash", "mobile"]), openingDate: date, openingPoisha: signedMoney }).strict() }).strict(),
  z.object({ type: z.literal("account_update"), id, account: z.object({ name }).strict() }).strict(),
  z.object({ type: z.literal("account_archive"), id, archived: z.boolean() }).strict(),
  z.object({ type: z.literal("transaction_create"), transaction: transactionInput }).strict(),
  z.object({ type: z.literal("transaction_update"), id, transaction: transactionInput }).strict(),
  z.object({ type: z.literal("transaction_delete"), id }).strict(),
  z.object({ type: z.literal("transfer_create"), transfer: transferInput }).strict(),
  z.object({ type: z.literal("transfer_delete"), id }).strict(),
  z.object({ type: z.literal("budget_create"), budget: budgetInput }).strict(),
  z.object({ type: z.literal("budget_update"), id, budget: budgetInput }).strict(),
  z.object({ type: z.literal("budget_delete"), id }).strict(),
]);
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;
export function validateCommand(value: unknown): WorkspaceCommand {
  const result = workspaceCommandSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid financial operation.");
  return result.data;
}
export const workspaceDataSchema = z.object({
  schemaVersion: z.literal(2), currency: z.literal("BDT"), revision,
  accounts: z.array(z.object({ id, name, kind: z.enum(["bank", "cash", "mobile"]), currency: z.literal("BDT"), openingDate: date, openingPoisha: signedMoney, archived: z.boolean() }).strict()).max(100),
  transactions: z.array(z.object({ id, accountId: id.nullable(), description, category: z.string(), date, type: z.enum(["income", "expense"]), poisha: positiveMoney }).strict()).max(10_000),
  transfers: z.array(z.object({ id, fromAccountId: id, toAccountId: id, description, date, poisha: positiveMoney }).strict()).max(10_000),
  budgets: z.array(budgetInput.extend({ id }).strict()).max(1_000),
}).strict();
export function validateWorkspace(value: unknown): WorkspaceData {
  const parsed = workspaceDataSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid workspace data.");
  const data = parsed.data;
  if (data.transactions.length + data.transfers.length > 10_000) throw new Error("The workspace supports at most 10,000 entries and transfers combined.");
  const ids = new Set<string>();
  const unique = (value: string) => { if (ids.has(value)) throw new Error("Financial record IDs must be unique."); ids.add(value); };
  const accounts = new Map(data.accounts.map(a => [a.id, a]));
  let absoluteTotal = 0n;
  const add = (value: number) => { absoluteTotal += BigInt(Math.abs(value)); if (absoluteTotal > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Combined financial amounts exceed the safe money limit."); };
  for (const account of data.accounts) { unique(account.id); add(account.openingPoisha); }
  const owned = (id: string, entryDate: string) => {
    const account = accounts.get(id);
    if (!account) throw new Error("A financial entry references an unknown account.");
    if (entryDate < account.openingDate) throw new Error("An entry cannot be dated before its account opening date.");
  };
  for (const t of data.transactions) {
    unique(t.id); add(t.poisha);
    if (!categories[t.type].includes(t.category)) throw new Error("A transaction category does not match its type.");
    if (t.accountId !== null) owned(t.accountId, t.date);
  }
  for (const t of data.transfers) {
    unique(t.id); add(t.poisha);
    if (t.fromAccountId === t.toAccountId) throw new Error("Transfers need two different accounts.");
    owned(t.fromAccountId, t.date); owned(t.toAccountId, t.date);
  }
  let budgetTotal = 0n;
  const tuples = new Set<string>();
  for (const b of data.budgets) {
    unique(b.id);
    const key = `${b.month}:${b.category}`;
    if (tuples.has(key)) throw new Error("Only one budget per category and month is allowed.");
    tuples.add(key); budgetTotal += BigInt(b.limitPoisha);
    if (budgetTotal > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Combined budget amounts exceed the safe money limit.");
  }
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 2 * 1024 * 1024) throw new Error("Workspace exceeds the 2 MiB safety limit.");
  return data;
}

export function parseSignedAmount(value: string): number | null {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(negative ? -amount : amount);
}

export function accountBalance(data: WorkspaceData, id: string, asOf: string): number {
  const account = data.accounts.find(a => a.id === id);
  if (!account || account.openingDate > asOf) return 0;
  let total = BigInt(account.openingPoisha);
  for (const t of data.transactions) if (t.accountId === id && t.date <= asOf) total += BigInt(t.poisha) * (t.type === "income" ? 1n : -1n);
  for (const t of data.transfers) if (t.date <= asOf) {
    if (t.fromAccountId === id) total -= BigInt(t.poisha);
    if (t.toAccountId === id) total += BigInt(t.poisha);
  }
  return Number(total);
}
export function workspaceSummary(data: WorkspaceData, month: string, asOf: string) {
  const entries = data.transactions.filter(t => t.date.startsWith(month) && t.date <= asOf);
  const sum = (type: "income" | "expense", category?: string) => Number(entries.filter(t => t.type === type && (!category || t.category === category)).reduce((s, t) => s + BigInt(t.poisha), 0n));
  return {
    balancePoisha: Number(data.accounts.reduce((s, a) => s + BigInt(accountBalance(data, a.id, asOf)), 0n)),
    incomePoisha: sum("income"), expensePoisha: sum("expense"),
    unassignedCount: data.transactions.filter(t => t.accountId === null).length,
    budgets: data.budgets.filter(b => b.month === month).map(b => { const spentPoisha = sum("expense", b.category); return { ...b, spentPoisha, status: budgetState(spentPoisha, b.limitPoisha) }; }),
  };
}
export function balanceHistory(data: WorkspaceData, from: string, to: string): { date: string; poisha: number }[] {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  const events = new Map<string, bigint>();
  const event = (date: string, amount: bigint) => events.set(date, (events.get(date) ?? 0n) + amount);
  for (const a of data.accounts) event(a.openingDate, BigInt(a.openingPoisha));
  for (const t of data.transactions) if (t.accountId !== null) event(t.date, BigInt(t.poisha) * (t.type === "income" ? 1n : -1n));
  // An internal transfer has equal opposite effects on the combined balance.
  let balance = [...events].filter(([date]) => date < from).reduce((s, [, amount]) => s + amount, 0n);
  const dates = [...new Set([from, ...[...events.keys()].filter(date => date >= from && date <= to), to])].sort();
  return dates.map(date => { balance += events.get(date) ?? 0n; return { date, poisha: Number(balance) }; });
}
