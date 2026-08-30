-- Migration 0002 — split private user fields, lock down trigger function RPC.
--
-- Что меняем:
-- 1. Удаляем VIEW public.users_public (security_invoker=false триггерил advisor ERROR
--    security_definer_view). Вместо view'ы делаем чистую архитектуру split-table:
--    приватные поля выносим в users_private с RLS auth.uid() = user_id.
--    Теперь SELECT * FROM users — публично безопасен (нет приватных полей).
-- 2. REVOKE EXECUTE на handle_new_auth_user() и set_updated_at() с anon/authenticated/public.
--    Эти функции — только триггерные, RPC-доступ через /rest/v1/rpc/* не нужен.
--    Триггеры срабатывают независимо от EXECUTE прав (используют права owner таблицы).
--
-- Безопасно потому что в users 0 строк на момент применения.

-- ---------------------------------------------------------------------------
-- 1. Drop security_invoker=false view
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.users_public;

-- ---------------------------------------------------------------------------
-- 2. Drop приватные колонки из public.users
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.users_phone_idx;

ALTER TABLE public.users DROP COLUMN IF EXISTS phone;
ALTER TABLE public.users DROP COLUMN IF EXISTS birth_year;
ALTER TABLE public.users DROP COLUMN IF EXISTS gender;
ALTER TABLE public.users DROP COLUMN IF EXISTS last_active_at;

-- ---------------------------------------------------------------------------
-- 3. CREATE users_private (приватные поля, только владелец)
-- ---------------------------------------------------------------------------
CREATE TABLE public.users_private (
  user_id        uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone          text UNIQUE,
  birth_year     int CHECK (birth_year IS NULL
                            OR (birth_year >= 1920
                                AND birth_year <= EXTRACT(YEAR FROM now())::int)),
  gender         public.user_gender NOT NULL DEFAULT 'unspecified',
  last_active_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.users_private IS 'Приватные поля пользователя — видны/редактируются только владельцем (RLS auth.uid() = user_id). Связь 1:1 с public.users.';
COMMENT ON COLUMN public.users_private.phone IS 'Может быть NULL для анонимных сессий sprint 1. Sprint 2 заполнит после OTP.';

CREATE TRIGGER users_private_set_updated_at
BEFORE UPDATE ON public.users_private
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX users_private_phone_idx ON public.users_private (phone) WHERE phone IS NOT NULL;

ALTER TABLE public.users_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_private_select_own ON public.users_private
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY users_private_insert_own ON public.users_private
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY users_private_update_own ON public.users_private
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. Расширяем RLS на public.users — SELECT теперь публичный
--    (все приватные поля уехали в users_private)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_own ON public.users;

CREATE POLICY users_select_all ON public.users
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 5. Обновляем handle_new_auth_user — теперь создаёт ОБЕ записи
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users_private (user_id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. REVOKE EXECUTE на trigger-функции (advisor warn)
--    Триггер всё равно работает: он выполняется правами owner таблицы.
--    REVOKE блокирует только прямой RPC через /rest/v1/rpc/*.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated;
