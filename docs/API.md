# Legacy V1 REST and MCP reference

For the current workspace use [API-V4.md](API-V4.md) and [OpenAPI](API.openapi.json): `/api/v4/workspace`, `workspace_get`, and `workspace_mutate`. V1/V2 formats omit classifications and transaction metadata; they return `409 VERSION_UPGRADE_REQUIRED` when the workspace cannot be represented completely. V1 finance writes/imports also reject after financial accounts exist. Token endpoints remain current.

Use your configured app origin and HTTPS outside loopback development. Financial fields and limits follow [backup format](<BACKUP-FORMAT.md>). All IDs are account-local finance identifiers, never owner/user selectors. All responses containing finances/tokens are `Cache-Control: no-store`.

## Authentication

Browser UI uses Auth.js Credentials/JWT sessions. API clients use `Authorization: Bearer <token>` from **Account & integrations**. Read access is always included; optional `finance:write` enables mutations. Expired/revoked tokens, inactive users and old session versions are rejected. An invalid Authorization header never falls back to a browser cookie. Browser-cookie writes must supply the configured same-origin `Origin`; Host must match the configured deployment. No permissive credential CORS or OAuth discovery is provided.

Secrets are shown once during creation and are never returned by token listing. Token management is browser-session-only; bearer credentials cannot mint/revoke/list integration tokens or create login users. A write-scoped bearer may manage its owner's financial accounts through V2. Never put credentials into query strings, workflows exported publicly, screenshots or logs.

## Financial endpoints

| Method / path | Input | Response |
| --- | --- | --- |
| GET `/api/v1/me` | none | `{id,email,name}` |
| GET `/api/v1/finance` | none | Complete v1 `FinanceData` snapshot / backup |
| PUT `/api/v1/finance` | `{expectedRevision,data}` | Saved canonical `FinanceData`; replaces all account finances |
| GET `/api/v1/transactions` | Optional query `month`, `type`, `category` | `{revision,transactions}` |
| POST `/api/v1/transactions` | `{expectedRevision,transaction}` | Saved full `FinanceData`, status 201 |
| PUT `/api/v1/transactions/[id]` | `{expectedRevision,transaction}` | Saved full `FinanceData` |
| DELETE `/api/v1/transactions/[id]` | JSON `{expectedRevision}` | Saved full `FinanceData` |
| GET `/api/v1/budgets` | Optional query `month` | `{revision,budgets}` |
| POST `/api/v1/budgets` | `{expectedRevision,budget}` | Saved full `FinanceData`, status 201 |
| PUT `/api/v1/budgets/[id]` | `{expectedRevision,budget}` | Saved full `FinanceData` |
| DELETE `/api/v1/budgets/[id]` | JSON `{expectedRevision}` | Saved full `FinanceData` |
| GET `/api/v1/summary?month=YYYY-MM` | Required month | `{month,revision,incomePoisha,expensePoisha,balancePoisha,budgets}` |

Create transaction fields: `description`, `category`, `date`, `type`, `poisha`, optional `id`. Update requires all fields except `id`, which comes from the path. Create budget fields: `month`, `category`, `limitPoisha`, optional `id`; update takes all except `id`. Summary budget entries include `spentPoisha` and human-readable `status`. POST/PUT/DELETE JSON bodies require `Content-Type: application/json`. Unknown body fields, including owner fields, are rejected.

Example transaction-create body (illustrative documentation, not seeded app data):

```json
{
  "expectedRevision": 0,
  "transaction": {
    "description": "Groceries",
    "category": "Groceries",
    "date": "2026-11-05",
    "type": "expense",
    "poisha": 12550
  }
}
```

`12550` poisha is ৳125.50, not ৳12,550. Always GET the latest revision before a write. On success, use the returned revision for the next operation. On `409`, reread and review the new state; do not blindly replay a destructive mutation. A lost network response can mean a write succeeded: reread before retrying. Operations are not advertised as idempotent retries.

Errors use `{error:{code,message}}`: invalid data 400, missing/invalid credentials 401, scope/Origin/Host denial 403, missing owned record 404, revision conflict 409, oversized JSON 413, wrong media type 415 and sanitized service/database failure 503. Other framework/protocol errors may differ. Invalid input never authorizes access to another account.

## Session-only token endpoints

- GET `/api/v1/tokens` → metadata array.
- POST `/api/v1/tokens` with `{name,scopes,expiresInDays}` → `{token,metadata}`. Name trimmed 1–80 characters; expiry integer 1–365 days. Scopes `['finance:read']` or `['finance:read','finance:write']`.
- DELETE `/api/v1/tokens/[id]` → `{revoked:true}`. No request body.

Metadata includes `id`, `name`, `scopes`, `expiresAt`, `revokedAt`, `createdAt`, never the stored hash or retrievable secret. Requests need browser authentication and same-origin mutation checks.

## MCP

Endpoint `/api/mcp` supports stateless Streamable HTTP **POST** using the official TypeScript SDK, JSON responses and manual bearer authentication. Send `Content-Type: application/json` and `Accept: application/json, text/event-stream`. GET/SSE subscriptions and DELETE session termination are not supported. Configure a client supporting custom Authorization headers; no OAuth or universal client-compatibility claim is made.

Tools:

- Reads: `finance_get`, `summary_get`, `transactions_list`, `budgets_list`.
- Writes: `transaction_create`, `transaction_update`, `transaction_delete`, `budget_create`, `budget_update`, `budget_delete`, `finance_replace`.

Write arguments mirror REST plus `id` for update/delete. Replacement uses `{expectedRevision,data}`. Tool schemas are strict; service validation remains authoritative. Destructive tools are annotated and described as requiring human confirmation, but annotations are advisory: a bearer token with write permission is powerful and can perform the operation. Client-side approval policy remains the client's responsibility. Tool failures return `isError:true` with a safe error in text content.

## n8n

Use a private HTTP Header Auth credential with `Authorization: Bearer <token>`, then HTTP Request nodes targeting the endpoints above. Fetch finance/current revision, derive a validated change, submit it with the revision, and stop/review on conflicts. Keep write/delete/import steps behind explicit workflow approval where appropriate. This repository does not install an n8n node or claim a tested external n8n deployment. See [V2 review](<REVIEW-V2.md>) and [handoff](<HANDOFF.md>) for actual execution scope.
