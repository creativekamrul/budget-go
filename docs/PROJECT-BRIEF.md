# Budget Go — personal finance workspace

## Current direction — V4, 9 November 2026

### Public beta release

The user now authorizes a public GitHub project under MIT, a simple GitHub Pages product/documentation site, and v1.0.0 beta packaging (SemVer1.0.0-beta.1). This supersedes earlier GitHub deferral. Deliver versioned GHCR images, two Compose installation options (bundled persistent PostgreSQL or a supplied external connection), explicit migrations and documented backup/upgrade/recovery steps. Never publish private configuration, financial records or local screenshots. Pages is static documentation; the finance application remains self-hosted. Alert connections remain deferred.

### Active build — complete manual finance workflows

The user authorized all five next areas: manual BDT account families/net worth and dated valuations; reversible corresponding-entry transfer matching; mapped CSV staging and closing-balance reconciliation; manually previewed classification rules/run history; profile/password/session controls and full supported-domain backup/restore. Alerts and GitHub connection remain deferred. Keep the historical milestones below as context. Source implementations use V4 workspace/workbench with existing V3 planning/automation; all share one revision. Profile/security/full backup require browser sessions and are not bearer/MCP tools. Full restore preserves current identity/authentication and receipt tombstones and atomically validates/replaces supported owner data. Broader native currency/FX/security-price/provider/household/file/AI parity remains open.

### Active build — core finance workflows, 9 November 2026

The user explicitly deferred alert connection work and asked to finish the application. Leave existing alert features available, but spend this milestone on complete everyday finance workflows: selected transaction bulk edits/deletion, exact amount-preserving transaction splits, recurring bill/income schedules and deliberate due-occurrence recording, monthly income/spending targets and copying prior category budgets into an empty month. Implement real UI/API/MCP and keep repository/in-app documentation aligned. This is core-app progress toward the full Sure inventory, not a claim of finished parity.

Recurring forecasts never enter financial balances until explicitly recorded; no background auto-posting is introduced. Schedule occurrence identities prevent repeated recording even with fresh command IDs. Splitting preserves total poisha, account/date/type and status/metadata; the first split part retains the original transaction ID, other parts receive new IDs, and the original form remains in read-only split provenance. Bulk operations are atomic and owner-scoped. Budget copying must never overwrite a populated target month silently.

### Product priority — Bangladesh automation and usable documentation

The user's primary reason for building this application is recording Bangladesh bank and mobile-wallet activity from emails/SMS without relying on bank APIs. Third-party n8n workflows or AI agents extract candidate data and submit it through the authenticated API/MCP. Treat extraction as untrusted input: ingest into an owned review inbox, detect exact replay and possible duplicate financial activity, then deliberately accept a complete validated draft into the shared ledger atomically. Ingestion must never silently post money or invent missing dates/accounts/amounts. Support Bangla numerals, exact BDT amounts and explicit Asia/Dhaka dates; reject OTP/security messages. Raw text storage is opt-in and bounded.

Add real source configuration and preferences, a usable developer portal inside the application, generated OpenAPI and repository guides/examples for API, MCP, n8n, operations and known parity gaps. The user deferred GitHub connection/publication: prepare local repository files now, do not invent a remote or claim publication. Current features are not full Sure parity; retain the complete audit.

The user likes the menus but rejects uniform gray cards, poor hierarchy and sparse settings. Preserve navigation structure while adding differentiated financial/review colors, a clear balance hero, stronger typography, ledger rows, section dividers and varied composition. New preferences must have observable behavior rather than inactive controls.

### Active objective — installed Sure feature parity

The user has now opened their own Sure instance and requested one-to-one features, including design, settings and other workflows. This expands the overall goal beyond the manual BDT MVP. Target the inspected installed **v0.7.2-alpha.12 / f51b240** and track the complete inventory in [live audit](SURE-PARITY-AUDIT.md) and [implementation architecture](SURE-IMPLEMENTATION-ARCHITECTURE.md). Preserve the Next.js/PostgreSQL foundation and own branding/custom API/MCP. The MVP exclusions below describe historical delivery limits, not removed parity requirements.

Actual Sure inspection is read-only: stale financial records do not authorize resetting or copying credentials. Build functional slices without menu-only placeholders; disclose partial/unverified areas. First immediate increment is real Reports (periods, comparisons, monthly/category breakdowns, account balances, CSV and print) on the current BDT model; it must not claim full net-worth/FX/investment parity. Shared workspace permissions, classification, currency/asset/liability/valuation data need versioned design before dependent features expand.

### Current implementation slice — Sure shell and classifications

Replace the blue MVP navigation with the observed neutral Sure layout: narrow labeled rail, secondary account sidebar, breadcrumb header and grouped Settings navigation. Home, transaction history, budgets and reports use actual owned records. Add category hierarchies with stable IDs, colors/icons and archive/restore, tags, merchants, transaction notes, pending/confirmed status and report exclusions through one V3 UI/REST/MCP service.

Pending transactions do not affect posted balances, balance history, cash flow, budgets or reports until confirmed. Confirmed excluded transactions continue to affect account balances but do not affect cash flow, budgets or reports. Transfers remain balance effects only. Category budgets include descendant expenses; report totals avoid adding overlapping parent/child plans twice. Archive keeps history and blocks new assignments; unchanged archived references remain editable. Category renames update display labels atomically while preserving financial IDs and amounts.

V3 snapshots/export include all classifications and metadata. Omitted metadata on transaction updates preserves saved values; explicit null, empty array or empty string clears the corresponding value. Legacy V1/V2 APIs return an explicit upgrade conflict when they cannot represent the complete workspace. Additive migration seeds only built-in classification configuration, with no fictional financial entries. Validate on an isolated disposable database before the real migration and compare original financial fields before/after.

### Delivered milestone — first usable MVP (historical scope)

The user has now requested “build the first mvp” after viewing the concept and confirming PostgreSQL readiness. Proceed with its charcoal/blue direction; the former design-only restriction is superseded for this build. Deliver real manual BDT bank/cash/mobile accounts, opening balances/dates, linked income/expenses, atomic internal transfers, monthly category budgets, search/filtering, JSON export and the same operations through authenticated V2 HTTP/MCP. No bank sync, investment/debt account types, sharing, custom categories or automatic Sure import in this first MVP.

Use additive schema migration only; retain legacy transactions with nullable account links and explicit Unassigned UI. Opening amount/date/kind are immutable in the first MVP; accounts can be renamed, archived/restored, and history retained. No account deletion. Legacy V1 writes/imports reject an explicit upgrade conflict once financial accounts exist, preventing silent link loss. JSON V2 export includes complete financial records; a V2 restore/import flow is deferred and must not be advertised.

Validate real finance writes only in a uniquely named disposable database with test gates; apply the reviewed additive migration to the app database only after those checks. Keep credentials private and never seed user finances. Retain ownership/scopes, revisions and request-id replay protection for commands. New ordinary operations use targeted writes rather than full-ledger replacement.

Build our own replacement for Sure Finance, using its financial workflows and interface structure as references, with our own API, MCP tools and additional features. The user explicitly rejected the current UI and said the goals have moved. The preserved quiet-ledger layout and postponed redesign are superseded. Budget Go remains a working name.

This is an independent Next.js application, not a Sure fork. Retain Next.js App Router, TypeScript, Tailwind/shadcn-style primitives, PostgreSQL/Prisma and Auth.js. Sure is a reference, not a promise of immediate feature parity. References: [Sure product overview](https://sure.am/) and [upstream source](https://github.com/we-promise/sure), inspected 8 November 2026.

### Completed kickoff milestone (before the MVP)

1. Produce a representative account-centric workspace at `/concept`, clearly labeled as a design preview with fictional finances. Review the visual direction before expanding the application; keep the authenticated ledger available.
2. Record source-based gaps and ordered implementation slices in [V3 roadmap](V3-ROADMAP.md).
3. After visual review, implement owned financial accounts and account-linked entries, then atomic transfers and accurate balances through the shared UI/REST/MCP service.

Fictional content is permitted only in the isolated, memory-only concept. This exception does not permit database seeds, automatic imports, fake connected-provider statuses or fictional data in the authenticated ledger. Preview controls never call financial write APIs.

### Product shape and assumptions

- Overview: account balances, assets/liabilities and cash flow; distinguish net worth from monthly surplus.
- Accounts: manual bank, cash and mobile wallet first; debt/investment types in later agreed slices.
- Transactions: account-linked income, expense and transfers; searchable/filterable history, then custom classification.
- Budgets: monthly category planning and clear spending/remaining/over-limit states.
- Integrations: REST and MCP are core interfaces to one authorized financial service. n8n can consume REST with scoped tokens.
- Later candidates: CSV/Sure import, recurring entries, rules, bills, goals, investments and assistant workflows. These require prioritization, not an implicit commitment to build everything.
- Working assumptions: BDT/en-BD and integer poisha; private users; dark neutral Sure-inspired UI with restrained glass chrome. Exact theme, user-specific extras, sharing and migration inputs remain unconfirmed.
- Existing v1 data/API/backups stay explicit legacy contracts until a versioned migration is designed. Never infer opening balances or bank accounts from historical monthly totals.

### Financial, access and delivery boundaries

- Separate authenticated `User` ownership from `FinancialAccount` bank/wallet/cash records; never trust client-supplied owner IDs.
- Specify opening balances/effective dates, signs, backdating and archival before schema changes. Transfers change two account balances atomically and are excluded from income, expenses and budget spend.
- UI, REST and MCP share validation/authorization/transactions. Preserve stale-write conflicts and specify safe retry semantics before automated creates can duplicate events.
- Retain Auth.js active/version checks, hashed expiring/revocable scoped tokens, session-only token management, trusted Host/Origin and sanitized failures.
- Secrets remain in ignored environment configuration. No real database fixtures, destructive resets, automatic migrations or deployment in this design milestone.
- Follow [quality checks](QUALITY-CHECKS.md). Inspect the concept at 360/768/1440 with working keyboard/navigation/filter controls and no overflow; record actual evidence. A concept is not database or integration acceptance.
- Financial slices require a separately authorized disposable PostgreSQL database. Historical V2 reports do not prove V3 functionality; external clients are claimed only after testing.

## Historical V2 brief — superseded where V3 differs

## Current goal — V2

Budget Go remains a straightforward personal monthly ledger using Next.js App Router + TypeScript + Tailwind/shadcn-style components. Preserve the approved layout and typography, but make the application **dark-only**, remove all sample-data controls and runtime fixtures, and replace browser storage with **PostgreSQL + Prisma**. The user chose **Auth.js**, **multiple private user accounts**, a **Next.js REST API** (not Python FastAPI), and **MCP/n8n integration**. Database credentials must be entered privately in the ignored environment file, never chat or logs.

The completed browser-only V1 and its historical evidence are not V2 server acceptance.

## Product boundaries

- BDT (৳), `en-BD` formatting, exact integer poisha; monthly income, expenses and their difference. No currency conversion or bank synchronization.
- Overview, Transactions and Budgets keep their approved responsive layout. No light theme or theme toggle, including on light-OS devices. More extensive visual redesign is deferred.
- Transactions: create/edit/delete, month/type/category filters, fixed categories, trimmed description 1–120 characters, positive safe integer poisha and valid local calendar dates in years 1000–9999.
- Budgets: one positive expense limit per account/month/category; editing/removal never removes transactions; near at 80%, reached at 100%, over above 100%.
- No sample mode, financial seed data, or automatic migration/upload of V1 browser data. Existing V1 JSON backups can be explicitly reviewed and imported to the signed-in account.
- Account-scoped JSON export and confirmed whole-account import remain; strict v1 schema and safety caps apply. Import replaces finances, not accounts or access tokens.

## Authentication and integration boundaries

- Auth.js browser sessions; initial account provisioning and password reset use an administrator CLI with masked input. Invite-only credentials are an implementation assumption, not a requested public-registration or OAuth-provider product flow.
- Each request derives the account from a validated session or token, never a client-supplied owner ID. Disabled accounts and changed session versions invalidate access.
- REST read/write and MCP tools share the same validated, transactional per-account finance service. Optimistic revisions reject stale writes; the database, not client state, is authoritative.
- Session-only token creation/list/revocation. Separate expiring integration tokens default to finance read access, optionally finance read/write. Tokens cannot create accounts or mint tokens. Store only hashes; reveal each secret once.
- MCP uses the official SDK and Streamable HTTP with manually configured bearer tokens. Do not claim OAuth discovery, hosted deployment, or compatibility with an untested external client. n8n can use HTTP requests with the same private credentials.
- Enforce trusted deployment Host/Origin, cookie-write CSRF boundaries, no permissive cross-origin credential access, safe errors, and no secret logging.

## Delivery and acceptance

Native small team: Lead owns UI, coordination and user docs; Designer owns dark styles and design contract; Builder owns Prisma/auth/API/MCP/config/dependencies; Reviewer independently checks security and evidence.

Run actual installed lint/type/unit/build commands. Verify rendered dark UI at 360/768/1440 and light-OS color preference. Server acceptance must include real PostgreSQL tenant isolation, authenticated CRUD and backup roundtrips, concurrent revision rejection, scoped/revoked/expired tokens and SDK protocol calls. Do not write test fixtures to the user's real database: dedicated disposable test database authorization is required. Record missing database credentials or unavailable external-client testing as incomplete, not passes. No destructive reset, automatic seed or unauthorized deployment.
