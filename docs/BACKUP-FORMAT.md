# Budget Go backup format

The first account-aware MVP exports a complete **schemaVersion2** snapshot; see [V2 snapshot contract](API-V2.md). It includes accounts, account links, transfers and budgets. V2 import/restore is not implemented. The V1 format below is historical and incomplete for the MVP; V1 replacement/import rejects `VERSION_UPGRADE_REQUIRED` once financial accounts exist, preserving their data.

The shared validator is implemented in [lib/finance.ts](<../lib/finance.ts>). Authenticated PostgreSQL-backed accounts retain the v1 file format, so existing V1 browser backups can be imported explicitly. Historical browser-storage results are not server acceptance; see [V2 review](<REVIEW-V2.md>) for current evidence.

## Version 1

A backup is a UTF-8 JSON object with exactly these five fields:

```json
{
  "schemaVersion": 1,
  "currency": "BDT",
  "revision": 0,
  "transactions": [],
  "budgets": []
}
```

Unknown or missing fields are rejected, including on each transaction/budget. Revision is a nonnegative safe integer. IDs are 1–80 ASCII letters, digits, underscores or hyphens, unique across both collections.

A transaction has exactly `id`, `description`, `category`, `date`, `type`, `poisha`. Type is `income` or `expense`. Description is 1–120 JavaScript string units, nonblank and already trimmed. Date is a real local-calendar `YYYY-MM-DD` date, year 1000–9999. Poisha is a positive safe integer: 100 poisha = ৳1.00. Categories must match type:

- Income: Salary, Freelance, Other income.
- Expense: Groceries, Dining, Transport, Home, Shopping.

A budget has exactly `id`, `month`, `category`, `limitPoisha`. Month is `YYYY-MM`, year 1000–9999. Category is a built-in expense category. Limit is a positive safe integer in poisha. Only one budget per category/month is allowed.

## Safety limits

- UTF-8 encoded JSON: at most 2 MiB (2,097,152 bytes).
- At most 10,000 transactions and 1,000 budgets.
- The sum of all positive transaction amounts must not exceed 9,007,199,254,740,991 poisha (৳90,071,992,547,409.91). Budget limits have the same aggregate bound, independently.
- No fractional poisha, negative/zero amounts, `NaN` or infinite amounts. The app represents refunds/corrections as appropriately typed positive transactions, not signed amounts.

Import is validated whole-account financial replacement with explicit UI confirmation, never an implicit merge. It changes only the authenticated account's transactions and budgets, not users, credentials or tokens. A supported backup is not encrypted: descriptions, dates and amounts are readable text. Keep downloaded copies private. Database backup/restore remains an operator responsibility.

PostgreSQL is authoritative. Writes acquire the account lock and compare `expectedRevision` from the latest server response; stale writes return 409. Imported `data.revision` is validated as file metadata but is not used as the concurrency lock. A successful write returns the server-assigned next revision. Validation and replacement occur in one database transaction; no local browser-storage write or automatic V1-data upload occurs. The API replacement envelope is `{ "expectedRevision": 0, "data": <backup object> }` at PUT `/api/v1/finance`. A GET of that endpoint exports the complete account snapshot.
