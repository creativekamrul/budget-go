# Transaction tools

Transactions supports individual edits, bulk changes and category splits. Financial amounts are exact integer poisha: `10000` means ৳100.00. The same service handles the application, `/api/v4/workspace` and MCP `workspace_mutate`.

## Select and change several transactions

Select the intended transactions in the history view. Bulk editing supports description, date, category, merchant, tags, notes, pending/confirmed status and report exclusion. Choose only fields you intend to change; omitted fields retain their saved values. Amount, financial account and income/expense direction are not bulk-editable.

Each batch supports up to 100 unique transaction IDs. All records and assigned classifications must belong to the signed-in user. A missing/foreign ID, invalid date, incompatible category or archived account causes the entire batch to fail. There is no partially successful batch.

```json
{
  "expectedRevision": 12,
  "requestId": "bulk-status-001",
  "command": {
    "type": "transaction_bulk_update",
    "ids": ["YOUR_FIRST_TRANSACTION_ID", "YOUR_SECOND_TRANSACTION_ID"],
    "patch": { "status": "confirmed" }
  }
}
```

Send the envelope to `/api/v4/workspace` with your existing session or write-scoped bearer token. Read the current revision before a new command. After a lost response, replay the identical envelope and request ID. A new ID with a stale revision conflicts; reload and review the retained draft before submitting a new command.

Changing pending to confirmed can change posted balances. A confirmed excluded transaction still affects its account balance while staying out of cash flow, budgets and reports. Changing a date can move activity between reporting periods; amounts are not changed by the batch.

## Delete selected transactions

Use the confirmed bulk-delete action only after checking the selection. The API command is `{type:"transaction_bulk_delete",ids:[...]}` in the same envelope. This deletes the selected financial entries, not transfers, accounts, categories or budgets. Deletion changes financial history and cannot be undone through an automatic restore feature. Historical split/recurring provenance can retain references to deleted entries so retrying a source operation cannot silently recreate them.

## Split a transaction across categories

Choose Split on an existing account-linked transaction. Enter 2–20 positive parts, each with a description, category and exact BDT amount. Parts must add up to the original amount; an invalid total is rejected atomically.

```json
{
  "expectedRevision": 15,
  "requestId": "split-purchase-001",
  "command": {
    "type": "transaction_split",
    "id": "YOUR_TRANSACTION_ID",
    "parts": [
      { "description": "Food shopping", "category": "Groceries", "categoryId": null, "poisha": 6000 },
      { "description": "Lunch", "category": "Dining", "categoryId": null, "poisha": 4000 }
    ]
  }
}
```

This example requires an original ৳100.00 transaction. The first part retains the original transaction ID; remaining parts receive new IDs. All parts retain the original account, date, income/expense direction, status, exclusion, merchant, tags and notes. Category spending is allocated between the parts, while total account balance and total income/expense remain unchanged at split time. No extra parent posting is added.

A split audit stores the original transaction and part IDs in planning data. It is historical provenance, not another financial entry. Re-splitting an already grouped part is rejected. Ordinary later edits/deletions are explicit financial changes; there is no automatic unsplit or whole-workspace restore in this release.

## Export and boundaries

The V4 financial workspace export contains the actual posting parts, so the financial totals are represented. Planning provenance is read through `/api/v3/planning`; it is not included in the financial JSON export. Use Settings → Backups for supported-domain full application export/restore and keep operator database backups for disaster recovery. Foreign-currency splitting and provider-protected editing remain open. Corresponding-entry matching and statement reconciliation are separate workflows: see [Transfers](transfers.md) and [Statements](statements.md).
