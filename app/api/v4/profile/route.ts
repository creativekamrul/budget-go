import {getProfile,updateProfile} from "@/lib/server/profile-service";
import {requestActor,readJson,json} from "@/lib/server/http";
import {inputObject,expectedRevision} from "@/lib/server/finance-service";
import {errorResponse} from "@/lib/server/errors";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){try{return json(await getProfile(await requestActor(request,false,true)));}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{const actor=await requestActor(request,true,true),body=inputObject(await readJson(request),["expectedRevision","requestId","command"]);return json(await updateProfile(actor,expectedRevision(body.expectedRevision),body.requestId,body.command));}catch(error){return errorResponse(error);}}
