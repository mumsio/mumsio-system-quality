-- Transactional smoke tests for the private Quality Center schema.
-- Requires 20260817162148_quality_schema.sql. Leaves no rows behind.

begin;

do $$
declare
  actor_user_id uuid := gen_random_uuid();
  quick_run_id uuid;
begin
  insert into quality.test_runs (
    test_type,
    environment,
    requested_by_user_id,
    requested_role,
    idempotency_key,
    definition_version,
    policy_version,
    runner_type
  ) values (
    'quick_health',
    'staging',
    actor_user_id,
    'dev',
    'quality-schema-smoke-quick',
    'test-definitions-v1',
    'execution-policy-v1',
    'mock'
  ) returning id into quick_run_id;

  insert into quality.test_run_events (
    test_run_id,
    event_type,
    actor_type,
    to_status
  ) values (
    quick_run_id,
    'created',
    'system',
    'queued'
  );

  update quality.test_runs
  set
    status = 'passed',
    started_at = requested_at,
    completed_at = requested_at + interval '1 second'
  where id = quick_run_id;

  insert into quality.test_results (
    test_run_id,
    schema_version,
    status,
    score,
    coverage,
    duration_ms,
    systems,
    metrics,
    thresholds
  ) values (
    quick_run_id,
    'normalized-result-v1',
    'passed',
    94,
    100,
    1000,
    '[{"id":"supabase","status":"passed","score":97}]'::jsonb,
    '{"p95_ms":128}'::jsonb,
    '{"p95_ms":{"pass":250,"warn":500}}'::jsonb
  );

  insert into quality.system_health (
    environment,
    overall_score,
    overall_status,
    coverage,
    dimensions,
    systems,
    source_test_run_id,
    captured_at
  ) values (
    'staging',
    94,
    'healthy',
    100,
    '{"performance":93,"reliability":95}'::jsonb,
    '[{"id":"supabase","status":"passed","score":97}]'::jsonb,
    quick_run_id,
    now()
  );

  insert into quality.findings (
    fingerprint,
    severity,
    title,
    system_id,
    description,
    source,
    first_test_run_id,
    last_test_run_id,
    first_detected_at,
    last_detected_at
  ) values (
    'quality-schema-smoke-finding',
    'medium',
    'Smoke-test finding',
    'cloudflare_web',
    'Synthetic sanitized finding used only by the transactional schema smoke test.',
    'mock',
    quick_run_id,
    quick_run_id,
    now(),
    now()
  );

  -- Production pressure tests must fail at the database boundary.
  begin
    insert into quality.test_runs (
      test_type,
      environment,
      requested_by_user_id,
      requested_role,
      idempotency_key,
      definition_version,
      policy_version,
      runner_type
    ) values (
      'stress',
      'production',
      actor_user_id,
      'dev',
      'quality-schema-smoke-production-stress',
      'test-definitions-v1',
      'execution-policy-v1',
      'mock'
    );
    raise exception 'production stress test was not rejected';
  exception
    when check_violation then null;
  end;

  -- A second active heavy test in one environment must fail.
  insert into quality.test_runs (
    test_type,
    environment,
    requested_by_user_id,
    requested_role,
    idempotency_key,
    definition_version,
    policy_version,
    runner_type
  ) values (
    'stress',
    'staging',
    actor_user_id,
    'dev',
    'quality-schema-smoke-heavy-one',
    'test-definitions-v1',
    'execution-policy-v1',
    'mock'
  );

  begin
    insert into quality.test_runs (
      test_type,
      environment,
      requested_by_user_id,
      requested_role,
      idempotency_key,
      definition_version,
      policy_version,
      runner_type
    ) values (
      'spike',
      'staging',
      actor_user_id,
      'dev',
      'quality-schema-smoke-heavy-two',
      'test-definitions-v1',
      'execution-policy-v1',
      'mock'
    );
    raise exception 'duplicate active heavy test was not rejected';
  exception
    when unique_violation then null;
  end;

  -- Retried requests with the same actor and idempotency key must fail.
  begin
    insert into quality.test_runs (
      test_type,
      environment,
      requested_by_user_id,
      requested_role,
      idempotency_key,
      definition_version,
      policy_version,
      runner_type
    ) values (
      'quick_health',
      'local',
      actor_user_id,
      'dev',
      'quality-schema-smoke-quick',
      'test-definitions-v1',
      'execution-policy-v1',
      'mock'
    );
    raise exception 'duplicate idempotency key was not rejected';
  exception
    when unique_violation then null;
  end;

  if has_schema_privilege('anon', 'quality', 'USAGE')
    or has_schema_privilege('authenticated', 'quality', 'USAGE') then
    raise exception 'browser role unexpectedly has quality schema usage';
  end if;

  if not has_table_privilege('service_role', 'quality.test_runs', 'SELECT, INSERT, UPDATE') then
    raise exception 'service_role is missing required test_runs privileges';
  end if;

  if has_table_privilege('service_role', 'quality.test_run_events', 'UPDATE')
    or has_table_privilege('service_role', 'quality.test_run_events', 'DELETE') then
    raise exception 'append-only event table has mutation privileges';
  end if;
end;
$$;

rollback;
