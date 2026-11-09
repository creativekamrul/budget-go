# Quality checks

## Accounts, statements, rules and platform completion — 9 November 2026

Run `npm run test:unit` including the new finance six and workbench seven pure groups; main lint/typecheck and Prisma validation; then the production build. Run guarded `test:finish-finance`, `test:workbench` and `test:platform` sequentially against the explicitly named disposable PostgreSQL database. Their actual service results at this checkpoint are finance seven, workbench eight and platform five groups passed; finance plus legacy service regression totals forty groups. Fixture cleanup must finish before the next suite. No acceptance writes belong in the application database.

Workbench service checks cover stage-without-posting, concurrent request replay, stable imported row IDs after deliberate deletion, selected duplicate acceptance, exact owned existing-entry links, live closing metadata without adjustments, read-only rule preview, amount/account/date preservation, stale revision and paused/foreign refusal, corrupt stored JSON and reference validation. Pure CSV checks cover actual UTF-8 size, quoted commas/newlines/escaped quotes/BOM, 1,000-row limit, Bangla digits, exact poisha, explicit ISO/DMY conventions and debit/credit ambiguity.

Run `test:finish:browser` using the isolated app/browser profile and inspect actual360/768/1440 captures, form retention, unknown-response retry and labeled control targets. Observed completion evidence: unit57, pure/official-SDK12, service53, production HTTP/MCP24 and production browser8 passed, together with build/lint/typecheck/Prisma validation and main public4/read-only database checks. Browser evidence includes actual phone CSV/rule/restore forms,44px controls/16px inputs, no page errors and lost-response restore retry. Platform tests restore all20 nonempty models and prove atomic rejection, tenant/identity preservation and shared password throttling. Run HTTP suites sequentially, including test:workbench:http; workspace HTTP also requires explicit TEST_APP_URL. Record fresh observations rather than relying on these milestone counts. See HANDOFF and REVIEW-FINISH for subsequent screenshot fixes, deployment and cleanup. Do not infer external n8n execution, automatic rules, PDF/OCR import, alerts, full Sure parity, true200% zoom, screen-reader or infrastructure disaster recovery from these checks.

## Core transactions and planning — 9 November 2026

`npm run test:unit` includes44 groups (legacy7/workspace6/classification5/reports8/automation5/docs4/core9). Run pure/SDK11, Prisma generate/validate, lint/typecheck and production build. Gated `test:core` covers atomic selected edits/deletion, exact split allocation/provenance, budget-copy refusal on a populated month, recurring calendar/ownership/recording/replay, template history, capacity and rollback. `test:core:http` checks real Auth.js, REST and official MCP19. `test:core:browser` exercises actual split validation and lost-response retry, bulk forms/deletion confirmation, persisted targets/copy, recurring create/edit/pause/archive/record, phone split save and legacy hierarchy allocation/report totals at360/768/1440.

Keep every database fixture in the guarded disposable database and run suites sequentially. New recurring/split tables must be cleared by exact fixture-owner IDs before account cleanup. Recurring forecasts are not ledger postings; verify GET/create/update does not generate money. Re-recording a date must never duplicate a transaction, including after the linked entry is deliberately deleted. Split totals, original first-part ID and metadata are financial invariants. Overlapping parent/child limits must count once even when older budgets have null category IDs; category renaming must not infer historical label mappings.

Use an isolated browser context/profile to preserve the user's session, inspect actual captures and test internal modal scrolling on phones. Schema3 financial export excludes planning definitions/history/targets; complete recovery requires a database backup. These checks do not establish full Sure parity, a background recurring scheduler, external integrations, real200% zoom, screen-reader or physical-print acceptance.

## Bangladesh automation, documentation and hierarchy increment

Run `npm run test:unit` (legacy7/workspace6/classification5/reports8/automation5/docs4), server pure/SDK11, Prisma generation/validation, lint/typecheck and production build. New gated suites: `test:automation` verifies staged delivery replay, concurrent acceptance, duplicate review, ownership, paused sources, raw-text opt-in/purge, OTP rejection, aggregate rollback and cursor pagination; `test:automation:http` verifies actual Auth.js, bearer REST and official MCP SDK17 transport. `test:automation:browser` exercises source settings, Bangla SMS preview/intake, reviewed acceptance with a committed-but-lost response, duplicate ignore, actual saved locale/accent/density/calendar/default-status behavior, docs search/copy/OpenAPI/n8n downloads and phone/tablet/desktop views.

Use only the existing guarded disposable database helper and separate3100 app/browser context. Run DB suites sequentially and clean exact generated fixture users. Measure native checkbox targets through associated clickable labels; inspect actual viewport captures for cropped text, since page overflow alone is insufficient. Scroll to the top before full-page captures of fixed navigation. Do not infer external n8n execution, bank-specific parser certification, automatic phone/mailbox access, full Sure parity, real200% zoom, screen-reader or physical print validation from these checks. Repository/in-app examples and generated local references are checked by `tests/docs-contract.mjs`.

## Sure shell and classification increment

`npm run test:unit` now includes legacy7, workspace6, classification5 and reports7 actual-source groups. Run lint/typecheck, Prisma generate/validate, server pure/SDK11, isolated PostgreSQL classification7/workspace9/legacy7, HTTP7 and browser8. Classification service checks cover hierarchy/tenant boundaries, rename identity/money preservation, metadata omission/clearing, archive retention and posted flags. Browser checks exercise real settings creation/edit/archive/restore, pending-to-confirmed excluded entries, metadata reload/filtering, parent budgets, reports totals/CSV/privacy and responsive shell geometry at360/768/1440. Native checkbox hit targets are measured through their actual clickable labels; other controls remain individually checked at44px.

Inspect screenshots separately: passing page geometry does not detect cropped labels or low-contrast actions. First visual review caught white-on-white primary text and phone Settings cropping; source corrections require fresh captures. Use the dedicated browser profile/context to protect the user's real session. Apply reviewed additive migrations only after isolated acceptance; `scripts/apply-classification-migration.mjs` compares original financial fields, links, user revisions and session state around deployment and logs no record contents. It does not replace operator backups or prove full Sure parity.

## Sure-parity Reports increment

`npm run test:unit` includes reports6 calculation/date/CSV groups (19 groups including legacy7/workspace6). Run lint/typecheck/build for the new authenticated route. Browser checks use representative disposable data: posted income/expenses including legacy, future entries, internal transfers and archived accounts; inspect period controls, custom invalid/valid ranges, previous/next, report totals and downloaded CSV, section keyboard controls, no page overflow and44px targets at360/768/1440. Printing opens/restores report sections through beforeprint/afterprint; actual print output must be separately verified before claiming it. No full Sure parity follows from these checks.

The CUA in-app browser shares cookies across ports on the same hostname. Do not sign into a fixture at127.0.0.1:3100 in that browser while preserving a real127.0.0.1:3000 session. Use a separate browser context/profile or a deliberately isolated hostname/configuration. The first Reports check replaced the local app cookie and required re-sign-in; financial records and the separate Sure host were unaffected.

## First MVP acceptance

- `npm run lint`, `npm run typecheck`, `npm run test:unit` (legacy7 + workspace6), Prisma generate/validate, `node tests/server-acceptance.mjs --pure`, production build and read-only `npm run db:check`.
- New guarded disposable-database checks: `tests/workspace-acceptance.mjs` (service), `tests/workspace-http.mjs` (real Auth.js/REST/SDK), `tests/workspace-browser.mjs` (authenticated UI persistence and failures). All refuse unsafe database targets; HTTP/browser require the separately configured port3100 app. They never load the real `.env` as a test target. Provision with the existing dedicated helper only when authorized, migrate that target and use `scripts/run-test-app.mjs` for its server.
- Run service, HTTP and browser fixture suites sequentially: each requires no preexisting users. Their private test configuration must include the real app URL only as a comparison reference. Do not log or commit it. Remove the disposable database/configuration afterward.
- Browser evidence covers empty state, account/entry/transfer/budget forms, exact persisted values, export, filter/reset, retained conflict drafts, a committed save with a dropped response followed by duplicate-safe retry, responsive/long-label layouts, touch targets, archive/restore/delete focus and unavailable reads without fake empty replacement.
- These checks do not establish arbitrary external MCP/n8n compatibility, hosting, operator backup/restore, true200% zoom or full screen-reader/contrast review. Record actual results in HANDOFF and REVIEW-MVP.

## V3 concept milestone

The new direction is specified in [brief](PROJECT-BRIEF.md), [design contract](DESIGN-CONTRACT.md) and [roadmap](V3-ROADMAP.md). This milestone adds an isolated `/concept` route, not financial account persistence.

- Run installed lint/type/unit/build commands and safe V2 checks below; preserve the actual ledger and authentication guards.
- With Next.js at port3000 and a dedicated Chrome CDP browser at port9222, run `node artifacts/concept/check.mjs`. It blocks all API requests and checks 4 views at 360/768/1440, page overflow, 44px controls, range/keyboard/disclosure behavior, account/search filtering, empty reset, budget statuses, no financial WebStorage and reset on reload. It writes screenshots and `artifacts/concept/results.json`.
- Inspect actual screenshots; no overflow alone does not prove readability, accessible contrast or design quality. Genuine 200% zoom, screen-reader review and all-state contrast remain separate checks.
- No test fixtures against the real database. New account/transfer/schema/backup functionality requires its own disposable-database acceptance in later milestones.

## Existing V2 baseline

Run commands from the installed package scripts; record actual results in [handoff](<HANDOFF.md>). A checklist is not a pass. V1 preview/local-storage artifacts remain historical and cannot establish current server behavior.

## Safe without database mutation

- `npm run lint`, `npm run typecheck`, `npm run test:unit` (money/backup utilities, including legacy storage-helper regression; not PostgreSQL persistence).
- `npm run db:generate`, `npm run db:validate`: schema/client checks, not connection/migration execution.
- `node tests/server-acceptance.mjs --pure`: actual-source validators/auth boundaries/scrypt and official SDK protocol transport. Database/auth entrypoints are deliberately replaced with throwing sentinels; this is NOT tenant, session or persistence acceptance.
- `npm run build`: real Next.js production artifact. On this Windows harness, Next/tsx subprocesses may require explicit wider access. Do not replace an EPERM test with a mocked success.
- `npm test`: live unauthenticated login/settings guards, dark-only rendering on light OS at 360/768/1440, keyboard order, no browser finance storage, actual REST/MCP unauthorized responses. Needs app port3000 and dedicated external CDP browser port9222; no real user credentials/finance writes.
- `npm run db:check`: read-only configured database connection/model queries after applying migrations. Empty credentials, missing tables or an unavailable server must fail honestly with sanitized output.

## Authorized dedicated PostgreSQL acceptance

Read [V2 review](<REVIEW-V2.md>) and [acceptance harness](<../tests/server-acceptance.mjs>) before execution. Database branch needs an explicitly authorized EMPTY disposable `TEST_DATABASE_URL`, separate from the app database, plus `BUDGET_GO_ALLOW_TEST_WRITES=1`. Never point at real finance data; do not weaken the safety gates. A harness being authored or passing syntax checks is not database evidence.

Establish two-user isolation across reads/CRUD/summary/full replacement, owner-ID injection rejection, exact poisha and validation, one-success/one-conflict concurrent revision writes, rollback after real SQL failure, read-only scopes, revocation/expiry/session-version/inactive-user rejection. Cleanup only generated fixture-account IDs.

## Authenticated HTTP/browser/external-client gates

Using a separately configured disposable app/test database and accounts:

- Auth.js sign-in/out, invalid credentials, CSRF, trusted Host/Origin, disabled/version-invalidated sessions; no raw errors, secrets or financial data in shared logs/caches.
- Browser transaction CRUD/filter/date changes, budget CRUD/thresholds, reload persistence, export actual download, reject invalid imports and confirmed whole-account replacement. Preserve drafts while pending/failed/conflicted; reload inside modal must not require discarding the draft. Reload after unknown network outcome before retry.
- Cross-account REST/MCP IDOR, bearer no-cookie-fallback, no bearer token mint/revoke/account management, scoped tokens, expiry/revocation while concurrent requests run.
- Actual SDK client against deployed endpoint with initialized notifications/read/write/error paths; an external MCP client and n8n read/write flow before claiming compatibility.
- Actual authenticated Overview/Transactions/Budgets/dialog/settings at360/768/1440, no overflow,44px targets, body14/helper12/input16, dark-only on light OS, focus return, keyboard errors, loading/empty/success/failure states. Test reduced motion/transparency. True200% zoom and screen-reader use require real evidence, not emulated viewport proxies.

## Recorded V2 acceptance

- [Service results](<../artifacts/review/service-results.json>): seven actual PostgreSQL groups, including tenant isolation, optimistic concurrency and real SQL rollback; Lead executed, Reviewer inspected evidence.
- [HTTP results](<../artifacts/v2-auth/http-results.json>): nine real Auth.js/REST/official-SDK-MCP groups, including cookie/bearer lifecycle and browser persistence. [Browser report](<../artifacts/v2-auth/browser-results.json>): 15 authenticated captures at360/768/1440, no page errors. Disposable fixtures/database/server/private test files removed; app database received no fixtures.
- Final tablet-header/footer CSS adjustment has separately bounded [source-markup DOM-replica geometry](<../artifacts/design/chrome-replica-results.json>); this is not a full authenticated postpatch rerun. Final production build/served-asset status is recorded in the handoff.
- Actual external n8n workflow, hosted HTTPS, genuine200% zoom, screen-reader/full-state contrast, outage recovery and broader stress/security coverage remain unverified. Do not interpret the checklist as exhaustive passing coverage.

Production operations (HTTPS, database backup/restore, deployment, monitoring and credential rotation) are separate operator responsibilities and must not be implied by source/test completion.
