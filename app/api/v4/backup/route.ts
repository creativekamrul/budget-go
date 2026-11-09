import {exportFullBackup} from "@/lib/server/backup-service";
import {requestActor} from "@/lib/server/http";
import {errorResponse} from "@/lib/server/errors";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){try{const backup=await exportFullBackup(await requestActor(request,false,true));return new Response(JSON.stringify(backup,null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename=budget-go-full-${backup.createdAt.slice(0,10)}.json`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}catch(error){return errorResponse(error);}}
