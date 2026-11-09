# Docker installation and upgrades

Budget Go has two independent Docker Compose options. Both run the same versioned image from GitHub Container Registry (GHCR), include the operator migration/user tools, and keep PostgreSQL financial records outside the app container. The image tag for this release is `ghcr.io/creativekamrul/budget-go:1.0.0-beta.1`. Beta images do not use the `latest` tag.

| Option | Compose file | Private configuration | Database |
| --- | --- | --- | --- |
| Bundled PostgreSQL | `compose.yaml` | `.env.docker` | PostgreSQL17 in a persistent named volume |
| Your PostgreSQL | `compose.external.yaml` | `.env.external` | Your reachable, dedicated PostgreSQL database |

Use Docker Engine/Desktop with Linux containers and Docker Compose v2. The commands below use a POSIX shell; Windows users can use PowerShell for the Compose commands and `Copy-Item` instead of `cp`. Never publish your private environment files, database dumps or full application backup files.

## Bundled PostgreSQL

Download the release source or clone the repository, then work in its root directory:

```sh
cp .env.docker.example .env.docker
```

Fill the blank `AUTH_SECRET` and `POSTGRES_PASSWORD` with independently generated, private secrets. `openssl rand -hex 32` generates a suitable value; with Node installed use `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. The bundled password must be URL-safe; hexadecimal avoids URL escaping and Compose interpolation problems. Required blank values make Compose refuse to start rather than install shared default credentials.

Keep `APP_URL=http://127.0.0.1:3000` for the local defaults, or set it to the exact public origin, including scheme and any port. If changing `APP_PORT`, change `APP_URL` to match. `AUTH_URL` is automatically set to this same origin. The default published app port binds only to host loopback. PostgreSQL has no published host port.

```sh
docker compose --env-file .env.docker pull
docker compose --env-file .env.docker up -d db
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker up -d app
docker compose --env-file .env.docker exec app npm run db:check
docker compose --env-file .env.docker exec app npm run user:create -- --email you@example.com --name "Your name"
```

The last command opens the existing masked password/confirmation prompt in your terminal. No default user, transaction or API token is created. Open `http://127.0.0.1:3000` and sign in with the account you provisioned. The public `/api/health` check returns only readiness and app version: it checks the database connection, applied migrations and current schema availability, returning503 when unavailable. It does not return financial records or credentials. `docker compose --env-file .env.docker ps` shows service health; `db:check` provides an additional operator schema check.

## External PostgreSQL

Use a dedicated empty database and a role permitted to apply the supplied migrations. Do not point an initial installation at an unrelated application's database.

```sh
cp .env.external.example .env.external
```

Set a random `AUTH_SECRET`, your exact `APP_URL`, and `DATABASE_URL`. The database URL has the usual `postgresql://USER:URL_ENCODED_PASSWORD@HOST:5432/DATABASE?schema=public` structure; follow your provider's TLS/CA requirements. A URL or a password in the URL must not appear in logs, scripts, shell history, screenshots or Git. Save the connection only in the private environment file. If the URL contains literal dollar signs, use Compose's single-quoted environment-file form. Percent-encode reserved characters in credentials.

`localhost` inside a container means that container. Use your server's reachable hostname/IP; Docker Desktop users connecting to a database on their host can use `host.docker.internal` where supported. Linux host access and managed database firewalls/TLS need deployment-specific configuration. This option starts no database service or volume.

```sh
docker compose --env-file .env.external -f compose.external.yaml pull
docker compose --env-file .env.external -f compose.external.yaml run --rm migrate
docker compose --env-file .env.external -f compose.external.yaml up -d app
docker compose --env-file .env.external -f compose.external.yaml exec app npm run db:check
docker compose --env-file .env.external -f compose.external.yaml exec app npm run user:create -- --email you@example.com --name "Your name"
```

## HTTPS and remote access

Use a reverse proxy with HTTPS for a remotely accessible app and preserve the public Host/Origin. Configure `APP_URL` to that exact HTTPS origin. Host loopback binding works with a proxy on the same host. If a proxy runs in another container, explicitly configure a suitable shared network or bind address; do not expose the database. The authentication/API guards deliberately reject unexpected origins. `AUTH_SECRET` must remain stable across ordinary restarts and upgrades; changing it invalidates browser sessions.

## Upgrading

Read the release notes and migration compatibility first. Keep the previous image tag/digest and a verified database backup. Do not use an unattended floating tag for this beta. Pulling or recreating an app container does not replace the named PostgreSQL volume. Migration execution is an explicit operator action and never runs automatically on app startup.

For a bundled install, first stop app writers and create a full PostgreSQL backup. A POSIX shell example:

```sh
docker compose --env-file .env.docker stop app
mkdir -p backups
docker compose --env-file .env.docker exec -T db pg_dump -U budget_go -d budget_go --format=custom > backups/budget-go-before-upgrade.dump
docker compose --env-file .env.docker exec -T db pg_restore --list < backups/budget-go-before-upgrade.dump
```

Do not use a TTY when redirecting a binary database dump. In Windows PowerShell older than7.4, avoid binary stdout redirection: run `docker compose --env-file .env.docker exec -T db pg_dump -U budget_go -d budget_go --format=custom --file=/tmp/budget-go-before-upgrade.dump`, then `docker compose --env-file .env.docker cp db:/tmp/budget-go-before-upgrade.dump ./backups/budget-go-before-upgrade.dump`. Verify the archive with a matching PostgreSQL client and periodically restore to an isolated database. A listing check detects obvious archive damage but does not establish full disaster recovery. Backups contain private data; encrypt and store them separately.

Change `BUDGET_GO_IMAGE` in `.env.docker` to the reviewed release's exact tag or digest, then:

```sh
docker compose --env-file .env.docker pull
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker up -d app
docker compose --env-file .env.docker exec app npm run db:check
```

For an external install, stop the app with the external Compose command, take/verify your provider's PostgreSQL backup or snapshot, update `BUDGET_GO_IMAGE` in `.env.external`, then run the same pull/migrate/up/check sequence with `--env-file .env.external -f compose.external.yaml`. The bundled `db` commands do not apply to external servers. Coordinate any other integration writers before backup/migration.

If a migration fails, keep the app stopped and investigate privately; do not use `migrate reset`, `db push --force-reset` or delete the database. If a new app version fails after a successful migration, starting an older image is safe only when its schema is compatible. Database migrations are not automatically reversible. Restore a verified pre-upgrade database backup when an incompatible rollback is required; that deliberately discards writes made after that backup, so review the recovery plan first.

## Persistence, shutdown and source builds

`docker compose --env-file .env.docker down` removes the containers/network while retaining the named volume. Do **not** add `--volumes` or `-v` to a normal shutdown/upgrade: those flags delete the bundled database volume. Keep the same Compose project name and volume when returning to the installation; another project name creates a different volume. PostgreSQL major-version upgrades require PostgreSQL's own dump/restore or upgrade procedure; changing an image's major tag is not an app upgrade.

To build locally instead of pulling GHCR, set `BUDGET_GO_IMAGE=budget-go-local:1.0.0-beta.1` in the private configuration and run `docker compose --env-file .env.docker build app migrate` (or the external-file equivalent), then follow the explicit migration/start steps without `pull`. The Docker context excludes `.env*`, financial screenshots/artifacts, browser state and local caches. Runtime credentials are supplied only when a container starts. The app runs as the image's unprivileged `node` user. Prisma/tsx operator tools intentionally remain in the beta image for migrations and account administration.

API/MCP clients connect to your hosted app, never the GitHub Pages project site. GitHub Pages hosts only the public project/documentation site and cannot run the PostgreSQL-backed Next.js server. See [Security](security.md), [Backups](backup.md) and [Operations](operations.md).
