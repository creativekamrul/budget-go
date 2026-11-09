import { getWorkspace, mutateWorkspace, projectWorkspaceV3 } from "@/lib/server/workspace-service";
import { expectedRevision, inputObject } from "@/lib/server/finance-service";
import { requestActor, readJson, json } from "@/lib/server/http";
import { errorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return json(projectWorkspaceV3(await getWorkspace(await requestActor(request)))); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requestActor(request, true);
    const input = inputObject(await readJson(request), ["expectedRevision", "requestId", "command"]);
    return json(projectWorkspaceV3(await mutateWorkspace(actor, expectedRevision(input.expectedRevision), input.requestId, input.command, "v3")));
  } catch (error) { return errorResponse(error); }
}
