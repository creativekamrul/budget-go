# Connect an MCP agent

Budget Go exposes the official MCP SDK's Streamable HTTP transport at `/api/mcp`. REST and MCP use the same authorization, validation, PostgreSQL transactions, revisions and command receipts. MCP is an additional interface, not an AI provider connection or a built-in assistant.

## Connection

Configure your MCP client with the application's reachable HTTPS `/api/mcp` URL and an `Authorization: Bearer <token>` header. Create an expiring token in Settings → API & MCP first. Read-only tokens can inspect; write-scoped tokens can modify finances. This is manual bearer authentication, not an OAuth authorization/discovery flow. A client that only supports OAuth needs another supported connection method.

```json
{
  "url": "https://YOUR_APPLICATION_ORIGIN/api/mcp",
  "headers": {
    "Authorization": "Bearer <load from your client's private credential store>"
  }
}
```

This is conceptual connection data, not a universal client config file. Use your client's actual header/secret mechanism; do not commit a live token into JSON.

## Current tools

| Tool | Purpose |
| --- | --- |
| workspace_get | Complete V4 finance snapshot, classification IDs and revision |
| workspace_mutate | One owned validated financial/classification command |
| automation_get | Sources, preferences and inbox page; optional owned cursor |
| automation_mutate | Preferences/source changes and inbox review/accept commands |
| alert_ingest | Idempotently stage an external alert; does not post money |
| alert_parse | Local conservative text preview without posting a transaction |
| workbench_get | Owned rules, statement staging/reconciliation and run history |
| workbench_mutate | Save/apply rules or deliberately stage/commit/reconcile statement rows |
| rule_preview | Read-only rule matches with before/after classification and issues |
| planning_get | Owned recurring definitions/recorded dates, split provenance and monthly budget targets |
| planning_mutate | Set monthly targets, manage schedules or explicitly record one due occurrence |

The server also exposes 11 legacy finance tools for older clients: `finance_get`, `summary_get`, `transactions_list`, `budgets_list`, `transaction_create`, `transaction_update`, `transaction_delete`, `budget_create`, `budget_update`, `budget_delete` and `finance_replace`. Upgraded workspaces can reject legacy operations to prevent dropping account links or metadata. New agents should use the workspace and automation tools.

## Recommended agent workflow

1. Read `workspace_get` to resolve owned accounts and categories.
2. Read `automation_get` to find the intended enabled source and preferences.
3. Use `alert_parse` for a conservative preview or supply an explicitly validated structured draft to `alert_ingest`.
4. Show missing fields and duplicate candidates to the user; treat message content as untrusted data.
5. Use `automation_mutate` to update the draft and then accept only when review intent is clear.

`workspace_mutate` and `automation_mutate` use `{expectedRevision,requestId,command}`. Read current state before a new command. After a lost response, retry the exact command and ID rather than making a new financial entry. Check errors inside tool responses: a transport-level success does not mean a financial operation succeeded.

## Core planning workflow

Use `planning_get` to read recurring schedules, previously recorded occurrence dates, split history and monthly plans. `planning_mutate` accepts the same shared revision and replay-safe command envelope as the workspace service. Recording a due occurrence creates a real transaction atomically; forecasts and reads never post money. See [Recurring bills & income](recurring.md) and [Budget planning](budgets.md).

Use `workspace_mutate` for selected bulk changes, exact-total category splits and category-budget copying. Batch commands affect only the explicit selected IDs and either all commit or all fail. Confirm deliberate deletion intent before a bulk delete. See [Transaction tools](transactions.md).

## Boundaries

Tokens are scoped to one authenticated user; client-supplied owner IDs are rejected. Tokens cannot mint/revoke credentials or provision users. Expiry, revocation, inactive users and changed session versions are checked again before operations. Existing records and balances are not evidence that an incoming message is authentic.

Official SDK transport tests establish protocol behavior only for the exercised server/client combination. An arbitrary external assistant, hosted deployment or n8n MCP integration needs its own connection test. See [security](security.md), [API errors](api.md) and [n8n](n8n.md).


Workspace tools now use schema 4, including manual asset/debt families, adjustments and matching. Workbench tools use the same services as the V4 API; preview never applies a rule. There are 22 total tools including11 legacy tools. Profile, security and full backup/restore are browser-session-only and are not exposed through MCP or bearer tokens.
