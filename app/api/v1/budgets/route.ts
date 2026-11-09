import { createBudget, getFinance, expectedRevision, inputObject } from "../../../../lib/server/finance-service";
import { requestActor, readJson, json } from "../../../../lib/server/http";
import { errorResponse, invalid } from "../../../../lib/server/errors";
import { monthValid } from "../../../../lib/finance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const actor = await requestActor(request); const url = new URL(request.url); const month = url.searchParams.get("month"); if ([...url.searchParams.keys()].some(key => key !== "month") || (month !== null && !monthValid(month))) invalid("Use only an optional valid month=YYYY-MM filter."); const data = await getFinance(actor); return json({ revision: data.revision, budgets: data.budgets.filter(b => !month || b.month === month) }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { const actor = await requestActor(request, true); const input = inputObject(await readJson(request), ["expectedRevision", "budget"]); return json(await createBudget(actor, expectedRevision(input.expectedRevision), input.budget), 201); } catch (error) { return errorResponse(error); } }
