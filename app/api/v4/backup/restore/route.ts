import {MAX_FULL_BACKUP_BYTES,restoreFullBackup} from "@/lib/server/backup-service";
import {requestActor,readJson,json} from "@/lib/server/http";
import {inputObject,expectedRevision} from "@/lib/server/finance-service";
import {errorResponse} from "@/lib/server/errors";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){try{const actor=await requestActor(request,true,true),body=inputObject(await readJson(request,MAX_FULL_BACKUP_BYTES+16384),["expectedRevision","requestId","currentPassword","backup"]);return json(await restoreFullBackup(actor,expectedRevision(body.expectedRevision),body.requestId,body.currentPassword,body.backup));}catch(error){return errorResponse(error);}}
