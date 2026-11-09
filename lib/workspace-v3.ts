import { z } from "zod";
import { budgetState, monthValid, type Budget } from "./finance";
import { categories, validDate, type Transaction } from "./preview";

export type AccountKind = "bank" | "cash" | "mobile";
export type FinancialAccount = { id: string; name: string; kind: AccountKind; currency: "BDT"; openingDate: string; openingPoisha: number; archived: boolean };
export type Category = { id: string; name: string; color: string; icon: string; parentId: string | null; kind: "income" | "expense" | "both"; archived: boolean };
export type Tag = { id: string; name: string; color: string; archived: boolean };
export type Merchant = { id: string; name: string; color: string; website: string; archived: boolean };
export type AccountTransaction = Transaction & { accountId: string | null; categoryId: string | null; merchantId: string | null; tagIds: string[]; notes: string; status: "confirmed" | "pending"; excluded: boolean };
export type WorkspaceBudget = Budget & { categoryId: string | null };
export type Transfer = { id: string; fromAccountId: string; toAccountId: string; description: string; date: string; poisha: number };
export type WorkspaceData = { schemaVersion: 3; currency: "BDT"; revision: number; accounts: FinancialAccount[]; transactions: AccountTransaction[]; transfers: Transfer[]; budgets: WorkspaceBudget[]; categories: Category[]; tags: Tag[]; merchants: Merchant[] };
export const emptyWorkspace = (): WorkspaceData => ({ schemaVersion: 3, currency: "BDT", revision: 0, accounts: [], transactions: [], transfers: [], budgets: [], categories: [], tags: [], merchants: [] });

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const date = z.string().refine(validDate, "Use a real calendar date in years 1000–9999.");
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedMoney = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const positiveMoney = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const name = z.string().trim().min(1).max(80);
const description = z.string().trim().min(1).max(120);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six digit hex color.");
const categoryFields = { name, color, icon: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), parentId: id.nullable(), kind: z.enum(["income", "expense", "both"]) };
const tagFields = { name, color };
const merchantFields = { name, color, website: z.string().max(500).refine(v => { if (!v) return true; try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; } }, "Use an http(s) website or leave it empty.") };
const metadata = { categoryId: id.nullable().default(null), merchantId: id.nullable().default(null), tagIds: z.array(id).max(500).refine(v => new Set(v).size === v.length, "Tags must be unique.").default([]), notes: z.string().max(2000).default(""), status: z.enum(["confirmed", "pending"]).default("confirmed"), excluded: z.boolean().default(false) };
const optionalMetadata = { categoryId: metadata.categoryId.removeDefault().optional(), merchantId: metadata.merchantId.removeDefault().optional(), tagIds: metadata.tagIds.removeDefault().optional(), notes: metadata.notes.removeDefault().optional(), status: metadata.status.removeDefault().optional(), excluded: metadata.excluded.removeDefault().optional() };
const transactionInput = z.object({ accountId: id, description, type: z.enum(["income", "expense"]), category: z.string().max(80), date, poisha: positiveMoney, ...optionalMetadata }).strict();
const transferInput = z.object({ fromAccountId: id, toAccountId: id, description, date, poisha: positiveMoney }).strict().refine(t => t.fromAccountId !== t.toAccountId, "Choose two different accounts.");
const budgetInput = z.object({ month: z.string().refine(monthValid, "Use a YYYY-MM month."), category: z.string().max(80), categoryId: id.nullable().optional(), limitPoisha: positiveMoney }).strict();
const selectedIds = z.array(id).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Choose each transaction only once.");
const bulkPatch = z.object({description:description.optional(),date:date.optional(),category:z.string().max(80).optional(),...optionalMetadata}).strict().refine(patch => Object.values(patch).some(value => value !== undefined), "Choose at least one field to change.");
export const workspaceCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("account_create"), account: z.object({ name, kind: z.enum(["bank", "cash", "mobile"]), openingDate: date, openingPoisha: signedMoney }).strict() }).strict(),
  z.object({ type: z.literal("account_update"), id, account: z.object({ name }).strict() }).strict(),
  z.object({ type: z.literal("account_archive"), id, archived: z.boolean() }).strict(),
  z.object({ type: z.literal("transaction_create"), transaction: transactionInput }).strict(),
  z.object({ type: z.literal("transaction_update"), id, transaction: transactionInput }).strict(),
  z.object({ type: z.literal("transaction_delete"), id }).strict(),
  z.object({type:z.literal("transaction_bulk_update"),ids:selectedIds,patch:bulkPatch}).strict(),
  z.object({type:z.literal("transaction_bulk_delete"),ids:selectedIds}).strict(),
  z.object({type:z.literal("transaction_split"),id,parts:z.array(z.object({description,category:z.string().max(80),categoryId:id.nullable(),poisha:positiveMoney}).strict()).min(2).max(20)}).strict(),
  z.object({ type: z.literal("transfer_create"), transfer: transferInput }).strict(),
  z.object({ type: z.literal("transfer_delete"), id }).strict(),
  z.object({ type: z.literal("budget_create"), budget: budgetInput }).strict(),
  z.object({ type: z.literal("budget_update"), id, budget: budgetInput }).strict(),
  z.object({ type: z.literal("budget_delete"), id }).strict(),
  z.object({type:z.literal("budget_copy"),fromMonth:z.string().refine(monthValid),toMonth:z.string().refine(monthValid)}).strict(),
  z.object({ type: z.literal("category_create"), category: z.object(categoryFields).strict() }).strict(),
  z.object({ type: z.literal("category_update"), id, category: z.object(categoryFields).strict() }).strict(),
  z.object({ type: z.literal("category_archive"), id, archived: z.boolean() }).strict(),
  z.object({ type: z.literal("tag_create"), tag: z.object(tagFields).strict() }).strict(),
  z.object({ type: z.literal("tag_update"), id, tag: z.object(tagFields).strict() }).strict(),
  z.object({ type: z.literal("tag_archive"), id, archived: z.boolean() }).strict(),
  z.object({ type: z.literal("merchant_create"), merchant: z.object(merchantFields).strict() }).strict(),
  z.object({ type: z.literal("merchant_update"), id, merchant: z.object(merchantFields).strict() }).strict(),
  z.object({ type: z.literal("merchant_archive"), id, archived: z.boolean() }).strict(),
]);
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;
export function validateCommand(value: unknown): WorkspaceCommand {
  const result = workspaceCommandSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid financial operation.");
  return result.data;
}
export const workspaceDataSchema = z.object({
  schemaVersion: z.literal(3), currency: z.literal("BDT"), revision,
  accounts: z.array(z.object({ id, name, kind: z.enum(["bank", "cash", "mobile"]), currency: z.literal("BDT"), openingDate: date, openingPoisha: signedMoney, archived: z.boolean() }).strict()).max(100),
  transactions: z.array(z.object({ id, accountId: id.nullable(), description, category: z.string(), date, type: z.enum(["income", "expense"]), poisha: positiveMoney, ...metadata }).strict()).max(10_000),
  transfers: z.array(z.object({ id, fromAccountId: id, toAccountId: id, description, date, poisha: positiveMoney }).strict()).max(10_000),
  budgets: z.array(budgetInput.extend({ id, categoryId: id.nullable() }).strict()).max(1_000),
  categories: z.array(z.object({ id, ...categoryFields, archived: z.boolean() }).strict()).max(500),
  tags: z.array(z.object({ id, ...tagFields, archived: z.boolean() }).strict()).max(500),
  merchants: z.array(z.object({ id, ...merchantFields, archived: z.boolean() }).strict()).max(1000),
}).strict();
export function validateWorkspace(value: unknown): WorkspaceData {
  const parsed = workspaceDataSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid workspace data.");
  const data = parsed.data;
  if (data.transactions.length + data.transfers.length > 10_000) throw new Error("The workspace supports at most 10,000 entries and transfers combined.");
  const ids = new Set<string>();
  const unique = (value: string) => { if (ids.has(value)) throw new Error("Financial record IDs must be unique."); ids.add(value); };
  const accounts = new Map(data.accounts.map(a => [a.id, a]));
  const catalog = new Map(data.categories.map(c => [c.id, c]));
  for (const list of [data.categories, data.tags, data.merchants]) {
    const names = new Set<string>(); const catalogIds = new Set<string>();
    for (const item of list) { if (catalogIds.has(item.id)) throw new Error("Classification IDs must be unique within their catalog."); catalogIds.add(item.id); const key = item.name.toLowerCase(); if (names.has(key)) throw new Error("Classification names must be unique."); names.add(key); }
  }
  for (const c of data.categories) {
    if (c.parentId !== null) { const parent = catalog.get(c.parentId); if (!parent || (parent.kind !== "both" && parent.kind !== c.kind)) throw new Error("Category parent must exist and support the child kind."); }
    const seen = new Set<string>([c.id]); let parentId = c.parentId;
    while (parentId !== null) { if (seen.has(parentId)) throw new Error("Category hierarchy cannot contain cycles."); seen.add(parentId); parentId = catalog.get(parentId)?.parentId ?? null; }
    if (!c.archived && c.parentId && catalog.get(c.parentId)?.archived) throw new Error("An active category cannot have an archived parent.");
  }
  const classification = (categoryId: string | null, label: string, kind: "income" | "expense") => {
    if (categoryId === null) { if (!categories[kind].includes(label)) throw new Error("Custom categories require a categoryId."); return; }
    const c = catalog.get(categoryId); if (!c || c.name !== label || (c.kind !== "both" && c.kind !== kind)) throw new Error("Category reference, name or kind is inconsistent.");
  };
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
    classification(t.categoryId, t.category, t.type);
    if (t.merchantId !== null && !data.merchants.some(m => m.id === t.merchantId)) throw new Error("Unknown merchant.");
    if (t.tagIds.some(id => !data.tags.some(tag => tag.id === id))) throw new Error("Unknown tag.");
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
    classification(b.categoryId, b.category, "expense");
    const key = `${b.month}:${b.category.toLowerCase()}`;
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
  for (const t of data.transactions) if (t.accountId === id && t.status !== "pending" && t.date <= asOf) total += BigInt(t.poisha) * (t.type === "income" ? 1n : -1n);
  for (const t of data.transfers) if (t.date <= asOf) {
    if (t.fromAccountId === id) total -= BigInt(t.poisha);
    if (t.toAccountId === id) total += BigInt(t.poisha);
  }
  return Number(total);
}
export function workspaceSummary(data: WorkspaceData, month: string, asOf: string) {
  const entries = data.transactions.filter(t => t.date.startsWith(month) && t.date <= asOf && t.status !== "pending" && !t.excluded);
  const sum = (type: "income" | "expense", category?: string) => Number(entries.filter(t => t.type === type && (!category || t.category === category)).reduce((s, t) => s + BigInt(t.poisha), 0n));
  return {
    balancePoisha: Number(data.accounts.reduce((s, a) => s + BigInt(accountBalance(data, a.id, asOf)), 0n)),
    incomePoisha: sum("income"), expensePoisha: sum("expense"),
    unassignedCount: data.transactions.filter(t => t.accountId === null).length,
    budgets: data.budgets.filter(b => b.month === month).map(b => { const rootId = resolveCategoryId(data, b.categoryId, b.category); const spentPoisha = Number(entries.filter(t => t.type === "expense" && (rootId ? categoryInSubtree(data, resolveCategoryId(data, t.categoryId, t.category), rootId) : t.category === b.category)).reduce((s, t) => s + BigInt(t.poisha), 0n)); return { ...b, spentPoisha, status: budgetState(spentPoisha, b.limitPoisha) }; }),
  };
}
export function balanceHistory(data: WorkspaceData, from: string, to: string): { date: string; poisha: number }[] {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  const events = new Map<string, bigint>();
  const event = (date: string, amount: bigint) => events.set(date, (events.get(date) ?? 0n) + amount);
  for (const a of data.accounts) event(a.openingDate, BigInt(a.openingPoisha));
  for (const t of data.transactions) if (t.accountId !== null && t.status !== "pending") event(t.date, BigInt(t.poisha) * (t.type === "income" ? 1n : -1n));
  // An internal transfer has equal opposite effects on the combined balance.
  let balance = [...events].filter(([date]) => date < from).reduce((s, [, amount]) => s + amount, 0n);
  const dates = [...new Set([from, ...[...events.keys()].filter(date => date >= from && date <= to), to])].sort();
  return dates.map(date => { balance += events.get(date) ?? 0n; return { date, poisha: Number(balance) }; });
}

export function categoryInSubtree(data: Pick<WorkspaceData, "categories">, categoryId: string | null, rootId: string): boolean {
  const visited = new Set<string>();
  while (categoryId !== null && !visited.has(categoryId)) { if (categoryId === rootId) return true; visited.add(categoryId); categoryId = data.categories.find(c => c.id === categoryId)?.parentId ?? null; }
  return false;
}

/** Legacy built-in labels can participate in a current hierarchy without rewriting their records. */
export function resolveCategoryId(data: Pick<WorkspaceData, "categories">, categoryId: string | null | undefined, label: string): string | null {
  return categoryId ?? data.categories.find(category => category.name === label)?.id ?? null;
}

/** Parent limits already cover child limits in the same month, including legacy label-only budgets. */
export function topLevelCategoryBudgets<T extends Pick<WorkspaceBudget, "id" | "month" | "category" | "categoryId">>(data: Pick<WorkspaceData, "categories">, budgets: T[]): T[] {
  return budgets.filter(budget => {
    const id = resolveCategoryId(data, budget.categoryId, budget.category);
    return !id || !budgets.some(parent => {
      const parentId = resolveCategoryId(data, parent.categoryId, parent.category);
      return parent.id !== budget.id && parent.month === budget.month && parentId !== null && categoryInSubtree(data, id, parentId);
    });
  });
}
