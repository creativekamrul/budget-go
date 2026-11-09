import { handleMcp } from "../../../lib/server/mcp";
import { requestActor, guardRequest } from "../../../lib/server/http";
import { ApiError, errorResponse } from "../../../lib/server/errors";
import { assertActor } from "../../../lib/server/finance-service";
import { db } from "../../../lib/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    guardRequest(request, false);
    if (!request.headers.has("authorization")) throw new ApiError(401, "BEARER_REQUIRED", "MCP requires a manual Bearer API token. Browser cookies and OAuth are not supported for this endpoint.");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "JSON_REQUIRED", "Send Content-Type: application/json.");
    const actor = await requestActor(request);
    await db().$transaction(tx => assertActor(tx, actor, "finance:read"));
    return await handleMcp(request, actor);
  } catch (error) { return errorResponse(error); }
}
function unsupported(request: Request) { try { guardRequest(request, false); return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export const GET = unsupported;
export const DELETE = unsupported;
