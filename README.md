# Budget Go

**v1.0.0 Beta 1 · MIT · Self-hosted personal finance for Bangladesh**

Budget Go brings accounts, spending, budgets and statement review into one workspace. Record BDT amounts manually, import a CSV, or send extracted bank SMS/email drafts through the REST API or MCP for review. It does not require a bank API.

[Website & documentation](https://creativekamrul.github.io/budget-go/) · [Releases](https://github.com/creativekamrul/budget-go/releases) · [Container image](https://github.com/creativekamrul/budget-go/pkgs/container/budget-go) · [API contract](docs/API-V4.md)

## Install with Docker

Use Docker Engine/Desktop with Compose v2. Choose one database option. The image includes the app, migration CLI and account-administration tools. Pin a version for reproducible installations:

```sh
docker pull ghcr.io/creativekamrul/budget-go:1.0.0-beta.1
```

### Option A: bundled PostgreSQL

```sh
git clone --branch v1.0.0-beta.1 https://github.com/creativekamrul/budget-go.git
cd budget-go
cp .env.docker.example .env.docker
# Edit .env.docker: set random AUTH_SECRET and POSTGRES_PASSWORD, and your APP_URL.
docker compose --env-file .env.docker up -d db
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker up -d app
docker compose --env-file .env.docker exec app npm run user:create -- --email you@example.com --name "Your name"
```

The password is entered in a masked interactive prompt. PostgreSQL uses a named persistent volume and is not exposed on a host port. The app defaults to http://127.0.0.1:3000.

### Option B: your existing PostgreSQL server

```sh
cp .env.external.example .env.external
# Edit .env.external: set DATABASE_URL, a random AUTH_SECRET, and your APP_URL.
docker compose -f compose.external.yaml --env-file .env.external run --rm migrate
docker compose -f compose.external.yaml --env-file .env.external up -d app
docker compose -f compose.external.yaml --env-file .env.external exec app npm run user:create -- --email you@example.com --name "Your name"
```

Use the same clone as above. The supplied database must be reachable **from inside the container**; localhost refers to that container. No PostgreSQL container is created in this option.

Read [Docker installation and upgrades](docs/developer/docker.md) for secret generation, TLS/reverse proxy setup, database connectivity, backups and recovery. Both options preserve records across app-container replacement. Never run `down -v` against an installation whose database you intend to keep.

## Upgrade deliberately

Back up the database and configuration, stop writes, pull the chosen image, run the explicit migration step, then recreate the app and verify its health. Keep the same Compose project/volume and authentication secret. Updating an image does not automatically run migrations. Do not assume downgrading the image reverses a database migration; restore a compatible backup if necessary.

Version tags such as `1.0.0-beta.1` are recommended; `beta` is a moving prerelease channel. Beta images are never published as `latest`. The release workflow publishes Linux AMD64 and ARM64 images to GHCR after installation checks. See the [complete upgrade procedure](docs/developer/docker.md).

## What this beta includes

- Eleven manual BDT account families, signed assets/debts, net worth and dated balance adjustments.
- Transactions, categories/subcategories, tags, merchants, notes, pending/excluded states, bulk changes and exact splits.
- Transfers with distinct posting dates, reviewed matching and reversible original-entry audits.
- Monthly category budgets, income/spending targets and explicit recurring occurrence recording.
- CSV column/date/amount mapping, duplicate review, selected imports and closing-balance comparison.
- Classification rules with before/after previews and explicit selected application.
- Bangladesh SMS/email review inbox, Bangla numerals, exact poisha, source identities and duplicate-safe ingestion.
- Scoped expiring API tokens, REST, 22 MCP tools, generated OpenAPI and n8n examples.
- Profile/password/session controls and supported-domain full backup/restore.

This is the first public beta, **not full Sure Finance feature parity**. Accounts use manual BDT positions, without FX, live security prices or trade lots. Bank/email/phone collectors are not connected automatically. Rules and recurring records require explicit actions; no background posting is configured. CSV import does not read PDFs. Household permissions and broader parity remain open. See [feature coverage](docs/developer/parity.md).

## Documentation and integrations

Guides live in [docs/](docs/README.md), on the [public documentation site](https://creativekamrul.github.io/budget-go/docs/), and inside the app at **Settings → Developer docs**. Installation documentation is available before signing in.

- [Current API](docs/API-V4.md) and [OpenAPI](docs/API.openapi.json): exact integer poisha, owner scopes, shared revisions and request-ID replay.
- [n8n](docs/developer/n8n.md): import the inactive starter and configure your own authenticated collector.
- [MCP](docs/developer/mcp.md): Streamable HTTP at `/api/mcp` with a scoped bearer token; no OAuth discovery.
- [Full backups](docs/developer/backup.md): versioned owner-data recovery; readable files must be kept private.
- [Security](docs/developer/security.md) and [operations](docs/developer/operations.md).

Financial data belongs in your private application/PostgreSQL deployment. GitHub Pages hosts only static product/documentation content, not the authenticated app or a public financial dashboard.

## Development without Docker

Requires Node.js22.15.1 or newer and PostgreSQL. Copy `.env.example` to `.env`, set private database/authentication configuration, and use:

```sh
npm ci
npm run db:generate
npm run db:validate
npm run db:migrate
npm run user:create -- --email you@example.com --name "Your name"
npm run dev
```

For a production build: `npm run build`, then `npm start`. The local npm scripts bind loopback. Configure your exact trusted HTTPS origin when deploying behind a reverse proxy. Never commit real environment files or use reset/force-push migrations on a live database.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:unit
node tests/server-acceptance.mjs --pure
npm run test:release
npm run build
npm run pages:build
# After building a local image tagged budget-go:ci:
npm run test:docker
```

Database, HTTP and authenticated browser suites have explicit disposable-database safety gates. Never point acceptance fixtures at a real installation. GitHub Actions checks the app, both Compose installation modes, the static site and versioned container publishing.

## License

[MIT](LICENSE), copyright2026 Kamrul Islam. Third-party dependencies and included project tooling retain their own licenses.
