# Bangladesh email and SMS automation

The main workflow is message collector → extraction → automation inbox → reviewed transaction. No bank API is required. Budget Go does not read your phone or mailbox itself, and a provider label is not a connected bank.

## Sources separate your collectors

Create an enabled source with a name, channel (`sms`, `email` or `manual`), optional provider label and optional default account. Keep account-specific sources separate when an alert does not safely identify its account. Account IDs are owned workspace IDs, not bank account numbers. Disabling a source stops new ingestion from that source; it does not erase history.

## Message delivery contract

```json
{
  "sourceId": "YOUR_SOURCE_ID",
  "externalId": "mailbox-message-stable-id",
  "reference": "BGDEMO001",
  "draft": {
    "accountId": "YOUR_ACCOUNT_ID",
    "description": "Reviewed grocery purchase",
    "type": "expense",
    "category": "Groceries",
    "date": "2026-11-08",
    "poisha": 12550
  }
}
```

Send this to `/api/v3/ingest`. A structured draft can omit unknown fields; those remain incomplete for review. `rawText` is optional when a draft is supplied. When both are supplied, explicit draft fields override extraction. An AI suggestion is a draft, not an authenticated instruction to post money.

The response `{revision,event,replayed}` includes the staged event. Typical event fields include its source/external IDs, bank reference, received timestamp, draft, issues, duplicate event reference, linked transaction ID and optional retained text. The inbox shows `needs_review`, `ready`, `accepted` or `ignored`. Ready means fields are complete enough for review, not that a bank authenticated the message or that a transaction has been posted.

## Let a trusted workflow or agent perform the review

Review is a separate API operation, not a requirement to click through every alert manually. An authorized n8n workflow or MCP agent can read the staged event and owned workspace, validate the account/category/date/amount, save a corrected draft with `event_update`, then call `event_accept` with the current revision and a stable request ID. That completes automated entry without a bank API. Ingestion alone never changes financial balances.

Keep incomplete, conflicting or possible-duplicate events in the inbox for a person to resolve. Do not automatically set `acknowledgeDuplicate:true` to bypass a warning. The included starter workflow stops at ingestion; adding automated review/acceptance is an explicit workflow configuration decision. The same write token can create transactions directly through `/api/v4/workspace`, but staged intake retains source identity and delivery replay protection.

## Conservative Bangladesh extraction

The local parser normalizes বাংলা digits (`০১২৩৪৫৬৭৮৯`) to ASCII. It recognizes BDT, Tk and ৳ amounts, including valid comma grouping, and converts to integer poisha without floating-point rounding. It looks for explicit debit/credit language. Mixed directions, multiple unclear amounts, missing dates and invalid dates require review.

An unambiguous four-digit-year ISO date or day/month/year date can be extracted. Two-digit years are not guessed. If a message contains a balance as well as a transaction amount, an explicitly adjacent debit/credit amount is preferred; otherwise ambiguous amounts remain unset. This is a general helper, not a certified parser for every Bangladesh bank's alert template. Check fees, reversals, transfers and card settlements carefully.

Configure collectors and agents to use the intended Asia/Dhaka calendar date. For timestamped messages, convert to that zone before taking the date. Never use the message's received date as a guessed transaction date when the alert says something different. Base currency is BDT; foreign-currency conversion is not implemented.

## Duplicate protection

Use a stable `externalId` from the original SMS/email collector for each message. Replaying the same source, external ID and body returns the existing event. Changing the body under that ID returns a conflict. To correct a staged draft, use `event_update` instead of resending a changed delivery.

Cross-channel deliveries may have different collector IDs. Keep the bank reference when available so the service can warn about related alerts. Matching financial details may also need review. Equal amounts alone do not prove duplication: two legitimate purchases can have the same amount and date. Inspect the candidate before acknowledging a duplicate warning.

Accepted events link to one financial transaction. Posting is atomic: saving the transaction, linking the event, revision advancement and retry protection succeed together. Replaying acceptance cannot post it twice. A human/agent that ignores duplicate warnings can still deliberately create two separate entries; review intent matters.

## Review commands

Read `/api/v3/automation`, copy its revision, and send a command envelope to the same endpoint. `event_update` replaces the complete draft. Use the generated schema for all draft fields: account, description, type, category/categoryId, date, poisha, merchantId, tagIds, notes, status and excluded.

```json
{
  "expectedRevision": 12,
  "requestId": "accept-BGDEMO001-v1",
  "command": {
    "type": "event_accept",
    "id": "YOUR_EVENT_ID",
    "acknowledgeDuplicate": false
  }
}
```

Set `acknowledgeDuplicate:true` only after explicitly reviewing the warning and deciding the transaction is distinct. Accept requires valid owned account/classification references and a complete draft. Ingestion alone never posts a transaction. `event_ignore` with `ignored:true` removes an unaccepted event from review; `ignored:false` returns it. It is not a financial deletion command.

## Preferences that affect this workflow

Settings → Preferences saves the locale (`en-BD` or `bn-BD`), comfortable/compact density, emerald/teal/amber accent, week start, fiscal-year start month and default transaction status. Locale controls supported financial/date formatting; it is not a claim that every interface sentence has a Bangla translation. Asia/Dhaka and BDT remain the current model's time zone and currency.

Default status is applied to newly staged drafts unless a structured input explicitly supplies one. Pending accepted entries remain outside posted balances and spending until confirmed. Pausing automation or disabling its source blocks intake, including delivery replays; existing events can still be read for reconciliation. Raw retention controls are separate from intake pause.

Reports includes **Fiscal YTD** using your saved start month (July by default), through the selected report date. For example, a 30 June 2026 anchor with July start selects 1 July 2025–30 June 2026; 1 July 2026 starts a new range. This is a configurable reporting period, not a tax-return calculation. Previous-period comparisons keep the existing equal observed-day semantics.

## Raw messages and sensitive data

Raw-message storage defaults to off. The service may process text to extract fields while retaining only the normalized event. Saving retention off purges previously retained inbox text in Budget Go; extracted drafts remain. Copies held by your collector, email/SMS provider, execution history or backups are outside that purge. Treat message bodies and extracted metadata as private financial data.

Do not forward OTPs, PINs, passwords, CVV/CVC or login/security messages. Recognized secret patterns are rejected even when raw retention is disabled. This detector is a safeguard, not a guarantee that arbitrary text contains no secret. Filter before submission too.

## Useful Bangladesh-specific extensions

The inbox is the foundation for bank-alert templates, mobile-wallet receipts, service charges, cash-out fees, payroll notifications and Bangla descriptions. It currently supports reviewed income/expenses. Do not auto-post both sides of an own-account transfer as income and spending; use the existing atomic transfer workflow. Automated matching, separate fee splitting, statement reconciliation and bank-specific verified templates remain future work.
