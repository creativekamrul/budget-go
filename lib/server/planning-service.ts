import { createHash,randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { planningCommandSchema,planningSnapshotSchema,recurringScheduleInputSchema,isOccurrenceDate,type PlanningData,type RecurringSchedule } from "../planning";
import { categories } from "../preview";
import { validateCommand,type WorkspaceData } from "../workspace";
import { db } from "./db";
import { assertActor,expectedRevision,type Actor } from "./finance-service";
import { ApiError,invalid } from "./errors";
import { applyWorkspaceCommand,workspaceSnapshot,assertPlanningCapacity } from "./workspace-service";

type Tx=Prisma.TransactionClient;
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value)??"null";
}
function safe(value:bigint):number {
  if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError(503,"DATA_INTEGRITY","Saved planning values exceed the exact-money safety limit.");
  return Number(value);
}
function todayDhaka() {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  return ["year","month","day"].map(type=>parts.find(part=>part.type===type)!.value).join("-");
}
async function snapshot(tx:Tx,userId:string,revision:bigint):Promise<PlanningData> {
  const [recurring,occurrences,splits,plans]=await Promise.all([
    tx.recurringSchedule.findMany({where:{userId},orderBy:[{archived:"asc"},{name:"asc"},{id:"asc"}]}),
    tx.recurringOccurrence.findMany({where:{userId},orderBy:[{date:"asc"},{id:"asc"}]}),
    tx.transactionSplit.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"asc"}]}),
    tx.monthlyPlan.findMany({where:{userId},orderBy:{month:"asc"}}),
  ]);
  const data={revision:safe(revision),recurring:recurring.map(s=>({id:s.id,name:s.name,transaction:s.transaction,startDate:s.startDate,frequency:s.frequency,active:s.active,archived:s.archived})),occurrences:occurrences.map(({id,scheduleId,date,transactionId})=>({id,scheduleId,date,transactionId})),splits:splits.map(({id,originalTransactionId,original,partIds,createdAt})=>({id,originalTransactionId,original,partIds,createdAt:createdAt.toISOString()})),monthlyPlans:plans.map(({month,incomePoisha,spendingPoisha})=>({month,incomePoisha:safe(incomePoisha),spendingPoisha:safe(spendingPoisha)}))};
  const parsed=planningSnapshotSchema.safeParse(data);
  if(!parsed.success||Buffer.byteLength(JSON.stringify(data))>2*1024*1024)throw new ApiError(503,"DATA_INTEGRITY","Saved planning data failed safety checks. No financial records were replaced.");
  return parsed.data;
}
export async function getPlanning(actor:Actor):Promise<PlanningData> {
  return db().$transaction(async tx=>{const user=await assertActor(tx,actor,"finance:read");return snapshot(tx,user.id,user.revision);},{isolationLevel:"RepeatableRead",maxWait:5000,timeout:15000});
}
function checkedSchedule(workspace:WorkspaceData,value:unknown,prior?:RecurringSchedule) {
  const result=recurringScheduleInputSchema.safeParse(value);
  if(!result.success)invalid("Use the documented recurring schedule fields and a positive BDT amount.");
  const schedule=result.data,entry={...schedule.transaction,tagIds:[...schedule.transaction.tagIds]};
  const account=workspace.accounts.find(a=>a.id===entry.accountId);
  if(!account)throw new ApiError(404,"NOT_FOUND","Financial account not found.");
  if(account.archived&&(!prior||entry.accountId!==prior.transaction.accountId||schedule.active))throw new ApiError(409,"ACCOUNT_ARCHIVED","Restore the account before using it in an active recurring schedule.");
  if(schedule.startDate<account.openingDate)invalid("The schedule cannot start before the account opening date.");
  if(entry.categoryId) {
    const category=workspace.categories.find(c=>c.id===entry.categoryId);
    if(!category)throw new ApiError(404,"NOT_FOUND","Category not found.");
    if(category.kind!=="both"&&category.kind!==entry.type)invalid("Choose a category matching the schedule's income or expense type.");
    if(category.archived&&category.id!==prior?.transaction.categoryId)throw new ApiError(409,"CLASSIFICATION_ARCHIVED","Restore this category before assigning it.");
    entry.category=category.name;
  } else if(!categories[entry.type].includes(entry.category))invalid("Custom categories require their owned categoryId.");
  if(entry.merchantId) {
    const merchant=workspace.merchants.find(m=>m.id===entry.merchantId);
    if(!merchant)throw new ApiError(404,"NOT_FOUND","Merchant not found.");
    if(merchant.archived&&merchant.id!==prior?.transaction.merchantId)throw new ApiError(409,"CLASSIFICATION_ARCHIVED","Restore this merchant before assigning it.");
  }
  for(const id of entry.tagIds) {
    const tag=workspace.tags.find(t=>t.id===id);
    if(!tag)throw new ApiError(404,"NOT_FOUND","Tag not found.");
    if(tag.archived&&!prior?.transaction.tagIds.includes(id))throw new ApiError(409,"CLASSIFICATION_ARCHIVED","Restore this tag before assigning it.");
  }
  return {...schedule,transaction:entry};
}
export async function mutatePlanning(actor:Actor,expected:number,requestId:unknown,value:unknown):Promise<PlanningData> {
  expectedRevision(expected);
  if(typeof requestId!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(requestId))invalid("Use a unique 1–80 character requestId.");
  const parsed=planningCommandSchema.safeParse(value);if(!parsed.success)invalid(parsed.error.issues[0]?.message??"Check the planning fields.");
  const command=parsed.data,hash=createHash("sha256").update(canonical({domain:"planning-command",command})).digest("hex");
  return db().$transaction(async tx=>{
    const user=await assertActor(tx,actor,"finance:write",true);
    const receipt=await tx.requestReceipt.findUnique({where:{userId_requestId:{userId:user.id,requestId}}});
    if(receipt){if(receipt.hash!==hash)throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This requestId belongs to a different command.");return snapshot(tx,user.id,user.revision);}
    if(user.revision!==BigInt(expected))throw new ApiError(409,"REVISION_CONFLICT","Your workspace changed. Reload saved data and review the retained draft.");
    if(expected===Number.MAX_SAFE_INTEGER)throw new ApiError(409,"REVISION_LIMIT","The revision reached its safety limit.");
    const current=await snapshot(tx,user.id,user.revision),workspace=await workspaceSnapshot(tx,user.id,user.revision);
    let next=user.revision+1n;
    switch(command.type) {
      case "monthly_plan_set":
        if(!current.monthlyPlans.some(p=>p.month===command.month)&&current.monthlyPlans.length>=1000)throw new ApiError(409,"PLAN_LIMIT","The workspace supports up to 1,000 monthly plans.");
        await tx.monthlyPlan.upsert({where:{userId_month:{userId:user.id,month:command.month}},create:{userId:user.id,month:command.month,incomePoisha:BigInt(command.incomePoisha),spendingPoisha:BigInt(command.spendingPoisha)},update:{incomePoisha:BigInt(command.incomePoisha),spendingPoisha:BigInt(command.spendingPoisha)}});
        break;
      case "recurring_create":
      case "recurring_update": {
        const prior=command.type==="recurring_update"?current.recurring.find(s=>s.id===command.id):undefined;
        if(command.type==="recurring_update"&&!prior)throw new ApiError(404,"NOT_FOUND","Recurring schedule not found.");
        if(prior&&(prior.startDate!==command.schedule.startDate||prior.frequency!==command.schedule.frequency))throw new ApiError(409,"ANCHOR_IMMUTABLE","Start date and frequency are fixed. Archive this schedule and create another to change its timing.");
        const schedule=checkedSchedule(workspace,command.schedule,prior);
        if(!prior&&current.recurring.length>=500)throw new ApiError(409,"SCHEDULE_LIMIT","The workspace supports up to 500 recurring schedules.");
        const data={name:schedule.name,accountId:schedule.transaction.accountId,transaction:schedule.transaction,startDate:schedule.startDate,frequency:schedule.frequency,active:schedule.active};
        if(prior)await tx.recurringSchedule.update({where:{userId_id:{userId:user.id,id:prior.id}},data});
        else await tx.recurringSchedule.create({data:{...data,userId:user.id,id:randomUUID(),archived:false}});
        break;
      }
      case "recurring_archive": {
        const prior=current.recurring.find(s=>s.id===command.id);if(!prior)throw new ApiError(404,"NOT_FOUND","Recurring schedule not found.");
        await tx.recurringSchedule.update({where:{userId_id:{userId:user.id,id:prior.id}},data:{archived:command.archived}});
        break;
      }
      case "recurring_record": {
        const schedule=current.recurring.find(s=>s.id===command.id);if(!schedule)throw new ApiError(404,"NOT_FOUND","Recurring schedule not found.");
        const existing=current.occurrences.find(o=>o.scheduleId===schedule.id&&o.date===command.date);
        if(existing){next=user.revision;break;}
        if(schedule.archived||!schedule.active)throw new ApiError(409,"SCHEDULE_PAUSED","Restore or resume the schedule before recording an occurrence.");
        if(command.date>todayDhaka())invalid("Upcoming occurrences do not affect balances. Record this occurrence on or after its due date in Bangladesh.");
        if(!isOccurrenceDate(schedule,command.date))invalid("Choose a scheduled occurrence date, not an arbitrary date.");
        if(current.occurrences.length>=5000)throw new ApiError(409,"OCCURRENCE_LIMIT","The workspace supports up to 5,000 recorded recurring occurrences.");
        const transaction={...schedule.transaction,date:command.date};
        if(transaction.categoryId){const category=workspace.categories.find(c=>c.id===transaction.categoryId);if(category)transaction.category=category.name;}
        const financialCommand=validateCommand({type:"transaction_create",transaction});
        const transactionId=await applyWorkspaceCommand(tx,user.id,workspace,financialCommand);
        if(!transactionId)throw new ApiError(503,"DATA_INTEGRITY","The recurring transaction could not be linked.");
        try{await workspaceSnapshot(tx,user.id,next);}catch(error){if(error instanceof ApiError&&error.code==="DATA_INTEGRITY")invalid("This occurrence exceeds a financial safety limit. No transaction was posted.");throw error;}
        await tx.recurringOccurrence.create({data:{userId:user.id,id:randomUUID(),scheduleId:schedule.id,date:command.date,transactionId}});
        break;
      }
    }
    let saved:PlanningData;
    await assertPlanningCapacity(tx,user.id);
    try{saved=await snapshot(tx,user.id,next);}catch(error){if(error instanceof ApiError&&error.code==="DATA_INTEGRITY")invalid("This change exceeds a planning safety limit. No successful change was saved.");throw error;}
    await tx.user.update({where:{id:user.id},data:{revision:next}});
    await tx.requestReceipt.create({data:{userId:user.id,requestId,hash}});
    return saved;
  },{maxWait:5000,timeout:30000});
}

export { snapshot as planningSnapshot };
