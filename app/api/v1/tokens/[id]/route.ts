import { revokeToken } from "../../../../../lib/server/token-service";
import { requestActor, json } from "../../../../../lib/server/http";
import { errorResponse } from "../../../../../lib/server/errors";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { return json(await revokeToken(await requestActor(request, true, true), (await context.params).id)); } catch (error) { return errorResponse(error); } }
