-- Mumsio Quality & Testing Center
--
-- Backend-only persistence for test orchestration, normalized results,
-- findings, health snapshots, and the append-only run event trail.
--
-- SECURITY BOUNDARY:
--   * `quality` must not be added to the PostgREST exposed schema list.
--   * `anon` and `authenticated` receive no schema or object privileges.
--   * Express accesses these objects through the server-side PostgreSQL path.
--   * RLS is enabled and forced as defence in depth; no browser policies exist.
--
-- This migration intentionally does not create:
--   * live runner/provider credentials;
--   * a granular capability system;
--   * unattended wallboard device credentials;
--   * retention cron jobs.

begin;

create schema if not exists quality authorization postgres;

comment on schema quality is
  'Private backend-only storage for the Mumsio Quality & Testing Center. Do not expose through PostgREST.';

revoke all on schema quality from public, anon, authenticated, service_role;
grant usage on schema quality to service_role;

-- Future objects are private by default. Each migration must grant the exact
-- server privileges it requires instead of inheriting broad defaults.
alter default privileges for role postgres in schema quality
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema quality
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema quality
  revoke execute on functions from public, anon, authenticated, service_role;

create or replace function quality.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function quality.set_updated_at() from public, anon, authenticated;
grant execute on function quality.set_updated_at() to service_role;

create table if not exists quality.test_runs (
  id                    uuid primary key default gen_random_uuid(),
  test_type             text not null,
  category              text generated always as (
    case
      when test_type in ('load', 'stress', 'spike', 'soak') then 'traffic'
      when test_type in ('security', 'efficiency', 'reliability', 'performance') then 'non_functional'
      else 'combined'
    end
  ) stored,
  intensity             text generated always as (
    case
      when test_type in ('stress', 'spike', 'soak', 'full_system', 'full_release') then 'heavy'
      when test_type in ('load', 'security', 'performance') then 'medium'
      else 'light'
    end
  ) stored,
  environment           text not null,
  status                text not null default 'queued',
  requested_by_admin_id uuid references public.admin_users(id) on delete set null,
  requested_by_user_id  uuid not null,
  requested_role        text not null,
  idempotency_key       text not null,
  definition_version    text not null,
  policy_version        text not null,
  runner_type           text not null,
  provider_run_id       text,
  git_commit            text,
  release_version       text,
  requested_at          timestamptz not null default now(),
  started_at            timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  failure_code          text,
  failure_message       text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint quality_test_runs_test_type_valid check (
    test_type in (
      'quick_health', 'load', 'stress', 'spike', 'soak', 'security',
      'efficiency', 'reliability', 'performance', 'full_system', 'full_release'
    )
  ),
  constraint quality_test_runs_environment_valid check (
    environment in ('local', 'staging', 'production')
  ),
  constraint quality_test_runs_status_valid check (
    status in ('queued', 'running', 'passed', 'warning', 'failed', 'cancelled')
  ),
  constraint quality_test_runs_requester_role_valid check (
    requested_role in ('owner', 'admin', 'dev')
  ),
  constraint quality_test_runs_idempotency_key_valid check (
    char_length(idempotency_key) between 1 and 200
  ),
  constraint quality_test_runs_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint quality_test_runs_production_pressure_denied check (
    not (
      environment = 'production'
      and test_type in ('stress', 'spike', 'soak')
    )
  ),
  constraint quality_test_runs_started_at_valid check (
    started_at is null or started_at >= requested_at
  ),
  constraint quality_test_runs_completed_at_valid check (
    completed_at is null
    or (
      completed_at >= requested_at
      and (started_at is null or completed_at >= started_at)
    )
  ),
  constraint quality_test_runs_terminal_timestamp_valid check (
    (
      status in ('queued', 'running')
      and completed_at is null
    )
    or (
      status in ('passed', 'warning', 'failed', 'cancelled')
      and completed_at is not null
    )
  ),
  constraint quality_test_runs_started_status_valid check (
    status not in ('running', 'passed', 'warning') or started_at is not null
  ),
  constraint quality_test_runs_cancelled_at_valid check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  ),
  constraint quality_test_runs_requester_idempotency_unique
    unique (requested_by_user_id, idempotency_key)
);

comment on table quality.test_runs is
  'One privileged, predefined quality-test request and its lifecycle. Contains no provider secrets or customer PII.';
comment on column quality.test_runs.failure_message is
  'Sanitized operator-safe failure text only. Never persist raw provider errors or secrets.';

create index if not exists quality_test_runs_environment_requested_idx
  on quality.test_runs (environment, requested_at desc, id desc);
create index if not exists quality_test_runs_status_requested_idx
  on quality.test_runs (status, requested_at desc, id desc);
create index if not exists quality_test_runs_type_requested_idx
  on quality.test_runs (test_type, requested_at desc, id desc);
create index if not exists quality_test_runs_requester_admin_idx
  on quality.test_runs (requested_by_admin_id)
  where requested_by_admin_id is not null;
create unique index if not exists quality_test_runs_provider_run_unique
  on quality.test_runs (runner_type, provider_run_id)
  where provider_run_id is not null;
create unique index if not exists quality_test_runs_one_active_heavy_per_environment
  on quality.test_runs (environment)
  where status in ('queued', 'running')
    and test_type in ('stress', 'spike', 'soak', 'full_system', 'full_release');

create or replace trigger set_quality_test_runs_updated_at
before update on quality.test_runs
for each row execute function quality.set_updated_at();

create table if not exists quality.test_results (
  id                     uuid primary key default gen_random_uuid(),
  test_run_id            uuid not null unique references quality.test_runs(id) on delete cascade,
  schema_version         text not null,
  status                 text not null,
  score                  smallint not null,
  coverage               numeric(5,2) not null,
  duration_ms            bigint not null,
  systems                jsonb not null default '[]'::jsonb,
  metrics                jsonb not null default '{}'::jsonb,
  thresholds             jsonb not null default '{}'::jsonb,
  warnings               jsonb not null default '[]'::jsonb,
  failures               jsonb not null default '[]'::jsonb,
  recommendations        jsonb not null default '[]'::jsonb,
  raw_provider_reference text,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  constraint quality_test_results_status_valid check (
    status in ('passed', 'warning', 'failed')
  ),
  constraint quality_test_results_score_valid check (
    score between 0 and 100
  ),
  constraint quality_test_results_coverage_valid check (
    coverage between 0 and 100
  ),
  constraint quality_test_results_duration_valid check (
    duration_ms >= 0
  ),
  constraint quality_test_results_systems_array check (
    jsonb_typeof(systems) = 'array'
  ),
  constraint quality_test_results_metrics_object check (
    jsonb_typeof(metrics) = 'object'
  ),
  constraint quality_test_results_thresholds_object check (
    jsonb_typeof(thresholds) = 'object'
  ),
  constraint quality_test_results_warnings_array check (
    jsonb_typeof(warnings) = 'array'
  ),
  constraint quality_test_results_failures_array check (
    jsonb_typeof(failures) = 'array'
  ),
  constraint quality_test_results_recommendations_array check (
    jsonb_typeof(recommendations) = 'array'
  ),
  constraint quality_test_results_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

comment on table quality.test_results is
  'Immutable normalized output for a completed test run. Large raw artifacts stay in provider storage and are referenced only.';

create table if not exists quality.findings (
  id                    uuid primary key default gen_random_uuid(),
  fingerprint           text not null unique,
  severity              text not null,
  title                 text not null,
  system_id             text not null,
  endpoint              text,
  description           text not null,
  source                text not null,
  status                text not null default 'open',
  occurrence_count      integer not null default 1,
  first_test_run_id     uuid references quality.test_runs(id) on delete set null,
  last_test_run_id      uuid references quality.test_runs(id) on delete set null,
  first_detected_at     timestamptz not null,
  last_detected_at      timestamptz not null,
  resolved_at           timestamptz,
  resolution_note       text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint quality_findings_fingerprint_valid check (
    char_length(fingerprint) between 1 and 500
  ),
  constraint quality_findings_severity_valid check (
    severity in ('critical', 'high', 'medium', 'low', 'informational')
  ),
  constraint quality_findings_status_valid check (
    status in ('open', 'acknowledged', 'resolved', 'false_positive')
  ),
  constraint quality_findings_occurrence_count_valid check (
    occurrence_count > 0
  ),
  constraint quality_findings_detection_time_valid check (
    last_detected_at >= first_detected_at
  ),
  constraint quality_findings_resolution_valid check (
    (
      status in ('resolved', 'false_positive')
      and resolved_at is not null
    )
    or (
      status in ('open', 'acknowledged')
      and resolved_at is null
    )
  ),
  constraint quality_findings_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

comment on table quality.findings is
  'Deduplicated finding lifecycle keyed by a deterministic provider-neutral fingerprint. Stored text must be sanitized and contain no PII.';

create index if not exists quality_findings_status_detected_idx
  on quality.findings (status, last_detected_at desc, id desc);
create index if not exists quality_findings_system_status_idx
  on quality.findings (system_id, status, last_detected_at desc);
create index if not exists quality_findings_first_test_run_idx
  on quality.findings (first_test_run_id)
  where first_test_run_id is not null;
create index if not exists quality_findings_last_test_run_idx
  on quality.findings (last_test_run_id)
  where last_test_run_id is not null;

create or replace trigger set_quality_findings_updated_at
before update on quality.findings
for each row execute function quality.set_updated_at();

create table if not exists quality.system_health (
  id                 uuid primary key default gen_random_uuid(),
  environment        text not null,
  overall_score      smallint not null,
  overall_status     text not null,
  coverage           numeric(5,2) not null,
  dimensions         jsonb not null default '{}'::jsonb,
  systems            jsonb not null default '[]'::jsonb,
  source_test_run_id uuid references quality.test_runs(id) on delete set null,
  git_commit         text,
  release_version    text,
  metadata           jsonb not null default '{}'::jsonb,
  captured_at        timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint quality_system_health_environment_valid check (
    environment in ('local', 'staging', 'production')
  ),
  constraint quality_system_health_score_valid check (
    overall_score between 0 and 100
  ),
  constraint quality_system_health_status_valid check (
    overall_status in ('healthy', 'warning', 'critical')
  ),
  constraint quality_system_health_coverage_valid check (
    coverage between 0 and 100
  ),
  constraint quality_system_health_dimensions_object check (
    jsonb_typeof(dimensions) = 'object'
  ),
  constraint quality_system_health_systems_array check (
    jsonb_typeof(systems) = 'array'
  ),
  constraint quality_system_health_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

comment on table quality.system_health is
  'Immutable system-health snapshots used for current state, trends, and the sanitized office wallboard projection.';

create index if not exists quality_system_health_environment_captured_idx
  on quality.system_health (environment, captured_at desc, id desc);
create index if not exists quality_system_health_source_test_run_idx
  on quality.system_health (source_test_run_id)
  where source_test_run_id is not null;

create table if not exists quality.test_run_events (
  id             uuid primary key default gen_random_uuid(),
  test_run_id    uuid not null references quality.test_runs(id) on delete cascade,
  event_type     text not null,
  actor_type     text not null,
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_user_id  uuid,
  from_status    text,
  to_status      text,
  message        text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint quality_test_run_events_type_valid check (
    event_type in (
      'created', 'status_changed', 'dispatch_requested', 'dispatch_succeeded',
      'dispatch_failed', 'cancel_requested', 'runner_update'
    )
  ),
  constraint quality_test_run_events_actor_type_valid check (
    actor_type in ('admin', 'system', 'runner')
  ),
  constraint quality_test_run_events_admin_actor_valid check (
    actor_type <> 'admin' or actor_admin_id is not null
  ),
  constraint quality_test_run_events_from_status_valid check (
    from_status is null
    or from_status in ('queued', 'running', 'passed', 'warning', 'failed', 'cancelled')
  ),
  constraint quality_test_run_events_to_status_valid check (
    to_status is null
    or to_status in ('queued', 'running', 'passed', 'warning', 'failed', 'cancelled')
  ),
  constraint quality_test_run_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

comment on table quality.test_run_events is
  'Append-only quality run lifecycle and audit trail. Application access intentionally excludes UPDATE and DELETE.';

create index if not exists quality_test_run_events_run_created_idx
  on quality.test_run_events (test_run_id, created_at, id);
create index if not exists quality_test_run_events_actor_admin_idx
  on quality.test_run_events (actor_admin_id, created_at desc)
  where actor_admin_id is not null;
create index if not exists quality_test_run_events_actor_user_idx
  on quality.test_run_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table quality.test_runs enable row level security;
alter table quality.test_runs force row level security;
alter table quality.test_results enable row level security;
alter table quality.test_results force row level security;
alter table quality.findings enable row level security;
alter table quality.findings force row level security;
alter table quality.system_health enable row level security;
alter table quality.system_health force row level security;
alter table quality.test_run_events enable row level security;
alter table quality.test_run_events force row level security;

revoke all on all tables in schema quality from public, anon, authenticated, service_role;

-- Exact server privileges. Retention/deletion remains an owner-operated or
-- separately reviewed maintenance path, not a normal application capability.
grant select, insert, update on quality.test_runs to service_role;
grant select, insert on quality.test_results to service_role;
grant select, insert, update on quality.findings to service_role;
grant select, insert on quality.system_health to service_role;
grant select, insert on quality.test_run_events to service_role;

commit;
