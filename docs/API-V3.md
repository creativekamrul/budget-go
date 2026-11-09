# Workspace API V3

> Historical schema3 contract. Current clients should use [V4](API-V4.md). V3 returns409 VERSION_UPGRADE_REQUIRED when current data includes unsupported account families, valuations, matching or distinct transfer settlement dates. Its schemas remain preserved for compatibility.

`GET /api/v3/workspace` returns the complete authenticated workspace. `POST` accepts `{expectedRevision, requestId, command}` and returns the complete saved workspace. V3 adds owned classification records and transaction metadata; it preserves BDT integer poisha, existing financial IDs, account links, revisions and transfer semantics. No whole-workspace import/restore endpoint is provided.

Use an Auth.js session or an expiring, revocable bearer token with `finance:read` / `finance:write`. Browser cookie writes require matching Origin. Owner IDs are always derived from authenticated identity. Bearer authentication never falls back to cookies. Errors use `{error:{code,message}}`; database failures do not disclose connection details.

## Snapshot

`schemaVersion:3`, `currency:"BDT"`, `revision`, `accounts`, `transactions`, `transfers`, `budgets`, `categories`, `tags`, `merchants`.

Existing financial fields remain. Each transaction additionally contains `categoryId:string|null`, `merchantId:string|null`, `tagIds:string[]`, `notes:string`, `status:"confirmed"|"pending"`, `excluded:boolean`. Each budget additionally contains `categoryId:string|null`. Category labels remain present for readable exports and legacy calculations, and are derived by the server when an ID is assigned.

| Catalog | Complete record |
| --- | --- |
| Category | `{id,name,color,icon,parentId:string|null,kind:"income"|"expense"|"both",archived}` |
| Tag | `{id,name,color,archived}` |
| Merchant | `{id,name,color,website,archived}` |

Names are trimmed, 1–80 characters, and unique ignoring case within each owned catalog. Colors use six digit `#RRGGBB`; icons use 1–40 letters, numbers, underscores or hyphens. Merchant website is empty or an HTTP(S) URL, at most 500 characters; the server never fetches it. Notes allow at most 2,000 characters. IDs use 1–80 letters, numbers, underscores or hyphens.

## Commands

The account, transaction, transfer and budget command names from V2 remain supported. Transaction create/update still supply accountId, description, type, category, date and positive poisha. Transaction metadata is optional: create defaults to null IDs, no tags, empty notes, confirmed status and excluded false. Update preserves omitted metadata; use explicit null, empty array or empty string to clear it. Budget categoryId is optional, defaults null on create and is preserved when omitted on update. Supplying categoryId overrides the supplied category label with the catalog name and validates its income/expense kind. Without an ID only existing built-in labels are valid.

| Command | Payload in addition to `type` |
| --- | --- |
| `category_create` | `category:{name,color,icon,parentId,kind}` |
| `category_update` | `id, category:{name,color,icon,parentId,kind}` |
| `category_archive` | `id, archived:boolean` |
| `tag_create` | `tag:{name,color}` |
| `tag_update` | `id, tag:{name,color}` |
| `tag_archive` | `id, archived:boolean` |
| `merchant_create` | `merchant:{name,color,website}` |
| `merchant_update` | `id, merchant:{name,color,website}` |
| `merchant_archive` | `id, archived:boolean` |

Create commands assign IDs on the server. Update supplies all editable catalog fields. No classification delete command exists: archival preserves history. Archived records cannot be newly assigned; an entry update can retain its unchanged archived category, merchant or tags. Assigning another archived record fails `409 CLASSIFICATION_ARCHIVED`. Accounts retain their existing stricter archive rule: restore before editing account-linked entries.

Category parents must belong to the same owner, support the child kind (`both` supports either), and form an acyclic hierarchy. Active children must be archived first (`409 ACTIVE_CHILDREN`); restoration requires an active parent. Kind changes incompatible with existing entries, budgets or children roll back. Built-in names retain their original kind. Rename updates all linked transaction/budget labels inside the same transaction. Duplicate names return `409 NAME_EXISTS`; a duplicate budget category/month returns `409 BUDGET_EXISTS`.

## Posted totals and hierarchy

Pending entries affect neither posted account balances/history nor income, expenses or budget spend. Confirmed excluded entries still affect account balances/history, but do not affect cash flow, budgets or reports. Future entries remain excluded until their effective date. Transfers are confirmed internal movements; they do not count as income/expense.

An expense-category budget includes posted, non-excluded descendant-category expenses once per budget. Legacy null-ID entries match the corresponding built-in label. Parent and child budgets may coexist; consumers must deduplicate transactions when aggregating their combined spend rather than summing overlapping budget rows.

## Concurrency and retry

Read the latest revision before each new write and use a fresh requestId. The same per-user database lock serializes V1/V2/V3 writes and security changes. Stale revisions return `409 REVISION_CONFLICT`. Replaying the exact same command and requestId returns current state without applying it twice, including after another write; changing the command with that requestId returns `409 IDEMPOTENCY_CONFLICT`. Failed writes roll back revision, receipts, metadata and financial changes together. Do not blindly retry a changed command after an unknown outcome.

## Compatibility, migration and limits

V2 is an explicit legacy adapter, with its original strict command/snapshot schemas preserved in `lib/workspace-v2.ts`. It returns a schema2 projection only for compatible workspaces; default built-in catalog configuration alone is compatible. Custom catalogs, changed classification configuration or transaction metadata require `409 VERSION_UPGRADE_REQUIRED` for both reads and writes. The check for V2 writes runs inside the owner lock, preventing a concurrent upgrade from being lost. Existing V2 request hashes remain compatible.

V1 reads likewise reject upgraded classification/metadata rather than misreporting valid V3 state as data corruption; V1 writes additionally reject account/transfer workspaces. Use V3 for complete backups and MCP `workspace_get` / `workspace_mutate`. These two tools share the V3 service and validation; the existing legacy tools remain available for compatible workspaces, with 13 tools total.

The additive migrations create only category configuration for existing users (three income and five expense labels), link matching historical entries/budgets, and preserve financial IDs, amounts and dates. CLI provisioning creates the same configuration for new users. No sample finances are seeded. Users created directly in tests can begin with empty catalogs and create classifications through commands. Migration execution is a separate deployment action.

Caps: 100 accounts, 10,000 transactions/transfers combined, 1,000 budgets, 500 categories, 500 tags, 1,000 merchants and 2 MiB serialized snapshots. The sum of absolute opening/entry/transfer amounts and sum of budget limits each fit JavaScript's safe integer range. New snapshots validate references, hierarchy, labels and aggregate limits before commit. Money remains exact integer poisha; no currency conversion, account valuation, sharing, bank sync, transaction splits or automatic rules are implied by V3.
