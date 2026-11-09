# V3 delivery roadmap

## Expanded objective: one-to-one installed Sure features

The user now requests the full design/feature/settings equivalent of their live Sure version. The MVP status below is historical progress, not the final scope. Use [live audit](SURE-PARITY-AUDIT.md) as the feature matrix and [architecture](SURE-IMPLEMENTATION-ARCHITECTURE.md) for dependencies. The first report increment at `/reports` is implemented with BDT periods/comparisons/activity/balances/CSV/print; full Sure parity is **not complete**. Next shared-domain work is workspace membership, category hierarchy/tags/merchants, currencies and typed asset/liability valuations. Do not substitute placeholder settings or silently drop provider/admin features.

Status: first MVP delivered locally, 8 November 2026. The user requested the MVP after reviewing the concept. Manual BDT accounts, linked entries, atomic transfers, monthly budgets, responsive production UI, versioned HTTP/MCP commands and JSON export are implemented. This is not full Sure parity.

## Delivered milestone

Slices0–2 are implemented within the MVP boundaries in PROJECT-BRIEF: bank/cash/mobile accounts with immutable opening balance/date/type; rename/archive/restore; preserved Unassigned legacy entries with explicit assignment; income/expense CRUD; atomic create/delete transfers; monthly built-in category budgets; real balance history; search/filtering; complete V2 export. UI, `/api/v2/workspace` and MCP workspace tools share the same service, revisions and request receipts. V1 writes/imports are guarded after account adoption.

Additive migration applied to the real app database with original transactions/budgets/user revisions verified unchanged. All financial fixtures ran only in a separately created disposable database, now removed. Actual checks/evidence: HANDOFF.md and REVIEW-MVP.md. User operational feedback is the next input, not a dependency blocking the delivered MVP.

Next candidates: V2 restore, real Sure/CSV import schema review, custom categories, recurring entries/rules and requested personal features. Bank sync, sharing, investments, debts and multi-currency remain separate decisions.

## Source-based gap map at kickoff (historical baseline)

| Area | Current source | Needed |
| --- | --- | --- |
| UI | Monthly Overview/Transactions/Budgets, evergreen ledger | Account-centric workspace; representative preview before expansion |
| Ownership | Auth.js User, private records and scoped tokens | Retain tenant boundaries; separate FinancialAccount entity |
| Money | BDT integer poisha, strict validation | Retain exactness; opening balances and account sign rules |
| Accounts | No financial account model | Bank/cash/mobile wallet; opening date/balance, archive and history |
| Transactions | Income/expense without account reference | Owned account links, atomic transfers, custom classification |
| Summary | Monthly income minus expenses | Account balances and, later, assets minus liabilities |
| Budgets | Fixed categories, per-user/month expense limits | Preserve rules, then custom categories and agreed allocation model |
| Service | Shared REST/MCP, user lock/revision; whole-state replacement per mutation | Targeted account-aware operations, safe retries and versioned payloads |
| Imports | Strict Budget Go v1 JSON whole-finance replacement | Preserve v1 meaning; explicit future CSV/Sure mapping and duplicate handling |
| Integrations | REST v1, 11 MCP tools, scoped tokens | Extend same service; actual external-client/n8n checks |

Reviewed source: `prisma/schema.prisma`, `lib/server/finance-service.ts`, `lib/server/http.ts`, `lib/server/token-service.ts`, `lib/server/mcp.ts`, `lib/finance.ts`, `lib/preview.ts`, `lib/use-finance.ts`. Independent Reviewer verified these gaps; no database writes or integration reruns were part of that review.

Reference scope: [Sure product overview](https://sure.am/) (accounts/assets/debts, transfers, classification/rules, budgets). No bank-provider coverage, investment pricing or upstream API compatibility is implied.

## Slice 0 — visual and architectural baseline (current)

Deliver `/concept` in the existing stack, updated design contract, source-based gap review and this roadmap. Fictional finances remain confined to the labeled concept and never enter PostgreSQL. Keep the authenticated ledger available.

Exit: inspect responsive renders/interactions, show the user the preview, record feedback before expanding the UI. Source checks are not user design approval.

## Slice 1 — financial accounts and linked entries

Add owned `FinancialAccount` records for bank/cash/mobile wallet, with names, BDT currency, opening balance/effective date and archival. Link income/expense entries to owned accounts. Expose list/detail and balances through shared service, REST and MCP.

Settle the versioned model/migration proposal first. Existing transactions have no account: never guess a bank or fabricate historical balances. Use user-reviewed mapping (for example a clearly named Legacy ledger) or an intentional unassigned legacy state. Preserve IDs and amounts. Archive retains history and blocks new entries. Use tenant-safe compound references; do not overload User or Auth.js Account terminology.

Exit: exact opening-plus-entry balances, owned-account validation, stale-write rejection, UI/REST/MCP equivalence and explicit v1 backup handling, tested against a disposable database.

## Slice 2 — transfers and trusted balances

One transfer identity, paired source/destination effects, one database transaction. Require same owner/currency, distinct accounts and a positive exact amount. Edits/deletes cannot leave half a transfer. Retried requests cannot duplicate funds. Exclude transfers from income/expense/budgets/consolidated cash flow. Reconcile history with opening balances and backdated entries; monthly surplus remains separately labeled.

Exit: atomic rollback, owner isolation, self-transfer rejection, concurrent/retried write behavior and balance neutrality. Balance adjustments must be distinguishable from ordinary spending/income.

## Slice 3 — daily-use replacement

Custom categories, search/filters, transaction editing, monthly category budgets and useful cash-flow reports. Agree refund, split, archived-category and rollover semantics before advertising them. Complete keyboard/mobile flows with real loading/empty/failure/conflict states.

Exit: actual accounts and daily finances can be managed without the concept. Opening balances are not income; no data is not a fabricated chart.

## Slice 4 — migration and personal extensions

Inspect a real Sure export schema before promising import compatibility. Validate, preview mappings, handle duplicates, require explicit confirmation and support recovery/export before importing. Prioritize requested recurring entries, rules, bills, goals, assistant actions or investments. Each needs bounded acceptance criteria.

## Decisions before slice 1 implementation

- Propose a versioned account-aware API/service; old v1 whole-state replacement must never erase new account links or transfers. Preserve or explicitly retire incompatible clients.
- Move routine operations to targeted normalized writes; preserve per-owner locking/revisions until finer concurrency has evidence.
- Specify idempotency keys for external creates/transfers: ownership, request fingerprint, result retention and replay/conflict behavior.
- Define balance as opening balance plus eligible dated effects; agree backdating/opening-date rules, signed adjustments and audit needs. Liabilities need a separate sign convention.
- Keep BDT-only initially. Multi-currency requires currency exponents, exchange-rate provenance and valuation dates; never sum unlike currencies.
- Version backups deliberately: v1 replacement cannot silently detach/delete new entities. Document upgrade, restore scope and downgrade limitations.

## Open product inputs

Most-used Sure workflows, import requirements, preferred theme(s), sharing needs and first custom feature are not yet specified. Continue safe baseline work using brief assumptions; resolve each before committing the relevant schema or feature scope.
