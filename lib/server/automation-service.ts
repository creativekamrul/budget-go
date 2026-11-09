import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { alertParseSchema, automationCommandSchema, automationDraftSchema, defaultPreferences, ingestSchema, normalizeBanglaDigits, parseBangladeshAlert, containsSecuritySecret, preferencesSchema, type AutomationDraft, type AutomationEvent, type AutomationSnapshot, type WorkspacePreferences } from "../automation";
import { categories as builtinCategories } from "../preview";
import { validateCommand, type WorkspaceData } from "../workspace";
import { db } from "./db";
import { assertActor, expectedRevision, type Actor } from "./finance-service";
import { ApiError, invalid } from "./errors";
import { applyWorkspaceCommand, workspaceSnapshot } from "./workspace-service";

type Tx = Prisma.TransactionClient;
const EVENT_LIMIT = 200;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
function safeRevision(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(503,"DATA_INTEGRITY","The saved revision exceeds the safety limit.");
  return Number(value);
}
function parsed<T>(schema: {safeParse: (value: unknown) => {success: true; data: T} | {success: false}}, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) invalid("Check the automation fields and send only the documented properties.");
  return result.data;
}
async function preferences(tx: Tx, userId: string): Promise<WorkspacePreferences> {
  const saved = await tx.workspacePreference.findUnique({where:{userId}});
  const result = preferencesSchema.safeParse(saved?.data ?? defaultPreferences());
  if (!result.success) throw new ApiError(503,"DATA_INTEGRITY","Saved workspace preferences failed validation.");
  return result.data;
}
function draftFromSaved(value: unknown): AutomationDraft {
  const result = automationDraftSchema.safeParse(value);
  if (!result.success) throw new ApiError(503,"DATA_INTEGRITY","A saved inbox draft failed validation.");
  return result.data;
}
function checkedDraft(workspace: WorkspaceData, input: AutomationDraft): AutomationDraft {
  const draft = {...input, tagIds:[...input.tagIds]};
  if (draft.accountId && !workspace.accounts.some(a => a.id === draft.accountId)) throw new ApiError(404,"NOT_FOUND","Financial account not found.");
  if (draft.categoryId) {
    const category = workspace.categories.find(c => c.id === draft.categoryId);
    if (!category) throw new ApiError(404,"NOT_FOUND","Category not found.");
    if (draft.type && category.kind !== "both" && category.kind !== draft.type) invalid("Category must match income or expense.");
    draft.category = category.name;
  } else if (draft.category && draft.type && !builtinCategories[draft.type].includes(draft.category)) invalid("Custom categories require their owned categoryId.");
  if (draft.merchantId && !workspace.merchants.some(m => m.id === draft.merchantId)) throw new ApiError(404,"NOT_FOUND","Merchant not found.");
  if (draft.tagIds.some(id => !workspace.tags.some(t => t.id === id))) throw new ApiError(404,"NOT_FOUND","Tag not found.");
  return draft;
}
function reviewIssues(workspace: WorkspaceData, draft: AutomationDraft): string[] {
  const issues: string[] = [];
  const account = workspace.accounts.find(a => a.id === draft.accountId);
  if (!account) issues.push("Choose the financial account.");
  else { if (account.archived) issues.push("Restore the financial account before posting."); if (draft.date && draft.date < account.openingDate) issues.push("The date is earlier than the account opening."); }
  if (!draft.description) issues.push("Enter a description.");
  if (!draft.type) issues.push("Confirm income or expense.");
  if (!draft.poisha) issues.push("Confirm the transaction amount.");
  if (!draft.date) issues.push("Confirm the transaction date.");
  if (!draft.category) issues.push("Choose a category.");
  const category = workspace.categories.find(c => c.id === draft.categoryId);
  if (category?.archived) issues.push("Restore or replace the archived category.");
  if (workspace.merchants.some(m => m.id === draft.merchantId && m.archived) || workspace.tags.some(t => draft.tagIds.includes(t.id) && t.archived)) issues.push("Restore or replace archived merchant/tag assignments.");
  return issues;
}
function matchingTransactions(workspace: WorkspaceData, draft: AutomationDraft, acceptedId?: string | null): string[] {
  if (!draft.accountId || !draft.date || !draft.poisha || !draft.type) return [];
  return workspace.transactions.filter(t => t.id !== acceptedId && t.accountId === draft.accountId && t.date === draft.date && t.poisha === draft.poisha && t.type === draft.type).map(t => t.id);
}
async function duplicateEvent(tx: Tx, userId: string, draft: AutomationDraft, reference: string, messageHash: string | null, excludeId?: string): Promise<string | null> {
  const candidates = await tx.automationEvent.findMany({where:{userId,status:{not:"ignored"},...(excludeId ? {id:{not:excludeId}} : {})},orderBy:[{receivedAt:"asc"},{id:"asc"}]});
  for (const other of candidates) {
    if (messageHash && messageHash === other.messageHash) return other.id;
    const previous = draftFromSaved(other.draft);
    if (reference && other.reference.toUpperCase() === reference.toUpperCase() && draft.accountId && previous.accountId === draft.accountId) return other.id;
  }
  return null;
}
async function snapshot(tx: Tx, userId: string, revision: bigint, cursor?: string): Promise<AutomationSnapshot> {
  const cursorEvent = cursor ? await tx.automationEvent.findUnique({where:{userId_id:{userId,id:cursor}},select:{id:true,receivedAt:true}}) : null;
  if (cursor && !cursorEvent) throw new ApiError(404,"NOT_FOUND","Inbox pagination cursor not found.");
  const pageWhere = cursorEvent ? {userId,OR:[{receivedAt:{lt:cursorEvent.receivedAt}},{receivedAt:cursorEvent.receivedAt,id:{lt:cursorEvent.id}}]} : {userId};
  const [settings,sources,events,eventTotal,workspace] = await Promise.all([
    preferences(tx,userId), tx.automationSource.findMany({where:{userId},orderBy:[{name:"asc"},{id:"asc"}]}),
    tx.automationEvent.findMany({where:pageWhere,orderBy:[{receivedAt:"desc"},{id:"desc"}],take:EVENT_LIMIT+1}), tx.automationEvent.count({where:{userId}}), workspaceSnapshot(tx,userId,revision),
  ]);
  const page = events.slice(0,EVENT_LIMIT);
  return {revision:safeRevision(revision),preferences:settings,sources:sources.map(({id,name,channel,providerLabel,accountId,enabled}) => ({id,name,channel:channel as "sms"|"email"|"manual",providerLabel,accountId,enabled})),events:page.map(event => eventView(event,workspace)),eventTotal,eventLimit:EVENT_LIMIT,nextCursor:events.length > EVENT_LIMIT ? page[page.length-1].id : null};
}
type EventRow = Awaited<ReturnType<Tx["automationEvent"]["findMany"]>>[number];
function eventView(event: EventRow, workspace: WorkspaceData): AutomationEvent {
  const draft = draftFromSaved(event.draft);
  const issues = event.status === "accepted" || event.status === "ignored" ? event.issues : reviewIssues(workspace,draft);
  const duplicateTransactionIds = matchingTransactions(workspace,draft,event.transactionId);
  const status = event.status === "accepted" || event.status === "ignored" ? event.status : issues.length || event.duplicateOfEventId || duplicateTransactionIds.length ? "needs_review" : "ready";
  return {id:event.id,sourceId:event.sourceId,externalId:event.externalId,reference:event.reference,receivedAt:event.receivedAt.toISOString(),status:status as AutomationEvent["status"],draft,issues,duplicateOfEventId:event.duplicateOfEventId,duplicateTransactionIds,transactionId:event.transactionId,rawText:event.rawText};
}
export async function getAutomation(actor: Actor, cursor?: string): Promise<AutomationSnapshot> {
  if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(cursor)) invalid("Use the event cursor returned by the previous page.");
  return db().$transaction(async tx => { const user = await assertActor(tx,actor,"finance:read"); return snapshot(tx,user.id,user.revision,cursor); },{isolationLevel:"RepeatableRead",maxWait:5000,timeout:15000});
}
export async function previewAlert(actor: Actor, value: unknown) {
  const input = parsed(alertParseSchema,value);
  await db().$transaction(tx => assertActor(tx,actor,"finance:read"));
  try { return parseBangladeshAlert(input.rawText); } catch { invalid("Security codes, OTPs and passwords must not be submitted to the finance inbox."); }
}
function checkNextRevision(revision: bigint): bigint { if (revision >= BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(409,"REVISION_LIMIT","The revision reached its safety limit."); return revision + 1n; }
export async function ingestAlert(actor: Actor, value: unknown) {
  const input = parsed(ingestSchema,value);
  if (containsSecuritySecret([input.rawText ?? "",input.draft?.description ?? "",input.draft?.notes ?? ""].join(" "))) invalid("Security codes, OTPs and passwords must not be submitted to the finance inbox.");
  const payloadHash = digest({domain:"bank-alert",input});
  return db().$transaction(async tx => {
    const user = await assertActor(tx,actor,"finance:write",true);
    const source = await tx.automationSource.findUnique({where:{userId_id:{userId:user.id,id:input.sourceId}}});
    if (!source) throw new ApiError(404,"NOT_FOUND","Automation source not found.");
    if (!source.enabled) throw new ApiError(409,"SOURCE_DISABLED","Enable this source before submitting alerts.");
    const settings = await preferences(tx,user.id);
    if (!settings.automationEnabled) throw new ApiError(409,"AUTOMATION_PAUSED","Automation intake is paused in workspace settings.");
    const existing = await tx.automationEvent.findUnique({where:{userId_sourceId_externalId:{userId:user.id,sourceId:source.id,externalId:input.externalId}}});
    const workspace = await workspaceSnapshot(tx,user.id,user.revision);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This source/externalId was used for a different alert. Do not reuse an event identifier for changed data.");
      return {revision:safeRevision(user.revision),event:eventView(existing,workspace),replayed:true};
    }
    if (await tx.automationEvent.count({where:{userId:user.id}}) >= 2000) throw new ApiError(409,"INBOX_LIMIT","The inbox reached its 2,000-event safety limit. An operator archival workflow is required before further intake.");
    const extracted = input.rawText ? parseBangladeshAlert(input.rawText) : {draft:{accountId:null,description:"",type:null,category:"",categoryId:null,date:null,poisha:null,merchantId:null,tagIds:[],notes:"",status:"confirmed",excluded:false} as AutomationDraft,reference:"",issues:[]};
    const draft = checkedDraft(workspace,{...extracted.draft,accountId:source.accountId,description:`${source.providerLabel || source.name} alert`.slice(0,120),status:settings.defaultEntryStatus,...input.draft});
    const issues = reviewIssues(workspace,draft);
    const messageHash = input.rawText ? digest(normalizeBanglaDigits(input.rawText).replace(/\s+/g," ").trim().toLowerCase()) : null;
    const reference = input.reference ?? extracted.reference;
    const duplicateOfEventId = await duplicateEvent(tx,user.id,draft,reference,messageHash);
    const event = await tx.automationEvent.create({data:{userId:user.id,id:randomUUID(),sourceId:source.id,externalId:input.externalId,payloadHash,messageHash,reference,draft,issues,status:issues.length ? "needs_review":"ready",duplicateOfEventId,rawText:settings.storeRawMessages ? input.rawText ?? null:null}});
    const next = checkNextRevision(user.revision);
    await tx.user.update({where:{id:user.id},data:{revision:next}});
    return {revision:safeRevision(next),event:eventView(event,workspace),replayed:false};
  },{maxWait:5000,timeout:30000});
}
export async function mutateAutomation(actor: Actor, expected: number, requestId: unknown, value: unknown): Promise<AutomationSnapshot> {
  expectedRevision(expected);
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) invalid("Use a unique requestId of 1–80 letters, digits, hyphens or underscores.");
  const command = parsed(automationCommandSchema,value);
  const hash = digest({domain:"automation-command",command});
  return db().$transaction(async tx => {
    const user = await assertActor(tx,actor,"finance:write",true);
    const priorReceipt = await tx.requestReceipt.findUnique({where:{userId_requestId:{userId:user.id,requestId}}});
    if (priorReceipt) { if (priorReceipt.hash !== hash) throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This requestId belongs to another command."); return snapshot(tx,user.id,user.revision); }
    if (user.revision !== BigInt(expected)) throw new ApiError(409,"REVISION_CONFLICT","Your workspace changed. Reload saved data and review the retained draft.");
    let next = checkNextRevision(user.revision);
    const workspace = await workspaceSnapshot(tx,user.id,user.revision);
    switch(command.type) {
      case "preferences_update":
        await tx.workspacePreference.upsert({where:{userId:user.id},create:{userId:user.id,data:command.preferences},update:{data:command.preferences}});
        if (!command.preferences.storeRawMessages) await tx.automationEvent.updateMany({where:{userId:user.id,rawText:{not:null}},data:{rawText:null}});
        break;
      case "source_create":
      case "source_update": {
        const sources = await tx.automationSource.findMany({where:{userId:user.id}});
        const sourceId = command.type === "source_update" ? command.id : randomUUID();
        if (command.type === "source_update" && !sources.some(s => s.id === sourceId)) throw new ApiError(404,"NOT_FOUND","Automation source not found.");
        if (command.source.accountId) { const account = workspace.accounts.find(a => a.id === command.source.accountId); if (!account) throw new ApiError(404,"NOT_FOUND","Financial account not found."); if (account.archived && !sources.some(s => s.id === sourceId && s.accountId === account.id)) throw new ApiError(409,"ACCOUNT_ARCHIVED","Restore the account before binding a new source."); }
        if (sources.some(s => s.id !== sourceId && s.name.toLowerCase() === command.source.name.toLowerCase())) throw new ApiError(409,"NAME_EXISTS","An automation source with this name already exists.");
        if (command.type === "source_create") { if (sources.length >= 100) throw new ApiError(409,"SOURCE_LIMIT","The workspace supports up to 100 automation sources."); await tx.automationSource.create({data:{userId:user.id,id:sourceId,...command.source}}); }
        else await tx.automationSource.update({where:{userId_id:{userId:user.id,id:sourceId}},data:command.source});
        break;
      }
      case "event_update":
      case "event_accept":
      case "event_ignore": {
        const event = await tx.automationEvent.findUnique({where:{userId_id:{userId:user.id,id:command.id}}});
        if (!event) throw new ApiError(404,"NOT_FOUND","Inbox event not found.");
        if (event.status === "accepted") {
          if (command.type !== "event_accept") throw new ApiError(409,"ALREADY_ACCEPTED","This alert already produced a transaction. Edit the financial entry instead.");
          next = user.revision;
          break;
        }
        if (command.type === "event_update") {
          if (containsSecuritySecret(`${command.draft.description} ${command.draft.notes}`)) invalid("Security codes, OTPs and passwords must not be stored in inbox drafts.");
          const draft = checkedDraft(workspace,command.draft);
          const issues = reviewIssues(workspace,draft);
          const duplicateOfEventId = await duplicateEvent(tx,user.id,draft,event.reference,event.messageHash,event.id);
          await tx.automationEvent.update({where:{userId_id:{userId:user.id,id:event.id}},data:{draft,issues,duplicateOfEventId,status:event.status === "ignored" ? "ignored":issues.length ? "needs_review":"ready"}});
        } else if (command.type === "event_ignore") {
          const issues = reviewIssues(workspace,draftFromSaved(event.draft));
          await tx.automationEvent.update({where:{userId_id:{userId:user.id,id:event.id}},data:{status:command.ignored ? "ignored":issues.length ? "needs_review":"ready"}});
        } else {
          if (event.status === "ignored") throw new ApiError(409,"EVENT_IGNORED","Restore the event before accepting it.");
          const draft = checkedDraft(workspace,draftFromSaved(event.draft));
          const issues = reviewIssues(workspace,draft);
          if (issues.length) invalid(`Review the alert before accepting: ${issues.join(" ")}`);
          const duplicate = await duplicateEvent(tx,user.id,draft,event.reference,event.messageHash,event.id);
          if ((duplicate || matchingTransactions(workspace,draft).length) && !command.acknowledgeDuplicate) throw new ApiError(409,"DUPLICATE_REVIEW_REQUIRED","A possible matching alert or posted entry exists. Review it and explicitly acknowledge the duplicate warning before accepting.");
          const financialCommand = validateCommand({type:"transaction_create",transaction:{...draft,accountId:draft.accountId!,type:draft.type!,date:draft.date!,poisha:draft.poisha!}});
          const transactionId = await applyWorkspaceCommand(tx,user.id,workspace,financialCommand);
          if (!transactionId) throw new ApiError(503,"DATA_INTEGRITY","The reviewed entry could not be linked.");
          try { await workspaceSnapshot(tx,user.id,next); }
          catch(error) { if (error instanceof ApiError && error.code === "DATA_INTEGRITY") invalid("This entry exceeds a workspace safety limit or would leave inconsistent financial records. Review the draft before trying again."); throw error; }
          await tx.automationEvent.update({where:{userId_id:{userId:user.id,id:event.id}},data:{status:"accepted",transactionId,issues:[],duplicateOfEventId:duplicate}});
        }
        break;
      }
    }
    await tx.user.update({where:{id:user.id},data:{revision:next}});
    await tx.requestReceipt.create({data:{userId:user.id,requestId,hash}});
    return snapshot(tx,user.id,next);
  },{maxWait:5000,timeout:30000});
}
