-- Dashboard-compatible, read-only Supabase production inventory.
--
-- This is the browser SQL Editor companion to db-inventory.sql. It returns one
-- JSON value, selects no row payloads/PII/object paths/function bodies/policy
-- expressions/secret values, and uses catalog estimates instead of full scans.
-- Never add user rows, contact fields, Storage object names or secret values.

WITH database_info AS (
  SELECT jsonb_build_object(
    'database_name', current_database(),
    'database_role', current_user,
    'postgres_version', current_setting('server_version'),
    'postgres_version_num', current_setting('server_version_num'),
    'captured_at', now()
  ) AS value
),
extensions AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', e.extname,
    'version', e.extversion,
    'schema', n.nspname
  ) ORDER BY e.extname), '[]'::jsonb) AS value
  FROM pg_extension AS e
  JOIN pg_namespace AS n ON n.oid = e.extnamespace
),
public_tables AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', n.nspname || '.' || c.relname,
    'planner_estimate', greatest(c.reltuples, 0)::bigint,
    'statistics_estimate', coalesce(s.n_live_tup, 0)::bigint,
    'last_analyze', s.last_analyze,
    'last_autoanalyze', s.last_autoanalyze
  ) ORDER BY n.nspname, c.relname), '[]'::jsonb) AS value
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables AS s ON s.relid = c.oid
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
public_functions AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', p.proname,
    'identity_arguments', pg_get_function_identity_arguments(p.oid),
    'result_type', pg_get_function_result(p.oid),
    'kind', p.prokind,
    'security_definer', p.prosecdef
  ) ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb) AS value
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
policies AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema', schemaname,
    'table', tablename,
    'name', policyname,
    'permissive', permissive,
    'roles', roles,
    'command', cmd
  ) ORDER BY schemaname, tablename, policyname), '[]'::jsonb) AS value
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
),
api_grants AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema', table_schema,
    'table', table_name,
    'grantee', grantee,
    'privilege', privilege_type
  ) ORDER BY table_schema, table_name, grantee, privilege_type), '[]'::jsonb) AS value
  FROM information_schema.role_table_grants
  WHERE table_schema IN ('public', 'storage')
    AND grantee IN ('anon', 'authenticated', 'service_role')
),
migration_history AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'version', version,
    'name', name
  ) ORDER BY version, name), '[]'::jsonb) AS value
  FROM supabase_migrations.schema_migrations
),
auth_summary AS (
  SELECT jsonb_build_object(
    'users', (SELECT count(*)::bigint FROM auth.users),
    'providers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'provider', provider,
        'count', identity_count
      ) ORDER BY provider), '[]'::jsonb)
      FROM (
        SELECT provider, count(*)::bigint AS identity_count
        FROM auth.identities
        GROUP BY provider
      ) AS provider_counts
    )
  ) AS value
),
storage_summary AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'public', b.public,
    'file_size_limit', b.file_size_limit,
    'allowed_mime_types', b.allowed_mime_types,
    'object_count', coalesce(o.object_count, 0)
  ) ORDER BY b.id), '[]'::jsonb) AS value
  FROM storage.buckets AS b
  LEFT JOIN (
    SELECT bucket_id, count(*)::bigint AS object_count
    FROM storage.objects
    GROUP BY bucket_id
  ) AS o ON o.bucket_id = b.id
),
realtime_tables AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'publication', pubname,
    'schema', schemaname,
    'table', tablename
  ) ORDER BY schemaname, tablename), '[]'::jsonb) AS value
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
),
cron_jobs AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', jobid,
    'name', jobname,
    'schedule', schedule,
    'active', active
  ) ORDER BY jobname, jobid), '[]'::jsonb) AS value
  FROM cron.job
)
SELECT jsonb_build_object(
  'database', (SELECT value FROM database_info),
  'extensions', (SELECT value FROM extensions),
  'public_tables', (SELECT value FROM public_tables),
  'public_functions', (SELECT value FROM public_functions),
  'rls_policies', (SELECT value FROM policies),
  'api_table_grants', (SELECT value FROM api_grants),
  'migration_history', (SELECT value FROM migration_history),
  'auth', (SELECT value FROM auth_summary),
  'storage_buckets', (SELECT value FROM storage_summary),
  'realtime_tables', (SELECT value FROM realtime_tables),
  'cron_jobs', (SELECT value FROM cron_jobs)
) AS inventory;
