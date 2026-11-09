# Budget Go documentation

Read these guides in the repository, on the [public documentation site](https://creativekamrul.github.io/budget-go/docs/), or open **Settings → Developer documentation** (`/docs`) in the app. This is the v1.0.0 Beta1 documentation, licensed with the application under MIT.

| Guide | What it explains |
| --- | --- |
| [Docker install & upgrades](developer/docker.md) | Versioned GHCR images with bundled or external PostgreSQL, backups and upgrades |
| [Quickstart](developer/quickstart.md) | Create an account, source and integration token; submit an alert |
| [API reference](developer/api.md) | Endpoints, payloads, money, permissions and error handling |
| [Accounts & net worth](developer/accounts.md) | Manual signed BDT asset/debt positions and dated valuations |
| [Transfer matching](developer/transfers.md) | Corresponding-entry matching, settlement dates and unmatch audit |
| [Statements & reconciliation](developer/statements.md) | Mapped CSV staging, per-row duplicate review and closing-balance comparisons |
| [Transaction rules](developer/rules.md) | Manual before/after previews and classification run history |
| [Full backup & restore](developer/backup.md) | Supported domains, version/checksum validation and confirmed replacement |
| [Transaction tools](developer/transactions.md) | Selected bulk changes and amount-preserving category splits |
| [Recurring bills & income](developer/recurring.md) | Calendar schedules, forecast dates and exactly-once recording |
| [Budget planning](developer/budgets.md) | Expected income/spending, category allocations and safe month copying |
| [Bangladesh automation](developer/automation.md) | SMS/email extraction, review, duplicate handling and posting |
| [n8n guide](developer/n8n.md) | Import the starter workflow and connect your own message collector |
| [MCP guide](developer/mcp.md) | Connect an agent and use the same service through tools |
| [Security](developer/security.md) | Credentials, private messages, scopes and AI boundaries |
| [Operations](developer/operations.md) | Setup, migrations, backup, troubleshooting and checks |
| [Feature coverage](developer/parity.md) | What works and what remains before Sure parity |

Machine-readable contracts: [current V4](API-V4.openapi.json), [historical workspace V3](API-V3.openapi.json) and [combined finance, workbench, account, automation and planning](API.openapi.json). Read the [V4 contract overview](API-V4.md). Run `npm run api:generate` to regenerate contracts from runtime schemas. The application serves the combined document at `/api/v3/openapi`.

The runtime Zod schemas and shared server services are authoritative. Narrative guides explain their guarantees; examples use placeholders and synthetic messages, never financial records or live credentials. An importable n8n template is provided in `integrations/n8n/`; importing a template does not configure a bank/email/SMS connection.

Design and implementation references: [project brief](PROJECT-BRIEF.md), [design contract](DESIGN-CONTRACT.md), [full Sure audit](SURE-PARITY-AUDIT.md), [current handoff](HANDOFF.md), [quality checks](QUALITY-CHECKS.md).
