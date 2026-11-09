import { categories as categoriesForLegacy } from "../preview";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { budgetState, emptyFinance, MAX_BACKUP_BYTES, monthValid, validateFinance, type Budget, type FinanceData } from "../finance";
import { type Transaction } from "../preview";
import { db } from "./db";
import { ApiError, invalid } from "./errors";

export type Scope = "finance:read" | "finance:write";
export type Actor = { userId: string; sessionVersion: number; kind: "session"; scopes: Scope[] } | { userId: string; sessionVersion: number; kind: "bearer"; scopes: Scope[]; tokenId: string };
export type DatabaseTransaction = Prisma.TransactionClient;
export async function assertActor(tx: DatabaseTransaction, actor: Actor, scope: Scope, lock = false) {
  if (lock) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: actor.userId } });
  if (!user || !user.active || user.sessionVersion !== actor.sessionVersion) throw new ApiError(401, "UNAUTHORIZED", "Your session or token is no longer valid. Sign in again.");
  if (actor.kind === "bearer") {
    const token = await tx.apiToken.findFirst({ where: { id: actor.tokenId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() }, sessionVersion: user.sessionVersion } });
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "The access token is invalid, expired or revoked.");
    if (!token.scopes.includes(scope)) throw new ApiError(403, "INSUFFICIENT_SCOPE", `This operation requires ${scope}.`);
  } else if (!actor.scopes.includes(scope)) throw new ApiError(403, "INSUFFICIENT_SCOPE", `This operation requires ${scope}.`);
  return user;
}
async function readState(tx: DatabaseTransaction, userId: string, revision: bigint): Promise<FinanceData> {
  const [transactions, budgets] = await Promise.all([
    tx.transaction.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { id: "asc" }] }),
    tx.budget.findMany({ where: { userId }, orderBy: [{ month: "asc" }, { category: "asc" }] }),
  ]);
  const data: FinanceData = { ...emptyFinance(), revision: Number(revision), transactions: transactions.map(({ id, description, category, date, type, poisha }) => ({ id, description, category, date, type: type as "income" | "expense", poisha: Number(poisha) })), budgets: budgets.map(({ id, month, category, limitPoisha }) => ({ id, month, category, limitPoisha: Number(limitPoisha) })) };
  try { validateFinance(data); if (Buffer.byteLength(JSON.stringify(data)) > MAX_BACKUP_BYTES) throw new Error(); }
  catch { throw new ApiError(503, "DATA_INTEGRITY", "The saved budget failed integrity checks. Contact the administrator; no data has been replaced."); }
  return data;
}
async function assertLegacyReadable(tx: DatabaseTransaction, userId: string) {
  const [advancedAccount,adjustment,match,datedTransfer]=await Promise.all([
    tx.financialAccount.findFirst({where:{userId,kind:{notIn:["bank","cash","mobile"]}},select:{id:true}}),
    tx.balanceAdjustment.findFirst({where:{userId},select:{id:true}}),tx.matchedTransfer.findFirst({where:{userId},select:{id:true}}),
    tx.transfer.findMany({where:{userId},select:{date:true,toDate:true}}),
  ]);
  if(advancedAccount||adjustment||match||datedTransfer.some(t=>t.toDate!==null&&t.toDate!==t.date))throw new ApiError(409,"VERSION_UPGRADE_REQUIRED","This workspace uses V4 financial features. Use the V4 workspace API for complete data.");

  const [transactions, budgets, categories, tag, merchant] = await Promise.all([
    tx.transaction.findMany({ where: { userId }, select: { category: true, type: true, categoryId: true, merchantId: true, notes: true, status: true, excluded: true, tags: { select: { tagId: true } } } }),
    tx.budget.findMany({ where: { userId }, select: { category: true, categoryId: true } }),
    tx.category.findMany({ where: { userId } }),
    tx.tag.findFirst({ where: { userId }, select: { id: true } }),
    tx.merchant.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  const builtin = (categoryId: string | null, label: string, kind: "income" | "expense") => {
    if (!categoriesForLegacy[kind].includes(label)) return false;
    if (!categoryId) return true;
    const c = categories.find(c => c.id === categoryId);
    return !!c && c.name === label && c.kind === kind && c.parentId === null && !c.archived;
  };
  if (tag || merchant || categories.some(c => c.parentId || c.archived || c.color.toLowerCase() !== "#a6bcff" || c.icon !== "folder" || c.kind === "both" || !categoriesForLegacy[c.kind as "income" | "expense"]?.includes(c.name)) || transactions.some(t => !builtin(t.categoryId, t.category, t.type as "income" | "expense") || t.merchantId || t.notes || t.status !== "confirmed" || t.excluded || t.tags.length) || budgets.some(b => !builtin(b.categoryId, b.category, "expense"))) throw new ApiError(409, "VERSION_UPGRADE_REQUIRED", "This workspace uses classifications or transaction metadata. Use the V3 workspace API to preserve complete data.");
}
export async function getFinance(actor: Actor): Promise<FinanceData> {
  return db().$transaction(async tx => {
    const user = await assertActor(tx, actor, "finance:read");
    await assertLegacyReadable(tx, user.id);
    return readState(tx, user.id, user.revision);
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 15_000 });
}
export function expectedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid("expectedRevision must be a non-negative safe integer from the latest saved response.");
  return value;
}
export async function mutateFinance(actor: Actor, expected: number, transform: (current: FinanceData) => FinanceData): Promise<FinanceData> {
  expectedRevision(expected);
  return db().$transaction(async tx => {
    // PostgreSQL row lock serializes all per-user finance writes, token revocations and resets.
    const user = await assertActor(tx, actor, "finance:write", true);
    // V1 whole-state replacement has no account/transfer fields. Once upgraded, it cannot
    // safely preserve links or complete backups. Never silently detach V2 financial data.
    const [account, transfer] = await Promise.all([
      tx.financialAccount.findFirst({ where: { userId: user.id }, select: { id: true } }),
      tx.transfer.findFirst({ where: { userId: user.id }, select: { id: true } }),
    ]);
    if (account || transfer) throw new ApiError(409, "VERSION_UPGRADE_REQUIRED", "This workspace uses financial accounts. Use the V3 workspace API to preserve account links and transfers; V1 writes and imports are disabled.");
    await assertLegacyReadable(tx, user.id);
    if (user.revision !== BigInt(expected)) throw new ApiError(409, "REVISION_CONFLICT", "Your budget changed in another tab or integration. Reload the saved budget before trying again.");
    if (expected === Number.MAX_SAFE_INTEGER) throw new ApiError(409, "REVISION_LIMIT", "The server revision reached its safety limit. Contact the administrator before making further changes.");
    // Keep database reads outside user-validation handling: raw driver failures must remain sanitized 503s.
    const current = await readState(tx, user.id, user.revision);
    let next: FinanceData;
    try { next = validateFinance({ ...transform(current), revision: expected + 1 }); }
    catch (error) { if (error instanceof ApiError) throw error; invalid(error instanceof Error ? error.message : "Invalid finance data."); }
    if (Buffer.byteLength(JSON.stringify(next)) > MAX_BACKUP_BYTES) throw new ApiError(413, "DATA_TOO_LARGE", "Your budget exceeds the 2 MiB safety limit.");
    await tx.transaction.deleteMany({ where: { userId: user.id } });
    await tx.budget.deleteMany({ where: { userId: user.id } });
    if (next.transactions.length) await tx.transaction.createMany({ data: next.transactions.map(t => ({ ...t, userId: user.id, poisha: BigInt(t.poisha) })) });
    if (next.budgets.length) await tx.budget.createMany({ data: next.budgets.map(b => ({ ...b, userId: user.id, limitPoisha: BigInt(b.limitPoisha) })) });
    await tx.user.update({ where: { id: user.id }, data: { revision: BigInt(next.revision) } });
    return next;
  }, { maxWait: 5_000, timeout: 30_000 });
}
export function replaceFinance(actor: Actor, expected: number, value: unknown) {
  let parsed: FinanceData;
  try { parsed = validateFinance(value); } catch (error) { invalid(error instanceof Error ? error.message : "Invalid finance data."); }
  return mutateFinance(actor, expected, () => parsed);
}
export function inputObject(value: unknown, allowed: string[], required: string[] = allowed): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("Expected a JSON object.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(object, key))) invalid(`Expected fields: ${required.join(", ")}. Unexpected fields are not accepted.`);
  return object;
}
export function createTransaction(actor: Actor, expected: number, value: unknown) {
  const input = inputObject(value, ["id", "description", "category", "date", "type", "poisha"], ["description", "category", "date", "type", "poisha"]);
  const transaction = { ...input, id: input.id ?? randomUUID() } as Transaction;
  return mutateFinance(actor, expected, current => ({ ...current, transactions: [transaction, ...current.transactions] }));
}
export function updateTransaction(actor: Actor, expected: number, id: string, value: unknown) {
  const input = inputObject(value, ["description", "category", "date", "type", "poisha"]);
  return mutateFinance(actor, expected, current => {
    if (!current.transactions.some(t => t.id === id)) throw new ApiError(404, "NOT_FOUND", "Transaction not found.");
    return { ...current, transactions: current.transactions.map(t => t.id === id ? { ...input, id } as Transaction : t) };
  });
}
export function deleteTransaction(actor: Actor, expected: number, id: string) {
  return mutateFinance(actor, expected, current => {
    if (!current.transactions.some(t => t.id === id)) throw new ApiError(404, "NOT_FOUND", "Transaction not found.");
    return { ...current, transactions: current.transactions.filter(t => t.id !== id) };
  });
}
export function createBudget(actor: Actor, expected: number, value: unknown) {
  const input = inputObject(value, ["id", "month", "category", "limitPoisha"], ["month", "category", "limitPoisha"]);
  const budget = { ...input, id: input.id ?? randomUUID() } as Budget;
  return mutateFinance(actor, expected, current => ({ ...current, budgets: [...current.budgets, budget] }));
}
export function updateBudget(actor: Actor, expected: number, id: string, value: unknown) {
  const input = inputObject(value, ["month", "category", "limitPoisha"]);
  return mutateFinance(actor, expected, current => {
    if (!current.budgets.some(b => b.id === id)) throw new ApiError(404, "NOT_FOUND", "Budget not found.");
    return { ...current, budgets: current.budgets.map(b => b.id === id ? { ...input, id } as Budget : b) };
  });
}
export function deleteBudget(actor: Actor, expected: number, id: string) {
  return mutateFinance(actor, expected, current => {
    if (!current.budgets.some(b => b.id === id)) throw new ApiError(404, "NOT_FOUND", "Budget not found.");
    return { ...current, budgets: current.budgets.filter(b => b.id !== id) };
  });
}
export async function getSummary(actor: Actor, month: string) {
  if (!monthValid(month)) invalid("month must be YYYY-MM in years 1000–9999.");
  const data = await getFinance(actor);
  const entries = data.transactions.filter(t => t.date.startsWith(month));
  const incomePoisha = entries.filter(t => t.type === "income").reduce((sum, t) => sum + t.poisha, 0);
  const expensePoisha = entries.filter(t => t.type === "expense").reduce((sum, t) => sum + t.poisha, 0);
  const budgets = data.budgets.filter(b => b.month === month).map(b => { const spentPoisha = entries.filter(t => t.type === "expense" && t.category === b.category).reduce((sum, t) => sum + t.poisha, 0); return { ...b, spentPoisha, status: budgetState(spentPoisha, b.limitPoisha) }; });
  return { month, revision: data.revision, incomePoisha, expensePoisha, balancePoisha: incomePoisha - expensePoisha, budgets };
}
