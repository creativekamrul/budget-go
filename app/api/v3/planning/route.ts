import { getPlanning,mutatePlanning } from "@/lib/server/planning-service";
import { expectedRevision,inputObject } from "@/lib/server/finance-service";
import { requestActor,readJson,json } from "@/lib/server/http";
import { errorResponse } from "@/lib/server/errors";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try{return json(await getPlanning(await requestActor(request)));}catch(error){return errorResponse(error);}
}
export async function POST(request:Request) {
  try{const actor=await requestActor(request,true),input=inputObject(await readJson(request),["expectedRevision","requestId","command"]);return json(await mutatePlanning(actor,expectedRevision(input.expectedRevision),input.requestId,input.command));}catch(error){return errorResponse(error);}
}
