import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { planningCommandSchema, planningSnapshotSchema, recurringScheduleInputSchema, recurringScheduleSchema, recurringTransactionSchema } from "../lib/planning";

// Run after the workspace and automation generators. Runtime Zod remains authoritative.
const spec = JSON.parse(readFileSync("docs/API.openapi.json", "utf8"));
const schema = (value: z.ZodType) => { const { $schema: dialect, ...document } = z.toJSONSchema(value); void dialect; return document; };
const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const content = (value: unknown) => ({ "application/json": { schema: value } });
const envelope = z.object({ expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), requestId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), command: planningCommandSchema }).strict();
const error = { description: "Safe JSON error. A 409 can mean revision, idempotency, archived/paused schedule, immutable anchor or another planning conflict. Recording an already recorded date with the current revision is a successful no-op.", content: content({ type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } }) };
const failures = Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 503].map(status => [String(status), error]));
Object.assign(spec.components.schemas, {
  PlanningCommand: schema(planningCommandSchema), PlanningSnapshot: schema(planningSnapshotSchema), PlanningEnvelope: schema(envelope),
  RecurringScheduleInput: schema(recurringScheduleInputSchema), RecurringSchedule: schema(recurringScheduleSchema), RecurringTransaction: schema(recurringTransactionSchema),
});
spec.info.version = "3.3.0";
spec.info.description += " Core planning adds exact-total category splits, atomic selected transaction edits/deletion, safe category-budget copying, monthly expected-income/spending targets and explicit recurring occurrence recording. Forecasts never create financial entries. Financial export3 contains posting parts but not planning provenance/definitions; use database backups for full recovery.";
spec.tags = [...(spec.tags ?? []), { name: "Planning" }];
spec.paths["/api/v3/planning"] = {
  get: { tags: ["Planning"], operationId: "getPlanning", summary: "Read owned recurring schedules, occurrences, split audit and monthly plans", description: "Requires finance:read. Returns the shared financial revision with bounded owned planning data. Reading never materializes a forecast or posts money. Historical occurrence/split references can remain after an associated financial entry is deliberately deleted.", responses: { "200": { description: "Current owned planning snapshot.", content: content(reference("PlanningSnapshot")) }, ...failures } },
  post: { tags: ["Planning"], operationId: "mutatePlanning", summary: "Set monthly targets or manage and record a recurring schedule", description: "Requires finance:write, current shared expectedRevision and fresh requestId. After an unknown result replay the identical envelope. Recording accepts exactly one valid owned active/unarchived schedule occurrence on or before financial today in Asia/Dhaka. It creates the transaction, historical occurrence link, shared revision and receipt atomically. Repeated dates never silently create another entry. Schedule start date/frequency are immutable; editing a template does not rewrite recorded entries. Pending generated entries do not affect posted balances.", requestBody: { required: true, content: content(reference("PlanningEnvelope")) }, responses: { "200": { description: "Current saved planning snapshot or exact replay.", content: content(reference("PlanningSnapshot")) }, ...failures } },
};
const workspacePost = spec.paths["/api/v3/workspace"].post;
workspacePost.summary = "Apply one owned financial or classification command, including split/bulk/copy";
workspacePost.description += " Selected transaction batches contain1–100 unique IDs and commit all-or-nothing. Bulk amount/account/type changes are not supported. Splits contain2–20 positive parts summing exactly to the original amount; first part retains the original ID and all parts retain account/date/type/status and metadata. A split audit is historical, not another posting. Re-splitting an already grouped part is rejected. budget_copy requires distinct source/target months and an empty target month's category budgets; it never silently overwrites targets or copies transactions.";
spec.paths["/api/mcp"].post.description += " planning_get and planning_mutate expose the same planning snapshot and validated commands. There are19 tools in total.";
writeFileSync("docs/API.openapi.json", JSON.stringify(spec, null, 2) + "\n");
console.log("Added planning runtime schemas and /api/v3/planning to docs/API.openapi.json.");
