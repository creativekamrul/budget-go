import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { categories as builtinCategories } from "../preview";
import { workspaceCommandSchema as legacyCommandSchema, type WorkspaceData as WorkspaceV2 } from "../workspace-v2";
import { workspaceCommandSchema as v3CommandSchema, type WorkspaceData as WorkspaceV3 } from "../workspace-v3";
import { MAX_BACKUP_BYTES } from "../finance";
import { accountBalance, validateCommand, validateWorkspace, type WorkspaceCommand, type WorkspaceData } from "../workspace";
import { db } from "./db";
import { ApiError, invalid } from "./errors";
import { assertActor, expectedRevision, type Actor } from "./finance-service";

type TransactionClient = Prisma.TransactionClient;
function safeInteger(value: bigint): number {
  if (value < -BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(503, "DATA_INTEGRITY", "Saved finances exceed the exact-money safety limit. Contact the administrator.");
  return Number(value);
}

async function snapshot(tx: TransactionClient, userId: string, revision: bigint): Promise<WorkspaceData> {
  const [accounts, transactions, transfers, budgets, categories, tags, merchants, adjustments, matches] = await Promise.all([
    tx.financialAccount.findMany({ where: { userId }, orderBy: [{ archived: "asc" }, { name: "asc" }, { id: "asc" }] }),
    tx.transaction.findMany({ where: { userId }, include: { tags: { orderBy: { tagId: "asc" } } }, orderBy: [{ date: "desc" }, { id: "asc" }] }),
    tx.transfer.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { id: "asc" }] }),
    tx.budget.findMany({ where: { userId }, orderBy: [{ month: "asc" }, { category: "asc" }] }),
    tx.category.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    tx.tag.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    tx.merchant.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    tx.balanceAdjustment.findMany({where:{userId},orderBy:[{date:"desc"},{id:"asc"}]}),
    tx.matchedTransfer.findMany({where:{userId},orderBy:{id:"asc"}}),
  ]);
  const data = {
    schemaVersion: 4,
    currency: "BDT",
    revision: safeInteger(revision),
    accounts: accounts.map(({ id, name, kind, currency, openingDate, openingPoisha, archived }) => ({ id, name, kind, currency, openingDate, openingPoisha: safeInteger(openingPoisha), archived })),
    transactions: transactions.map(({ id, description, category, date, type, poisha, accountId, categoryId, merchantId, notes, status, excluded, tags }) => ({ id, description, category, date, type, poisha: safeInteger(poisha), accountId, categoryId, merchantId, notes, status, excluded, tagIds: tags.map(t => t.tagId) })),
    transfers: transfers.map(({ id, fromAccountId, toAccountId, description, date, toDate, poisha }) => ({ id, fromAccountId, toAccountId, description, date, toDate:toDate??date, poisha: safeInteger(poisha) })),
    adjustments: adjustments.map(({id,accountId,date,poisha,balancePoisha,description})=>({id,accountId,date,poisha:safeInteger(poisha),balancePoisha:safeInteger(balancePoisha),description})),
    matches: matches.map(({id,transferId,outgoing,incoming})=>({id,transferId,outgoing,incoming})),
    budgets: budgets.map(({ id, month, category, categoryId, limitPoisha }) => ({ id, month, category, categoryId, limitPoisha: safeInteger(limitPoisha) })),
    categories: categories.map(({ id, name, color, icon, parentId, kind, archived }) => ({ id, name, color, icon, parentId, kind, archived })),
    tags: tags.map(({ id, name, color, archived }) => ({ id, name, color, archived })),
    merchants: merchants.map(({ id, name, color, website, archived }) => ({ id, name, color, website, archived })),
  };
  try {
    const parsed = validateWorkspace(data);
    if (Buffer.byteLength(JSON.stringify(parsed)) > MAX_BACKUP_BYTES) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(503, "DATA_INTEGRITY", "Saved finances failed integrity checks. No data has been replaced. Contact the administrator.");
  }
}

export async function getWorkspace(actor: Actor): Promise<WorkspaceData> {
  return db().$transaction(async tx => {
    const user = await assertActor(tx, actor, "finance:read");
    return snapshot(tx, user.id, user.revision);
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 15_000 });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function ownedAccount(current: WorkspaceData, id: string, date?: string) {
  const account = current.accounts.find(item => item.id === id);
  if (!account) throw new ApiError(404, "NOT_FOUND", "Financial account not found.");
  if (account.archived) throw new ApiError(409, "ACCOUNT_ARCHIVED", "Restore this account before adding or editing entries.");
  if (date && date < account.openingDate) invalid("The entry date cannot be earlier than the account's opening date.");
  return account;
}

function uniqueName(items: { id: string; name: string }[], name: string, except?: string) {
  if (items.some(item => item.id !== except && item.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, "NAME_EXISTS", "A classification with this name already exists.");
}
function classifiedItem<T extends { id: string; archived: boolean }>(items: T[], id: string | null, previous: string | null | undefined, label: string): T | undefined {
  if (id === null) return;
  const item = items.find(item => item.id === id);
  if (!item) throw new ApiError(404, "NOT_FOUND", `${label} not found.`);
  if (item.archived && id !== previous) throw new ApiError(409, "CLASSIFICATION_ARCHIVED", `Restore this ${label.toLowerCase()} before assigning it.`);
  return item;
}
function classifiedCategory(current: WorkspaceData, id: string | null, label: string, kind: "income" | "expense", previous?: string | null): string {
  const item = classifiedItem(current.categories, id, previous, "Category");
  if (!item) { if (!builtinCategories[kind].includes(label)) invalid("Custom categories require a categoryId matching the transaction type."); return label; }
  if (item.kind !== "both" && item.kind !== kind) invalid("Choose a category matching the transaction type.");
  return item.name;
}

async function applyCommand(tx: TransactionClient, userId: string, current: WorkspaceData, command: WorkspaceCommand): Promise<string | undefined> {
  const where = (id: string) => ({ userId_id: { userId, id } });
  switch (command.type) {
    case "account_create":
      await tx.financialAccount.create({ data: { ...command.account, userId, id: randomUUID(), currency: "BDT", archived: false, openingPoisha: BigInt(command.account.openingPoisha) } });
      return;
    case "account_update":
      if (!current.accounts.some(item => item.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Financial account not found.");
      await tx.financialAccount.update({ where: where(command.id), data: { name: command.account.name } });
      return;
    case "account_archive":
      if (!current.accounts.some(item => item.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Financial account not found.");
      await tx.financialAccount.update({ where: where(command.id), data: { archived: command.archived } });
      return;
    case "account_adjustment_set": {
      ownedAccount(current,command.accountId,command.date);
      const prior=current.adjustments.find(a=>a.accountId===command.accountId&&a.date===command.date);
      const baseline=accountBalance({...current,adjustments:current.adjustments.filter(a=>a.id!==prior?.id)},command.accountId,command.date);
      const delta=BigInt(command.balancePoisha)-BigInt(baseline);
      if(delta < -BigInt(Number.MAX_SAFE_INTEGER)||delta>BigInt(Number.MAX_SAFE_INTEGER)) invalid("This adjustment exceeds the exact-money safety limit.");
      const data={accountId:command.accountId,date:command.date,poisha:delta,balancePoisha:BigInt(command.balancePoisha),description:command.description};
      if(prior)await tx.balanceAdjustment.update({where:where(prior.id),data});
      else await tx.balanceAdjustment.create({data:{...data,userId,id:randomUUID()}});
      return;
    }
    case "account_adjustment_delete": {
      const adjustment=current.adjustments.find(a=>a.id===command.id);
      if(!adjustment)throw new ApiError(404,"NOT_FOUND","Balance adjustment not found.");
      ownedAccount(current,adjustment.accountId);
      await tx.balanceAdjustment.delete({where:where(command.id)});return;
    }
    case "transaction_create":
    case "transaction_update": {
      const prior = command.type === "transaction_update" ? current.transactions.find(item => item.id === command.id) : undefined;
      if (command.type === "transaction_update" && !prior) throw new ApiError(404, "NOT_FOUND", "Transaction not found.");
      if (prior?.accountId) ownedAccount(current, prior.accountId);
      ownedAccount(current, command.transaction.accountId, command.transaction.date);
      const value = { categoryId: prior?.categoryId ?? null, merchantId: prior?.merchantId ?? null, tagIds: prior?.tagIds ?? [], notes: prior?.notes ?? "", status: prior?.status ?? "confirmed", excluded: prior?.excluded ?? false, ...command.transaction };
      const category = classifiedCategory(current, value.categoryId, value.category, value.type, prior?.categoryId);
      classifiedItem(current.merchants, value.merchantId, prior?.merchantId, "Merchant");
      for (const id of value.tagIds) classifiedItem(current.tags, id, prior?.tagIds.includes(id) ? id : undefined, "Tag");
      const { tagIds, ...fields } = value;
      const data = { ...fields, category, poisha: BigInt(value.poisha) };
      const transactionId = prior?.id ?? randomUUID();
      if (prior) {
        await tx.transaction.update({ where: where(transactionId), data });
        await tx.transactionTag.deleteMany({ where: { userId, transactionId } });
      } else await tx.transaction.create({ data: { ...data, userId, id: transactionId } });
      if (tagIds.length) await tx.transactionTag.createMany({ data: tagIds.map(tagId => ({ userId, transactionId, tagId })) });
      return transactionId;
    }
    case "transaction_delete":
      if (!current.transactions.some(item => item.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Transaction not found.");
      await tx.transaction.delete({ where: where(command.id) });
      return;
    case "transaction_bulk_update": {
      const selected = command.ids.map(id => current.transactions.find(t => t.id === id));
      if (selected.some(t => !t)) throw new ApiError(404,"NOT_FOUND","One or more selected transactions were not found.");
      for (const entry of selected) {
        if (!entry!.accountId) throw new ApiError(409,"ASSIGN_ACCOUNT_REQUIRED","Assign a financial account before bulk editing this legacy entry.");
        ownedAccount(current,entry!.accountId,command.patch.date ?? entry!.date);
      }
      for (const entry of selected) {
        const {id,...fields} = entry!;
        await applyCommand(tx,userId,current,{type:"transaction_update",id,transaction:{...fields,accountId:entry!.accountId!,...command.patch,...(command.patch.category !== undefined && command.patch.categoryId === undefined ? {categoryId:null} : {})}});
      }
      return;
    }
    case "transaction_bulk_delete": {
      if (command.ids.some(id => !current.transactions.some(t => t.id === id))) throw new ApiError(404,"NOT_FOUND","One or more selected transactions were not found.");
      await tx.transaction.deleteMany({where:{userId,id:{in:command.ids}}});
      return;
    }
    case "transaction_split": {
      const original = current.transactions.find(t => t.id === command.id);
      if (!original) throw new ApiError(404,"NOT_FOUND","Transaction not found.");
      if (!original.accountId) throw new ApiError(409,"ASSIGN_ACCOUNT_REQUIRED","Assign an account before splitting this legacy entry.");
      ownedAccount(current,original.accountId,original.date);
      if (await tx.transactionSplit.findFirst({where:{userId,partIds:{has:original.id}}})) throw new ApiError(409,"ALREADY_SPLIT","This entry already belongs to a split. Edit its existing parts individually.");
      if (await tx.transactionSplit.count({where:{userId}}) >= 1000) throw new ApiError(409,"SPLIT_LIMIT","The workspace supports up to 1,000 split records.");
      if (command.parts.reduce((sum,part) => sum+BigInt(part.poisha),0n) !== BigInt(original.poisha)) invalid("Split parts must add up exactly to the original transaction amount.");
      classifiedItem(current.merchants,original.merchantId,undefined,"Merchant");
      for (const id of original.tagIds) classifiedItem(current.tags,id,undefined,"Tag");
      const {id:originalId,...fields} = original;
      const partIds:string[] = [];
      for (const [index,part] of command.parts.entries()) {
        const transaction = {...fields,accountId:original.accountId,...part};
        const id = await applyCommand(tx,userId,current,index === 0 ? {type:"transaction_update",id:originalId,transaction} : {type:"transaction_create",transaction});
        if (!id) throw new ApiError(503,"DATA_INTEGRITY","A split part could not be linked.");
        partIds.push(id);
      }
      await tx.transactionSplit.create({data:{userId,id:randomUUID(),originalTransactionId:originalId,original,partIds}});
      await assertPlanningCapacity(tx,userId);
      return;
    }
    case "transfer_create":
      ownedAccount(current, command.transfer.fromAccountId, command.transfer.date);
      ownedAccount(current, command.transfer.toAccountId, command.transfer.toDate??command.transfer.date);
      if (command.transfer.fromAccountId === command.transfer.toAccountId) invalid("Choose two different financial accounts for a transfer.");
      await tx.transfer.create({ data: { ...command.transfer, toDate:command.transfer.toDate??command.transfer.date, userId, id: randomUUID(), poisha: BigInt(command.transfer.poisha) } });
      return;
    case "transfer_match": {
      const outgoing=current.transactions.find(t=>t.id===command.expenseId),incoming=current.transactions.find(t=>t.id===command.incomeId);
      if(!outgoing||!incoming)throw new ApiError(404,"NOT_FOUND","One or both transactions were not found.");
      if(outgoing.type!=="expense"||incoming.type!=="income"||outgoing.status!=="confirmed"||incoming.status!=="confirmed"||!outgoing.accountId||!incoming.accountId||outgoing.accountId===incoming.accountId||outgoing.poisha!==incoming.poisha)invalid("Match a confirmed expense and income of the same amount in two different accounts.");
      ownedAccount(current,outgoing.accountId,outgoing.date);ownedAccount(current,incoming.accountId,incoming.date);
      if(await tx.transactionSplit.findFirst({where:{userId,partIds:{hasSome:[outgoing.id,incoming.id]}}}))throw new ApiError(409,"SPLIT_MATCH_UNSUPPORTED","Split parts cannot be matched as transfers.");
      const transferId=randomUUID();
      await tx.transfer.create({data:{userId,id:transferId,fromAccountId:outgoing.accountId,toAccountId:incoming.accountId,date:outgoing.date,toDate:incoming.date,description:("Transfer: "+outgoing.description).slice(0,120),poisha:BigInt(outgoing.poisha)}});
      await tx.matchedTransfer.create({data:{userId,id:randomUUID(),transferId,outgoing,incoming}});
      await tx.transaction.deleteMany({where:{userId,id:{in:[outgoing.id,incoming.id]}}});return;
    }
    case "transfer_unmatch": {
      const match=current.matches.find(m=>m.id===command.id);
      if(!match)throw new ApiError(404,"NOT_FOUND","Transfer match not found.");
      if(current.transactions.some(t=>t.id===match.outgoing.id||t.id===match.incoming.id))throw new ApiError(409,"ID_COLLISION","An original transaction ID is already in use. No records were replaced.");
      for(const original of [match.outgoing,match.incoming]){
        ownedAccount(current,original.accountId!,original.date);
        const {tagIds,...fields}=original;
        const category=classifiedCategory(current,original.categoryId,original.category,original.type,original.categoryId);
        await tx.transaction.create({data:{...fields,category,userId,poisha:BigInt(original.poisha)}});
        if(tagIds.length)await tx.transactionTag.createMany({data:tagIds.map(tagId=>({userId,transactionId:original.id,tagId}))});
      }
      await tx.matchedTransfer.delete({where:where(match.id)});
      await tx.transfer.delete({where:where(match.transferId)});return;
    }
    case "transfer_delete":
      if (!current.transfers.some(item => item.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Transfer not found.");
      if(current.matches.some(m=>m.transferId===command.id))throw new ApiError(409,"MATCHED_TRANSFER","Unmatch this transfer to restore its original entries before deleting it.");
      await tx.transfer.delete({ where: where(command.id) });
      return;
    case "budget_create":
    case "budget_update": {
      const prior = command.type === "budget_update" ? current.budgets.find(item => item.id === command.id) : undefined;
      if (command.type === "budget_update" && !prior) throw new ApiError(404, "NOT_FOUND", "Budget not found.");
      const categoryId = command.budget.categoryId === undefined ? prior?.categoryId ?? null : command.budget.categoryId;
      const category = classifiedCategory(current, categoryId, command.budget.category, "expense", prior?.categoryId);
      if (current.budgets.some(item => item.id !== prior?.id && item.month === command.budget.month && item.category.toLowerCase() === category.toLowerCase())) throw new ApiError(409, "BUDGET_EXISTS", "A budget already exists for this category and month.");
      const data = { ...command.budget, categoryId, category, limitPoisha: BigInt(command.budget.limitPoisha) };
      if (prior) await tx.budget.update({ where: where(prior.id), data });
      else await tx.budget.create({ data: { ...data, userId, id: randomUUID() } });
      return;
    }
    case "budget_delete":
      if (!current.budgets.some(item => item.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Budget not found.");
      await tx.budget.delete({ where: where(command.id) });
      return;
    case "budget_copy": {
      if (command.fromMonth === command.toMonth) invalid("Choose a different target month.");
      if (current.budgets.some(b => b.month === command.toMonth)) throw new ApiError(409,"TARGET_HAS_BUDGETS","The target month already has category budgets. Nothing was replaced.");
      const source = current.budgets.filter(b => b.month === command.fromMonth);
      if (!source.length) throw new ApiError(409,"NO_BUDGETS","The source month has no category budgets to copy.");
      for (const budget of source) await applyCommand(tx,userId,current,{type:"budget_create",budget:{month:command.toMonth,category:budget.category,categoryId:budget.categoryId,limitPoisha:budget.limitPoisha}});
      return;
    }
    case "category_create":
    case "category_update": {
      const prior = command.type === "category_update" ? current.categories.find(c => c.id === command.id) : undefined;
      if (command.type === "category_update" && !prior) throw new ApiError(404, "NOT_FOUND", "Category not found.");
      uniqueName(current.categories, command.category.name, prior?.id);
      const categoryId = prior?.id ?? randomUUID();
      const value = command.category;
      const reservedKind = builtinCategories.income.some(n => n.toLowerCase() === value.name.toLowerCase()) ? "income" : builtinCategories.expense.some(n => n.toLowerCase() === value.name.toLowerCase()) ? "expense" : null;
      if (reservedKind && value.kind !== reservedKind) invalid("Built-in category names retain their original kind.");
      if (value.parentId !== null) {
        const parent = classifiedItem(current.categories, value.parentId, prior?.parentId, "Parent category");
        if (parent && parent.kind !== "both" && parent.kind !== value.kind) invalid("Parent category must support the child kind.");
        let cursor: string | null = value.parentId;
        const seen = new Set<string>([categoryId]);
        while (cursor !== null) { if (seen.has(cursor)) invalid("Category hierarchy cannot contain cycles."); seen.add(cursor); cursor = current.categories.find(c => c.id === cursor)?.parentId ?? null; }
      }
      // The validated post-write snapshot also rejects kind changes incompatible with history/children.
      if (prior) {
        if (current.budgets.some(b => b.categoryId === prior.id && current.budgets.some(other => other.id !== b.id && other.month === b.month && other.category.toLowerCase() === value.name.toLowerCase() && other.categoryId !== prior.id))) throw new ApiError(409, "BUDGET_EXISTS", "Renaming this category would duplicate a budget category and month.");
        await tx.category.update({ where: where(prior.id), data: value });
        await tx.transaction.updateMany({ where: { userId, categoryId: prior.id }, data: { category: value.name } });
        await tx.budget.updateMany({ where: { userId, categoryId: prior.id }, data: { category: value.name } });
      } else await tx.category.create({ data: { ...value, userId, id: categoryId } });
      return;
    }
    case "category_archive": {
      const item = current.categories.find(c => c.id === command.id);
      if (!item) throw new ApiError(404, "NOT_FOUND", "Category not found.");
      if (command.archived && current.categories.some(c => c.parentId === item.id && !c.archived)) throw new ApiError(409, "ACTIVE_CHILDREN", "Archive active child categories first.");
      if (!command.archived && item.parentId) classifiedItem(current.categories, item.parentId, undefined, "Parent category");
      await tx.category.update({ where: where(command.id), data: { archived: command.archived } }); return;
    }
    case "tag_create":
      uniqueName(current.tags, command.tag.name);
      await tx.tag.create({ data: { ...command.tag, userId, id: randomUUID() } }); return;
    case "tag_update":
      if (!current.tags.some(t => t.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Tag not found.");
      uniqueName(current.tags, command.tag.name, command.id);
      await tx.tag.update({ where: where(command.id), data: command.tag }); return;
    case "tag_archive":
      if (!current.tags.some(t => t.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Tag not found.");
      await tx.tag.update({ where: where(command.id), data: { archived: command.archived } }); return;
    case "merchant_create":
      uniqueName(current.merchants, command.merchant.name);
      await tx.merchant.create({ data: { ...command.merchant, userId, id: randomUUID() } }); return;
    case "merchant_update":
      if (!current.merchants.some(t => t.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Merchant not found.");
      uniqueName(current.merchants, command.merchant.name, command.id);
      await tx.merchant.update({ where: where(command.id), data: command.merchant }); return;
    case "merchant_archive":
      if (!current.merchants.some(t => t.id === command.id)) throw new ApiError(404, "NOT_FOUND", "Merchant not found.");
      await tx.merchant.update({ where: where(command.id), data: { archived: command.archived } }); return;
  }
}

export async function mutateWorkspace(actor: Actor, expected: number, requestId: unknown, value: unknown, legacy: boolean | "v3" = false): Promise<WorkspaceData> {
  expectedRevision(expected);
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) invalid("requestId must be a unique 1–80 character identifier using letters, numbers, hyphens or underscores.");
  let command: WorkspaceCommand;
  try { command = validateCommand(value); }
  catch (error) { invalid(error instanceof Error ? error.message : "Invalid workspace command."); }
  let hashCommand: unknown = command;
  if (legacy) { const parsed = (legacy === "v3" ? v3CommandSchema : legacyCommandSchema).safeParse(value); if (!parsed.success) invalid("Use a valid V2 command or upgrade to V3."); hashCommand = parsed.data; }
  const hash = createHash("sha256").update(canonical(hashCommand)).digest("hex");
  return db().$transaction(async tx => {
    // The same owner lock serializes V1 writes, V2 commands, revocations and password resets.
    const user = await assertActor(tx, actor, "finance:write", true);
    if (legacy) {const data=await snapshot(tx,user.id,user.revision);if(legacy==="v3")projectWorkspaceV3(data);else projectWorkspaceV2(data);}
    const receipt = await tx.requestReceipt.findUnique({ where: { userId_requestId: { userId: user.id, requestId } } });
    if (receipt) {
      if (receipt.hash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This requestId has already been used for a different command. Use a new requestId.");
      // A retry after a lost response does not apply the command again. Return current state,
      // rather than an old snapshot that could overwrite newer UI state.
      return snapshot(tx, user.id, user.revision);
    }
    if (user.revision !== BigInt(expected)) throw new ApiError(409, "REVISION_CONFLICT", "Your finances changed in another tab or integration. Reload saved data before trying again.");
    if (expected === Number.MAX_SAFE_INTEGER) throw new ApiError(409, "REVISION_LIMIT", "The revision reached its safety limit. Contact the administrator.");
    const current = await snapshot(tx, user.id, user.revision);
    await applyCommand(tx, user.id, current, command);
    const nextRevision = user.revision + 1n;
    // This read validates aggregate amounts, references and caps before the transaction commits.
    // Invalid mutations roll back their targeted writes along with the revision and receipt.
    let next: WorkspaceData;
    try { next = await snapshot(tx, user.id, nextRevision); }
    catch (error) {
      if (error instanceof ApiError && error.code === "DATA_INTEGRITY") invalid("This change exceeds a workspace safety limit or would leave inconsistent financial records.");
      throw error;
    }
    await tx.user.update({ where: { id: user.id }, data: { revision: nextRevision } });
    await tx.requestReceipt.create({ data: { userId: user.id, requestId, hash } });
    return next;
  }, { maxWait: 5_000, timeout: 30_000 });
}

export function projectWorkspaceV3(data: WorkspaceData): WorkspaceV3 {
  if(data.adjustments.length||data.matches.length||data.accounts.some(a=>!["bank","cash","mobile"].includes(a.kind))||data.transfers.some(t=>t.toDate!==t.date))throw new ApiError(409,"VERSION_UPGRADE_REQUIRED","This workspace uses account families, balance adjustments or matched/dated transfers. Use the V4 workspace API for complete data.");
  const {adjustments,matches,...rest}=data;
  void adjustments;void matches;
  return {...rest,schemaVersion:3,accounts:data.accounts as WorkspaceV3["accounts"],transfers:data.transfers.map(({id,fromAccountId,toAccountId,description,date,poisha})=>({id,fromAccountId,toAccountId,description,date,poisha}))};
}
export function projectWorkspaceV2(source: WorkspaceData): WorkspaceV2 {
  const data=projectWorkspaceV3(source);
  const builtin = (categoryId: string | null, label: string, kind: "income" | "expense") => {
    if (!builtinCategories[kind].includes(label)) return false;
    if (!categoryId) return true;
    const c = data.categories.find(c => c.id === categoryId);
    return !!c && c.name === label && c.kind === kind && c.parentId === null && !c.archived;
  };
  const defaultNames = [...builtinCategories.income, ...builtinCategories.expense];
  if (data.tags.length || data.merchants.length || data.categories.some(c => c.kind === "both" || !defaultNames.includes(c.name) || c.parentId !== null || c.archived || c.color.toLowerCase() !== "#a6bcff" || c.icon !== "folder" || !builtinCategories[c.kind].includes(c.name)) || data.transactions.some(t => !builtin(t.categoryId, t.category, t.type) || t.merchantId || t.tagIds.length || t.notes || t.status !== "confirmed" || t.excluded) || data.budgets.some(b => !builtin(b.categoryId, b.category, "expense"))) throw new ApiError(409, "VERSION_UPGRADE_REQUIRED", "This workspace uses classifications or transaction metadata. Use the V3 workspace API for complete data.");
  return { schemaVersion: 2, currency: data.currency, revision: data.revision, accounts: data.accounts, transfers: data.transfers, transactions: data.transactions.map(({ id, accountId, description, category, date, type, poisha }) => ({ id, accountId, description, category, date, type, poisha })), budgets: data.budgets.map(({ id, month, category, limitPoisha }) => ({ id, month, category, limitPoisha })) };
}

// Internal transaction-scoped helpers let inbox acceptance reuse the exact financial rules.
export { snapshot as workspaceSnapshot, applyCommand as applyWorkspaceCommand };

// Raw rows include owner/index fields and are conservatively at least as large as
// their public planning projection. Financial split commands also share this cap.
export async function assertPlanningCapacity(tx:TransactionClient,userId:string) {
  const [recurring,occurrences,splits,monthlyPlans]=await Promise.all([
    tx.recurringSchedule.findMany({where:{userId}}),tx.recurringOccurrence.findMany({where:{userId}}),
    tx.transactionSplit.findMany({where:{userId}}),tx.monthlyPlan.findMany({where:{userId}}),
  ]);
  const bytes=Buffer.byteLength(JSON.stringify({revision:Number.MAX_SAFE_INTEGER,recurring,occurrences,splits,monthlyPlans},(_,value)=>typeof value==="bigint"?value.toString():value));
  if(bytes>2*1024*1024)invalid("This change exceeds the planning snapshot safety limit. No successful change was saved.");
}
