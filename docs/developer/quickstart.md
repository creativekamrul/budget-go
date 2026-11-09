# Connect your first automation

Budget Go records BDT accounts and transactions without requiring a bank API. Your email/SMS collector or agent submits an alert to the automation inbox. Review the extracted fields before posting a transaction.

> This guide uses synthetic data. Creating a source or importing a workflow does not connect to a bank, mailbox, phone or AI provider.

## 1. Prepare your workspace

Sign in and create a real bank, cash or mobile-wallet account with the correct opening date and balance. Create any categories, tags and merchants you want to assign. Existing unassigned transactions stay preserved; no account balance is guessed from them.

Open Settings → Automation sources. Create an enabled source for the collector, choose SMS, email or manual, and optionally choose its default financial account. Use separate sources when messages belong to different accounts. Provider labels describe your source; they do not establish a bank connection.

## 2. Create an integration token

Open Settings → API & MCP. Create a named, expiring token. Read-only is the default. Ingestion and posting require read/write access (`finance:read` and `finance:write`). Copy the token once and store it in your automation system's credential store. It cannot be retrieved later.

Use your configured HTTPS application origin outside local development. A remote n8n server cannot reach another machine's `127.0.0.1`. Configure a reachable trusted origin and HTTPS before connecting it.

## 3. Find source and account IDs

Read `/api/v3/automation` to find sources, preferences and inbox items. Read `/api/v4/workspace` to find actual account and classification IDs. Never use a display name or another user's ID in place of an owned ID.

```sh
curl "$BUDGET_GO_URL/api/v3/automation" \
  -H "Authorization: Bearer $BUDGET_GO_TOKEN"
```

These shell examples assume a POSIX shell. The repository's `integrations/n8n/ingest-event.mjs` is a Node.js alternative that also works on Windows; download it from `/docs/downloads/node`.

## 4. Submit one message

Use the collector's stable message ID, not a random ID on every retry. Send the same body and external ID after a lost response.

```json
{
  "sourceId": "YOUR_SOURCE_ID",
  "externalId": "collector-message-0001",
  "rawText": "Tk 125.50 debited on 08-11-2026. Ref BGDEMO001."
}
```

POST that JSON to `/api/v3/ingest` with the bearer credential and `Content-Type: application/json`. Ingestion stores an inbox event; it does not change balances. Default raw-message retention is off. Recognized security/OTP messages are rejected.

## 5. Review and post

Open Inbox, inspect the account, date, direction, amount and classification, and correct missing fields. Review duplicate warnings against existing entries and other alerts. Only a deliberate accept operation creates the financial transaction. Accepted events keep a link to that transaction.

Repeated acceptance cannot create another transaction from the same event. Revision conflicts require a reload and review. After an unknown result, retry the same command and request ID; do not invent a new command just to clear the error.

## Continue

Read the [API reference](api.md), [Bangladesh automation guide](automation.md), [n8n setup](n8n.md) or [MCP connection guide](mcp.md). For a machine-readable contract, download `/api/v3/openapi?download=1`.
