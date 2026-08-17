# Quality Center Database Design

Status: migration applied and verified in local Mumsio Docker; production unchanged

Target: Supabase/Postgres project `ymiheulyzcbznudcdmgo` after isolated validation

Last updated: 2026-08-17

## Safety status

The only connected Supabase project is the live Mumsio production project. No schema or data changes have been applied to it.

The proposed migration is:

`supabase/migrations/20260817162148_quality_schema.sql`

It is **not safe to push yet**. It has passed isolated exact-version validation and validation against the currently running local Mumsio database, but it must still pass the complete Mumsio migration replay, repository database checks, and Supabase advisors.

## Local validation evidence

Validated on 2026-08-17 against:

- a disposable PostgreSQL `17.6.1.084` Supabase container; and
- the running local Mumsio container `supabase_db_Mumsio`, also PostgreSQL `17.6.1.084`.

Results:

- migration applied without error;
- all five `quality` tables exist;
- RLS is enabled and forced on every table;
- `anon` and `authenticated` have neither schema usage nor table access;
- `service_role` has only the intended per-table privileges;
- there are no browser-facing RLS policies;
- production pressure-test rejection, active-heavy-run exclusion, and request idempotency checks passed; and
- the behavioral smoke test completed inside `BEGIN`/`ROLLBACK`, so it left no test rows behind.

The local schema remains installed in the Docker database for application development. This direct local application does not register the migration in Mumsio's monorepo migration history; the migration must later be copied into that repository with its next collision-free version and replayed through the normal reset flow.

## Decision

Use a private PostgreSQL schema:

```text
quality.test_runs
quality.test_results
quality.findings
quality.system_health
quality.test_run_events
```

Mumsio currently exposes only `public` and `graphql_public` through PostgREST. The `quality` schema must remain absent from that list. `anon` and `authenticated` receive no schema or object privileges; every table also has RLS enabled and forced with no browser policies.

Because an unexposed schema cannot be selected through PostgREST, including with a service-role API key, the Express repository should use Mumsio's existing direct PostgreSQL (`pg`) path. The browser calls Express only.

## Authorization decision

Do not introduce Mumsio's first granular capability system as part of this feature.

Initial server mapping:

| Action | Allowed existing roles |
|---|---|
| View technical Quality Center | `owner`, `admin`, `dev` |
| Run a predefined test | `owner`, `admin`, `dev` |
| Configure Quality Center | `owner`, `admin`, `dev` |
| Open attended wallboard | `owner`, `admin`, `dev` |

The server must load the role from `public.admin_users`; it must never trust a role supplied by the browser. Support access and unattended wallboard device credentials require separate product approval.

## Tables

### `quality.test_runs`

Stores the privileged request, lifecycle, actor, definition/policy versions, runner correlation, release identity, timestamps, and sanitized failures.

Database safety includes:

- production `stress`, `spike`, and `soak` rejection;
- one queued/running heavy test per environment through a partial unique index;
- per-authenticated-user idempotency-key uniqueness;
- generated category and intensity classifications;
- terminal timestamp consistency.

### `quality.test_results`

One immutable normalized result per run. Common filter/sort fields remain relational; provider-shaped metrics stay in validated JSONB. Large raw payloads remain in short-lived provider artifact storage and only a reference is persisted.

### `quality.findings`

Deduplicated finding lifecycle keyed by a deterministic fingerprint. It records first/last run, severity, source, resolution state, and occurrence count without storing customer PII.

### `quality.system_health`

Immutable environment snapshots for current health, trends, and the sanitized wallboard read model.

### `quality.test_run_events`

Append-only lifecycle/audit events following the existing `support_ticket_events` pattern. Normal application access is SELECT/INSERT only.

## Retention proposal

| Data | Initial retention |
|---|---:|
| Run metadata | 365 days |
| Normalized results | 90 days |
| Health snapshots | 30 days |
| Resolved findings | 365 days after resolution |
| Raw provider artifacts | 7–14 days |

Retention jobs are intentionally excluded from the initial migration. They require operational ownership, deletion batching, and monitoring before activation.

## Validation sequence

1. Copy the migration into the Mumsio monorepo using its next collision-free migration version.
2. Run the complete local `npx supabase db reset` migration replay.
3. Run Mumsio's database tests, RLS checker, and spec-drift checker.
4. Extend the RLS checker to cover the private `quality` schema.
5. Run `supabase/verification/quality_schema.sql` against local or an isolated branch.
6. Run the transactional `supabase/tests/quality_schema_smoke.sql` behavioral checks.
7. Run Supabase security and performance advisors and resolve new findings.
8. Review the diff and explicitly mark the final Mumsio migration `safe to push` only after every check passes.
9. The repository owner performs the manual production push under the established Mumsio process.

## Production incident prerequisite

Before any Quality Center integration or load-test work, fix environment isolation. The existing local orders-hub startup can target production through its checked-in environment configuration. A Quality Center must never be built on top of that unsafe default.

Minimum prerequisite:

- local development fails closed unless Supabase resolves to the local stack;
- non-production test definitions cannot resolve production targets;
- CI verifies the guard;
- a separate development or staging environment exists before any live runner is connected.
