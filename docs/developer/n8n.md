# Connect n8n

Use n8n as your collector and orchestration layer; use Budget Go as the owned financial ledger and review inbox. The starter workflow submits a synthetic alert with a Manual Trigger. It has no bank, Gmail, IMAP or phone credentials, and is inactive by default.

## Import the template

Download the starter from `/docs/downloads/n8n` or open `integrations/n8n/budget-go-alert-inbox.json` in the repository. In n8n choose Import from File. The workflow contains a Manual Trigger, a Code node that emits one example event, and an HTTP Request node that submits it to the inbox.

Replace the placeholder application URL and source ID. Configure a **Bearer Auth** credential in n8n containing a named Budget Go read/write token, then select it on the HTTP Request node. Keep the credential out of the workflow JSON. n8n officially supports importing workflow JSON and generic Bearer Auth for HTTP requests. See [n8n import/export](https://docs.n8n.io/build/manage-workflows/export-and-import.md) and [HTTP Request credentials](https://docs.n8n.io/integrations/builtin/credentials/httprequest).

> The JSON structure and node fields are checked against n8n's official documentation/source. An external n8n instance and your mailbox/phone connection have not been exercised here. Import and test on your installed version before enabling a real collector.

## Configure the HTTP Request node

| Setting | Value |
| --- | --- |
| Method | POST |
| URL | Your reachable HTTPS origin + `/api/v3/ingest` |
| Authentication | Generic Credential Type → Bearer Auth |
| Send body | On |
| Body content type | JSON |
| JSON body | The sourceId/externalId/rawText/reference/draft object |

On a hosted or containerized n8n, `127.0.0.1` points to n8n itself. Configure application networking and the trusted `APP_URL`/`AUTH_URL` origin; do not send production credentials to a placeholder host. Start with a disposable source and synthetic message.

## Replace the example collector

For email, replace the Manual Trigger/example input with your configured email trigger or IMAP/Gmail workflow. Carry the stable original message ID into `externalId`. Filter to actual financial alerts using sender, subject and body checks appropriate to your mailbox; sender text alone is not proof of authenticity.

For SMS, use your chosen phone/collector forwarding system to provide messages to n8n. Configure and secure that collector separately. Preserve its stable message ID and source identity. Do not expose a public forwarding webhook without authentication, request-size limits and deliberate handling of private message bodies.

If both email and SMS report the same purchase, keep the bank reference for duplicate review. Do not generate a fresh external ID for a retry. A retry with the same identity and changed text is a conflict; edit the staged inbox draft instead.

## Add an AI extraction step

Pass only the necessary financial alert text to your chosen model. Ask for a JSON candidate using the ingest `draft` fields and retain unknown values as null or absent. Resolve account/category names to owned IDs using workspace data. Never let text inside a bank message override system instructions, choose credentials, switch owners or call arbitrary URLs.

The agent may normalize বাংলা digits and explicit BDT amounts, but the server still validates them. If you calculate poisha in code, use decimal-string/BigInt conversion and reject more than two decimal places. Do not use `Math.round(parseFloat(amount) * 100)` as the source of financial truth. Missing dates, mixed debit/credit, fees and balances need review. Prefer ingestion to a direct transaction create for unreviewed extractions.

## Retry and error branches

For ingestion, retry the same source/external ID and exact body after a timeout. Treat 400 as extraction/validation work, 401/403 as credential/scope/configuration work, and 409 as a conflict requiring inspection. Keep retry attempts bounded; a dead-letter branch or notification should preserve the original event identity.

If your agent also accepts events, GET `/api/v3/automation` before a new mutation and use its revision. Save the exact command envelope and request ID before sending. Reuse that envelope after an unknown outcome. On a known revision conflict, reread and review before issuing a new command. A template import is not evidence that your external retry branch is configured correctly.

## Keep execution history private

Avoid retaining message bodies or tokens in shared execution logs. n8n's exported workflows can include credential names/IDs and imported headers; inspect and sanitize before sharing. Budget Go's raw retention setting does not govern n8n's execution storage or the AI provider's logs. Review those systems' retention independently.

See [automation semantics](automation.md), [security](security.md) and the [API reference](api.md).
