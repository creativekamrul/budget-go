# Budget Go v1.0.0 Beta 1

First public MIT-licensed beta of Budget Go: a self-hosted BDT personal-finance workspace built for Bangladesh's manual and message-based banking workflows.

## Install

Read the [installation guide](https://creativekamrul.github.io/budget-go/docs/docker.html). Choose either bundled persistent PostgreSQL or your own PostgreSQL connection. Both use:

```sh
docker pull ghcr.io/creativekamrul/budget-go:1.0.0-beta.1
```

The public website hosts documentation only. The authenticated app and its database run on your server. Configure private secrets, run the explicit migrations and provision your own login; no shared default credentials or financial records are seeded.

## Included

- Manual assets/debts, net worth and dated balance adjustments.
- Transactions, classifications, exact splits, bulk tools and reversible transfer matching.
- Budgets, monthly targets and deliberately recorded recurring entries.
- CSV review/import, duplicate decisions and statement reconciliation.
- Previewed transaction rules with selected application.
- Reviewed Bangladesh SMS/email intake through REST, MCP and n8n examples.
- Password/session controls and versioned supported-domain full backup/restore.
- Generated OpenAPI, public/in-app guides, two Compose configurations and versioned GHCR publishing.

## Upgrades

Pin a version. Stop writers, take and verify a database/configuration backup, pull the reviewed image, run migrations explicitly and recreate the app. Keep the same database volume/project and authentication secret. A migration is not reversed by downgrading the image. Follow the [upgrade and recovery guide](https://creativekamrul.github.io/budget-go/docs/docker.html#upgrading).

The `beta` image tag follows prereleases; `latest` is reserved for stable versions. Images are built for Linux AMD64 and ARM64. Installation/runtime smoke checks run on AMD64; ARM64 build availability does not establish a separate native ARM64 runtime acceptance.

## Beta boundaries

Manual BDT only: no currency conversion, live market prices, automatic bank/phone/email connections, PDF/OCR imports or household roles. Rules and recurring posting remain explicit actions. The included n8n template needs your own collector and credentials. Full Sure Finance parity is not claimed. Full application backups are readable private files and do not replace encrypted operator-managed PostgreSQL backups. See [feature coverage](https://creativekamrul.github.io/budget-go/docs/parity.html).

See [CHANGELOG](../CHANGELOG.md), [MIT license](../LICENSE) and [security policy](../SECURITY.md).
