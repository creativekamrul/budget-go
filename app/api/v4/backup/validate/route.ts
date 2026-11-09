import {MAX_FULL_BACKUP_BYTES,previewFullBackup} from "@/lib/server/backup-service";
import {requestActor,readJson,json} from "@/lib/server/http";
import {inputObject} from "@/lib/server/finance-service";
import {errorResponse} from "@/lib/server/errors";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){try{await requestActor(request,true,true);const body=inputObject(await readJson(request,MAX_FULL_BACKUP_BYTES+16384),["backup"]);return json(previewFullBackup(body.backup));}catch(error){return errorResponse(error);}}
