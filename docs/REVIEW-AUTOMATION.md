# Bangladesh automation and documentation review — 8 November 2026

The coordinator reviewed the backend, tests and rendered UI independently of the delegated backend/frontend/docs implementation. This is a scoped milestone, not full Sure parity or certified bank integration.

## Behavior implemented

Owned SMS/email/manual sources and persisted preferences; conservative Bangla-digit/BDT/four-digit-year extraction; staged intake keyed by source and external message ID; exact-body retry and changed-body conflict; possible cross-channel reference/message and posted-transaction duplicate warnings; draft edit/ignore/restore; atomic acceptance into one validated financial entry with shared revisions and idempotent receipts. Cursor pagination keeps older events accessible. No intake automatically posts money. Authorized workflows/agents can perform review and acceptance through API/MCP as separate explicit operations.

Raw text retention defaults off. Saving it off purges existing retained bodies. Security indicators are rejected in raw intake, structured description/notes and review edits. Missing/ambiguous values remain reviewable; this is not a bank-specific parser certification. Sources identify collectors and do not connect to banks/mailboxes/phones themselves.

The UI retains menus, adds Inbox/Guide, and replaces equal gray cards with an accented balance hero, open ledger sections and distinct financial/review colors. Preferences actually affect money formatting, accent, density, Dhaka dates, WTD/FYTD and new-entry status. The app's eight documentation guides read the same Markdown as the repository. Generated OpenAPI, inactive n8n template and Node helper are downloadable.

## Executed checks

- PASS production build, lint (no warnings), typecheck, Prisma generation/validation, unit35: legacy7/workspace6/classification5/reports8/automation5/docs4; actual-source pure/official-SDK11.
- PASS guarded disposable PostgreSQL automation8, existing workspace9, classification7 and legacy7. Automation checks include concurrent intake/acceptance, exact replay, changed payload rejection, tenant boundaries, duplicate acknowledgement, ignored/restored state, raw opt-in/purge, OTP update bypass, inactive actors, archived account/source pause, aggregate-failure rollback and owned cursor pagination across205 additional fixtures. Exact fixture cleanup completed.
- PASS final production automation HTTP5 and existing workspace HTTP7: actual Auth.js cookies, scoped bearer/no-cookie-fallback, official MCP SDK17 read/parse/ingest/review/accept/replay, revocation and REST-visible equality. These are not external n8n execution results.
- PASS production automation browser7: real source forms, Bangla SMS preview/intake, staged edits, commit with intentionally dropped response and safe acceptance retry producing exactly one entry, duplicate warning/ignore, persisted preferences/default pending entry, fiscal report, docs search/language tabs/copy/actual OpenAPI and workflow downloads, no browser financial storage, five page families at360/768/1440 without page overflow or sub44px controls (native checkbox target is its clickable label). Existing finance browser8 passed on the redesigned app before final phone-label-only polish. No page errors. See `artifacts/automation/{service,http,browser}-results.json` and `artifacts/mvp/` regression reports.
- Main restarted app public4 passed. Additional checks: /inbox, /docs, /settings/preferences redirect unauthenticated users; /api/v3/automation returns401; the public schema endpoint returns200. Read-only database check passed after deployment.

## Review findings and visual evidence

Fixed parser selection of a sole available-balance amount; OTP bypass through structured/review text; access to events older than200; dynamic review state after archiving an account; invalid aggregate acceptance incorrectly returning503 instead of rolling back with400; inability to pause an unchanged archived account source; response-only token marked writeOnly in OpenAPI; mobile Transactions label orphaning a final letter. The visible phone label is Activity with accessible name Transactions. Date assertions were adjusted to the installed Intl month/day order, not by changing financial date semantics.

Root and Designer inspected actual Home desktop/tablet and Home/Inbox/Preferences/Sources phone captures; root also inspected Reports and documentation rendering. Final production `home-viewport-360.png` and `inbox-viewport-360.png` confirm the mobile label fix, readable Bangla amounts, amber queue indicator and semantic active navigation. `sources-768.png` shows legible configuration and wrapped identity. Root's final captures scroll to top before full-page shots; an earlier review shot taken after Save draft reflected fixed-nav screenshot positioning.

## Deployment and limits

Reviewed additive migration `20261108020000_automation_inbox` was applied after isolated acceptance. Existing financial IDs/labels/dates/amounts/account links, user revisions and session state were fingerprint-verified unchanged. It creates new configuration/staging tables without financial seeds. Main production app remains at127.0.0.1:3000. Temporary3100 server, unique test DB, private test env files and dedicated test-browser process were cleaned up. GitHub connection/publication was explicitly deferred by the user; docs are local and in-app.

Full Sure parity, actual external SMS/mailbox collectors, externally executed n8n workflow, arbitrary assistant connectivity, automatic AI provider setup, whole-app JSON restore, hosted operations, physical print output, screen readers and true200% zoom remain open. Inbox is capped at2000 saved events and100 sources; an operator archival workflow is not yet implemented. Financial export3 excludes automation/preferences; database backup is required for complete recovery. The starter workflow is inactive and intentionally stops at ingestion; trusted automated review/acceptance can be configured separately.
