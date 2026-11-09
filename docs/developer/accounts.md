# Accounts, valuations and net worth

Create accounts in **Home → Accounts → Add account**. Supported manual BDT types are `bank`, `cash`, `mobile`, `investment`, `crypto`, `property`, `vehicle`, `credit_card`, `loan`, `other_asset` and `other_liability`. These types describe a manually maintained position; they do not connect to an institution, price securities, track holdings or convert currencies.

## Signed balances

Enter the actual balance on the opening date, with at most two decimal places. Negative means money owed; a loan of ৳25,000 starts at `-25000.00`. A positive credit-card balance represents an overpayment. Opening type, amount and date are fixed after creation. Rename and archive/restore retain history; there is no account deletion.

Home and Reports calculate net worth from every signed position, including archived accounts. Positive positions contribute to assets and negative positions contribute to liabilities; net worth is assets minus liabilities. Sidebar Assets/Debts groups reflect account type, so an overpaid credit card stays in the Debts family while its positive position contributes to assets.

Unassigned legacy transactions affect cash flow but cannot affect a particular account until assigned. Pending entries do not post; confirmed excluded entries still affect balances. Future-dated entries/valuations affect the position only on their dates. Date calculations use Asia/Dhaka financial today.

## Record a new valuation

In Accounts, open **Account details & balance history**, select the account and supply a date, signed new balance and reason. The server calculates a dated adjustment delta from that date’s current posted balance. It is neither income nor spending. Restore an archived account before adding a new valuation.

The history shows the recorded target and adjustment delta. A later backdated transaction can change that date’s calculated position: recorded targets are audit facts, not a permanently enforced balance. Confirmed removal reverses the adjustment’s effect on subsequent balances and preserves financial entries.

## API and MCP

Read `GET /api/v4/workspace` or `workspace_get`; the schema 4 snapshot includes `adjustments` and `matches`. Send financial commands to `POST /api/v4/workspace` or `workspace_mutate` using the shared revision and request ID.

```json
{
  "expectedRevision": 12,
  "requestId": "valuation-example-1",
  "command": {
    "type": "account_adjustment_set",
    "accountId": "YOUR_ACCOUNT_ID",
    "date": "2026-11-09",
    "balancePoisha": -2500000,
    "description": "Reviewed outstanding principal"
  }
}
```

Delete with `{"type":"account_adjustment_delete","id":"YOUR_ADJUSTMENT_ID"}` in the same envelope. The amount is integer poisha, so `-2500000` means negative ৳25,000.00. IDs must belong to the signed-in owner. After an unknown outcome retry the identical envelope; after a revision conflict reload, review and submit a deliberately new request. See [API reference](api.md) and [Transfers](transfers.md).

## Remaining scope

Native account currencies, FX history, live security prices, holdings/trades, institution and subtype metadata, loan terms, card limits/APR, account sharing and provider synchronization remain outside this manual BDT slice. This is useful manual net worth, not full Sure investment/currency parity.
