# Local development

## Safety rule

The standalone application uses deterministic fixtures and an in-memory store by default. It must not receive production credentials or production test targets. The local Supabase Docker stack may be used only through an explicitly local connection string.

## Start the application

```bash
npm install
npm run dev
```

`npm run dev` binds only to loopback by default. It does not interfere with Mumsio's processes unless those same ports have been manually assigned elsewhere.

The API listens on `http://127.0.0.1:4100` and the web application on `http://127.0.0.1:4173` by default.

The interactive dashboard is available at:

```text
http://127.0.0.1:4173/admin/system-quality
```

The attended office wallboard is available at:

```text
http://127.0.0.1:4173/admin/system-quality/wallboard
```

## Local quality schema

The migration at `supabase/migrations/20260817162148_quality_schema.sql` has been applied to the running local Mumsio Docker database. It is not approved for production.

Re-run the read-only verification and transactional smoke test with:

```bash
docker exec supabase_db_Mumsio psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/quality_schema_verification.sql
docker exec supabase_db_Mumsio psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/quality_schema_smoke.sql
```

## Verification

```bash
npm run check
```

This runs strict TypeScript checks, tests, and production builds for every workspace package.

The API integration tests open temporary loopback ports through Supertest. They do not connect to Docker, Supabase, Mumsio, or external services.
