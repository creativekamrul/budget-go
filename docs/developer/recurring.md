# Recurring bills and income

Create a recurring schedule for rent, subscriptions, salary or another repeatable financial entry. A schedule is a plan, not posted money. Reading schedules or upcoming occurrences never creates a transaction or changes account balances.

## Define a schedule

Choose a name, financial account, income/expense direction, category, amount, start date and weekly/monthly/yearly frequency. Merchant, tags, notes, status and report exclusion can accompany the transaction template. Existing ownership, classification and exact-money validation applies.

```json
{
  "expectedRevision": 20,
  "requestId": "rent-schedule-001",
  "command": {
    "type": "recurring_create",
    "schedule": {
      "name": "Monthly rent",
      "transaction": {
        "accountId": "YOUR_ACCOUNT_ID",
        "description": "Monthly rent",
        "type": "expense",
        "category": "Home",
        "categoryId": null,
        "poisha": 2000000,
        "merchantId": null,
        "tagIds": [],
        "notes": "",
        "status": "confirmed",
        "excluded": false
      },
      "startDate": "2026-11-01",
      "frequency": "monthly",
      "active": true
    }
  }
}
```

Send planning commands to `/api/v3/planning`, or use MCP `planning_mutate`. Read `planning_get` / GET `/api/v3/planning` for schedules, recorded occurrence links, split audit and monthly budget plans. It returns the same shared financial revision used by workspace and automation commands.

## Calendar behavior

Weekly dates remain anchored to the original start date, seven days apart. Monthly schedules retain the original day: a schedule starting January 31 uses February's last day, then March 31. A yearly February 29 schedule uses February 28 in non-leap years and February 29 when valid. Dates are calendar dates; financial today follows Asia/Dhaka.

The upcoming list is a forecast. Overdue occurrences remain eligible for deliberate recording. Future occurrences cannot be recorded early through this command. Upcoming values are not added to account balances, budgets or report totals.

## Record one due occurrence

Review an occurrence and choose Record. The command is `{type:"recurring_record",id:"YOUR_SCHEDULE_ID",date:"2026-11-01"}` inside a current-revision/request-ID envelope. The date must be a valid occurrence of that owned active, unarchived schedule and must not be in the future.

Recording creates one ordinary financial transaction using the schedule's current template and the occurrence date. A saved occurrence link protects against duplicate recording, including new request IDs and retries after the generated transaction was later deleted. Deleting a generated entry is a deliberate financial change; it does not make the occurrence eligible to create another entry silently.

If the template is pending, the created transaction remains pending and does not affect posted balances until confirmed. Archived accounts/classifications, invalid chronology and aggregate-money limits reject recording without a partial transaction or receipt.

## Change, pause or archive

Editing a schedule changes future unrecorded occurrences; existing financial entries are not rewritten. Start date and frequency are immutable after creation. Create a replacement schedule when the recurrence anchor must change, and pause/archive the old one deliberately.

Pause stops recording and upcoming active forecasts while retaining the definition/history. Archive keeps historical links and allows later restoration; it does not delete posted financial entries. Resume only when the schedule is intended to run again.

This release uses explicit recording. It does not install a background scheduler, infer recurring patterns from imports, initiate bank payments, send reminders or automatically post forecast amounts.
