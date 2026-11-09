import { getFinance, inputObject, expectedRevision, replaceFinance } from "../../../../lib/server/finance-service";
import { requestActor, readJson, json } from "../../../../lib/server/http";
import { errorResponse } from "../../../../lib/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return json(await getFinance(await requestActor(request))); } catch (error) { return errorResponse(error); } }
export async function PUT(request: Request) { try { const actor = await requestActor(request, true); const input = inputObject(await readJson(request), ["expectedRevision", "data"]); return json(await replaceFinance(actor, expectedRevision(input.expectedRevision), input.data)); } catch (error) { return errorResponse(error); } }
