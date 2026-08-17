-- Read-only verification for 20260817162148_quality_schema.sql.
-- Run after applying the migration to local Supabase or an isolated branch.

-- The private schema and five expected tables exist.
select
  n.nspname as schema_name,
  array_agg(c.relname order by c.relname) as tables
from pg_namespace n
join pg_class c on c.relnamespace = n.oid
where n.nspname = 'quality'
  and c.relkind = 'r'
group by n.nspname;

-- Every table has RLS enabled and forced.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'quality'
  and c.relkind = 'r'
order by c.relname;

-- Browser roles have neither schema usage nor table privileges.
select
  role_name,
  has_schema_privilege(role_name, 'quality', 'USAGE') as schema_usage,
  has_table_privilege(role_name, 'quality.test_runs', 'SELECT') as can_select_runs,
  has_table_privilege(role_name, 'quality.test_runs', 'INSERT') as can_insert_runs
from unnest(array['anon', 'authenticated']) as role_name;

-- Service role permissions are deliberately different for mutable and
-- append-only tables.
select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'quality'
  and grantee = 'service_role'
order by table_name, privilege_type;

-- Expected production denial and one-active-heavy-test constraints exist.
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'quality'::regnamespace
  and conname in (
    'quality_test_runs_production_pressure_denied',
    'quality_test_runs_requester_idempotency_unique'
  )
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'quality'
  and indexname = 'quality_test_runs_one_active_heavy_per_environment';

-- PostgREST exposure is deployment configuration and cannot be proven by a
-- normal database session. Separately verify that `quality` is absent from the
-- `[api].schemas` list in supabase/config.toml before integration.

-- No browser RLS policies should exist in this private schema.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'quality'
order by tablename, policyname;
