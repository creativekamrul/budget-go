import { getSummary } from "../../../../lib/server/finance-service";
import { requestActor, json } from "../../../../lib/server/http";
import { errorResponse, invalid } from "../../../../lib/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const actor = await requestActor(request); const url = new URL(request.url); const month = url.searchParams.get("month"); if (!month || [...url.searchParams.keys()].some(key => key !== "month")) invalid("Supply only month=YYYY-MM."); return json(await getSummary(actor, month)); } catch (error) { return errorResponse(error); } }
