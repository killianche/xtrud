-- 0242: раздел tech-security — «Безопасность и антенны» (№297, 2026-10-07).
-- DECISION владельца: «Лучше „Безопасность и антенны“». «Сантехника и
-- электрика» остаётся одним разделом (DECISION того же дня).
-- Откат: 0242_rename_security_section_rollback.sql. Применять от postgres.

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0242_must_run_as_postgres';
  END IF;
  IF (SELECT name_ru FROM public.categories_l1 WHERE id = 'tech-security')
     IS DISTINCT FROM 'Замки, камеры, антенны' THEN
    RAISE EXCEPTION '0242_state_changed';
  END IF;
END $$;

UPDATE public.categories_l1 SET name_ru = 'Безопасность и антенны' WHERE id = 'tech-security';

DO $$
BEGIN
  IF (SELECT name_ru FROM public.categories_l1 WHERE id = 'tech-security')
     IS DISTINCT FROM 'Безопасность и антенны' THEN
    RAISE EXCEPTION '0242_postcheck_failed';
  END IF;
END $$;

COMMIT;
