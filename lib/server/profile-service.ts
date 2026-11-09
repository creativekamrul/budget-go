import {createHash} from "node:crypto";
import {z} from "zod";
import {db} from "./db";
import {assertActor,expectedRevision,type Actor} from "./finance-service";
import {ApiError,invalid} from "./errors";
import {hashPassword,passwordValid,verifyPassword} from "./password";

function browser(actor:Actor){if(actor.kind!=="session")throw new ApiError(403,"SESSION_REQUIRED","Browser sign-in is required for profile, security and backups.");}
export const profileCommandSchema=z.object({type:z.literal("profile_update"),name:z.string().trim().min(1).max(80)}).strict();
export const securityCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("password_change"),currentPassword:z.string().min(1).max(256),newPassword:z.string().refine(passwordValid,"Use a password of 12–256 characters.")}).strict(),
  z.object({action:z.literal("sessions_revoke"),currentPassword:z.string().min(1).max(256)}).strict(),
]);
export async function getProfile(actor:Actor){browser(actor);return db().$transaction(async tx=>{const user=await assertActor(tx,actor,"finance:read");return{revision:Number(user.revision),profile:{name:user.name,email:user.email,createdAt:user.createdAt.toISOString()}};});}
export async function updateProfile(actor:Actor,expected:number,requestId:unknown,value:unknown){
  browser(actor);expectedRevision(expected);if(typeof requestId!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(requestId))invalid("Use a fresh valid requestId.");
  const parsed=profileCommandSchema.safeParse(value);if(!parsed.success)invalid("Enter a name of 1–80 characters.");
  const hash=createHash("sha256").update(JSON.stringify({domain:"profile",command:parsed.data})).digest("hex");
  return db().$transaction(async tx=>{
    const user=await assertActor(tx,actor,"finance:write",true);
    const receipt=await tx.requestReceipt.findUnique({where:{userId_requestId:{userId:user.id,requestId}}});
    if(receipt&&receipt.hash!==hash)throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This requestId belongs to another change.");
    if(!receipt){if(user.revision!==BigInt(expected))throw new ApiError(409,"REVISION_CONFLICT","Your workspace changed. Reload and review the retained draft.");if(expected===Number.MAX_SAFE_INTEGER)throw new ApiError(409,"REVISION_LIMIT","Revision limit reached.");await tx.user.update({where:{id:user.id},data:{name:parsed.data.name,revision:user.revision+1n}});await tx.requestReceipt.create({data:{userId:user.id,requestId,hash}});}
    const saved=await tx.user.findUniqueOrThrow({where:{id:user.id}});return{revision:Number(saved.revision),profile:{name:saved.name,email:saved.email,createdAt:saved.createdAt.toISOString()}};
  });
}
export async function changeSecurity(actor:Actor,value:unknown){
  browser(actor);const parsed=securityCommandSchema.safeParse(value);if(!parsed.success)invalid("Check the current password and new password requirements.");
  const input=parsed.data;
  return db().$transaction(async tx=>{
    const user=await assertActor(tx,actor,"finance:write",true);
    const key=`security:${user.id}`,now=new Date();
    const rate=await tx.loginRateLimit.findUnique({where:{key}});
    if(rate&&now.getTime()-rate.windowStart.getTime()<15*60*1000&&rate.attempts>=5)throw new ApiError(429,"RATE_LIMITED","Too many security attempts. Try again in 15 minutes.");
    const ok=await verifyPassword(input.currentPassword,user.passwordHash);
    if(!ok){await tx.loginRateLimit.upsert({where:{key},create:{key,windowStart:now,attempts:1},update:{windowStart:rate&&now.getTime()-rate.windowStart.getTime()<15*60*1000?rate.windowStart:now,attempts:rate&&now.getTime()-rate.windowStart.getTime()<15*60*1000?rate.attempts+1:1}});return{denied:true as const};}
    if(user.sessionVersion>=2147483647)throw new ApiError(409,"SESSION_VERSION_LIMIT","Session version limit reached.");
    const passwordHash=input.action==="password_change"?await hashPassword(input.newPassword):user.passwordHash;
    await tx.user.update({where:{id:user.id},data:{passwordHash,sessionVersion:user.sessionVersion+1}});await tx.loginRateLimit.deleteMany({where:{key}});
    return{signedOut:true as const};
  },{maxWait:5000,timeout:30000}).then(result=>{if("denied"in result)throw new ApiError(403,"PASSWORD_INVALID","The current password is incorrect.");return result;});
}
