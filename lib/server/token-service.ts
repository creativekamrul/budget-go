import { createHash, randomBytes } from "node:crypto";
import { assertActor, inputObject, type Actor, type Scope } from "./finance-service";
import { ApiError, invalid } from "./errors";
import { db } from "./db";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const metadataSelect = { id: true, name: true, scopes: true, expiresAt: true, revokedAt: true, createdAt: true } as const;
function sessionOnly(actor: Actor) { if (actor.kind !== "session") throw new ApiError(403, "SESSION_REQUIRED", "Sign in in the browser to manage API tokens. Bearer tokens cannot manage credentials."); }
export async function listTokens(actor: Actor) {
  sessionOnly(actor);
  return db().$transaction(async tx => { await assertActor(tx, actor, "finance:read"); return tx.apiToken.findMany({ where: { userId: actor.userId }, select: metadataSelect, orderBy: { createdAt: "desc" } }); }, { isolationLevel: "RepeatableRead" });
}
export async function mintToken(actor: Actor, value: unknown) {
  sessionOnly(actor);
  const input = inputObject(value, ["name", "scopes", "expiresInDays"]);
  if (typeof input.name !== "string" || input.name !== input.name.trim() || input.name.length < 1 || input.name.length > 80) invalid("Token name must be 1–80 characters without surrounding spaces.");
  if (!Array.isArray(input.scopes) || !input.scopes.includes("finance:read") || input.scopes.some(scope => scope !== "finance:read" && scope !== "finance:write") || new Set(input.scopes).size !== input.scopes.length) invalid("Choose finance:read, optionally with finance:write. Write tokens also require read permission for saved-data responses.");
  if (typeof input.expiresInDays !== "number" || !Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > 365) invalid("Token expiry must be 1–365 days.");
  const name = input.name, scopes = input.scopes as Scope[], days = input.expiresInDays;
  const token = `bg_${randomBytes(32).toString("base64url")}`;
  const metadata = await db().$transaction(async tx => {
    const user = await assertActor(tx, actor, "finance:write", true);
    const count = await tx.apiToken.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (count >= 50) invalid("At most 50 active API tokens are allowed. Revoke an unused token first.");
    // Remove expired/revoked metadata after 90 days to bound this account's credential history.
    await tx.apiToken.deleteMany({ where: { userId: user.id, createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) }, OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }] } });
    return tx.apiToken.create({ data: { userId: user.id, name, scopes, tokenHash: hashToken(token), sessionVersion: user.sessionVersion, expiresAt: new Date(Date.now() + days * 86_400_000) }, select: metadataSelect });
  });
  return { token, metadata };
}
export async function revokeToken(actor: Actor, id: string) {
  sessionOnly(actor);
  return db().$transaction(async tx => {
    await assertActor(tx, actor, "finance:write", true);
    const token = await tx.apiToken.findFirst({ where: { id, userId: actor.userId }, select: { id: true } });
    if (!token) throw new ApiError(404, "NOT_FOUND", "Token not found.");
    await tx.apiToken.updateMany({ where: { id, userId: actor.userId }, data: { revokedAt: new Date() } });
    return { revoked: true };
  });
}
export async function bearerActor(raw: string): Promise<Actor> {
  if (!/^bg_[A-Za-z0-9_-]{43}$/.test(raw)) throw new ApiError(401, "UNAUTHORIZED", "Invalid bearer token.");
  const token = await db().apiToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
  if (!token || token.revokedAt || token.expiresAt <= new Date() || !token.user.active || token.sessionVersion !== token.user.sessionVersion) throw new ApiError(401, "UNAUTHORIZED", "The access token is invalid, expired or revoked.");
  return { kind: "bearer", userId: token.userId, sessionVersion: token.sessionVersion, tokenId: token.id, scopes: token.scopes as Scope[] };
}
