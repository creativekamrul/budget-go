import {createHash} from "node:crypto";
import {z} from "zod";
import type {Prisma} from "../../generated/prisma/client";
import registry from "../backup-models.json";
import {db} from "./db";
import {assertActor,expectedRevision,type Actor} from "./finance-service";
import {ApiError,invalid} from "./errors";
import {verifyPassword} from "./password";
import {workspaceSnapshot} from "./workspace-service";
import {planningSnapshot} from "./planning-service";
import {workbenchSnapshot} from "./workbench-service";
import {preferencesSchema,automationDraftSchema,containsSecuritySecret} from "../automation";
import {categories as builtinCategories} from "../preview";

export const MAX_FULL_BACKUP_BYTES=64*1024*1024;
type Row=Record<string,unknown>;
type Delegate={findMany(args:unknown):Promise<Row[]>;deleteMany(args:unknown):Promise<unknown>;createMany(args:unknown):Promise<unknown>};
const delegate=(tx:Prisma.TransactionClient,name:string)=>(tx as unknown as Record<string,Delegate>)[name];
const jsonSafe=(value:unknown)=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v)) as unknown;
function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;return JSON.stringify(value)??"null";}
const digest=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
function browser(actor:Actor){if(actor.kind!=="session")throw new ApiError(403,"SESSION_REQUIRED","Browser sign-in is required for full backups and restore.");}
const rowSchemas=Object.fromEntries(registry.models.map(model=>{
  const fields:Record<string,z.ZodType>={};
  for(const field of model.fields){let shape:z.ZodType;
    if(field.type==="String"){shape=z.string().max(1024*1024);if(field.name==="id"||field.name.endsWith("Id")&&field.name!=="externalId")shape=z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);}
    else if(field.type==="BigInt")shape=z.string().regex(/^-?\d{1,16}$/).refine(v=>BigInt(v)>=-BigInt(Number.MAX_SAFE_INTEGER)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER));
    else if(field.type==="Int")shape=z.number().int().min(-2147483648).max(2147483647);
    else if(field.type==="Boolean")shape=z.boolean();
    else if(field.type==="DateTime")shape=z.string().refine(v=>{try{return new Date(v).toISOString()===v;}catch{return false;}});
    else if(field.type==="Json")shape=z.json();
    else shape=z.number().finite();
    if(field.list)shape=z.array(shape).max(10000);if(field.nullable)shape=shape.nullable();fields[field.name]=shape;
  }
  return[model.name,z.array(z.object(fields).strict()).max(10000)];
}));
const backupSchema=z.object({format:z.literal("budget-go-full"),formatVersion:z.literal(1),modelVersion:z.literal(registry.version),createdAt:z.string(),sourceRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),profile:z.object({name:z.string().min(1).max(80)}).strict(),tables:z.object(rowSchemas).strict(),checksum:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Backup=z.infer<typeof backupSchema>;
export function validateFullBackup(value:unknown){
  const parsed=backupSchema.safeParse(value);if(!parsed.success)invalid("This backup does not match the supported full-backup version or model fields. No data was replaced.");
  const backup=parsed.data;const{checksum,...content}=backup;
  if(Buffer.byteLength(JSON.stringify(backup))>MAX_FULL_BACKUP_BYTES)throw new ApiError(413,"BACKUP_TOO_LARGE","Full backups support up to64MiB.");
  if(digest(content)!==checksum)invalid("Backup checksum mismatch. Use an unchanged exported file.");
  return backup;
}
function counts(backup:Backup){return Object.fromEntries(registry.models.map(model=>[model.name,(backup.tables[model.name] as unknown[]).length]));}
export function previewFullBackup(value:unknown){const backup=validateFullBackup(value);return{checksum:backup.checksum,counts:counts(backup),warnings:["This replaces this signed-in user's finances, planning, rules, statements and automation data.","Your sign-in name/email/password and integration credentials are not imported. Existing request-id tombstones are retained.","This readable file can contain private financial records and retained message text. Keep it private."]};}
export async function exportFullBackup(actor:Actor){browser(actor);return db().$transaction(async tx=>{
  const user=await assertActor(tx,actor,"finance:read");const tables:Record<string,unknown>={};
  for(const model of registry.models){const select=Object.fromEntries(model.fields.map(f=>[f.name,true]));tables[model.name]=jsonSafe(await delegate(tx,model.delegate).findMany({where:{userId:user.id},select}));}
  const content={format:"budget-go-full",formatVersion:1,modelVersion:registry.version,createdAt:new Date().toISOString(),sourceRevision:Number(user.revision),profile:{name:user.name},tables};
  const backup=validateFullBackup({...content,checksum:digest(content)});return backup;
},{isolationLevel:"RepeatableRead",maxWait:5000,timeout:60000});}
function rehydrate(model:typeof registry.models[number],row:Row,userId:string){const restored:Row={...row,userId};for(const field of model.fields){if(restored[field.name]===null)continue;if(field.type==="BigInt")restored[field.name]=BigInt(String(restored[field.name]));if(field.type==="DateTime")restored[field.name]=new Date(String(restored[field.name]));}return restored;}
async function validateDomains(tx:Prisma.TransactionClient,userId:string,revision:bigint){
  const workspace=await workspaceSnapshot(tx,userId,revision);await planningSnapshot(tx,userId,revision);await workbenchSnapshot(tx,userId,revision);
  const accountIds=new Set(workspace.accounts.map(a=>a.id)),categoryIds=new Set(workspace.categories.map(c=>c.id)),merchantIds=new Set(workspace.merchants.map(m=>m.id)),tagIds=new Set(workspace.tags.map(t=>t.id));
  const validateRefs=(draft:Row)=>{if(draft.accountId&&!accountIds.has(String(draft.accountId)))invalid("Backup draft has an unknown account.");if(draft.categoryId&&!categoryIds.has(String(draft.categoryId)))invalid("Backup draft has an unknown category.");const category=workspace.categories.find(c=>c.id===draft.categoryId);if(category&&draft.type&&category.kind!=="both"&&category.kind!==draft.type)invalid("Backup draft category has an incompatible type.");if(!category&&draft.category&&(draft.type==="income"||draft.type==="expense")&&!builtinCategories[draft.type].includes(String(draft.category)))invalid("Backup custom draft categories require an owned identifier.");if(draft.merchantId&&!merchantIds.has(String(draft.merchantId)))invalid("Backup draft has an unknown merchant.");if(Array.isArray(draft.tagIds)&&draft.tagIds.some(id=>!tagIds.has(String(id))))invalid("Backup draft has an unknown tag.");};
  const preferences=await tx.workspacePreference.findUnique({where:{userId}});if(preferences&&!preferencesSchema.safeParse(preferences.data).success)invalid("Backup preferences are invalid.");
  const events=await tx.automationEvent.findMany({where:{userId}});if(events.length>2000||await tx.automationSource.count({where:{userId}})>100)invalid("Backup exceeds automation record limits.");
  for(const event of events){const draft=automationDraftSchema.safeParse(event.draft);if(!draft.success)invalid("Backup contains an invalid automation draft.");validateRefs(draft.data);if(event.rawText&&(!preferences||!(preferences.data as Row).storeRawMessages))invalid("Retained message text conflicts with the backup privacy preference.");if(containsSecuritySecret([event.rawText??"",draft.data.description??"",draft.data.notes??""].join(" ")))invalid("Backup inbox data contains security credentials or codes.");}
  for(const schedule of await tx.recurringSchedule.findMany({where:{userId}})){const draft=schedule.transaction as Row;validateRefs(draft);if(draft.accountId!==schedule.accountId)invalid("Backup recurring account links are inconsistent.");}
}
export async function restoreFullBackup(actor:Actor,expected:number,requestId:unknown,currentPassword:unknown,value:unknown){
  browser(actor);expectedRevision(expected);if(typeof requestId!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(requestId)||typeof currentPassword!=="string"||currentPassword.length<1||currentPassword.length>256)invalid("Supply your current password and a valid requestId.");
  const backup=validateFullBackup(value),hash=digest({domain:"full-restore",checksum:backup.checksum});
  return db().$transaction(async tx=>{
    const user=await assertActor(tx,actor,"finance:write",true);
    const key=`security:${user.id}`,now=new Date(),rate=await tx.loginRateLimit.findUnique({where:{key}}),within=!!rate&&now.getTime()-rate.windowStart.getTime()<15*60*1000;
    if(within&&rate.attempts>=5)throw new ApiError(429,"RATE_LIMITED","Too many security attempts. Try again in 15 minutes.");
    if(!await verifyPassword(currentPassword,user.passwordHash)){await tx.loginRateLimit.upsert({where:{key},create:{key,windowStart:now,attempts:1},update:{windowStart:within?rate.windowStart:now,attempts:within?rate.attempts+1:1}});return{denied:true as const};}
    await tx.loginRateLimit.deleteMany({where:{key}});
    const receipt=await tx.requestReceipt.findUnique({where:{userId_requestId:{userId:user.id,requestId}}});
    if(receipt){if(receipt.hash!==hash)throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This requestId belongs to another command.");return{restored:true,revision:Number(user.revision),counts:counts(backup),replayed:true};}
    if(user.revision!==BigInt(expected))throw new ApiError(409,"REVISION_CONFLICT","Your workspace changed. Reload and review the restore before continuing.");if(expected===Number.MAX_SAFE_INTEGER)throw new ApiError(409,"REVISION_LIMIT","Revision limit reached.");
    for(const model of [...registry.models].reverse())await delegate(tx,model.delegate).deleteMany({where:{userId:user.id}});
    for(const model of registry.models){const rows=backup.tables[model.name] as Row[];if(rows.length)await delegate(tx,model.delegate).createMany({data:rows.map(row=>rehydrate(model,row,user.id))});}
    try{await validateDomains(tx,user.id,user.revision+1n);}catch(error){if(error instanceof ApiError)invalid("Backup data failed financial or reference validation. The restore was rolled back.");throw error;}
    await tx.user.update({where:{id:user.id},data:{revision:user.revision+1n}});await tx.requestReceipt.create({data:{userId:user.id,requestId,hash}});
    return{restored:true,revision:Number(user.revision+1n),counts:counts(backup),replayed:false};
  },{maxWait:5000,timeout:120000}).then(result=>{if("denied"in result)throw new ApiError(403,"PASSWORD_INVALID","The current password is incorrect.");return result;}).catch(error=>{if(error&&typeof error==="object"&&"code"in error&&["P2002","P2003","P2004","P2011","P2014","P2020","P2023","P2039"].includes(String(error.code)))invalid("Backup records violate data constraints. The restore was rolled back.");throw error;});
}
