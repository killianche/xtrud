-- 0186 — каждый аккаунт сразу специалист.
--
-- DECISION владельца (2026-09-11): «Стать специалистом надо убрать.
-- Изначально аккаунт сразу же должен быть специалистом: заходит в аккаунт и
-- видит „Я специалист“, там уже вся информация».
--
-- В каталоге ничего не меняется: специалист там — тот, кто выбрал категорию
-- (Р6, try_publish_master). Профиль без категории — pending и скрыт, пустых
-- карточек в «Специалистах» не появится и рассылка «Новая заявка» их не
-- касается (она берёт только status = 'active').

BEGIN;

-- 1. Регистрация: профиль специалиста создаётся вместе с аккаунтом.
--    onboarding_completed_at не трогаем (в отличие от enable_master_mode):
--    имя человек по-прежнему вводит сам на первом экране.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.users (id, is_master)
  VALUES (NEW.id, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users_private (user_id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.master_profiles (user_id, status, is_hidden_from_search)
  VALUES (NEW.id, 'pending', true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2. Уже существующие аккаунты.
UPDATE public.users
   SET is_master = true
 WHERE NOT is_master
   AND status <> 'deleted';

INSERT INTO public.master_profiles (user_id, status, is_hidden_from_search)
SELECT u.id, 'pending', true
  FROM public.users u
 WHERE u.status <> 'deleted'
   AND NOT EXISTS (SELECT 1 FROM public.master_profiles mp WHERE mp.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- 2а. Статус специалиста не снимается. Установленные сборки до 78 на
--     экране имени пишут is_master = (role = 'master'), то есть false, —
--     без этой защиты каждый новый человек переставал бы быть специалистом.
--     Ни одна функция базы is_master в false не ставит (FACT 2026-09-11).
CREATE OR REPLACE FUNCTION public.trg_keep_is_master()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.is_master AND NOT NEW.is_master THEN
    NEW.is_master := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_keep_is_master() FROM PUBLIC;

DROP TRIGGER IF EXISTS users_keep_is_master ON public.users;
CREATE TRIGGER users_keep_is_master
  BEFORE UPDATE OF is_master ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_keep_is_master();

-- 3. Телефон отдаём только опубликованному специалисту. Раньше хватало
--    is_master — теперь он есть у всех, и защита держалась бы только на том,
--    что у клиентов пустой contact_phone (FACT 2026-09-11: пуст у всех трёх).
CREATE OR REPLACE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pu.contact_phone
    FROM public.users pu
   WHERE auth.uid() IS NOT NULL
     AND pu.id = p_master_id
     AND pu.is_master = true
     AND pu.status = 'active'
     AND EXISTS (
       SELECT 1 FROM public.master_profiles mp
        WHERE mp.user_id = pu.id AND mp.status = 'active'
     );
$$;

-- 4. «Специалистов» в сводке админки — те, кто в каталоге, а не все
--    аккаунты подряд. Меняем одну строку, остальное тело не трогаем.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.admin_metrics'::regproc);
  v_new text;
BEGIN
  v_new := replace(
    v_def,
    $q$(SELECT count(*) FROM public.users WHERE is_master AND status <> 'deleted')$q$,
    $q$(SELECT count(*) FROM public.master_profiles WHERE status = 'active')$q$
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'admin_metrics: строка masters_total не найдена — правка остановлена';
  END IF;
  EXECUTE v_new;
END;
$$;

COMMIT;
