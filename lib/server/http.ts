import { auth } from "../../auth";
import { MAX_BACKUP_BYTES } from "../finance";
import { ApiError } from "./errors";
import { assertActor, type Actor } from "./finance-service";
import { bearerActor } from "./token-service";
import { db } from "./db";

export function configuredOrigin(): string {
  const configured = process.env.APP_URL;
  if (!configured) throw new ApiError(503, "APP_URL_NOT_CONFIGURED", "The administrator must configure APP_URL before serving authenticated requests.");
  try { const url = new URL(configured); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(); return url.origin; }
  catch { throw new ApiError(503, "APP_URL_INVALID", "APP_URL must be a single trusted HTTP(S) origin without credentials, path, query or fragment."); }
}
export function guardRequest(request: Request, requireOrigin: boolean) {
  const expected = configuredOrigin();
  const configured = new URL(expected);
  // NextURL canonicalizes loopback URL hostnames to localhost, but preserves the raw Host header.
  // Container/reverse-proxy requests also use the internal HTTP listener URL.
  // Neither normalization changes the mandatory exact public Host or write Origin.
  const canonical = new URL(expected);
  if (/^(?:127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|\[::1\]|localhost)$/.test(configured.hostname)) canonical.hostname = "localhost";
  const requestURL = new URL(request.url);
  const listenerPort = process.env.PORT ?? "3000";
  const internalListener = requestURL.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(requestURL.hostname) && (requestURL.port || "80") === listenerPort;
  if (request.headers.get("host") !== configured.host || (requestURL.origin !== expected && requestURL.origin !== canonical.origin && !internalListener)) throw new ApiError(403, "INVALID_HOST", "The request host is not trusted.");
  const origin = request.headers.get("origin");
  if ((requireOrigin && !origin) || (origin !== null && origin !== expected)) throw new ApiError(403, "INVALID_ORIGIN", "This request must come from the configured application origin.");
}
export async function requestActor(request: Request, write = false, sessionOnly = false): Promise<Actor> {
  const authorization = request.headers.get("authorization");
  // Any provided Authorization header takes precedence. Never fall back to cookies on a bad token.
  guardRequest(request, write && authorization === null);
  if (authorization !== null) {
    if (sessionOnly) throw new ApiError(403, "SESSION_REQUIRED", "Browser sign-in is required to manage API tokens.");
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) throw new ApiError(401, "UNAUTHORIZED", "Use a valid Bearer access token.");
    return bearerActor(match[1]);
  }
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHORIZED", "Sign in to access your budget.");
  const actor: Actor = { kind: "session", userId: session.user.id, sessionVersion: session.user.sessionVersion, scopes: ["finance:read", "finance:write"] };
  await db().$transaction(tx => assertActor(tx, actor, "finance:read"));
  return actor;
}
export async function readJson(request: Request, maximum = MAX_BACKUP_BYTES + 16_384): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "JSON_REQUIRED", "Send Content-Type: application/json.");
  // The finite envelope allowance lets a valid 2 MiB backup travel inside {expectedRevision,data}.
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 65 * 1024 * 1024) throw new Error("Invalid server request limit.");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(maximum))) throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds this endpoint's safety limit.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "A JSON request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) { await reader.cancel(); throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds this endpoint's safety limit."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON."); }
}
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
