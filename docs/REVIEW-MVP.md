# MVP review

## Scope

Independent Reviewer source review and reviewer-authored behavior checks for the account-aware BDT MVP. Production browser/HTTP checks executed by Lead must be recorded separately in HANDOFF.md. No external n8n/client compatibility, operational backup restore, genuine 200% zoom or assistive-technology acceptance is implied.

## Current source findings

- Shared V2 command validation and transactional service keep User ownership separate from financial accounts. Account references are checked against the owner's snapshot and compound foreign keys enforce tenant ownership in PostgreSQL.
- Opening balances initialize balances, while income/expense and budget calculations exclude transfers. Unassigned legacy rows remain explicit and are excluded from account balances until assignment.
- New commands retain the existing owner row lock and revision check. A matching request receipt is read only after current authorization; the same command replays without mutation, and a changed command reusing an ID conflicts.
- Account archive retains history and blocks entry creation/editing; deletion explicitly changes historical balances. V1 writes are blocked after account adoption to prevent old whole-ledger replacement from deleting links.
- Additive migration creates accounts/transfers/receipts and nullable account links; it does not assign old rows, fabricate opening balances or seed finances.

## Checks authored and actually run

- `node tests/workspace-unit.mjs`: PASS six actual-source pure groups (signed exact parsing; strict command/owner/date validation; snapshot reference/date/duplicate/aggregate validation; opening/entry/transfer/as-of balances; income/expense/budget isolation; dated balance-history reconciliation).
- `node --check tests/workspace-acceptance.mjs`: PASS syntax. Lead then executed its nine groups against the authorized migrated disposable PostgreSQL database; Reviewer inspected `artifacts/mvp/service-results.json` with all nine complete and `failure:null`. Groups cover legacy preservation/tenant isolation, exact CRUD/assignment, transfer neutrality, invalid/archive/date/aggregate rollback, revision concurrency, idempotency, actual SQL-failure rollback, authorization rechecks and V1 replacement guard. This was Lead-executed evidence, not a separately rerun Reviewer database check.
- `node --check tests/workspace-http.mjs`: PASS syntax. Lead executed six actual Auth.js cookie/REST/official-SDK groups against the isolated port3100 app; Reviewer inspected `artifacts/mvp/http-results.json`, all six complete with `failure:null`. Evidence covers real two-user sign-in, V2 transport/ownership/CSRF guards, exact linked entries/budgets/transfers and replay, session-issued token scopes, thirteen-tool SDK discovery and shared mutation/read/replay behavior, V1 mutation guard, revocation/expiry/session-version invalidation. This establishes the tested local SDK client, not arbitrary external-client or n8n compatibility.
- Lead reports the final production build passed and reran HTTP six groups and authenticated browser six groups against that build using the disposable database. Reviewer inspected `artifacts/mvp/browser-results.json`: all six complete, twelve populated view/viewport geometries at 360/768/1440, no page errors, fixture cleanup true and `failure:null`. Inspected the actual browser assertions for 44px controls, persistence/export, retained conflict drafts, duplicate-safe retry after an unknown committed response, archive/restore/transfer deletion and an unavailable-read state that does not pretend finances are empty. These are Lead-executed checks and were not independently rerun by Reviewer.
- Reviewer visually inspected final `artifacts/mvp/overview-1440.png`, `accounts-360.png` and `transaction-error-360.png`: clear financial hierarchy, readable amounts, fully visible phone navigation, wrapped account actions and labeled retained-draft validation feedback. This is a representative visual review, not comprehensive rendered contrast or assistive-technology acceptance.

## Scoped acceptance and remaining limits

Final backend and frontend source review is clean within this MVP scope. Schema relation delete semantics match additive SQL (`NoAction`). Confirmed frontend corrections: export is disabled while writes have unknown outcomes or conflicts; the global unassigned-entry link selects the latest month containing unassigned history; chart points use actual elapsed date distance. Archived-entry editing has an explicit restore requirement, deleted-opener focus falls back to main, and mutation generation invalidates stale in-flight reads. No remaining source blocker found.

The reviewed source and final reported local production-build checks support this bounded manual-BDT account MVP. No remaining blocker found within the tested flows. Sure/CSV import, schema2 restore, bank synchronization, investment/liability valuation and multi-currency are outside this implementation. External n8n/client compatibility, full rendered contrast, genuine 200% zoom, screen-reader behavior and operational PostgreSQL backup/restore remain unverified. Real user finances received no test fixtures; only the dedicated disposable database was used for acceptance writes.
