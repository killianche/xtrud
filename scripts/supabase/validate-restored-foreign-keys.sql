\set ON_ERROR_STOP on

-- Read-only orphan validation for every non-system foreign key after a restore
-- that temporarily used session_replication_role=replica. Run only against the
-- disposable target. The script fails on the first orphaned relationship.
DO $validation$
DECLARE
  fk record;
  orphan_count bigint;
  validated_count integer := 0;
BEGIN
  FOR fk IN
    SELECT
      source_ns.nspname AS source_schema,
      source_table.relname AS source_table,
      constraint_row.conname AS constraint_name,
      constraint_row.confmatchtype AS match_type,
      target_ns.nspname AS target_schema,
      target_table.relname AS target_table,
      string_agg(
        format('source_row.%I = target_row.%I', source_column.attname, target_column.attname),
        ' AND ' ORDER BY source_key.ordinality
      ) AS join_condition,
      string_agg(
        format('source_row.%I IS NOT NULL', source_column.attname),
        ' AND ' ORDER BY source_key.ordinality
      ) AS source_present_condition,
      (array_agg(target_column.attname ORDER BY source_key.ordinality))[1] AS first_target_column
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_table ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_ns ON source_ns.oid = source_table.relnamespace
    JOIN pg_class AS target_table ON target_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS target_ns ON target_ns.oid = target_table.relnamespace
    CROSS JOIN LATERAL unnest(constraint_row.conkey)
      WITH ORDINALITY AS source_key(attnum, ordinality)
    JOIN LATERAL unnest(constraint_row.confkey)
      WITH ORDINALITY AS target_key(attnum, ordinality)
      ON target_key.ordinality = source_key.ordinality
    JOIN pg_attribute AS source_column
      ON source_column.attrelid = source_table.oid
      AND source_column.attnum = source_key.attnum
    JOIN pg_attribute AS target_column
      ON target_column.attrelid = target_table.oid
      AND target_column.attnum = target_key.attnum
    WHERE constraint_row.contype = 'f'
      AND source_ns.nspname <> 'information_schema'
      AND source_ns.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    GROUP BY
      source_ns.nspname,
      source_table.relname,
      constraint_row.conname,
      constraint_row.confmatchtype,
      target_ns.nspname,
      target_table.relname
    ORDER BY source_ns.nspname, source_table.relname, constraint_row.conname
  LOOP
    IF fk.match_type <> 's' THEN
      RAISE EXCEPTION 'Unsupported non-MATCH-SIMPLE FK %.%.%',
        fk.source_schema, fk.source_table, fk.constraint_name;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I.%I AS source_row LEFT JOIN %I.%I AS target_row ON %s WHERE (%s) AND target_row.%I IS NULL',
      fk.source_schema,
      fk.source_table,
      fk.target_schema,
      fk.target_table,
      fk.join_condition,
      fk.source_present_condition,
      fk.first_target_column
    ) INTO orphan_count;

    IF orphan_count <> 0 THEN
      RAISE EXCEPTION 'FK %.%.% has % orphan rows',
        fk.source_schema, fk.source_table, fk.constraint_name, orphan_count;
    END IF;
    validated_count := validated_count + 1;
  END LOOP;

  IF validated_count = 0 THEN
    RAISE EXCEPTION 'No non-system foreign keys were found; validation is inconclusive';
  END IF;
  RAISE NOTICE 'Validated % foreign keys; no orphan rows found', validated_count;
END
$validation$;
