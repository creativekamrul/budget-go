# Classification increment review — 8 November 2026

Independent Reviewer scope: shared V3 validation/service, tenant boundaries, metadata preservation and posted-money calculations. The parent coordinates implementation and runtime; this review does not establish complete Sure feature parity.

## Executed evidence

- `node tests/classification-unit.mjs`: five passing actual-source groups for pending/excluded balances, cash flow and budgets; invalid hierarchy/reference/kind snapshots; retained archived history; descendant budget spending; strict metadata validation.
- `node tests/workspace-unit.mjs`: six passing existing exact-money/account/transfer/date/history groups, adapted for complete V3 snapshot fields and optional command metadata.
- `node tests/server-acceptance.mjs --pure`: eleven passing actual-source/helper/official-SDK groups, including exact V2 projection and refusal of custom category kinds, with deliberately throwing database/auth sentinels. This establishes no persistence or cookie-session behavior.
- `node --env-file=.env.test-app tests/classification-acceptance.mjs`: seven passing groups against the parent's uniquely named migrated disposable PostgreSQL database. Covers hierarchy cycles and foreign references, metadata isolation/persistence, category rename preserving record IDs/money, omission-preserving updates and explicit clearing, invalid kind-change rollback, archive history/new-assignment policy, pending confirmation/exclusion reconciliation and legacy write refusal. Exact generated fixture users and dependent rows were removed. See `artifacts/classification/service-results.json`.
- `node --env-file=.env.test-app tests/workspace-acceptance.mjs`: nine passing existing PostgreSQL groups, including tenant isolation, exact CRUD/account assignment, atomic transfers, invalid-write rollback, same-revision concurrency, idempotent replay, actual SQL-failure rollback, scope/revocation/session-version checks and legacy association protection. Exact fixture cleanup completed. See `artifacts/mvp/service-results.json`.

No application database fixtures or migrations were executed by the Reviewer. Private environment contents and raw database connection errors were not recorded in evidence.

## Findings corrected during review

1. `budget_delete` fell through into category handling after deleting its row. Builder added the missing return.
2. Real custom-category transaction creation initially failed PostgreSQL's existing builtin-only `Transaction_category_valid` check. Builder added migration `20261108010001_classification_labels`, retaining builtin checks for null category references and allowing owner-linked custom categories. The corresponding budget check was amended. The parent migrated the disposable target and the classification suite then passed all seven groups.
3. V2 projection allowed an unassigned `both` category named Salary with default styling, losing its custom kind in an old-shaped export. Builder added an explicit rejection; the new pure regression passed independently.

## Authenticated HTTP and browser coverage

Reviewer extended `tests/workspace-http.mjs` to V3 with metadata REST/official-SDK equality, cross-owner archive rejection and V2 GET/POST downgrade refusal, preserving the existing authentication/replay/token tests. Reviewer extended `tests/workspace-browser.mjs` for the Home/rail shell and V3 export, plus real settings hierarchy/tag/merchant creation, category rename, archive/restore, pending-to-confirmed excluded metadata editing, reload persistence, note/status filtering and a custom parent budget. Browser cleanup is restricted to the generated fixture user's dependent rows. Both harnesses passed syntax checks. Parent executed HTTP acceptance: seven groups passed, including the added classification transport and downgrade guard; Reviewer inspected `artifacts/mvp/http-results.json` with null failure. Browser execution is in progress. The first run stopped at an incorrect Home-after-reload assertion because the URL retained the Accounts query despite client navigation; the harness now explicitly loads Home for that check. The first run reported exact fixture cleanup and no page errors. No complete browser or rendered inspection pass is claimed yet.

The Reviewer has not independently checked hosted deployment, external n8n compatibility, print output, true 200% zoom, assistive technology, provider connections, family ownership or full Sure parity. These checks do not imply those capabilities exist.

## Coordinator completion evidence

The coordinator completed the final production-build browser suite: eight groups passed with null failure, exact fixture cleanup and no page errors (`artifacts/mvp/browser-results.json`). This includes shared Reports totals, flagged-entry/transfer exclusion in the actual CSV, privacy redaction, classification settings and all four workspace views at360/768/1440. Explicit phone Settings label bounds were checked against the document client width after a CSS correction. The coordinator inspected desktop Home/Accounts/Reports and phone Transactions/Settings captures; the Designer also inspected desktop/tablet/phone workspace captures. Early white-on-white primary text and phone navigation layout were corrected. Final production HTTP7 also passed.

Build, lint, typecheck, Prisma generation/validation, unit25, pure/SDK11, isolated legacy PostgreSQL7 and main-app public4 passed. The reviewed additive migrations were deployed to the application database with an in-memory before/after fingerprint verifying original financial fields, account links, user revisions and session state unchanged. Read-only database check passed. Disposable database, private test environment files, test server and dedicated Chrome profile process were removed/stopped. The application remains running on127.0.0.1:3000. Full parity, print output, external n8n, true200% zoom and assistive-technology checks remain open.
