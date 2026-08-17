# Mumsio System Quality

Standalone architecture and implementation workspace for the Mumsio Quality & Testing Center. The target product is an embedded Mumsio Admin feature for Owners and Developers, with a separate secure, read-only office wallboard mode.

This repository is intentionally separate from the Mumsio application. The standalone mock-driven MVP is implemented and does not connect to Mumsio, production infrastructure, or third-party services by default.

## Implemented MVP

- responsive Vue 3 Admin dashboard and test-run views;
- chrome-free 16:9 office wallboard with freshness and reconnect states;
- Express API with predefined test catalog and capability projection;
- Owner/Admin/Developer role mapping with Support/Sales denied;
- server-enforced production and heavy-test safety policies;
- deterministic scoring, fixtures, mock execution, cancellation, and idempotency;
- history, findings, release comparison, configuration, health, and wallboard APIs;
- in-memory persistence by default and an opt-in direct PostgreSQL adapter for the private `quality` schema;
- npm workspaces and lockfile matching the existing Mumsio repository;
- strict type checks, API/domain/UI tests, production builds, and CI.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173/admin/system-quality`. The office view is at `http://127.0.0.1:4173/admin/system-quality/wallboard`.

The default is deliberately isolated: it uses an in-memory repository and mock runner. It does not use Docker or Supabase unless `QUALITY_DATABASE_URL` is explicitly configured.

## Planning documents

- [Architecture](docs/ARCHITECTURE.md)
- [Build plan](docs/BUILD_PLAN.md)
- [Database design and migration safety](docs/DATABASE.md)
- [Local development and safety](docs/LOCAL_DEVELOPMENT.md)

## Current status

Standalone MVP complete and locally verified. Live connectors, k6, unattended wallboard credentials, Mumsio repository integration, and production deployment remain intentionally deferred.
