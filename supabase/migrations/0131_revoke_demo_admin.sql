-- Снятие прав администратора с demo-аккаунта.
--
-- Миграция 0104_admin_demo_account.sql создала аккаунт с is_admin = true и
-- записала его пароль открытым текстом прямо в комментарии файла:
--   «пароль   xtrud   (OTP-заглушка: любые 6 цифр)»
--
-- Проверено read-only запросом к production 2026-08-30: этот аккаунт был
-- ЕДИНСТВЕННЫМ администратором в базе и находился в статусе active.
--   SELECT count(*) FROM public.users WHERE is_admin;            -- 1
--   SELECT count(*) FROM public.users WHERE is_admin AND is_demo; -- 1
--
-- То есть административный доступ к production принадлежал любому, кто прочитал
-- репозиторий. Миграция 0094 должна была разжаловать этот аккаунт, но по
-- живому состоянию не сработала.
--
-- После применения администраторов в базе не остаётся. Это осознанно и
-- безопаснее прежнего состояния: веб-админка ещё не построена, а выдача прав
-- настоящему модератору — отдельная операция владельца базы, у которой нет
-- интерфейса и, значит, нет вектора атаки (docs/ADMIN_PANEL.md §6).
--
-- Триггер users_guard_privilege_columns из 0130 пропускает эту запись, потому
-- что она выполняется владельцем базы.

DO $$
DECLARE
  v_revoked integer;
  v_remaining integer;
BEGIN
  UPDATE public.users
     SET is_admin = false
   WHERE is_admin
     AND is_demo;

  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM public.users WHERE is_admin;

  RAISE NOTICE 'Снято прав администратора: %. Осталось администраторов: %.',
    v_revoked, v_remaining;

  -- Fail-closed: если после снятия остался администратор с признаком demo,
  -- значит условие не покрыло всё, и молча продолжать нельзя.
  IF EXISTS (SELECT 1 FROM public.users WHERE is_admin AND is_demo) THEN
    RAISE EXCEPTION 'demo_admin_still_present'
      USING DETAIL = 'A demo account still holds is_admin after the revoke.';
  END IF;
END
$$;

-- Инвариант на будущее: demo-аккаунт не может быть администратором.
-- Без этого следующая миграция или ручная правка вернут ту же дыру.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_demo_is_never_admin;

ALTER TABLE public.users
  ADD CONSTRAINT users_demo_is_never_admin
  CHECK (NOT (is_demo AND is_admin));

COMMENT ON CONSTRAINT users_demo_is_never_admin ON public.users IS
  'A demo account must never hold admin rights: its password is published in migration 0104.';
