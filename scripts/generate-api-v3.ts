import { writeFileSync } from "node:fs";
import { z } from "zod";
import { workspaceCommandSchema, workspaceDataSchema } from "../lib/workspace-v3";

// The runtime schemas are the authority; do not hand-edit the generated schema shapes.
const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _dialect, ...result } = z.toJSONSchema(schema);
  void _dialect;
  return result;
};
const error = { description: "Safe JSON error with code and message. 409 indicates a revision, idempotency, archive or V1 upgrade conflict.", content: { "application/json": { schema: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] } }, required: ["error"] } } } };
const response = { description: "Complete current owned workspace. Account balances are derived from opening balances and dated effects; transfers are neutral in consolidated cash flow. Export only: no whole-workspace restore endpoint in this MVP.", content: { "application/json": { schema: { $ref: "#/components/schemas/WorkspaceData" } } } };
const spec = {
  openapi: "3.1.0", info: { title: "Budget Go Workspace API", version: "3.0.0", description: "Private BDT personal finance. Money uses integer poisha. Same authorization/service as MCP workspace_get/workspace_mutate. Calendar dates and same-owner references are also checked at runtime. Records: maximum 100 accounts, 10,000 transactions/transfers combined, 1,000 budgets, 500 categories, 500 tags, 1,000 merchants, 2 MiB snapshot. Pending transactions do not affect posted balances or aggregates. Excluded confirmed transactions affect balances but not cash flow, budgets or reports. Category budgets include descendants. Classification IDs are stable; archive retains history. Sum of absolute opening/entry/transfer amounts and sum of budgets must each fit the safe integer limit. Accounts referenced by historical entries may be archived; new/edited entries require active accounts. No currency conversion or provider synchronization." },
  servers: [{ url: "http://127.0.0.1:3000", description: "Local development; configure trusted origin and HTTPS for hosting" }],
  security: [{ BearerAuth: [] }, { SessionCookie: [] }],
  paths: { "/api/v3/workspace": {
    get: { operationId: "getWorkspace", summary: "Read the complete authenticated workspace", responses: { "200": response, "401": error, "403": error, "503": error } },
    post: { operationId: "mutateWorkspace", summary: "Apply one account, transaction, transfer, budget, category, tag or merchant command", description: "Requires finance:write. Browser-cookie writes require matching Origin; bearer auth never falls back to cookies. Read current revision first. Every new command uses a fresh requestId. After an unknown outcome retry the exact same command/requestId; it returns current state without reapplying. Reusing an ID for another command returns 409. A stale revision with a new requestId returns 409; reload and review before a new write. Deletions require intentional user action.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["expectedRevision", "requestId", "command"], properties: { expectedRevision: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, requestId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,80}$" }, command: { $ref: "#/components/schemas/WorkspaceCommand" } } } } } }, responses: { "200": response, "400": error, "401": error, "403": error, "404": error, "409": error, "413": error, "415": error, "503": error } },
  } },
  components: { securitySchemes: { BearerAuth: { type: "http", scheme: "bearer", description: "Manually configured expiring Budget Go integration token; not OAuth. Reads require finance:read, commands finance:write." }, SessionCookie: { type: "apiKey", in: "cookie", name: "authjs.session-token", description: "Existing Auth.js browser sign-in. Secure hosted cookie uses __Secure-authjs.session-token. Not a client-issued user ID." } }, schemas: { WorkspaceData: jsonSchema(workspaceDataSchema), WorkspaceCommand: jsonSchema(workspaceCommandSchema) } },
};
writeFileSync("docs/API-V3.openapi.json", JSON.stringify(spec, null, 2) + "\n");
console.log("Generated docs/API-V3.openapi.json from runtime workspace schemas.");
