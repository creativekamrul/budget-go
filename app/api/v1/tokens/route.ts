import { listTokens, mintToken } from "../../../../lib/server/token-service";
import { requestActor, readJson, json } from "../../../../lib/server/http";
import { errorResponse } from "../../../../lib/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return json(await listTokens(await requestActor(request, false, true))); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { const actor = await requestActor(request, true, true); return json(await mintToken(actor, await readJson(request)), 201); } catch (error) { return errorResponse(error); } }
