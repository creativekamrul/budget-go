# Independent review — server milestone

## Status and boundaries

New authorized milestone: Next.js REST, Prisma/Postgres, Auth.js explicit multiuser, dark-only UI, no sample mode/data, n8n read/write MCP over actual Streamable HTTP. Prior localStorage review is historical and does not establish server security or persistence correctness.

Reviewer owns this report and `tests/server-acceptance.mjs` only. Independent source review and ten no-database helper/real-SDK check groups passed. Lead subsequently executed the reviewer-authored service harness against an explicitly authorized disposable PostgreSQL database: seven groups passed with exact generated-account cleanup reported. This was Lead-executed, not Reviewer-direct execution; details and attribution follow below. Lead also executed nine actual Auth.js/REST/official-SDK-MCP/browser groups successfully on the isolated test app; Reviewer independently read the sanitized artifacts and test assertions. External n8n remains unrun. No stub establishes database behavior and no test fixtures are authorized in the application financial database.

Invite-only email/password is the proposed lifecycle, not an independently confirmed user requirement beyond Auth.js. Lead must keep this assumption explicit.

## Critical acceptance matrix

### Tenant isolation and authorization
- Two independently authenticated users A/B; B's transaction/budget/token IDs in A's get/edit/delete requests must not reveal or mutate B's records. Include missing IDs, valid-looking IDs, list filters, empty lists, pagination, date/month bounds, aggregates, import/export, and every MCP tool.
- Tenant derives solely from verified credentials/session, never request body/query/backup owner IDs. Strict backup schema rejects injected ownership fields. Whole-data replacement affects only the caller across all months, not other users.
- Unauthenticated REST/MCP access is rejected without revealing financial data. Check all route verbs; unsupported verbs cannot bypass gates.

### Auth.js and credential/session lifecycle
- Login verifies stored password hashes, generic invalid-credential messages, bounded input and brute-force mitigation. No public registration unless explicitly authorized. Invitation/setup commands do not log plaintext secrets.
- Every sensitive session request rechecks active state and sessionVersion; disabling a user or incrementing sessionVersion invalidates existing sessions, including prior JWTs. Expired/forged sessions fail closed.
- Cookie-authenticated mutations enforce an explicit trusted Origin/CSRF policy, including missing/null/foreign Origin and cross-site form requests. Read-only routes do not change state. Deployment Host/proxy configuration must not turn untrusted Host into an Origin allowlist.

### Bearer lifecycle and scopes
- Random high-entropy plaintext appears only once at creation; persistence stores a cryptographic hash, not reversible/plaintext token. Authentication rejects expired, revoked, inactive-owner and invalid-version credentials.
- Test read-only token mutation rejection and minimal-scope grants for every REST/MCP operation. Bearer authentication cannot mint/manage privileged tokens or fall back to an authenticated cookie when the Bearer header is malformed/invalid/expired. Define precedence when both cookie and bearer exist.
- Revocation is effective on the next request; token list/errors/logs never include token hashes or plaintext. No bearer credentials in URLs.

### Transactional integrity and money
- Postgres-backed writes compare expected revision and increment atomically in the same transaction as mutations; concurrent same-revision writers yield one success and a conflict, not two successes/lost data. Independently test transaction CRUD, budget changes and import racing other mutations.
- All money uses integer poisha with explicit safe limits and BigInt where required; no float conversion for parsing, sums, formatting or Prisma serialization. Aggregate checks and persistence occur under the same lock/serialization boundary.
- Validate strict keys, positive safe amounts, type/category/date/month, unique per-tenant category/month budgets and count/byte limits. Test leap/calendar boundaries, exact .01/.29/MAX_SAFE fractions, sums exceeding limits, unsafe revisions and invalid JSON.
- Invalid/failed import leaves tenant records and revision unchanged; whole replacement is atomic, including injected database failure. Empty replacement is intentional. Exports include only caller data and roundtrip under byte/count caps.

### MCP and n8n interoperability
- Actual official SDK Streamable HTTP initialization, initialized notification, tools/list and tools/call sequence; protocol/session/version/content-type handling and proper errors. REST-shaped JSON pretending to be MCP is insufficient.
- Use same authorized tenant services as REST, not duplicate permissive queries. All read/write tool calls test user isolation, scopes, invalid input and conflict behavior. If MCP sessions exist, bind them to authenticated user/token and prevent cross-credential session reuse.
- Manual n8n bearer setup is explicitly documented; do not claim OAuth discovery or automatic OAuth integration. MCP endpoint rejects untrusted Origins where applicable and avoids leaking credentials in debug output.

### UI and operational evidence
- No sample buttons/data or application seed fixtures. Dark-only UI and Auth.js redirects/logout/session-expiry behavior need actual browser checks after implementation.
- No secrets in tracked files, API responses, diagnostics or screenshots. Errors retain useful conflict/validation distinctions without database details.
- Missing database or auth configuration produces truthful setup/unavailable states, not success or fake persisted data.

## Execution policy

Read package scripts and actual schema/services/routes before enabling tests. Pure validation/source checks may run without Postgres, but must be labeled accordingly. Database tests require an explicitly designated dedicated test database and test credentials, must refuse ordinary production DATABASE_URL by default, and must clean only uniquely prefixed test-created identities. Never reset/migrate/seed the user's financial database as a test convenience.

## Independent checks executed

Command: `node tests/server-acceptance.mjs --pure` — exit 0, ten check groups passed against the current implementation. An initial harness argument-parser bug was fixed before the successful run; it was not an application failure.

The harness transpiles actual TypeScript modules in memory. Only database and Auth.js session entrypoints are substituted with throwing sentinels, so no connection or authenticated identity is created. The actual MCP SDK and official WebStandard Streamable HTTP transport execute in process. These boundaries deliberately prevent database/session acceptance claims.

1. Strict safe revision parsing and rejection of ownership/unknown fields.
2. Exact MAX_SAFE `.91` money parsing/edit prefill, unsafe amount rejection and leap dates; strict backup ownership-field rejection.
3. Real scrypt salted hashes, correct/wrong password verification, malformed hash and password bounds.
4. SHA-256 token hashing; bearer rejection from list/mint/revoke before database access; malformed bearer rejection.
5. Trusted configured Host/Origin, absent/null/foreign cookie-write Origin, malformed Authorization with no session fallback, and unsafe APP_URL rejection.
6. JSON media type, malformed body, enormous declared length and streamed actual byte limit. Builder tightened media-type comparison; independent regression verifies `application/jsonp` rejects with 415.
7. Generic unexpected-error redaction and no-store response; explicit conflict error retained.
8. Actual SDK initialize, initialized notification (202), tools/list (11 tools; no account/token administration), unacceptable Accept header (406), invalid tool input, and safe service-unavailable tool output when the database sentinel throws. No financial operation successfully executes.
9. Actual NextRequest loopback normalization regression: configured 127.0.0.1 with normalized localhost URL is accepted only with exact raw Host and original Origin. IPv6/localhost cases pass; absent/evil/alternate/wrong-port Host, foreign URL host/protocol/port, foreign Origin and non-loopback internal-origin substitution reject. This verifies the helper/framework construction in process, not a rebuilt deployed route.
10. Dedicated database identity preflight using dummy URLs: maintenance/provider options are accepted only on the comparison reference; target allows schema=public but rejects nonpublic/duplicate mixed schemas, unknown options and search-path overrides. Same host/database identity remains equal despite different users/ports/schemas.

## Source findings and limits

Independently read auth/session callbacks, password implementation, finance/token/HTTP/MCP services, database lazy initialization, schema, initial migration, user administration and all REST/Auth/MCP route handlers. No material tenant/auth defect identified in this source pass; this is not a security certification.

- Actor ownership is server-derived. Mutations lock the user row before rechecking active/sessionVersion and bearer expiry/revocation/database scopes, compare expected revision, validate complete tenant state and persist in one transaction. Reads use RepeatableRead. Per-user record keys/filters and tenant-only replacement are present. Actual rollback and one-success/one-conflict concurrency now have Lead-executed service evidence below; broader race coverage remains pending.
- Token entropy/hashing, once-only plaintext response, session-only management and tenant filtering are present. Admin reset increments sessionVersion and revokes tokens under the same user lock. Real service revocation/disable/version checks now have Lead-executed evidence below; Auth.js cookie invalidation/reset has subsequent Lead-executed HTTP evidence below.
- Cookie-origin and trusted-host policy, bounded body reads and sanitized generic errors are present. Builder moved a database read outside the validation-error catch; independently observed source structure, but no real driver failure was induced.
- MCP uses the real SDK with stateless request transports and shared finance services. Tool descriptions explicitly require human confirmation for destructive changes and describe manual bearer rather than OAuth. The server cannot itself prove an external automation obtained human confirmation.
- Migration contains per-record money/revision/category/hash/scope checks and tenant foreign keys. It was read, not applied or exercised by Reviewer.
- Invite-only credentials and conservative global login rate limiting are operational assumptions. Global throttling can temporarily deny all logins after abusive attempts; production rate-limit/reverse-proxy policy needs an operator decision.

## Outstanding release evidence

Service and authenticated HTTP/SDK/browser evidence was subsequently supplied and independently inspected as recorded below; this matrix is a target coverage plan, not a claim every permutation was exercised. Remaining release gaps: actual external n8n/hosted HTTPS, full authenticated post-CSS-patch rerun, genuine 200% browser zoom, screen-reader/full-state contrast, database-unavailable recovery and broader race/security hardening. V1 browser results do not cover this rewrite.

Reviewer did not migrate, seed, reset or write to any database. Do not describe these ten no-DB groups as ten integration tests or a production/security pass.

## Opt-in PostgreSQL service harness — Lead-executed evidence below

`node tests/server-acceptance.mjs --database` is restricted to explicitly authorized disposable-database runs; its existence never authorizes application-database testing. It requires TEST_DATABASE_URL, an explicit application DATABASE_URL reference for comparison, and BUDGET_GO_ALLOW_TEST_WRITES=1, refuses the application DATABASE_URL host/database regardless of credentials/port/schema, normalizes loopback aliases, allows only the default schema=public on the test target, rejects nonpublic schemas/search-path/unknown test URL options and test maintenance database names, and refuses an initialized client or a test database containing existing accounts. DNS aliases are not proof of separate servers: the operator must designate a truly dedicated database.

Only the database URL environment is switched inside the fresh test process. It uses actual TypeScript service modules, generated Prisma and PostgreSQL, never the pure-runner sentinels. Migrations must already be applied by an authorized operator; this harness does not migrate/reset a schema. Two unique test-only accounts are created and only their exact successfully created IDs are deleted in finally, with dependent fixtures removed through their foreign-key cascades. Errors are redacted to avoid disclosing credentials. Cleanup failure makes the run fail and requires operator inspection of the dedicated test database.

Authored groups cover empty accounts; cross-tenant transaction/budget/token ID rejection; same record IDs in separate tenants; CRUD/summary/month budgets and backup replacement isolation; concurrent same-revision writers (one success/one 409); unsafe aggregate/invalid import/date preserving state/revision; actual SQL failure after service deletes proving rollback; read-only token rejection; hashes/nonsecret metadata; revocation/expiry; cached token/session actor version and inactive-owner rechecks. Rollback fault injection wraps the transaction callback only to raise a real PostgreSQL division-by-zero at createMany after real deletes; it returns no fake database success and modifies no schema.

Reviewer independently executed syntax/lint and --pure: exit 0, ten groups pass. Lead later executed the PostgreSQL branch successfully after the preflight correction described below. Auth.js HTTP cookies, deployed REST/MCP and n8n/browser acceptance remain separate from these service groups.

## Connection/migration handoff and safe next setup

Lead-reported only: the user supplied a private application database connection; Lead's initial PostgreSQL SELECT 1 succeeded, with zero public tables and no Prisma migration table. User explicitly authorized applying migrations to that application database. Lead subsequently reported migration `20261105000000_initial` applied successfully (job pwsh-c85f77f09ed7449b, exit 0), followed by read-only `npm run db:check` passing all model checks (job pwsh-9843debf7e794bac, exit 0). Lead reported no fixtures, administration-created accounts or seed data; the application was restarting on its existing port 3000 with environment configuration. Reviewer did not independently execute or inspect those jobs, read private environment files/connection strings, or query this database. Migration/model availability does NOT establish authenticated financial acceptance or authorize automated test accounts/financial writes there.

Recommended authenticated acceptance setup:
1. Operator provisions an empty disposable PostgreSQL database (or empty provider branch without copying financial/user data), a dedicated least-privilege test role, and privately supplies TEST_DATABASE_URL. Do not reuse the application database with a different schema/user/token. Explicitly authorize migrations and fixture writes on this disposable target.
2. Keep the application DATABASE_URL available only as a private comparison reference for service-test preflight. The harness now fails closed when that reference is absent, rather than skipping the collision comparison. No private environment file is read by the harness. Hostname aliases cannot prove separation; operator verification is required.
3. An authorized operator applies the committed migration to the disposable target only. Then authorize the --database service run; it requires an empty User table and cleans its exact two generated accounts. Do not create browser-login fixtures before this run, or its empty-account guard will correctly refuse.
4. For separate HTTP/browser/MCP checks, explicitly authorize a test-only application process on a separate port, configured to the disposable database, a unique test AUTH_SECRET, exact APP_URL/AUTH_URL and isolated test login credentials. These must never replace the live application process/configuration. A separate build/output directory may be needed to avoid competing Next.js build artifacts.
5. Create two uniquely named test-only login accounts on that disposable target via approved administration. Exercise real Auth.js cookies/Origin, two-tenant REST CRUD/import/export and every MCP tool, token expiry/revocation/read-only scope, and actual n8n manual-bearer connection using only synthetic test finances. Never capture passwords, cookies or bearer plaintext in logs/screenshots. No OAuth claim.
6. Stop the test-only process, revoke test credentials and remove only exact test-created identities (or have the operator drop the expressly disposable database). Do not run broad cleanup against the application database.

Later authorization: Lead reports the user explicitly approved a uniquely named temporary database on the same PostgreSQL server, fixture testing there and dropping that temporary database afterward. Lead reported creating/migrating the empty temporary target and privately configuring the test process. Reviewer started the gated service command only after Lead's ready signal, before any other test accounts were created. No fixture-write authorization applies to the application database. First authorized execution: `node --env-file=.env --env-file=.env.test-service tests/server-acceptance.mjs --database` exited 1 (Reviewer job pwsh-11b1d4d647224f8d), before any acceptance group or success/cleanup output. The original redacted diagnostic did not preserve the underlying error code, so no database success or fixture-state assertion follows from this attempt. Lead identified a prior tsx/esbuild sandbox EPERM risk; Reviewer did not retry another execution route or request unavailable escalation. Safe stage/error-code-only diagnostics were added and the exact command handed to Lead for approved execution. Lead's next run proved failure was in preflight, before imports (not demonstrated EPERM): schema=public was rejected by an overstrict harness check. The harness was corrected to distinguish target restrictions from application-reference comparison, allow only default public schema on the target, retain strict isolation/options restrictions and emit nonsecret reason codes; ten independent pure groups and lint passed afterward.

## Actual PostgreSQL service result — Lead executed

Lead reported running the corrected exact service command with approved capabilities: job pwsh-f493ac406c924f7c, exit 0. All seven groups passed:
- Empty accounts, tenant-ID isolation and identical per-record IDs in different tenants.
- Transaction/budget CRUD, month summaries and tenant-isolated JSON replacement roundtrip.
- Same-revision concurrent writes: exactly one success and one 409.
- Invalid import/date and unsafe aggregate leave finance rows/revision unchanged.
- Real PostgreSQL division-by-zero after service deletes rolls back rows/revision.
- Token hashing/nonsecret metadata, read-only scope, token ownership, revocation and expiry.
- Cached actors rechecked against user active/sessionVersion and token validity.

Lead reported exact generated account cleanup completed; no application-database fixtures were created. Reviewer authored/read the executed harness but could not retrieve the other session's job: job_output returned `belongs to another session`. These are therefore explicitly Lead-executed/reported results, not independent Reviewer-direct runtime observation. Reviewer independently read the sanitized Lead-created result artifact `artifacts/review/service-results.json`: it records the same executor/job/exit code, seven group names, disposable-target distinction and exact-account cleanup. This corroborates the reported evidence artifact without changing runtime execution attribution. The first HTTP run stopped after its initial authentication pass because its custom Host assertion used fetch, which did not transmit the intended override. Builder replaced that assertion's transport with node:http and reran the whole suite successfully (evidence below). This was a harness correction, not a claimed product security fix.

## Actual authenticated HTTP, SDK and browser result — Lead executed

Reviewer independently read `artifacts/v2-auth/http-results.json` and `artifacts/v2-auth/browser-results.json`, and read the complete implementation/assertions in `tests/auth-http.mjs` and `tests/auth-browser.mjs`. Lead executed job pwsh-7a1f2de0ba6c4c16, exit 0, nine groups:
- Real Auth.js credentials cookies for two accounts; wrong-password rejection and isolated account identity.
- Actual Host/Origin defenses and invalid bearer precedence without cookie fallback.
- Tenant REST CRUD, query filters, month budgets and unsafe-integer aggregate rejection.
- HTTP revision conflicts and whole-tenant JSON replacement/export.
- Session-only credential management, stored token hashing, scope enforcement and no-store responses.
- Actual browser login, 12.34 create → 12.35 edit → reload → delete and sign-out/protected-route redirect.
- Official SDK client initializes the actual StreamableHTTP endpoint, lists all 11 tools, exercises finance tools and checks scope/conflict/ownership rejection.
- HTTP token revocation/expiry and disabled-account rejection.
- Admin CLI password reset: old real cookie and bearer rejected, new password accepted and old password rejected.

The browser artifact records 15 authenticated captures at 360/768/1440 widths, no page errors and no financial webStorage. Reviewer directly inspected the overview/settings 360px screenshots: dark account-scoped interface and manual-bearer messaging are visible. These captures and JSON are independently inspected artifacts of Lead's runtime execution, not a Reviewer-driven browser session. Lead reports exact fixture cleanup, isolated port-3100 server stopped, test environment files removed and temporary database dropped. The application database received no test fixtures.

### Final bounded assessment

No material unresolved tenant-isolation, money-integrity or authentication finding was established in this review. Service7 + HTTP9 + browser evidence supports the exercised flows, not an exhaustive security certification. The milestone is reviewed with these explicit limits:
- Actual external n8n connection is NOT RUN; official SDK compatibility is not a substitute for that acceptance.
- Genuine 200% browser zoom, screen-reader operation, exhaustive all-control/all-state contrast and real PostgreSQL outage recovery are unverified.
- Reviewer raised a possible 360px footer clipping edge. Designer checked actual source-markup/current-CSS in a targeted DOM replica; Reviewer independently read `artifacts/design/chrome-replica-results.json` and its viewport-only footer screenshot. Client/scroll widths match at 345/753/1425; month right edges 329/729/1385 retain 16/24/40px margins. The footer candidate is not a confirmed live defect. Designer separately confirmed/fixed a 768px topbar clip; replica shows its account row at y72–116 with 44px controls. This is targeted replica evidence, not authenticated-app rerun. Lead subsequently rebuilt/restarted and verified served CSS as recorded below; no postpatch authenticated full browser rerun is claimed.
- Authenticated/test-user-only checks ran on a disposable database/app, not a production deployment. Invite-only administration and manual bearer tokens remain the implemented lifecycle; no OAuth n8n consent flow is implied.

## Final build/served-artifact closure — Lead executed

Reviewer independently read `artifacts/v2-auth/final-release-results.json`. It records Lead's final build exit 0 (job pwsh-b2f15e2eafbf4ca7), restarted production server on the existing http://127.0.0.1:3000, and successful served-asset/public tests (job pwsh-504da451d6f24c99, exit 0). Login returned 200, final tablet-header/footer-wrap CSS was served, four public browser groups passed with no page errors, and the temporary database/server/private test files were removed. No first real account was created by testing. This closes rebuild/served-artifact delivery evidence; authenticated HTTP9 remains pre-CSS-patch evidence supplemented by targeted source-markup geometry, not a full authenticated postpatch rerun. Hosted HTTPS and actual external n8n remain NOT RUN.
