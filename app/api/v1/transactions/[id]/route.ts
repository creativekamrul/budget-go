import { updateTransaction, deleteTransaction, expectedRevision, inputObject } from "../../../../../lib/server/finance-service";
import { requestActor, readJson, json } from "../../../../../lib/server/http";
import { errorResponse } from "../../../../../lib/server/errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { try { const actor = await requestActor(request, true); const input = inputObject(await readJson(request), ["expectedRevision", "transaction"]); return json(await updateTransaction(actor, expectedRevision(input.expectedRevision), (await context.params).id, input.transaction)); } catch (error) { return errorResponse(error); } }
export async function DELETE(request: Request, context: Context) { try { const actor = await requestActor(request, true); const input = inputObject(await readJson(request), ["expectedRevision"]); return json(await deleteTransaction(actor, expectedRevision(input.expectedRevision), (await context.params).id)); } catch (error) { return errorResponse(error); } }
