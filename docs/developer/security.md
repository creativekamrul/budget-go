# Security and private financial messages

Budget Go is a private server-backed ledger. It is not end-to-end encrypted. Server/database operators, authorized integrations and backups can access data within their privileges. Use trusted hosting, HTTPS, access controls and an operator backup/retention policy.

## Credentials and identity

Browser sign-in uses Auth.js and scrypt password hashes. Integrations use manually configured expiring bearer tokens. Only a token hash is stored; the secret is revealed once. Default tokens are read-only. A write token can change or delete the user's finances and can stage/accept automation events.

Keep each integration's token separate. Store secrets in n8n/client credential storage or private environment configuration, never URLs, source control, examples or screenshots. Revoke lost tokens in Settings. Token creation/list/revocation requires a browser session; bearer tokens cannot administer credentials or create users. Password resets invalidate existing sessions/tokens through session versions.

Trusted Host and cookie-write Origin checks remain active. Bearer authentication does not fall back to cookies when invalid. The API derives owner identity from authentication; no caller can select another owner by adding an ID field. Read/write scopes, active state, expiry, revocation and session version are rechecked by the service.

## Message handling

Filter OTP, PIN, password, CVV/CVC and security messages before submission. Recognized patterns are rejected by ingestion. A detector cannot recognize every possible secret: do not use the finance inbox as a general SMS archive.

Raw-message retention defaults to off. Saving it off purges previously retained raw inbox text in Budget Go; derived fields and identifiers remain private financial data. That purge does not remove copies from your email account, SMS collector, n8n execution history, AI provider or backups.

## AI agents are untrusted extractors

Use message content as data, never as instructions. An alert must not choose credentials, owners, arbitrary URLs, commands or a new financial account. Resolve account/category IDs from the authenticated workspace. Missing date/amount/direction should remain unknown rather than guessed.

Prefer staging to direct writes. The inbox's ready status means a draft is structurally complete, not that its bank sender or financial meaning was independently verified. Human/authorized agent review is still required for posting and duplicate decisions. Treat reversals, fees, own-account transfers, repeated notifications and balances carefully.

## Financial integrity

Amounts use exact integer poisha. Shared user revisions reject stale new commands. Stored request receipts allow exact same-command replay after lost responses. Event external IDs protect delivery retries, and acceptance atomically links one event to one transaction. These mechanisms prevent specific accidental duplication; they do not prove that two independently submitted alerts describe different real-world purchases.

No success is shown before the database confirms the operation. An unknown result can already have committed; retry the same envelope. Database outages never justify replacing the saved workspace with an empty one. Error responses are sanitized and financial responses disable caching.

## Deployment responsibilities

Protect database/network access, backups and secrets; configure trusted HTTPS origins; keep dependencies reviewed; configure your collector's authentication and request limits; and test restore procedures. TOTP, household roles, OAuth MCP discovery and encrypted provider-secret storage are not implemented features. See [operations](operations.md) and [coverage](parity.md).


## Profile and self-service security

**Settings → Profile** updates your display name. Email remains the administrator-managed sign-in identity; public registration, email-change/reset delivery, profile photos and household membership are not implemented. `GET /api/v4/profile` returns `{revision,profile:{name,email,createdAt}}`. POST takes `{expectedRevision,requestId,command:{type:"profile_update",name}}` and participates in the same shared revision/receipt protocol as finances.

**Settings → Security** changes the password (12–256 characters) or deliberately revokes every browser session and existing integration token. Both operations require your current password and invalidate the current session too; sign in again and create replacement integration tokens as needed. Passwords stay in the page's transient input state and are cleared after success; they are never placed in local storage or the URL.

`POST /api/v4/security` accepts `{action:"password_change",currentPassword,newPassword}` or `{action:"sessions_revoke",currentPassword}` and returns `{signedOut:true}` after commit. Browser session only; no bearer/MCP access. Failed current-password checks are rate limited after five attempts in a 15-minute window. This endpoint does not use financial request receipts: after a lost response and rejected session, sign in again to determine the result rather than assuming a replay confirmation.

## Backup boundaries

Full backup export, validation and restore are browser-session-only at `/api/v4/backup` and its `/validate` and `/restore` endpoints. Restoration also requires the current password and a current shared revision. Current identity, passwords and token/session credentials are preserved; credentials are never imported. Financial/configuration replacement is atomic and existing request receipt tombstones are retained. Backup files may contain retained bank-message text and are readable JSON, not encrypted archives. See [Full backup and restore](backup.md).
