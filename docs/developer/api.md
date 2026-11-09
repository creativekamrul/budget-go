# API reference

The API and MCP tools call the same owned, validated PostgreSQL service. All money uses integer poisha: `12550` means ৳125.50. Floating-point taka amounts are not accepted as money. Calendar dates use `YYYY-MM-DD` in years 1000–9999; use the intended Bangladesh date, not an accidental UTC conversion.

Download the generated OpenAPI document from `/api/v3/openapi?download=1`. It includes the runtime request schemas. Regenerate repository contracts with `npm run api:generate` after schema changes.

## Authentication

Send `Authorization: Bearer <token>` over HTTPS. `finance:read` permits reads; writes require `finance:write` as well. The configured trusted Host remains required. An invalid bearer header never falls back to a browser cookie. Browser-cookie writes require the matching Origin. Tokens cannot create users or administer credentials.

Responses containing financial or credential data use `Cache-Control: no-store`. Errors have the shape `{ "error": { "code": "REVISION_CONFLICT", "message": "…" } }` and do not expose database credentials.

## Endpoint map

| Method | Endpoint | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/v4/workspace` | Complete V4 finance snapshot and revision | finance:read |
| POST | `/api/v4/workspace` | One account, transaction, transfer, budget or classification command | finance:write |
| GET / POST | `/api/v4/workbench` | Rules, CSV staging/commit, reconciliation and run history | finance:read / finance:write |
| POST | `/api/v4/workbench/preview` | Read-only rule before/after preview | finance:read |
| GET / POST | `/api/v4/profile` | Display name/read-only sign-in identity | Browser session only |
| POST | `/api/v4/security` | Password change or all-session/token revocation | Browser session + current password |
| GET | `/api/v4/backup` | Download full owner backup | Browser session only |
| POST | `/api/v4/backup/validate` | Structure/checksum/counts preview | Browser session only |
| POST | `/api/v4/backup/restore` | Atomic supported-domain replacement | Browser session + current password |
| GET | `/api/v3/planning` | Recurring definitions/occurrences, split audit, monthly targets and revision | finance:read |
| POST | `/api/v3/planning` | Monthly target or recurring schedule/record command | finance:write |
| GET | `/api/v3/automation` | Preferences, sources and bounded inbox snapshot | finance:read |
| POST | `/api/v3/automation` | Preferences/source updates and inbox review commands | finance:write |
| POST | `/api/v3/ingest` | Stage an external message or structured draft | finance:write |
| POST | `/api/v3/automation/parse` | Conservative text preview without event/financial writes | finance:read |
| POST | `/api/mcp` | MCP Streamable HTTP tool transport | Per tool |
| GET | `/api/v3/openapi` | Generated contract; contains no private records | Public contract |
| GET / POST | `/api/v1/tokens` | List metadata / create a token | Browser session only |
| DELETE | `/api/v1/tokens/{id}` | Revoke a token | Browser session only |

## Read the workspace

The response has `schemaVersion:4`, `currency:"BDT"`, `revision`, `accounts`, `transactions`, `transfers`, `budgets`, `categories`, `tags`, `merchants`, `adjustments` and `matches`. Transaction metadata includes `categoryId`, `merchantId`, `tagIds`, `notes`, `status` and `excluded`. Financial account opening values are immutable in this model; rename/archive/restore is supported.

Pending entries do not affect posted balances or aggregates. Confirmed excluded entries affect balances but not cash flow, budgets or reports. Future entries do not post before their date. Internal transfers affect two account balances atomically and are not income or spending. Parent category budgets include descendants.

## Command envelope and safe retry

Workspace, workbench, profile, planning and automation commands share the user's financial revision. Read current state before a new command. Each new command needs a fresh `requestId` containing 1–80 letters, numbers, underscores or hyphens.

```json
{
  "expectedRevision": 12,
  "requestId": "review-BGDEMO001-v1",
  "command": {
    "type": "event_accept",
    "id": "YOUR_EVENT_ID",
    "acknowledgeDuplicate": false
  }
}
```

Send this envelope to `/api/v3/automation` to accept an event. Use the actual revision and event ID. A workspace transaction command goes to `/api/v4/workspace` instead.

If a request times out, resend the identical envelope. A matching receipt returns saved state without reapplying the mutation. Reusing an ID with a changed command returns an idempotency conflict. A new command with a stale revision returns a revision conflict: read state, review the draft, then issue a deliberately new command. Do not blindly retry a changed command with a new ID after an unknown outcome.

## Workspace commands

Selected transaction tools add `transaction_bulk_update`, `transaction_bulk_delete` and `transaction_split`; safe category-budget copying uses `budget_copy`. Batches are atomic and splits preserve their original total. See [Transaction tools](transactions.md) and [Budget planning](budgets.md) for the exact fields and boundaries.

New V4 financial commands: `account_adjustment_set`, `account_adjustment_delete`, `transfer_match` and `transfer_unmatch`. Eleven account families are manual signed BDT positions. Transfers contain outgoing `date` and incoming `toDate`; adjustments affect balance history without adding cash flow. See [Accounts](accounts.md), [Transfers](transfers.md), [Statements](statements.md), [Rules](rules.md), [Security](security.md) and [Full backup](backup.md).

Supported command types: `account_create`, `account_update`, `account_archive`, `transaction_create`, `transaction_update`, `transaction_delete`, `transfer_create`, `transfer_delete`, `budget_create`, `budget_update`, `budget_delete`, and create/update/archive for `category`, `tag` and `merchant`.

```json
{
  "expectedRevision": 12,
  "requestId": "expense-BGDEMO001-v1",
  "command": {
    "type": "transaction_create",
    "transaction": {
      "accountId": "YOUR_ACCOUNT_ID",
      "description": "Reviewed grocery purchase",
      "date": "2026-11-08",
      "type": "expense",
      "category": "Groceries",
      "categoryId": null,
      "poisha": 12550,
      "merchantId": null,
      "tagIds": [],
      "notes": "Reviewed from a bank alert",
      "status": "confirmed",
      "excluded": false
    }
  }
}
```

Custom categories require an owned `categoryId`; the server derives its display label. Omitted metadata on transaction updates preserves the saved value. Explicit null, empty array or empty string clears an assignment. Archived classifications retain historical references but cannot be newly assigned. Archive active child categories before their parent.

## Ingest without posting

`POST /api/v3/ingest` accepts `sourceId`, `externalId`, optional `rawText`, optional bank `reference` and optional structured `draft`. See [automation](automation.md) for exact processing behavior. It returns `{revision,event,replayed}`. Its stable source/external ID handles retries without requiring a pre-read financial revision. A changed body under the same delivery ID is rejected rather than silently overwriting an event.

## Automation commands

| Type | Fields after type | Effect |
| --- | --- | --- |
| preferences_update | preferences | Save validated complete preferences |
| source_create | source | Create an owned message source |
| source_update | id, source | Update a source; source has name/channel/providerLabel/accountId/enabled |
| event_update | id, draft | Save the reviewed complete draft |
| event_accept | id, acknowledgeDuplicate | Atomically create one linked transaction |
| event_ignore | id, ignored | Ignore or return an unaccepted event to review |

`GET /api/v3/automation` returns `eventTotal`, `eventLimit:200` and `nextCursor` alongside its event list. Follow `/api/v3/automation?cursor=<nextCursor>` until the cursor is null to read later pages. A cursor must belong to the authenticated user's inbox. Do not mistake a single page for a complete audit export. Workspace JSON export covers finances; it does not replace database backups or export all inbox history.

`POST /api/v3/automation/parse` accepts `{rawText}` and returns a conservative draft/reference/issues preview. It performs no event or transaction write. Cookie requests still need the configured Origin because this is a POST endpoint. Pausing automation or disabling a source blocks ingestion, including an exact replay; use authenticated reads to inspect previously saved events while paused.

## Planning commands

GET `/api/v3/planning` returns `{revision,recurring,occurrences,splits,monthlyPlans}`. POST accepts the same shared-revision/request-ID envelope with one of `monthly_plan_set`, `recurring_create`, `recurring_update`, `recurring_archive` or `recurring_record`. MCP exposes the same service as `planning_get` and `planning_mutate`.

Monthly plans are expected income/spending targets; they do not create actual transactions. Recurring definitions and upcoming forecasts do not affect finances until an explicit valid due occurrence is recorded. Occurrence identity prevents double recording, even after the linked financial transaction is deliberately deleted. Updating a schedule does not rewrite existing entries, and its start date/frequency are immutable.

Planning definitions and historical split/occurrence provenance are separate from the V4 financial export. The export contains the real posting parts but is not a complete application restore package. Use [Full backup and restore](backup.md) for owner-level recovery, and [Operations](operations.md) for database disaster recovery.

## Errors

| HTTP status | What to do |
| --- | --- |
| 400 | Correct validation errors; never invent missing financial fields |
| 401 | Check sign-in or token expiry/revocation; do not fall back to another identity |
| 403 | Check scopes, trusted Host/Origin or session-only operation |
| 404 | The owned account/event/classification was not found |
| 409 | Inspect the error code: stale revision, changed replay, duplicate review or archived reference |
| 413 | Reduce the payload or workspace size |
| 415 | Send application/json |
| 503 | Service unavailable or integrity error; no successful write is confirmed; replay the same command safely |

## Compatibility and limits

V1/V2/V3 workspace formats cannot represent every upgraded state. They return `409 VERSION_UPGRADE_REQUIRED` when data would be lost. Use V4 workspace for new integrations. Workspace caps include 100 accounts, 10,000 transactions/transfers, 1,000 budgets, 500 categories, 500 tags, 1,000 merchants and a 2 MiB snapshot. Combined absolute money must stay within JavaScript's safe integer range. Automation has its own source/event/message caps documented in the generated schemas.


## Version compatibility and backups

V4 workspace is the complete current financial contract. Historical `/api/v3/workspace` uses its preserved schema3 and returns `409 VERSION_UPGRADE_REQUIRED` when account families, valuations, matching or distinct settlement dates cannot be represented; it never drops unsupported fields. Automation and planning retain their existing V3 routes while sharing the latest revision. The public combined OpenAPI download remains `/api/v3/openapi` and includes all V4 operations.

Full backup is a separate browser-only contract, not a workspace snapshot or bearer export. Validation checks model/format version, size and checksum; restoration additionally validates domain references inside its atomic transaction. Only exact supported full backups can be restored. The current profile and tokens are preserved. Security actions invalidate all old sessions/tokens and do not use the financial replay receipt protocol. See their dedicated guides before calling.
