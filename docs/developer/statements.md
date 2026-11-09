# CSV statements and reconciliation

Open **Settings → Statements & reconciliation** or `/statements`. This is a staged CSV importer and closing-balance comparison, not a PDF/file vault or automatic bank connection.

## Map and review a CSV

1. Choose an active BDT account and a CSV up to 1 MiB with a header row and at most 1,000 data rows.
2. Map date and description columns. Choose signed amount or separate debit/credit columns. Signed negative means expense; positive means income. Separate columns require exactly one positive debit or credit per row.
3. Select ISO `YYYY-MM-DD` or explicit day/month/four-digit-year dates. Ambiguous or invalid dates are rejected. Bangla digits, currency prefixes and supported comma grouping normalize to exact poisha; zero, unsafe amounts and more than two decimal places are rejected.
4. Review mapped rows and errors before saving staging. Staging creates no transactions. Default CSV categories are Groceries for expenses and Other income for income; review classification after import or use a rule.
5. Select up to 100 pending rows to import. Repeated commits skip already imported/linked rows, even if their previously linked transaction was later deliberately deleted. Ignored rows must be restored before committing.

CSV parsing supports quoted fields, embedded commas/newlines and escaped double quotes. This is explicit mapping, not a verified parser for every Bangladesh bank statement. No PDF, XLSX, QIF, Sure NDJSON or automatic document extraction is provided.

## Duplicate review and linking

Candidates use the same account, date, direction, exact amount and normalized description. The snapshot exposes `duplicateIds` for existing entries and `duplicateRowIds` for earlier identical rows in the same statement. The UI skips both by default. A warning is not a duplicate guarantee. Either leave the row pending, ignore it, explicitly allow that specific duplicate row, or link it to a known existing entry. Linking requires the same owned account/date/type/amount and does not create a transaction. One existing entry can be linked at most once within the statement.

## Reconcile a closing balance

Set the closing date and signed balance printed on your statement. The app compares the account’s posted ledger balance on that date with the reported amount. Difference is **ledger minus statement**, with zero marked reconciled. This is a live comparison; later edits or backdated entries can change the result. Recording a closing balance never creates a balancing transaction or income. Investigate missing/duplicate entries, opening balances and valuations separately.

## API and MCP

`GET /api/v4/workbench` / `workbench_get` returns staged rows, duplicate candidates, closing balances and reconciliation differences. Mutations use `POST /api/v4/workbench` / `workbench_mutate` with `{expectedRevision,requestId,command}`. Financial, workbench, planning and profile mutations share one revision.

```json
{
  "expectedRevision": 12,
  "requestId": "statement-stage-example-1",
  "command": {
    "type": "statement_create",
    "name": "November statement",
    "accountId": "YOUR_ACCOUNT_ID",
    "rows": [{"date":"2026-11-09","description":"Reviewed grocery payment","type":"expense","poisha":12550,"category":"Groceries","categoryId":null}]
  }
}
```

After reading server-created statement and row IDs, send `statement_commit` with `id`, `rowIds`, optional `includeDuplicateRowIds` and optional `links:[{rowId,transactionId}]`. `statement_ignore` takes `id`, `rowIds`, `ignored`; `statement_reconcile` takes `id`, `date`, `balancePoisha`. Rows are committed atomically using the same financial service. Limits: 100 statement imports, 1,000 rows per import and 4 MiB complete workbench snapshot. Exact request replays are safe; review a conflict before a new write. See [API reference](api.md), [Rules](rules.md) and [Transfers](transfers.md).
