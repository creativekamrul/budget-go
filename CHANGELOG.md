# Changelog

## 1.0.0-beta.1 — 2026-11-09

First public beta of Budget Go, a self-hosted personal-finance workspace focused on Bangladesh.

- Manual BDT bank, wallet, cash, asset and debt accounts; net worth and dated balance adjustments.
- Transactions, classifications, bulk edits, exact splits and reversible transfer matching.
- Monthly budgets, targets and recurring schedules with explicit occurrence recording.
- CSV statement review/import, duplicate decisions and closing-balance reconciliation.
- Rules with before/after previews and selected application.
- Review-based Bangladesh SMS/email intake via custom REST API, MCP and n8n examples.
- Profile, password/session controls, and versioned full backup/restore.
- Repository and in-app documentation, generated OpenAPI, MIT license and a public documentation site.
- Docker Compose options for bundled or external PostgreSQL; versioned GHCR images and documented upgrades.

### Beta boundaries

BDT manual accounting only. No live bank connections, exchange rates, security prices, automatic message collection, automatic rule execution or background recurring posting. CSV import does not read PDFs. Household roles and broader Sure feature parity remain open. GitHub Pages hosts the public product/docs site; the authenticated application and PostgreSQL run on your own server. Backups contain readable private data and need protection. See [coverage](docs/developer/parity.md) and [operations](docs/developer/operations.md).
