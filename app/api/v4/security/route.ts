import {changeSecurity} from "@/lib/server/profile-service";
import {requestActor,readJson,json} from "@/lib/server/http";
import {errorResponse} from "@/lib/server/errors";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){try{return json(await changeSecurity(await requestActor(request,true,true),await readJson(request)));}catch(error){return errorResponse(error);}}
