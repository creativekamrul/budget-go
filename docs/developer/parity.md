# Feature coverage and Sure parity

Full one-to-one Sure Finance parity is not finished. The reference is the user's inspected installed Sure v0.7.2-alpha.12 / f51b240. The detailed 35-area inventory is maintained in `docs/SURE-PARITY-AUDIT.md`; implementation architecture is in `docs/SURE-IMPLEMENTATION-ARCHITECTURE.md`.

## Working finance foundation

All 11 manual BDT account families (cash/bank/mobile, investments/crypto, property/vehicle, credit-card/loan and other assets/liabilities); signed positions; dated valuation adjustments; exact BDT opening balances; account-linked income/expenses; atomic transfers; rename/archive/restore; custom hierarchical categories; colored tags and merchants; transaction notes/status/exclusion; month/all-history search and filters; parent-category budgets; dated balance history; reports with period comparisons, configurable Fiscal YTD, CSV and print lifecycle; scoped token management; shared REST/MCP services.

Core tools now add amount-preserving category splits, selected atomic bulk edits/deletion, monthly expected-income/spending plans, safe copying of category limits, and explicit weekly/monthly/yearly recurring schedules with upcoming dates and duplicate-safe occurrence recording. Corresponding-entry transfer matching now preserves separate settlement dates and supports unmatching with original metadata. No automatic recurrence detection or background posting scheduler is implied.

Print lifecycle support is not a claim that physical/PDF print output has been verified. Manual BDT net worth includes every signed position and dated adjustment; live prices, holdings/trades and FX valuation remain open.

## Bangladesh automation foundation

Owned SMS/email/manual sources, stable delivery identity, conservative বাংলা-digit/BDT extraction, structured external-agent drafts, an inbox for review, duplicate warnings, deliberate atomic posting, preference controls and documentation. This is designed for collectors such as n8n rather than reliance on unavailable bank APIs.

No bank/email/SMS connection is automatically established. No external AI model is configured by these features. Bank-specific verified parsers and fee splitting remain open. A staged CSV importer and live closing-balance reconciliation comparison are implemented; neither is a document vault or a verified bank-format parser. An n8n template is provided, but external deployment/collector execution remains to be configured and tested.


## Rules, statements and account management

Manual classification rules support AND conditions, case-insensitive equals/contains, before/after previews, explicit selected application and run history. CSV mapping stages rows before import, requires per-row duplicate acknowledgement or existing-entry linking, and records closing-balance comparison metadata without adding balancing money. Profile name updates, current-password-protected password/session-token revocation and supported-domain full backup/restore are implemented. Full restore preserves current identity/authentication and request receipts; structural preview is followed by atomic domain validation during replacement. These features do not imply TOTP, SSO, households, provider connections or Sure-format migration.

## Remaining parity areas

| Area | Still required |
| --- | --- |
| Accounts and valuation | Institution/subtype metadata, holdings/trades, richer loans/cards and shared account lifecycle beyond manual BDT positions |
| Currency | Per-account currencies, FX rates/history and base-currency valuation |
| Transactions | Split undo/group maintenance, richer bulk operations, duplicate tools, provider protection, pagination and richer amount/date/multi-select filters |
| Matching | Missing-counterpart creation, unequal/fee/debt principal-interest matching and foreign-currency modes |
| Budgets | Shared allocations, suggestions, carry-over, copy/replace options and richer category statistics |
| Rules and recurring | Nested conditions/OR, amount/date predicates, future automatic application, broader actions, automatic recurrence detection and background scheduling |
| Documents and migration | PDF/XLSX vault, attachments, resumable/other-app imports including Sure and cross-version full-backup migration |
| Providers and assistant | Actual configured provider sync, built-in assistant/conversations, AI usage/cost settings |
| Household and profile | Membership, invites/roles, sharing, photos, family settings and self-service email changes |
| Security and administration | TOTP, SSO, admin/support workflows, encrypted provider credentials and operational event tools |
| Experience preferences | Broader language coverage, light/system themes, customizable dashboard widgets/layouts and additional display preferences |

## Evidence is scoped

Every delivery should state what changed, what was exercised and what remains. Database/API/browser acceptance for one vertical slice does not establish arbitrary external MCP/n8n compatibility, all accessibility states or full Sure parity. Repository handoff and review notes are the current evidence record.

Our own differentiator is a reliable local banking-alert workflow: stable collector identities, exact BDT amounts, Bangladesh dates, conservative extraction, explicit review and understandable automation contracts. It complements the Sure parity goal rather than replacing the unfinished features with placeholder menus.
