# Transfers and corresponding-entry matching

A transfer changes account positions without adding income or spending. Create one deliberately with **Transfer** in Accounts or Transactions. Source and destination must be different active accounts owned by you. Ordinary manual transfers default both sides to the same date; the API also supports a separate incoming `toDate`.

## Match imported entries

Open **Transactions → Match imported transfers**. Choose a confirmed outgoing expense and incoming income for the same amount in different accounts. Excluded entries and archived accounts are not offered. Check that descriptions, dates and accounts represent the same movement; matching by amount alone is not proof.

The side-by-side preview shows both settlement dates and explains the cash-flow correction. Confirm the verification checkbox, then **Match transfer**. The two original entries leave the active transaction ledger, one transfer retains their account/date/amount effects, and an immutable matching record retains the originals for undo. Their former income and spending disappear from their respective dates. If settlement dates differ, consolidated tracked positions can temporarily change between those dates.

## Undo and audit

The Matching audit shows both accounts, original descriptions, dates and amount. **Unmatch → Confirm unmatch** removes the matched transfer and restores both original entries, including IDs and classification metadata. Income/spending return to the original dates. A matched transfer cannot be deleted directly; unmatch first. The backend rejects matching grouped split parts rather than corrupting provenance.

## API and MCP

Use `POST /api/v4/workspace` or `workspace_mutate` with a current shared revision and fresh request ID.

```json
{
  "expectedRevision": 12,
  "requestId": "match-example-1",
  "command": {
    "type": "transfer_match",
    "expenseId": "YOUR_OUTGOING_ENTRY_ID",
    "incomeId": "YOUR_INCOMING_ENTRY_ID"
  }
}
```

Unmatch with `{"type":"transfer_unmatch","id":"YOUR_MATCH_ID"}`; this is the matching record ID, not the transfer ID. A schema 4 transfer has `date` for the withdrawal and `toDate` for the deposit. Direct deletion of a matched transfer returns `409 MATCHED_TRANSFER`. Nonmatching entries, unsafe amounts, cross-owner IDs, archived accounts or stale revisions are rejected atomically. Exact-envelope retries do not match or restore twice.

## Boundaries

This slice matches two existing equal-value BDT entries. It does not infer matches, create missing counterparts automatically, match fees/unequal amounts, convert currencies or model loan principal/interest separately. Payment to a debt account can use ordinary transfer effects, but specialized debt-payment/FX matching remains future work. See [Accounts](accounts.md) and [API reference](api.md).
