import { getAutomation, mutateAutomation } from "@/lib/server/automation-service";
import { expectedRevision, inputObject } from "@/lib/server/finance-service";
import { requestActor, readJson, json } from "@/lib/server/http";
import { errorResponse, invalid } from "@/lib/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requestActor(request);
    const search = new URL(request.url).searchParams;
    if ([...search.keys()].some(key => key !== "cursor") || search.getAll("cursor").length > 1) invalid("Only one optional cursor query parameter is supported.");
    return json(await getAutomation(actor,search.get("cursor") ?? undefined));
  } catch(error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requestActor(request,true);
    const input = inputObject(await readJson(request),["expectedRevision","requestId","command"]);
    return json(await mutateAutomation(actor,expectedRevision(input.expectedRevision),input.requestId,input.command));
  } catch(error) { return errorResponse(error); }
}
