# Monthly budget planning

Budgets combine monthly expected income, an overall spending target and category limits. They describe your plan; saving or copying a budget does not create income or expense transactions.

## Set the monthly plan

Choose the month, expected income and planned spending. Both targets can be zero and must be exact non-negative BDT amounts. The API uses integer poisha.

```json
{
  "expectedRevision": 25,
  "requestId": "monthly-plan-001",
  "command": {
    "type": "monthly_plan_set",
    "month": "2026-11",
    "incomePoisha": 8000000,
    "spendingPoisha": 5000000
  }
}
```

Send this to `/api/v3/planning` or MCP `planning_mutate`. Read the current shared revision before a new command. Exact request-ID replay is safe after an unknown response.

Category limits remain ordinary workspace budgets. They do not automatically change when the overall target changes. A target and a category allocation are different planning levels; planned income minus planned spending is the planned remainder, not your account balance.

## Allocate spending by category

Set a positive category limit for a month. Parent-category spending includes its descendants. When summarizing allocations, a parent limit already covers its child subtree, so overlapping parent and child limits are not added twice. Unallocated spending is the overall target minus those top-level category limits; a negative result means allocations exceed the target.

Actual spending includes confirmed, non-excluded expenses posted through the reporting date. Pending/future entries, internal transfers and account openings do not count as spending. Existing unassigned legacy expenses can still affect category spending even though they do not affect an account balance.

## Copy category limits to another month

Choose Copy previous month on an empty target month. The command `{type:"budget_copy",fromMonth:"2026-10",toMonth:"2026-11"}` goes to `/api/v4/workspace` or MCP `workspace_mutate` with the normal envelope. It copies category limits and stable category references; it does not duplicate actual transactions or replace an existing target month's budgets.

The source and target months must differ. An existing target plan of category limits causes a conflict rather than silent overwrite. Classification validation and workspace caps still apply; restore archived categories before assigning them in a new month. The operation is atomic and replay-safe.

Copying category limits is separate from `monthly_plan_set`: set the target month's expected income and overall spending target deliberately. Removing a category limit or changing a target leaves financial transactions intact.

## Current boundaries

This implements manual expected-income/spending targets, hierarchical category limits and safe copying. It does not yet implement AI/history suggestions, shared child allocations, carry-over, envelope transfers, investment/debt planning or full Sure budget-setup parity. Financial schema4 export contains category budgets; monthly plans are planning data and are included in Settings → Backups full-format export/restore. See [Full backup](backup.md).
