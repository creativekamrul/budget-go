# Setup and operations

For a versioned container installation, start with [Docker installation and upgrades](docker.md). Choose bundled persistent PostgreSQL or supply an external connection. The public GitHub Pages site hosts documentation only; the authenticated Next.js app runs on your own server.

The application uses Next.js App Router, TypeScript, Tailwind/shadcn-style Radix primitives, Prisma/PostgreSQL and Auth.js. It supports BDT integer poisha. Read the root README for the pinned Node/npm requirements and installed scripts before changing the environment.

## Local setup

1. Install the lockfile with `npm ci`.
2. Configure the ignored `.env` using `.env.example`. Set `DATABASE_URL`, a generated `AUTH_SECRET` and matching `APP_URL`/`AUTH_URL`. Keep existing private configuration; never paste it into documentation.
3. Run `npm run db:generate` and `npm run db:validate`.
4. Review migrations and back up any existing database before `npm run db:migrate`.
5. Run the read-only `npm run db:check`.
6. Provision a login with `npm run user:create -- --email you@example.com --name "Your name"`; enter its password at the masked prompt.
7. Build with `npm run build` and start with `npm start`, or use `npm run dev` during development.

The default server binds loopback at port3000. A remote integration needs a reachable HTTPS origin and trusted deployment configuration. Restart a production server after rebuilding; source changes do not alter an already-running production artifact.

## Migrations and preservation

Use additive migrations against real finances. Never use reset, force-push or fixture seeds against the application database. Built-in category configuration is allowed; fictional financial entries are not. The reviewed classification deployment helper compares original financial fields before/after deployment. It is a verification aid, not a backup or general rollback system.

Automated acceptance uses a uniquely named guarded disposable PostgreSQL database and a separate port3100 application. Test suites refuse an application database target. Keep fixture credentials private and remove temporary database/configuration afterward. Separate Chrome contexts/profiles protect real browser cookies; ports alone do not isolate cookies on one hostname.

## Verification commands

```sh
npm run lint
npm run typecheck
npm run test:unit
node tests/server-acceptance.mjs --pure
npm run db:validate
npm run build
npm run api:generate
```

Run database/HTTP/browser acceptance only with its guarded disposable environment. Actual results and remaining limits are recorded in `docs/HANDOFF.md`, `docs/QUALITY-CHECKS.md` and review evidence. A successful unit test does not establish live persistence, an external n8n connection, accessibility or hosted deployment.

## Database and integration troubleshooting

| Symptom | Check |
| --- | --- |
| PostgreSQL host is online but app fails | DATABASE_URL credentials, database/schema existence, network route, applied migrations and read-only db:check |
| Ingestion returns 403 | Token write scope, trusted Host/Origin, source/user permissions |
| Ingestion is disabled | Automation preference and the source's enabled flag |
| Same message returns 409 | Stable external ID was reused with a changed body; review/edit the existing event |
| New command returns revision conflict | Reread state and review before creating a new command |
| Save timed out | Replay the exact envelope/request ID; do not assume it failed |
| Inbox fields are incomplete | General parser could not safely determine them; review or supply a validated draft |
| Old V1/V2 endpoint rejects | Upgrade client to V4 to preserve accounts/classification/metadata |
| Remote n8n cannot reach localhost | Its loopback is a different machine/container; configure reachable HTTPS origin |

## Backups and exports

Home’s financial JSON export is a schema 4 snapshot, not a restorable full application backup. Settings → Backups downloads supported finances/planning/workbench/automation domains, with a validated browser-only restore workflow. It preserves current authentication and receipt tombstones. Only current full format/model-version files are accepted; financial V1/V2/V3/V4 snapshots, CSV and Sure exports cannot be restored there. See [Full backup and restore](backup.md) for exact coverage and destructive confirmation. Keep encrypted operator-managed PostgreSQL backups, retention and tested recovery for infrastructure failure.

Keep tokens, raw messages and backups out of shared logs/source control. The public MIT project is [creativekamrul/budget-go](https://github.com/creativekamrul/budget-go). Private environment files, local screenshots, financial records and backups are excluded from publication. Application and API contract version numbers are independent: this v1.0.0-beta.1 application implements the V4 financial API.


`npm run api:generate` first regenerates the strict 20-model backup field registry from Prisma, then historical V2/V3, automation/planning and finally V4/combined OpenAPI. Review generated registry/modelVersion changes together with migrations: changing supported model fields deliberately changes accepted full-backup versions. Generation reads source files and schemas without connecting to PostgreSQL.
