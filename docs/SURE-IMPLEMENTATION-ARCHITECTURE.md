# Sure feature-parity implementation architecture

Status: source and live-feature architecture audit, 8 November 2026. This document describes the dependencies for the user's requested feature-for-feature replacement. A first Reports increment is being built separately; it is not full Sure parity. The source constraints below describe the delivered MVP baseline before parity work.

## Evidence boundary

The parent agent inspected the user's opened, authenticated Sure instance without saving changes. Its account menu identifies **v0.7.2-alpha.12**, commit **f51b24096795a15f3d0aae6c860398e8470bfe0f**. This is the parity reference version; a public website or later upstream release must not silently expand or replace that target.

Observed by the parent:

- Primary navigation: Home, Transactions, Reports, Budgets.
- Dashboard: Assets/Debts sidebar tabs, grouped accounts, privacy toggle, Net Worth, Balance Sheet, Cashflow and Outflows sections; section collapse, resizing/reordering controls and a time-period control.
- General settings: Accounts, Bank sync, Preferences, Appearance, Profile Info, Security.
- Transaction settings: Categories, Tags, Rules, Merchants, Recurring, Statement Vault.
- Advanced settings: AI Prompts, LLM Usage, API Keys, MCP, Debug, Self-Hosting, Imports, Exports, SSO Providers, Users.
- More: Guides, What's new, Feedback.

### Confirmed live forms and workflows

| Surface | Controls and behavior observed in the live UI |
| --- | --- |
| Account families | Cash, Investment, Crypto, Property, Vehicle, Credit Card, Loan, Other Asset and Other Liability; account currencies/opening date, institution/domain, notes and exclude-from-reports |
| Account-specific forms | Cash subtypes checking/savings/HSA/CD/money market; investment regional/retirement subtypes; loans original balance, fixed/variable/adjustable rate and term/subtype; card available credit, minimum payment, APR, expiry and annual fee; property type/year/area with Value/Address wizard; vehicle make/model/year/mileage/unit |
| Account details | Activity/Statements, period chart, daily balances, dated New balance valuation, edit balance, sharing and deletion controls |
| Transactions | Upcoming, date grouping, 10–100 row pagination, account/date/type/status/amount/category/tag/merchant filters; status confirmed/pending and amount equals/greater-than/less-than |
| Transaction edits | Bulk duplicate/edit date/name/category/merchant/tags/notes/delete; detail notes/tags/merchant, protect from sync, exclude/one-time, amount-conserving split, transfer/debt matcher and mark recurring |
| Attachments and statements | Transaction attachments: up to10 images/PDFs, 10 MiB each. Statement Vault: PDF/CSV/XLSX up to25 MiB, inbox or account destination |
| FX transfers | UI can convert using a rate or calculate a rate from source/destination amounts |
| Classification | Categories have name, color, icon and optional parent; tags have name/color; merchants have name/color/website/logo |
| Rules | Conditions on name, amount, type, merchant, category, details, notes and account, including condition groups; actions set category/tags/merchant/name/investment activity label, exclude, transfer or AI category/merchant; effective date, run history and manual apply |
| Budgets | Expected income and total-spend setup, historical/AI suggestion, copy prior plan, category allocation, uncategorized allocation, average/median and recent-category transactions. A child with an empty allocation shares its parent limit. No rollover control was observed |
| Reports | Monthly, quarterly, YTD, six-month and custom periods; print, CSV and Google Sheets instructions; income/expense/net/savings/budget-percentage summaries, monthly table/averages/activity/net worth |
| Preferences | Locale, timezone, date format, account sorting, country, budget start day1–28, base/additional currencies, family default sharing and preview flag |
| Appearance | Light/dark/automatic theme, two-column dashboard, outside-click behavior and split grouping |
| Profile/security | Photo up to5 MiB, name/email, household invitation, reset/delete controls and MFA |
| API/MCP | API key creation/last-used/read-write/active/revoke controls. MCP UI exposes an OAuth authorization flow and URL; it is not only manual bearer configuration |
| AI/quotes/sync | Built-in assistant versus external remote agent; OpenAI/Anthropic/custom endpoint, model/JSON-mode/token budgets, three prompt roles and usage/cost filters; Twelve Data/Yahoo/MOEX FX choices, nine securities-provider choices; autosync daily time and pending behavior |
| Operator surfaces | Bank sync lists17 provider options (names belong in the main live inventory); onboarding Open/Closed/Invite and email confirmation; cache clear; Guest/Member/Admin/Super Admin labels, families, SSO/server-restart controls and debug filters |
| Data migration | Sure NDJSON, Mint, Actual, QIF, YNAB and AI-document import paths; raw transactions/trades/accounts/categories/merchants/rules import tools; export collections include accounts/balances/transactions/trades/categories/tags/rules with a partial-CSV-restore warning |

These are confirmed **UI observations**, not evidence that every mutation/provider/background task was executed. The parent inspected without saving changes. Exact role inheritance, pending-item accounting, provider credentials/coverage, AI execution, calculation edge cases and recovery/error behavior still require targeted implementation research and tests. No user account names, balances, email addresses, secrets or stale financial records are copied into this architecture note.

## Current code: reusable foundations

The actual checkout uses Next.js App Router, TypeScript, Tailwind 4 and existing Radix/shadcn-style UI. Keep this stack; the request is our own implementation, not an implicit rewrite in Sure's upstream framework.

- `lib/server/finance-service.ts`: authenticated actor, active/session-version/token rechecks, tenant-scoped access and owner row locking. These are useful primitives for all subsequent domain services.
- `lib/server/workspace-service.ts`: targeted writes inside PostgreSQL transactions, revision conflict checking, canonical-command fingerprints and persistent request receipts. Current matching-request replay returns current state without reapplying; preserve that guarantee when adding operations.
- `lib/server/http.ts`: trusted Host/Origin checks, session/bearer precedence, strict request envelope/body limits and no-secret error handling.
- `lib/server/token-service.ts`: hashed expiring/revocable bearer tokens; session-only credential administration. Keep tokens distinct from external provider credentials.
- `lib/workspace.ts`: exact current BDT calculations, snapshot/command validation, account ownership/reference validation and transfer-neutral cash flow.
- `tests/workspace-acceptance.mjs`, `tests/workspace-http.mjs`, `tests/workspace-browser.mjs`: existing behavior-focused service, real-cookie/SDK and actual-browser checks with disposable-database gates. Extend their real guarantees rather than substituting fake success.

## Current constraints that full parity must replace deliberately

| Current source fact | Consequence for parity | Implementation direction |
| --- | --- | --- |
| `FinancialAccount.kind` is only bank/cash/mobile; currency is literal BDT (`lib/workspace.ts:5`) | Cannot represent the nine observed account families, subtype metadata or multiple currencies | Add classification, account family/subtype and typed metadata plus currency; keep current mobile wallets mapped intentionally rather than dropping them |
| Money fields are integer poisha exposed as safe JS numbers | Correct for current BDT MVP; cannot silently become arbitrary currency/valuation arithmetic | Keep integer minor units per currency; use precise decimal/rational exchange rates and explicit valuation dates; version payloads where representation changes |
| `Transfer` has one positive amount for both accounts | Same-currency internal transfer works, cross-currency transfer does not | Model source and destination money separately when required, with FX provenance and optional fees; retain one logical atomic transfer |
| Opening balance/date/type are immutable | Observed dated valuations/edit balance and family-specific forms need more than rename/archive | Add audited dated valuations/adjustments, family-specific details and report-exclusion rules; define what balance edits mean for transaction history |
| Transaction category and budget category are strings validated against `lib/preview.ts` built-ins | Custom categories, renames, hierarchy, merge and rules cannot be safely added by just making a textbox | Tenant-owned Category IDs, parent relationship and archive/merge policies; map existing strings explicitly and preserve labels/IDs in versioned backups |
| No Merchant, Tag, Rule, Recurrence, Statement, ImportJob or ExportJob entities | Observed classification, rule/recurrence, attachment/vault and import/export workflows have no durable implementation | Add owned entities and relationship constraints, not settings placeholders |
| Every finance record belongs directly to `User` | Private user isolation exists; observed family sharing/invitation and Guest/Member/Admin/Super Admin roles do not | Establish Workspace/Family + Membership and a verified permission matrix; preserve User as identity and separate operator-wide power from family administration |
| `snapshot()` loads every account, transaction, transfer and budget; `validateWorkspace()` caps 10,000 entries and 2 MiB | Large imports, statement archives and richer reports should not require shipping the complete ledger after every action | Add cursor-filtered query endpoints and aggregate/report reads; store files separately; retain V2 bounded contract or introduce a documented successor |
| `FinanceWorkspace` has four local views in one client component | Direct linking, account detail, report navigation and nested settings need persistent route structure | Introduce shared app/settings layouts and route-based pages; keep interaction state close to each workflow |
| Only finance:read/finance:write token scopes | Enough for MVP, too coarse for provider credentials, admin users, documents or AI configuration | Define capability boundaries before exposing new privileged operations; financial tokens must not become admin tokens |
| MCP currently authenticates only manually configured bearer tokens | Cannot reproduce the observed MCP OAuth authorization flow | Add standards-compliant authorization/discovery and explicit client grants while preserving current bearer compatibility; do not disguise static-token configuration as OAuth |
| Theme/locale/date behavior is mostly fixed in client code | Observed persisted theme, family currency/sharing, budget-start and privacy/layout settings cannot be replicated consistently | Separate user preferences from family defaults and saved dashboard layout; derive formatting and period boundaries from explicit preferences |
| No transaction status/splits/provenance/protection fields | Upcoming/pending, conserved splits, sync protection, debt matching and rich bulk editing lack domain semantics | Add entry lifecycle, allocation children, source/provenance and manual-override policy; specify their financial/report effects before enabling writes |
| V2 export exists; no V2 restore | A larger system needs tested recovery and migration before depending on new integrations | Versioned export/import preview, strict validation, explicit replace/merge semantics and reversible staging; preserve receipts/security entities intentionally |
| No durable job runner or job table | Recurrence, bank sync, parsing, price refresh, AI and large imports cannot be reliable request-side fire-and-forget work | Durable jobs/outbox with retry policy, progress, cancellation and per-source deduplication |

## Proposed domain boundaries

These are implementation proposals inferred from the observed feature surface, not unverified descriptions of Sure's internals.

1. **Identity and workspace:** User, Workspace/Family, Membership, capability policy, profile/MFA/security and user/workspace preferences. Role labels are observed; exact role inheritance and access to another family's records still need explicit verification. Operator administration must remain separate from ordinary family membership.
2. **Accounts and valuation:** Asset/liability classification, nine account families, subtypes and their typed details; currency, institution/domain, notes, report exclusion, share policy, opening position, activity/statements, adjustments and dated valuations. Investment/Crypto need position/trade/price representation; credit/loan fields need credit/debt semantics. Net worth is assets minus liabilities at a stated valuation date, distinct from monthly cash flow.
3. **Transaction organization:** Owned category hierarchy/color/icon, merchants/color/site/logo, tags/color, notes, confirmed/pending status, one-time/exclusion flags, source protection, split allocations, attachments, transfer/debt matching and bulk operations. Splits must conserve the parent's amount and be counted once in budgets/reports. Manual overrides protected from synchronization need explicit merge precedence and audit history.
4. **Automation:** Versioned rule condition groups/actions, effective date, execution preview/history and manual apply; recurrence definitions with generated occurrence identities. AI categorization/merchant actions are privileged data-processing jobs, not client-side labels. Rule and recurrence retry must never duplicate financial effects.
5. **Planning and analytics:** Expected-income/total-spend budget plan, category/uncategorized allocations, parent-limit inheritance, copy prior and history/AI suggestion; period boundaries incorporate budget start day1–28. Report filters, summary/monthly/activity/net-worth views, print/CSV and dashboard privacy/arrangement consume the same accounting semantics. No rollover was observed; do not introduce it as claimed parity. Confirm pending/scheduled/excluded/one-time effects before asserting identical totals.
6. **Data operations:** Import staging/mapping/validation/review/commit, export jobs and statement/transaction-file metadata. Transaction attachments and Statement Vault have different count/size/type limits and inbox-versus-account destinations. Files belong outside the 2 MiB ledger JSON; derive every read/download from ownership and avoid permanent public URLs. A configured PDF/CSV/XLSX upload is not proof OCR/AI parsing works.
7. **Connections and intelligence:** Provider connection, encrypted secrets, sync schedule/cursor, pending-source reconciliation, item deduplication, FX/security quote providers, built-in assistant and external remote-agent configuration. Persist prompt roles/model/custom endpoint/JSON mode/token budgets and usage/cost attribution. Live provider/LLM access requires real configuration and bounded tests, not a simulated Connected badge.
8. **API, MCP and operators:** Versioned HTTP/query APIs and focused MCP tools share the same services. API keys retain read/write lifecycle and last-used metadata; MCP additionally needs the observed OAuth authorization/discovery/grant flow. SSO, onboarding/email confirmation, user/family administration, diagnostics/cache/restart features require explicit operator capabilities and audited actions.

## First domain foundation: workspace, classification and currency

These three concerns should be designed together before broad schema expansion. They are the next architectural priority even while the bounded Reports increment ships using the current MVP data.

| Foundation | Concrete design proposal | Migration/verification requirement |
| --- | --- | --- |
| Workspace ownership | Introduce Workspace/Family and Membership; keep User as identity. New actor context contains both authenticated user ID and verified workspace ID/capabilities. Preserve a default private workspace for every existing private-user ledger | Server verifies membership for selected workspace; no automatic sharing. Compound financial references use workspace ownership. Current tokens bind to their existing private scope; new shared tokens do not inherit operator access |
| Classification | Add owned stable Category IDs with parent/color/icon and lifecycle; Merchant and Tag IDs plus joins. Keep display names separate from references and preserve existing built-in labels through an explicit mapping | Validate same-workspace references and acyclic parents. Rename must not detach transactions/budgets/rules/import mappings. Define archive/delete/merge and fallback semantics from the actual UI before enabling those controls |
| Currency and account model | Explicit per-account currency and minor-unit exponent; explicit base/additional workspace currencies; account family/subtype/classification and metadata. Dated FX rates and valuations are separate facts with source/provenance | Keep old BDT values unchanged. Never sum unlike currencies or relabel poisha as another currency. Cross-currency transfers conserve each side in its own denomination, with an explicit recorded rate and fees if required |

The lock/revision owner moves from User to Workspace only as part of the tested ownership migration. Request receipts must remain scoped to both the financial workspace and the originating client/actor identity so concurrent household users cannot collide on IDs. Current membership/scope must be rechecked before replaying a saved receipt. User preference changes should use a separate version boundary and should not stale every family financial write.

The first report page can safely expose current BDT income/expense/cash-flow/category totals and export/period controls now. It must label its current coverage; reports over nine account families, valuation-based net worth, multi-currency conversion, pending statuses, splits or inherited budgets cannot be declared equivalent until those domains exist.

## Dependency-based build order

Full parity remains the target. The sequence prevents one feature's temporary schema from blocking another.

| Stage | Deliverables | Why it comes here |
| --- | --- | --- |
| A — reference and shell | Version-pinned live feature inventory, route map, shared application/settings layout, representative Sure-matching screen/states | Gives concrete acceptance targets and avoids mistaking placeholder navigation for parity |
| B — domain foundation | Workspace/member/capability model, stable Category/Merchant/Tag IDs and currency/account-classification contract; persistent preferences and admin separation | Establishes ownership and references before new pages accumulate incompatible data models |
| C — organization and transaction lifecycle | Classification CRUD/hierarchy, additive legacy mapping, rich detail/editor/filtering/pagination, confirmed/pending, notes/protection/exclusion/one-time, exact splits and bulk semantics | Rules, reports and import mapping require durable classification and explicit entry lifecycle |
| D — complete financial model | Nine account families/subtypes, typed details, currency/FX, dated balance edits/valuations, debt matching, cross-currency transfer rules, positions/trades | True net worth/balance-sheet/report parity depends on this model |
| E — budgets/reports/dashboard | Expected-income/spend plans, inherited category limits, copy/history suggestions, full report aggregations, print/CSV, privacy and saved dashboard arrangement | Must consume correct classification, valuation, status and period semantics; bounded initial Reports delivery can precede full parity |
| F — migration, files and automation | Successor restore, inspected Sure NDJSON and other source adapters, recurrence/rule execution, attachment/vault storage and durable jobs | Required before importing substantial history or enabling unattended data generation; partial CSV is not a complete backup |
| G — providers/AI/admin | Seventeen inspected bank-provider choices, FX/security quote providers, built-in/remote agents, AI prompts/budgets/usage, MFA/SSO, OAuth MCP, users/families and operator tools | Depends on ownership, jobs, secret storage and tested failure/retry boundaries; actual external support requires configured provider access |

Stages can have independent implementation work, but dependencies cannot be bypassed by rendering inactive pages. Newly observed features should be inserted into the first stage where their data and permission dependencies are satisfied.

## Migration and compatibility rules

- Do not alter the user's Sure records during inspection. Stale data is useful as read-only UI evidence; it is not authorization to delete, resync, import, update credentials or submit financial changes.
- Preserve Budget Go's existing finances and identifiers. Add new entities/nullable columns, validate/backfill with an explicit mapping, then tighten constraints only after source/backup compatibility is established.
- Keep existing private-user ownership until a tested workspace migration explicitly transfers it; never use a new owner ID supplied by a browser as authorization.
- Preserve V1 guards and V2 meaning. New category IDs, currencies or transfer representations should not be smuggled into a schema whose strict validator rejects them. Add a successor version/adaptor and document old-client behavior.
- Keep request receipts valid for old commands through contract changes, or retain the old canonical payload interpreter. Reinterpreting an existing receipt under a changed schema could break replay guarantees.
- Prefer per-domain revisions for preferences and background job metadata so changing appearance does not unnecessarily conflict with a financial write. Financial multi-record operations still need a consistent transaction/revision boundary.
- Define deduplication identities for bank items/import rows/recurrence occurrences separately from user request IDs. An import re-run is not equivalent to replaying one browser click.
- Export original currency amounts, classification identities, links, valuations and source provenance. Restore semantics for provider credentials, API tokens and request receipts must be explicit; a finance export should not expose secrets.

## Acceptance contract for each parity feature

A feature is complete only when its real workflow, persistence and relevant failure states match the inspected reference sufficiently to satisfy its recorded criteria. A title, settings link or disabled control is not completion.

- Record the reference version, route, observed controls and important states. Separate behavior actually inspected from source research, inference and unavailable provider paths.
- Add/update the domain schema and shared validation/authorization before UI and MCP writes. Test owner isolation and privilege boundaries wherever new entities are introduced.
- Use an authorized disposable PostgreSQL target for finance/file/job fixtures. Cover database rollback, concurrency, duplicate retry, category/tag/merchant references and any scheduled side effect.
- Verify the browser at representative desktop/tablet/phone sizes, including populated/empty/loading/error/conflict states, keyboard focus and accessible disclosure of chart values.
- Verify HTTP and the actual official MCP SDK against the same data/service. Provider/LLM mock checks establish only the simulated case; live compatibility requires a real configured provider and bounded authorized activity.
- Mark reference features as implemented, partial, external-configuration dependent or unverified in the parity inventory. Never turn untested external behavior into a blanket one-to-one claim.

## Read-only audit outcome

The current MVP can be extended without discarding its tested auth, transaction and retry foundations. The required changes are substantial because the existing BDT/private-user/snapshot model deliberately excluded most of the inspected settings surface. The correct path to the requested one-to-one product is to evolve those domains and verify feature-by-feature against this installed Sure version, retaining our own API/MCP and identity.

No application source, schema, database or running service was changed by this architecture audit. Only this planning document was created. No tests were run because no implementation was changed.
