# Transaction classification rules

Open **Settings → Transaction rules** or `/rules`. Rules describe deliberate changes to existing transactions. They do not run automatically on new imports, incoming bank alerts or a background timer.

## Define a rule

Give the rule a name, active state and priority. All conditions must match (AND). Supported fields are description, notes, category label, account ID, transaction type and merchant ID, with case-insensitive `contains` or `equals`. A rule has 1–8 conditions. Priority orders the list; it does not automatically execute a chain of rules.

Actions set a category, merchant, complete tag selection, notes or report exclusion. Tags are replaced, not appended. Explicit `merchantId:null` clears the merchant and an empty tag array clears tags. No action can change amount, account, date, direction or status. Categories must be compatible with the transaction type and newly assigned classifications must be active and owned.

## Preview, then apply

Preview shows before/after classification and any blocking issues without making changes. At most 100 previews are returned, with total/has-more metadata for larger matches. Select the intended IDs and explicitly apply. The server rechecks matching conditions, ownership and the shared revision before committing the selected changes and a run-history record atomically. A paused rule cannot be applied. Archived accounts must be restored before edits.

Run history records rule ID, timestamp, selected count and changed IDs. It is an application audit, not a scheduler/job history and not an automatic undo system. Review transaction changes directly if a rule needs correction.

## API and MCP

Read `GET /api/v4/workbench` or `workbench_get`. Save through `POST /api/v4/workbench` or `workbench_mutate` using the shared command envelope.

```json
{
  "expectedRevision": 12,
  "requestId": "rule-create-example-1",
  "command": {
    "type": "rule_create",
    "rule": {
      "name": "Reviewed rent notes",
      "active": true,
      "priority": 10,
      "conditions": [{"field":"description","operator":"contains","value":"rent"}],
      "actions": {"notes":"Reviewed housing payment"}
    }
  }
}
```

`rule_update` takes `id` and the complete `rule`. `POST /api/v4/workbench/preview` takes `{ruleId,ids?}` and requires `finance:read` (cookie POST still requires Origin); MCP uses `rule_preview`. `rule_apply` takes `id` and 1–100 unique selected transaction `ids`, through the mutation envelope with `finance:write`. Preview is read-only; apply is not implied by preview intent.

Limits: 500 rules, priority 0–9999 and 1,000 run-history records. Retire/pause unused rules; rule deletion/history pruning require later lifecycle work. Nested OR groups, amount/date predicates, effective-date scopes, name changes, AI actions, transfer/payment actions and future-entry automation remain beyond this slice. See [API reference](api.md) and [Feature coverage](parity.md).
