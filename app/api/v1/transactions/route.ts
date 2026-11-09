import { createTransaction, getFinance, expectedRevision, inputObject } from "../../../../lib/server/finance-service";
import { requestActor, readJson, json } from "../../../../lib/server/http";
import { errorResponse, invalid } from "../../../../lib/server/errors";
import { monthValid } from "../../../../lib/finance";
import { categories } from "../../../../lib/preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requestActor(request); const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => !["month", "type", "category"].includes(key))) invalid("Supported filters: month, type, category.");
    const month = url.searchParams.get("month"), type = url.searchParams.get("type"), category = url.searchParams.get("category");
    if (month !== null && !monthValid(month)) invalid("Invalid month filter.");
    if (type !== null && !["income", "expense"].includes(type)) invalid("type must be income or expense.");
    if (category !== null && ![...categories.income, ...categories.expense].includes(category)) invalid("Unknown category filter.");
    const data = await getFinance(actor);
    return json({ revision: data.revision, transactions: data.transactions.filter(t => (!month || t.date.startsWith(month)) && (!type || t.type === type) && (!category || t.category === category)) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) { try { const actor = await requestActor(request, true); const input = inputObject(await readJson(request), ["expectedRevision", "transaction"]); return json(await createTransaction(actor, expectedRevision(input.expectedRevision), input.transaction), 201); } catch (error) { return errorResponse(error); } }
