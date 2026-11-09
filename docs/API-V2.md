# Account-aware workspace API

The [OpenAPI 3.1 contract](API-V2.openapi.json) is generated from the runtime schemas with `npm run api:generate`; do not hand-edit its schema shapes.

The V2 contract extends Budget Go with manual BDT financial accounts and atomic transfers. It is distinct from the legacy V1 ledger format. The browser, REST endpoint and MCP tools use the same authorized transactional service. Implementation is in `lib/server/workspace-service.ts`; commands and snapshot validation are defined in `lib/workspace.ts`.

## Authentication and transport

Use the existing Auth.js session or an expiring integration bearer token. Read requests require `finance:read`; commands require `finance:write`. Token management remains browser-session-only. Tokens never authorize another user's records or account administration. Ownership comes from the authenticated actor, never a request field.

The same trusted Host/Origin and JSON body limits documented in [API.md](API.md) apply. Browser cookie mutations require the configured Origin. Bearer authentication takes precedence over cookies and invalid bearer tokens never fall back to a session. All responses use `Cache-Control: no-store`. Do not log tokens, database connection strings or financial payloads.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/api/v2/workspace` | None | Complete `WorkspaceData` snapshot |
| POST `/api/v2/workspace` | `{expectedRevision,requestId,command}` | Complete current snapshot after the command or an exact replay |

This MVP uses a bounded command endpoint so every financial mutation has a uniform revision and retry contract. No pagination is needed within the explicit workspace limits. Resource-specific endpoints can be added later without changing the shared operations.

## Snapshot / export format

The complete export is the GET response, saved as JSON:

```json
{
  "schemaVersion": 2,
  "currency": "BDT",
  "revision": 0,
  "accounts": [],
  "transactions": [],
  "transfers": [],
  "budgets": []
}
```

- Financial account: `{id,name,kind,currency,openingDate,openingPoisha,archived}`. Kind is `bank`, `cash` or `mobile`; currency is always `BDT`. Opening poisha is a signed safe integer, including zero. Opening dates use a real `YYYY-MM-DD` date in years 1000–9999.
- Transaction: `{id,description,category,date,type,poisha,accountId}`. Income/expense amounts are positive safe-integer poisha. A null account ID identifies preserved, unassigned legacy history. New transactions and updates require an owned active account.
- Transfer: `{id,fromAccountId,toAccountId,description,date,poisha}`. One logical row has equal opposite effects on two distinct accounts. Transfer effects are calculated from that single row, never represented as duplicate income/expense records.
- Budget: `{id,month,category,limitPoisha}`. One positive expense-category limit per `YYYY-MM` month/category.

Limits: 100 accounts, 10,000 transactions and transfers combined, 1,000 budgets and a 2 MiB complete snapshot. The sum of absolute opening amounts plus transaction/transfer amounts cannot exceed `Number.MAX_SAFE_INTEGER` poisha. The sum of budget limits has its own safe-money cap. Unknown fields and owner IDs are rejected. Every record ID must be unique across the snapshot's financial entities.

Schema2 export includes archived accounts and unassigned history. It excludes authentication, token secrets and internal retry receipts. It is private financial data. The first MVP offers complete export; schema2 restore and Sure/CSV import are not implemented. Never pass a schema2 export to the schema1 replacement endpoint.

## Command contract

Every command is a strict object with the following fields; create IDs are generated server-side.

| `command.type` | Other fields | Effect |
| --- | --- | --- |
| `account_create` | `account:{name,kind,openingDate,openingPoisha}` | Create an active manual BDT account |
| `account_update` | `id,account:{name}` | Rename an owned account |
| `account_archive` | `id,archived:boolean` | Archive or restore while preserving history |
| `transaction_create` | `transaction:{accountId,description,category,date,type,poisha}` | Create owned-account income/expense |
| `transaction_update` | `id,transaction:{accountId,description,category,date,type,poisha}` | Replace entry fields or explicitly assign a legacy entry |
| `transaction_delete` | `id` | Delete one entry, including in an archived account |
| `transfer_create` | `transfer:{fromAccountId,toAccountId,description,date,poisha}` | Transfer atomically between active accounts |
| `transfer_delete` | `id` | Delete the whole transfer, removing both effects atomically |
| `budget_create` | `budget:{month,category,limitPoisha}` | Create a monthly category budget |
| `budget_update` | `id,budget:{month,category,limitPoisha}` | Update an owned budget |
| `budget_delete` | `id` | Remove a budget without deleting entries |

Names are trimmed to 1–80 characters; descriptions to 1–120. Use the existing category lists in `lib/preview.ts`: Salary/Freelance/Other income for income; Groceries/Dining/Transport/Home/Shopping for expenses and budgets.

Account opening amount/date/kind cannot be edited in this MVP. There is no account-delete command. Archival blocks new entries and edits affecting the archived account; restore first. Explicit deletions remain possible and change historical balances. Existing legacy entries are never automatically assigned to a guessed account.

Entries and transfers cannot predate any referenced account's opening date. Future-dated entries are allowed but only affect balances and cash flow as of their date. Negative account balances are permitted; an opening balance is initialization, never income. Transfers do not count toward income, expense or budget spending. Unassigned legacy entries still appear in monthly income/expense/budget calculations but are excluded from account balances until explicitly assigned. This MVP does not value investments, debts or unlike currencies.

Example (documentation only; not seeded financial data):

```json
{
  "expectedRevision": 0,
  "requestId": "create-wallet-20261108-unique-id",
  "command": {
    "type": "account_create",
    "account": {
      "name": "Cash wallet",
      "kind": "cash",
      "openingDate": "2026-11-08",
      "openingPoisha": 50000
    }
  }
}
```

`50000` poisha means ৳500.00. GET the latest snapshot first; use its revision for the next new command.

## Concurrency and retries

`expectedRevision` is a non-negative safe integer. `requestId` is 1–80 ASCII letters, digits, hyphens or underscores; generate a unique ID for every new command. The service takes the same per-user row lock used for legacy finance writes, token revocation and session invalidation, then rechecks actor validity/scope inside the transaction.

For a new request ID, a stale revision returns `409 REVISION_CONFLICT` with no mutation. An accepted command, revision increment and retry receipt commit atomically. Failed commands leave no receipt and no partial financial effects.

After a lost response, retry the same validated command with the same request ID. A matching receipt is checked before stale-revision rejection and returns the current snapshot without applying the command again. The response is current state, not a saved historical response; it can contain later edits or deletion of the original record. Command hashing sorts object keys and uses the validated/trimmed command, so JSON property order does not affect replay identity. Reusing the ID with a different validated command returns `409 IDEMPOTENCY_CONFLICT`. Receipts persist with the user; no automatic replay window expiry is claimed.

On a revision conflict, reload and review the current state, then submit any intended new command with a new request ID. Do not change a pending command while reusing its request ID. A bad/expired/revoked token cannot replay an old command.

## Errors

Errors use the existing `{error:{code,message}}` envelope. Important statuses include `400 INVALID_REQUEST` for malformed commands, dates, owner fields or safety-limit violations; `401 UNAUTHORIZED`; `403 INSUFFICIENT_SCOPE` or Host/Origin rejection; `404 NOT_FOUND` for unowned/missing records; `409 REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `ACCOUNT_ARCHIVED`, `BUDGET_EXISTS` or `REVISION_LIMIT`; `413 BODY_TOO_LARGE`; `415 JSON_REQUIRED`; and sanitized `503 SERVICE_UNAVAILABLE`/`DATA_INTEGRITY` failures.

Database constraints additionally enforce tenant-scoped account references and distinct transfer accounts. A failed write rolls back; an unknown network outcome requires replay/reload before assuming it failed.

## V1 compatibility

V1 reads and the old schema1 format remain legacy views of income/expense transactions and budgets; they omit account definitions, account IDs and transfers. They are not complete backups of the new workspace.

Once any financial account or transfer exists, all V1 mutations—including schema1 replacement/import and legacy MCP mutations—return `409 VERSION_UPGRADE_REQUIRED`. This prevents the old delete/recreate implementation from losing new account links. Existing rows and their IDs are retained by the additive migration; no balances are inferred, accounts created or entries assigned automatically.

## MCP

The existing `/api/mcp` transport adds `workspace_get` and `workspace_mutate` with the exact service, command schema, revision and request-ID rules above. Legacy tools remain available subject to the V1 write guard. Use `workspace_get` for complete reads/exports. `workspace_mutate` is conservatively annotated destructive because some commands delete data; integrations should confirm human intent for deletion. Integration token issuance remains session-only.

Manual bearer Streamable HTTP support is inherited. External-client and n8n compatibility require actual live tests before being claimed. Source implementation and this contract alone are not integration acceptance; current evidence belongs in [HANDOFF.md](HANDOFF.md).
