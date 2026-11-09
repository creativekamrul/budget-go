# Security

Budget Go is beta software handling private financial data. Keep the application, PostgreSQL, deployment configuration and backups on systems you control. Use HTTPS for remote access, random deployment secrets and scoped expiring integration tokens. Do not expose PostgreSQL or development/debugging ports publicly.

Do not post credentials, bank messages, database dumps or financial screenshots in public issues. To report a vulnerability privately, use the repository's **Security → Report a vulnerability** feature. If that feature is unavailable, open an issue requesting a private contact without including vulnerability details or private data.

See [security](docs/developer/security.md), [backups](docs/developer/backup.md) and [Docker operations](docs/developer/docker.md) for implementation boundaries and recovery procedures. Release notes identify supported beta versions; no independent security audit is claimed.
