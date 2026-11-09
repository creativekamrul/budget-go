# Releasing Budget Go

Release tags, the application version and container versions must agree. The first prerelease is `v1.0.0-beta.1`; its image tag is `1.0.0-beta.1`. API schema versions are separate from application releases.

## Prepare a release

1. Update `package.json` and the lockfile together, review additive migrations and update the changelog/release notes. Keep installation examples pinned to the reviewed release.
2. Run the application, API, Pages and packaging checks. Use generated disposable databases and Docker projects only; never run acceptance fixtures on an existing installation.
3. Merge/push the reviewed source to `main`. Wait for Application checks, Container checks and Pages publishing to pass. Inspect the actual static site and installation guide.
4. Create the matching annotated `v…` tag and publish a GitHub prerelease for beta versions. Attach Compose files, placeholder configuration examples, API contracts and the license. No real environment files, screenshots or backups belong in release assets.

## Container publishing

The tag workflow first runs the reusable application checks, then builds a local image and executes `scripts/docker-smoke.mjs`. Its isolated PostgreSQL tests cover both install modes, real sign-in/API reads, migrations, backup archives, exact data across recreation/migration replay and readiness during an outage. Test resources are generated and cleaned by exact project names.

After those gates succeed, the workflow uses a repository-scoped `GITHUB_TOKEN` with `packages:write` to publish Linux AMD64 and ARM64 images to `ghcr.io/OWNER/REPOSITORY`. It records the immutable digest in the job summary and includes source/revision/version/MIT OCI labels. ARM64 builds do not establish separate native ARM64 runtime acceptance.

Prereleases update their exact version tag and the moving `beta` channel. Only stable versions update `latest`; beta publication never changes it. Operators should pin a version or digest rather than relying on moving channels.

### First GHCR publication

GitHub creates a new container package with private visibility by default, even when its source repository is public. After the first successful push, the package owner must review its package settings and change visibility to **Public** if anonymous installation is intended. Linking a public source repository and inheriting workflow access do not by themselves prove anonymous pulls work. This setting is separate from GitHub Pages and repository visibility.

Verify the version manifest and its AMD64/ARM64 platform descriptors without registry credentials. An authenticated owner pull alone is insufficient acceptance. Confirm the version/channel digests agree and that a prerelease did not create or replace `latest`. Keep the release page clear about any remaining access requirement.

## Upgrade and recovery acceptance

Before a real upgrade, back up and verify the PostgreSQL database and private configuration, stop writers, pull the reviewed version, run migrations explicitly and recreate/check the app. Preserve the Compose project/volume and authentication secret. An older image cannot automatically reverse a schema migration. PostgreSQL major-version upgrades follow PostgreSQL's own procedure.

See [Docker operations](developer/docker.md), [security](developer/security.md) and [full application backups](developer/backup.md). Application-level JSON recovery is not a substitute for infrastructure disaster recovery.
