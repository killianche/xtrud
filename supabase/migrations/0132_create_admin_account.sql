-- Создание аккаунта администратора.
--
-- После 0131 администраторов в базе не осталось: единственным был demo-аккаунт,
-- чей пароль лежал открытым текстом в комментарии миграции 0104. Эта миграция
-- создаёт настоящего администратора взамен.
--
-- ПАРОЛЬ В ЭТОТ ФАЙЛ НЕ ЗАПИСЫВАЕТСЯ. Ровно эта ошибка и сделала 0104
-- уязвимостью: файл в репозитории раздавал административный доступ каждому, кто
-- умеет читать. Значение передаётся переменной psql в момент применения:
--
--   psql -v admin_password="$(openssl rand -base64 24)" \
--        -f supabase/migrations/0132_create_admin_account.sql
--
-- Миграция намеренно падает, если переменная не задана: молча создать
-- администратора со слабым или предсказуемым паролем хуже, чем не создать.
--
-- Аккаунт отдельный, не совмещённый с обычным аккаунтом владельца в приложении
-- (docs/ADMIN_PANEL.md §11): скомпрометированный обычный вход не должен давать
-- административных прав.
--
-- Профиль в public.users создаётся триггером on_auth_user_created, поэтому
-- здесь он только дополняется. Инвариант users_demo_is_never_admin из 0131
-- гарантирует, что администратор не может быть помечен тестовым.

\if :{?admin_password}
\else
  \echo 'ОШИБКА: не задана переменная admin_password.'
  \echo 'Запуск: psql -v admin_password="$(openssl rand -base64 24)" -f <этот файл>'
  \quit 1
\endif

BEGIN;

-- Переменная psql не подставляется внутри долларовых кавычек, поэтому значение
-- кладётся в параметр сессии и читается через current_setting. false во втором
-- аргументе set_config означает «на всю транзакцию», не на сессию.
SELECT set_config('xtrud.admin_password', :'admin_password', true);

DO $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text := 'admin@xtrud.pro';
  v_password text := current_setting('xtrud.admin_password', true);
  v_existing uuid;
BEGIN
  IF length(coalesce(v_password, '')) < 16 THEN
    RAISE EXCEPTION 'admin_password_too_short'
      USING DETAIL = 'Administrative password must be at least 16 characters.';
  END IF;

  SELECT id INTO v_existing FROM auth.users WHERE email = v_email;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'admin_account_already_exists'
      USING DETAIL = 'An account with this email is already present; refusing to overwrite.';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, crypt(v_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false,
    now(), now(), false, false
  );

  INSERT INTO auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_id, 'email', v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  );

  -- Профиль уже создан триггером on_auth_user_created — дополняем его.
  UPDATE public.users
     SET is_admin = true,
         is_demo = false,
         first_name = 'Администратор',
         active_role = 'client',
         status = 'active',
         onboarding_completed_at = coalesce(onboarding_completed_at, now())
   WHERE id = v_id;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_id AND is_admin) THEN
    RAISE EXCEPTION 'admin_profile_not_created'
      USING DETAIL = 'The profile row was not created by the auth trigger.';
  END IF;

  RAISE NOTICE 'Администратор создан: % (id %)', v_email, v_id;
END
$$;

COMMIT;
