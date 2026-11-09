import type { NextRequest } from "next/server";
import { handlers } from "../../../../auth";
import { guardRequest } from "../../../../lib/server/http";
import { errorResponse } from "../../../../lib/server/errors";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try { guardRequest(request, false); return await handlers.GET(request); } catch (error) { return errorResponse(error); } }
export async function POST(request: NextRequest) { try { guardRequest(request, true); return await handlers.POST(request); } catch (error) { return errorResponse(error); } }
