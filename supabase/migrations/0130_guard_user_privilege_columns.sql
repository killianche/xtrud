-- Запрет самоназначения в администраторы.
--
-- RLS в PostgreSQL ограничивает строки, но не колонки: политика users_update_own
-- разрешает владельцу менять свою строку целиком, а табличный грант UPDATE даёт
-- доступ ко всем её колонкам. Поэтому любой авторизованный пользователь мог
-- выставить себе is_admin = true.
--
-- Подтверждено read-only запросом к production 2026-08-30:
--   SELECT grantee, privilege_type FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='users' AND column_name='is_admin';
-- вернул UPDATE у ролей anon и authenticated.
--
-- Триггер аддитивен: не трогает гранты и политики, снимается одним
-- DROP TRIGGER users_guard_privilege_columns ON public.users.
--
-- Колонка status намеренно НЕ блокируется: ею пользуется существующая админка
-- прямым UPDATE, и её замок требует сначала заменить эти записи на RPC.
-- Это отдельная задача, см. supabase/migration-drafts/0126_suspension_enforcement.sql.

CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Владелец базы обслуживает права вручную: выдача админа остаётся
  -- операцией через psql, у неё нет интерфейса и, значит, нет вектора атаки.
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Изменение прав администратора запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.is_admin is managed by the database owner only';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'Изменение признака тестового аккаунта запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.is_demo is managed by the database owner only';
  END IF;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.guard_user_privilege_columns() IS
  'Blocks privilege escalation through users.is_admin / users.is_demo. RLS cannot restrict columns; only the database owner may change these.';

REVOKE ALL ON FUNCTION public.guard_user_privilege_columns()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS users_guard_privilege_columns ON public.users;
CREATE TRIGGER users_guard_privilege_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_privilege_columns();
