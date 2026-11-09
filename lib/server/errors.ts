export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = "ApiError"; }
}
export function invalid(message: string): never { throw new ApiError(400, "INVALID_REQUEST", message); }
export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  // Never serialize raw Prisma/driver/Auth.js errors: they can contain connection credentials.
  return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "The database service is unavailable. No successful change has been confirmed. Please retry." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
