# Full workspace backup and restore

Use **Settings → Backups** to download the current owner's supported application data. This full format is distinct from Home’s financial JSON export and from historical V1/V2/V3 files. Only a full `budget-go-full` format 1 file with the supported model version can be restored here. There is no Sure-export import compatibility.

## Included and excluded data

The 20 supported data models cover financial accounts, transactions/tags, transfers, valuations, matching audit, budgets and classifications; preferences and automation sources/events; recurring definitions/occurrences, split provenance and monthly plans; rules, rule runs and staged statements/reconciliation. Retained automation message text is included when present. Treat the file as private readable financial data.

Password hashes, sessions, integration tokens, login/security rate limits, owner IDs and request receipts are excluded. The profile name in the file is informational: restore preserves the current account’s name, email and password. Existing authentication and tokens remain valid, and existing command receipts remain as tombstones so a prior request cannot silently reapply. Downloaded backups are not encrypted by this application.

## Validate and restore

1. Download a current full backup before replacing anything.
2. Select the intended JSON file (maximum 64 MiB) and **Validate backup**.
3. Review the checksum, counts for every model and replacement/privacy warnings. Validation checks structure, supported version, bounded size and checksum; complete financial/reference validation also runs during the restore transaction.
4. Confirm the review checkbox, type `RESTORE` and enter your current password.
5. **Replace workspace from backup** deliberately replaces the signed-in owner’s supported records atomically. A financial/reference failure or ID conflict rolls back the replacement. Other owners are not changed.

The checksum detects changed files; it is not an authenticity signature or encryption. Do not edit a file and invent a checksum to bypass review. A structural validation success does not guarantee that all cross-domain references will pass restoration.

If another tab/integration changed the shared revision, reload the saved revision while retaining the draft, review and submit deliberately. After an unknown network outcome, keep the page open and retry the same retained request ID; do not choose a new file or issue a different restore. The server receipt makes an exact committed restore replay safe. A successful restore reloads the workspace.

## Browser-only API

| Endpoint | Input or result |
| --- | --- |
| `GET /api/v4/backup` | Downloadable versioned JSON with checksum and 20 tables |
| `POST /api/v4/backup/validate` | `{backup}` → `{checksum,counts,warnings}` |
| `POST /api/v4/backup/restore` | `{backup,currentPassword,expectedRevision,requestId}` → `{restored,revision,counts,replayed}` |

These endpoints require a valid browser session. Bearer tokens and MCP cannot export, validate or restore full backups. Cookie POSTs require the configured matching Origin. Typed confirmation belongs to the app UI; the server enforces password, owner scope, revision, receipt and data validation. Restore and security actions share a five-failed-password-attempt limit per15 minutes. Never log the password or readable backup body. The OpenAPI document describes the exact scalar fields generated from the current Prisma model registry.

## Operations boundary

This is application-level owner recovery, not a PostgreSQL disaster-recovery plan. Keep separately managed encrypted database backups, migration history, configuration and deployment credentials. Model-version changes can require an explicit future migration tool; old files are rejected rather than partially restored. No scheduled/offsite backup, automatic retention policy or infrastructure recovery has been configured. See [Security](security.md) and [Operations](operations.md).
