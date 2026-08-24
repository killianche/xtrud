-- Read-only Supabase database inventory for migration/recovery planning.
--
-- Safety properties:
-- - the transaction is explicitly READ ONLY;
-- - no row payloads, PII, Storage object paths, function bodies, cron commands,
--   or secret values are selected;
-- - Vault/app_secrets expose names only when the caller has SELECT permission.

\set ON_ERROR_STOP on
\pset pager off
\pset null '<null>'
\pset border 1

-- Direct psql users get the same safe default as the wrapper.
\if :{?exact_counts}
\else
  \set exact_counts off
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

\echo '=== database ==='
SELECT
  current_database() AS database_name,
  current_user AS database_role,
  current_setting('server_version') AS postgres_version,
  current_setting('server_version_num') AS postgres_version_num,
  now() AS captured_at;

\echo '=== extensions ==='
SELECT
  e.extname AS extension_name,
  e.extversion AS extension_version,
  n.nspname AS extension_schema
FROM pg_extension AS e
JOIN pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;

\echo '=== public tables: catalog row estimates, no row data ==='
SELECT
  n.nspname || '.' || c.relname AS table_name,
  greatest(c.reltuples, 0)::bigint AS planner_estimate,
  coalesce(s.n_live_tup, 0)::bigint AS statistics_estimate,
  s.last_analyze,
  s.last_autoanalyze
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables AS s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY table_name;

\if :exact_counts
  \echo '=== public tables: exact row counts (explicit opt-in; full scans) ==='
  SELECT format(
    'SELECT %L AS table_name, count(*)::bigint AS exact_row_count FROM %I.%I;',
    schemaname || '.' || tablename,
    schemaname,
    tablename
  )
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
  \gexec
\else
  \echo '=== exact row counts skipped; rerun wrapper with --exact-counts during an approved window ==='
\endif

\echo '=== public views/materialized views ==='
SELECT schemaname, viewname AS object_name, 'view' AS object_kind
FROM pg_views
WHERE schemaname = 'public'
UNION ALL
SELECT schemaname, matviewname AS object_name, 'materialized_view' AS object_kind
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY object_kind, object_name;

\echo '=== public functions: signatures only, no source ==='
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prokind AS function_kind,
  p.prosecdef AS security_definer
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments;

\echo '=== RLS policies: metadata only, expressions omitted ==='
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

\echo '=== table grants for API roles ==='
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'storage')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_migration_history
\gset
\if :has_migration_history
  \echo '=== Supabase migration history: identifiers only ==='
  SELECT version, name
  FROM supabase_migrations.schema_migrations
  ORDER BY version, name;
\else
  \echo '=== Supabase migration history: relation unavailable ==='
\endif

SELECT to_regclass('auth.users') IS NOT NULL AS has_auth_users
\gset
\if :has_auth_users
  \echo '=== Auth users: aggregate only ==='
  SELECT count(*)::bigint AS auth_user_count
  FROM auth.users;
\else
  \echo '=== Auth users: relation unavailable ==='
\endif

SELECT to_regclass('auth.identities') IS NOT NULL AS has_auth_identities
\gset
\if :has_auth_identities
  \echo '=== Auth identity providers: aggregate only ==='
  SELECT provider, count(*)::bigint AS identity_count
  FROM auth.identities
  GROUP BY provider
  ORDER BY provider;
\else
  \echo '=== Auth identities: relation unavailable ==='
\endif

SELECT to_regclass('storage.buckets') IS NOT NULL AS has_storage_buckets
\gset
\if :has_storage_buckets
  \echo '=== Storage buckets: configuration only ==='
  SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
  ORDER BY id;
\else
  \echo '=== Storage buckets: relation unavailable ==='
\endif

SELECT to_regclass('storage.objects') IS NOT NULL AS has_storage_objects
\gset
\if :has_storage_objects
  \echo '=== Storage objects: aggregate only, paths omitted ==='
  SELECT bucket_id, count(*)::bigint AS object_count
  FROM storage.objects
  GROUP BY bucket_id
  ORDER BY bucket_id;
\else
  \echo '=== Storage objects: relation unavailable ==='
\endif

\echo '=== Realtime publication tables ==='
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;

SELECT
  to_regclass('cron.job') IS NOT NULL
  AND coalesce(has_table_privilege(current_user, to_regclass('cron.job'), 'SELECT'), false)
  AS can_read_cron_jobs
\gset
\if :can_read_cron_jobs
  \echo '=== cron jobs: commands and connection fields omitted ==='
  SELECT jobid, jobname, schedule, active
  FROM cron.job
  ORDER BY jobname, jobid;
\else
  \echo '=== cron jobs: relation unavailable or SELECT denied ==='
\endif

SELECT
  to_regclass('vault.secrets') IS NOT NULL
  AND coalesce(has_table_privilege(current_user, to_regclass('vault.secrets'), 'SELECT'), false)
  AS can_read_vault_secret_names
\gset
\if :can_read_vault_secret_names
  \echo '=== Vault secret names only; encrypted/decrypted values omitted ==='
  SELECT name
  FROM vault.secrets
  ORDER BY name;
\else
  \echo '=== Vault secret names: relation unavailable or SELECT denied ==='
\endif

SELECT
  to_regclass('public.app_secrets') IS NOT NULL
  AND coalesce(has_table_privilege(current_user, to_regclass('public.app_secrets'), 'SELECT'), false)
  AS can_read_app_secret_names
\gset
\if :can_read_app_secret_names
  \echo '=== app_secrets keys only; values omitted ==='
  SELECT key
  FROM public.app_secrets
  ORDER BY key;
\else
  \echo '=== app_secrets keys: relation unavailable or SELECT denied ==='
\endif

COMMIT;
