# n8n starter

`budget-go-alert-inbox.json` is an inactive importable workflow template: Manual Trigger → configured synthetic event → HTTP Request. It stages an inbox event; it never accepts/posts it. Replace the source ID and the `.invalid` placeholder origin, select your private Bearer Auth credential, then test. Do not embed the token in workflow JSON. The example node deliberately refuses to run with its placeholder source ID.

The node fields were checked against the official [HTTP Request source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/Description.ts), [credential guide](https://docs.n8n.io/integrations/builtin/credentials/httprequest) and [workflow import guide](https://docs.n8n.io/build/manage-workflows/export-and-import.md). JSON parsing/static validation is not external n8n execution evidence. Import and configure on your installed n8n version; a real mailbox/phone/agent connection has not been created or tested here.

Read [the full setup guide](../../docs/developer/n8n.md). Replace the Manual Trigger with your authenticated email/SMS collector only after a synthetic test succeeds. Preserve original message IDs for retries and the bank reference for duplicate review. Raw-message retention in Budget Go does not govern n8n execution logs.

## Node.js alternative

`ingest-event.mjs` reads a JSON file and privately configured `BUDGET_GO_URL` / `BUDGET_GO_TOKEN` environment variables. It sends one explicit ingestion request. It logs only event ID, status, revision and replay status, not the token/message/draft. A timeout may have committed; inspect the inbox or replay the exact body/identity.

```sh
node integrations/n8n/ingest-event.mjs /private/path/event.json
```

Do not pass a live token as a command argument or commit your event file. See [the ingest contract](../../docs/developer/automation.md).
