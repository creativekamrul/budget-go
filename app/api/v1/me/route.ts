import { assertActor } from "../../../../lib/server/finance-service";
import { db } from "../../../../lib/server/db";
import { requestActor, json } from "../../../../lib/server/http";
import { errorResponse } from "../../../../lib/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const actor = await requestActor(request); const user = await db().$transaction(tx => assertActor(tx, actor, "finance:read")); return json({ id: user.id, email: user.email, name: user.name }); } catch (error) { return errorResponse(error); } }
