# V4 workspace, workbench and account API

The current complete financial snapshot is `GET /api/v4/workspace`, with mutations at `POST /api/v4/workspace`. Schemas are generated from `lib/workspace.ts`. Workbench schemas come from `lib/workbench.ts`; full-backup fields come from the generated Prisma scalar-field registry. The [combined OpenAPI](API.openapi.json) and [V4 operations](API-V4.openapi.json) describe exact payloads. Run `npm run api:generate`; generated output must not be hand-edited.

The application serves the combined contract at `/api/v3/openapi?download=1`; this contract URL includes V4 operations even though automation and planning retain their V3 route versions. [In-app/repository API guide](developer/api.md) documents authentication, errors and examples.

| Interface | Routes | Authentication |
| --- | --- | --- |
| Complete finance | GET/POST `/api/v4/workspace` | finance:read / finance:write session or bearer |
| Statements, reconciliation, rules | GET/POST `/api/v4/workbench` | finance:read / finance:write session or bearer |
| Read-only rule preview | POST `/api/v4/workbench/preview` | finance:read session or bearer |
| Profile | GET/POST `/api/v4/profile` | Browser session only |
| Password or session/token revocation | POST `/api/v4/security` | Browser session + current password |
| Full backup | GET `/api/v4/backup`; POST `/validate` or `/restore` under that path | Browser session; restore also requires current password |
| Planning and automation | Existing `/api/v3/planning`, `/api/v3/automation`, `/api/v3/ingest`, `/api/v3/automation/parse` | Existing scoped session/bearer policy |

## Money and dates

All money is exact integer poisha, bounded by safe-integer/aggregate checks; BDT only. Eleven account families use signed positions, with negative owed and positive assets/overpayments. Account openings remain immutable. Dated balance-adjustment deltas affect account/net-worth history without becoming income/spending. Transfers have outgoing `date` and incoming `toDate`; distinct settlement dates preserve both account histories. Matching removes the original income/expense from cash flow and retains them for unmatching.

## Commands and revision

Financial, workbench, planning, profile and automation commands share the owner’s revision. Mutations use `{expectedRevision,requestId,command}` unless their dedicated contract specifies otherwise. A new request gets a fresh ID; after a lost response retry exactly the same envelope. A stale new request returns409; reload and review before resubmitting. All references must be owned. Cookie POSTs require the configured matching Origin; an invalid bearer header never falls back to cookies. Responses are no-store and errors expose sanitized `{error:{code,message}}`.

Profile/security/full backup are intentionally not available through bearer or MCP. Security actions use no command receipt and invalidate all old sessions/tokens; a lost response may require signing in again to determine the result. Full restoration uses its own password/revision/request-ID envelope, preserves current authentication and prior receipt tombstones, and validates/commits owner-data replacement atomically.

## Guides and boundaries

- [Accounts and net worth](developer/accounts.md): family kinds, signed balances, valuation history and adjustment commands.
- [Transfers](developer/transfers.md): matching previews, cash-flow effects, separate dates and undo.
- [Statements](developer/statements.md): CSV mapping, per-row duplicate review, existing-entry linking and reconciliation.
- [Rules](developer/rules.md): AND predicates, classification actions, preview/apply and run limits.
- [Security](developer/security.md): display name, password, session/token invalidation and privacy.
- [Full backup](developer/backup.md): exact supported format, counts/checksum validation, confirmation and replacement semantics.

V1/V2 and preserved V3 workspace schemas cannot represent every V4 state and return `409 VERSION_UPGRADE_REQUIRED` rather than losing fields. V4 is manual BDT finance; no live prices, FX, auto-matching, automatic rule scheduler, Sure import, households or provider sync are implied. Current acceptance evidence belongs to the repository handoff/review, not the contract generator.
