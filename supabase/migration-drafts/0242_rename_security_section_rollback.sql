-- Откат 0242: вернуть название раздела tech-security из 0241.
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0242_rollback_must_run_as_postgres';
  END IF;
  IF (SELECT name_ru FROM public.categories_l1 WHERE id = 'tech-security')
     IS DISTINCT FROM 'Безопасность и антенны' THEN
    RAISE EXCEPTION '0242_not_applied';
  END IF;
END $$;

UPDATE public.categories_l1 SET name_ru = 'Замки, камеры, антенны' WHERE id = 'tech-security';

COMMIT;
