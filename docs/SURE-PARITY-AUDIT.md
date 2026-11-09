# Sure replacement — live feature audit

Inspected 8 November 2026 in the user's authenticated Sure instance. Reference version **v0.7.2-alpha.12**, commit **f51b24096795a15f3d0aae6c860398e8470bfe0f**, as displayed in its account menu. This installed version, rather than an unspecified future Sure release, is the parity baseline.

The user now requests one-to-one feature coverage and the actual Sure interface as the reference. This supersedes the intentionally narrow MVP scope as the overall product objective. The current MVP remains working infrastructure, not feature parity. API/MCP and personal extensions remain part of our application.

## Inspection method and privacy

Used the already-open Sure tab through native browser tools. Inspected dashboard, reports, transaction filters/details/create/split/matching/bulk-edit forms, current and configured budgets, account creation types/detail/edit/balance forms and the settings sections listed below. Opened forms and read options without submitting them. Did not import/export records, upload files, run rules/sync/AI jobs, enable providers/MFA, create credentials, change roles or reset/delete data. Private names, balances, transaction descriptions and credentials are intentionally omitted from this document. Sure was left on its dashboard with forms/menus closed.

“Observed” means exposed in this installed UI; it does not prove a provider connection, background job, write workflow, authorization protocol or calculation was executed successfully. Disabled/coming-soon controls are not counted as working features. Exact shared-budget arithmetic, investment trades/holdings and unavailable-provider behavior need source/fixture verification before implementation acceptance.

## Visual and interaction contract

- Near-black flat canvas and opaque neutral cards; restrained borders and compact rounded controls. White primary actions; green/red financial status. Own branding, not Sure's logo.
- Narrow primary icon rail with visible Home / Transactions / Reports / Budgets labels. Separate, resizable account sidebar with All / Assets / Debts tabs, expandable account-type groups, balances, period changes and new-account actions.
- Header breadcrumbs, left-sidebar toggle, privacy mode and right assistant-panel toggle. Separate resizable assistant sidebar with conversation history and composer.
- Dashboard widgets collapse, reorder with drag and keyboard, and offer Half/Full width and Compact/Auto/Tall height. Two-column preference applies on large screens.
- Dashboard ranges: 1D, WTD, 7D, MTD, LM, 30D, 90D, YTD, 365D, 5Y, 10Y, All. Exact definitions/timezone boundaries must be tested, not guessed from labels.
- Settings is a dedicated grouped navigation surface with back/escape navigation and previous/next section links. Transaction details use a side drawer; creation and bulk-edit flows use dialogs; budget setup is a two-step page flow.
- Desktop visual structure was observed directly; Sure mobile/reflow/keyboard behavior was not exhaustively tested. Our implementation must still maintain accessible focus, readable type and touch targets rather than copying inaccessible details.

## Feature inventory and current gap

| ID | Area / observed surface | Required behavior | Current Budget Go status |
| --- | --- | --- | --- |
| S01 | Shell/navigation | Rail + resizable account sidebar, asset/debt filtering, breadcrumbs, privacy mode, assistant panel | Implemented rail, width/collapse controls, real Assets/Debts family filtering, breadcrumbs and privacy; assistant remains open |
| S02 | Home | Net worth, balance sheet/weights, cashflow flow diagram, outflow categories; configurable widgets and ranges | Partial: manual BDT net worth/assets/liabilities, dated valuation history, balance weights, outflows and cash flow/budgets; live prices/FX and configurable widgets remain open |
| S03 | Account families | Cash, Investment, Crypto, Property, Vehicle, Credit Card, Loan, Other Asset, Other Liability | Manual BDT families implemented for all listed groups plus bank/mobile; subtypes, institution details and securities/FX remain open |
| S04 | Account currency/valuation | Per-account currency, base-currency valuation, FX rates, native balances and dated history | Missing: BDT-only |
| S05 | Account identity/detail | Name, subtype, institution/domain/logo, notes, report exclusion, edit balance, sharing, delete; Activity/Statements tabs | Partial: name, all manual families, immutable opening date/balance, archive/restore, valuation detail/history; sharing/institution metadata/delete remain open |
| S06 | Balance events | New balance with date/amount, daily running balances, balance chart/time range | Implemented dated target-to-delta valuations/removal and running history on manual BDT positions; native FX/security prices remain open |
| S07 | Transaction workspace | All-history totals, date grouping, inline category, Upcoming, pagination 10/20/30/50/100 | Partial: month/all-history totals, date groups and CRUD; inline category, Upcoming and pagination remain open |
| S08 | Filters | Account, Date, Type, Status, Amount, Category, Tag, Merchant; multi-select search | Partial: account/type/text/category/tag/merchant/status filters; amount/date ranges and multi-select remain open |
| S09 | Transaction detail | Native currency/type/date/amount/category, merchant/tags/notes, provider protection/additional metadata | Partial: core fields, category IDs, merchant, tags, notes and status; provider protection and extra metadata remain open |
| S10 | Advanced transactions | Split with conserved total; duplicate/bulk date/name/category/merchant/tags/notes edits; confirmed deletion | Implemented exact-total category splits with historical provenance, selected atomic bulk edits/deletion; duplicate tools and split undo/group maintenance remain open |
| S11 | Transfer/payment matching | Match corresponding posted entries or create counterpart; internal transfer/debt payment; FX entry modes | Partial: atomic BDT transfers and confirmed equal-value corresponding-entry matching with separate dates, audit and unmatch; fees/FX/specialized debt payment remain open |
| S12 | Transaction flags | Confirmed/pending, excluded from reports/budgets, one-time expense, recurring linkage | Pending/confirmed and report exclusion implemented; one-time and recurring remain open |
| S13 | Categories | Custom name, color/icon, optional parent, maintenance actions | Implemented owned name/color/supported icons/parent/kind and archive/restore |
| S14 | Tags / merchants | Colored tags; family/provider merchant distinction, name/color/website/logo, merchant import | Owned colored tags and name/color/website merchants implemented; provider distinction, logo and import remain open |
| S15 | Budget setup | Expected income + planned total spending, history/AI suggestion, copy prior budget, category allocation/uncategorized remainder | Partial: monthly expected income/spending, allocation/remainder and copy prior limits into empty month implemented; history/AI suggestions and full setup flow remain open |
| S16 | Hierarchical budgets | Child may share parent's limit; own allocated child amounts; over/on-track filter; category average/median and recent entries | Partial: parent-category descendant spend and overlap-safe report totals; shared allocations, statistics and filters remain open |
| S17 | Reports | Monthly/quarterly/YTD/last6months/custom, previous/next/Today, income/expense comparisons, savings/budget performance, monthly averages/table, activity grouping, net worth | First BDT increment implemented and browser-checked; full net-worth/currency parity remains open |
| S18 | Report outputs | Printable report, CSV activity, Google Sheets instructions | CSV download verified; print support implemented/reviewed (actual print output not exercised); Sheets workflow remains open |
| S19 | Rules | Condition groups, financial/text criteria, multiple actions, effective-date scope, active state, apply-all, run history/counts/status | Partial: manual AND equals/contains rules, classification actions, before/after preview, selected apply and run history; nested groups/broader predicates/automatic runs remain open |
| S20 | Recurring | Enable/detect patterns, run after imports/sync, amount variation, expected day/next date/last occurrence, active state and upcoming projections | Partial: manual weekly/monthly/yearly schedules, month-end/leap dates, future edits, pause/archive, forecasts and duplicate-safe explicit recording implemented; detection/background/import integration remain open |
| S21 | Files | Statement vault, unmatched inbox/account linking, PDF/CSV/XLSX up to25MB; transaction images/PDF up to10 files/10MB each | Staged CSV rows implemented separately; document vault, stored attachments/PDF/XLSX remain missing |
| S22 | Imports | Resumable/import-status flows; Sure NDJSON, Mint, Actual Budget, QIF, YNAB, AI documents; raw transaction/trade/account/category/merchant/rule imports | Partial: staged mapped CSV with1MiB/1000-row limits, per-row duplicate review, existing-entry linking and live closing reconciliation; broader formats/resume/Sure import remain open |
| S23 | Exports | Async export history/download, full accounts/balances/transactions/trades/categories/tags/rules; UI warns only some data can be CSV-restored | Partial: financial schema4 export plus model-versioned20-domain full JSON backup and password-confirmed atomic restore; async exports/trades/format migrations remain open |
| S24 | Bank/provider sync | Provider catalog/search/type filters, connection-specific setup, daily schedule/pending handling | Missing; external credentials/configuration required |
| S25 | Assistant/AI | Builtin/direct LLM vs external remote agent, conversation menu/history, prompt customization, categorization/merchant detection/PDF processing | Missing; existing MCP service is infrastructure, not assistant UI |
| S26 | AI usage/settings | Date filters, requests/prompt+completion tokens/cost averages/recent use; custom endpoint/model/JSON mode/context/response/batch limits | Missing |
| S27 | API keys | Named keys, created/last-used/access/status, create/revoke, owner boundaries | Partial: named scoped expiring hashed tokens and lifecycle; last-used metadata absent |
| S28 | MCP authorization | URL-based assistant connection, redirect to Sure sign-in and authorization | Partial: StreamableHTTP + manual bearer, no OAuth connection flow |
| S29 | Preferences | Language/timezone/date format/account order/country/budget start/base+additional currencies/default family sharing/preview opt-in | Partial: English/Bangla money format, fixed Dhaka financial dates, configurable week/fiscal start and new-entry status; broader locale/sharing/currency preferences remain open |
| S30 | Appearance | Light/Dark/System, dashboard columns, outside-click behavior, split-row grouping | Partial: persisted accent and ledger density with stronger visual hierarchy; light/system and configurable dashboard remain open |
| S31 | Profile/household | Photo JPG/PNG up to5MB, names/email, household name/members/invites, roles, reset/preload/delete | Partial: display-name profile update and read-only email; photos/households/invites/sharing/self-service email changes remain open |
| S32 | Security | Authenticator-based 2FA and encryption-at-rest readiness | Partial: scrypt/Auth.js/session-version checks plus current-password-protected password change/all-session-token revocation; no TOTP/secret-provider encryption system |
| S33 | Admin / SSO | Guest/Member/Admin/SuperAdmin; family groups, trial filters, support impersonation; configurable SSO providers requiring restart | Missing except operator user CLI |
| S34 | Operations | Filterable debug events; FX/security providers; logos; pending sync; auto-sync time; onboarding Open/Closed/Invite-only; email confirmation; cache clearing | Missing |
| S35 | Product support | Guides/changelog/feedback links | Own searchable in-app/repository guides, API/MCP/OpenAPI/n8n examples implemented; changelog/feedback workflows remain open |

## Account details observed

- Cash subtypes: None, Checking, Savings, HSA, Certificate of Deposit, Money Market.
- Investments: general brokerage/pension/retirement/mutual-fund/gold/trust types plus many country-specific tax/retirement products. The full subtype list needs a versioned catalog, not an ad hoc enum of three types.
- Loans: current balance/date/currency, original balance, interest rate, Fixed/Variable/Adjustable rate type, term in months; Mortgage, Student, Auto, Home Equity, Line of Credit, Business, Other subtypes.
- Credit cards: balance/date/currency, available credit, minimum payment, APR, expiration date, annual fee.
- Property wizard: Overview/Value/Address stages; property type, year built, area/unit visible. Later stages were not submitted or exercised.
- Vehicles: make/model/year/mileage/unit plus dated balance and general metadata.
- Account detail: period chart, daily balance groups, transaction search/status filter, New Balance/Transaction/Transfer, Statements; account menu Edit/Sharing/Statements/Exclude/Import/Delete. No lifecycle action was submitted.
- Manual cross-currency transfer exposes Source amount, Exchange rate and Destination amount with Convert with FX rate / Calculate FX rate modes. Both amounts/rate provenance must be persisted and tested before claiming parity.

## Rules and recurring details observed

Rule conditions: transaction name, amount, type, merchant, category, details, notes, account; text condition operators include Contains, Equal to, Is empty. Add condition and Add condition group are distinct. Actions include category, tags, merchant, name, investment activity label, report/budget exclusion, transfer/payment and AI category/merchant actions. Scope is all past/future or starting from a date. Run history includes queued/processed/modified/blocked counts, status and manual run type. No rule execution was triggered.

Recurring UI exposes pattern identification, amount range/variance, expected day, next/last dates, active status; documentation on-screen says detection also follows completed imports and provider sync. A transaction can be marked recurring. No detection or marking was triggered.

## Providers exposed by this version

The Bank Sync catalog lists17 providers: Akahu, Binance, Brex, Coinbase, CoinStats, Enable Banking, Indexa Capital, Interactive Brokers, Kraken, Lunch Flow, Mercury, Plaid, Plaid EU, SimpleFIN, SnapTrade, Sophtron and Up. Labels differ by bank/crypto/investment, region and alpha/beta maturity. Catalog visibility is not proof of a working connection; availability requires provider-specific credentials, account eligibility and tested adapters.

Self-hosting exposes exchange rates via Twelve Data / Yahoo Finance / MOEX; security prices through Twelve Data, Yahoo Finance, Tiingo, EODHD, Alpha Vantage, MFAPI.in, Binance, MOEX and T-Invest. Brand/logo settings and high-resolution logos are separate. Observed operational warnings are not copied as intended behavior.

Assistant configuration exposes OpenAI-compatible endpoints and Anthropic for chat; the screen states batch categorization/merchant/PDF operations use OpenAI. It also supports an external remote-agent assistant. We must implement explicit data/credential boundaries and provider failures rather than replaying the existing instance's secrets/configuration.

## Build sequence and definition of parity

1. **Reference capture and first report slice:** this audit, architecture, traceable gap matrix; real BDT reports/CSV/print as an immediately usable addition. This does not complete S17–S18 or the overall target.
2. **Shared domain foundation:** household/workspace permissions; category hierarchy/tags/merchants; currency exponents/FX/date policy; typed assets/liabilities/valuations; backward-compatible migrations and exports. These unlock dependent modules.
3. **Daily finance parity:** account detail/drawers/adjustments, richer transaction queries and flags, splits/matching/bulk edits, hierarchical budgets, recurring/rules and exact report/net-worth calculations.
4. **Files and migration:** private attachment storage, statements, staged import mapping/validation/resume/deduplication and complete exports. Inspect actual Sure export schema before claiming migration compatibility.
5. **Providers/assistant/admin:** tested provider adapters and jobs; configurable assistant/prompts/usage; MCP OAuth; preferences/theme/profile/households/MFA/SSO/roles and operational diagnostics.
6. **Parity acceptance:** mark each row implemented only after its actual behavior, ownership/failure paths, API/MCP equivalence where relevant, migrations and visual states are verified. A visible menu or static card is not a completed feature. Third-party flows without configuration remain explicitly unverified.

No feature above is silently removed from the goal because it is difficult or not used by the current stale records. Sequencing is a dependency decision; the full inventory remains the target. Architecture details: [SURE-IMPLEMENTATION-ARCHITECTURE.md](SURE-IMPLEMENTATION-ARCHITECTURE.md).



### Completion slice — 9 November 2026

Manual BDT families/valuations/net worth, reversible equal-value transfer matching, staged mapped CSV and closing reconciliation, manual previewed classification rules with history, profile/security controls and supported-domain full backup/restore have source/API/UI implementations. The current handoff/review records actual verification; this inventory does not assert full Sure parity or arbitrary external client compatibility. Full-backup preview validates structure/checksum; cross-domain restoration validation is transactional. Native currencies/FX, live securities, files/provider integrations, automatic rules, households and broader security remain open.
