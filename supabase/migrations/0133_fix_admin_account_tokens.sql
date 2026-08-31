-- Починка служебных полей аккаунта администратора.
--
-- Миграция 0132 создала аккаунт, но оставила NULL в четырёх служебных колонках
-- auth.users: confirmation_token, recovery_token, email_change,
-- email_change_token_new. GoTrue ожидает там пустую строку, а не NULL, и при
-- попытке входа падает с «Database error querying schema» — то есть аккаунт был
-- создан, но войти под ним было нельзя.
--
-- Обнаружено проверкой входа настоящим запросом к /auth/v1/token сразу после
-- создания, а не предположено. Миграция 0104 этой проблемы не имела, потому что
-- копировала все колонки из существующего аккаунта целиком.
--
-- Применяется ко всем администраторам, а не только к одному: если такой же
-- аккаунт заведут повторно тем же способом, он получит те же пустые строки.

BEGIN;

UPDATE auth.users u
   SET confirmation_token     = coalesce(u.confirmation_token, ''),
       recovery_token         = coalesce(u.recovery_token, ''),
       email_change           = coalesce(u.email_change, ''),
       email_change_token_new = coalesce(u.email_change_token_new, ''),
       email_change_token_current = coalesce(u.email_change_token_current, ''),
       phone_change           = coalesce(u.phone_change, ''),
       phone_change_token     = coalesce(u.phone_change_token, ''),
       reauthentication_token = coalesce(u.reauthentication_token, '')
  FROM public.users pu
 WHERE pu.id = u.id
   AND pu.is_admin;

DO $$
DECLARE
  v_broken integer;
BEGIN
  SELECT count(*) INTO v_broken
    FROM auth.users u
    JOIN public.users pu ON pu.id = u.id
   WHERE pu.is_admin
     AND (u.confirmation_token IS NULL
       OR u.recovery_token IS NULL
       OR u.email_change IS NULL
       OR u.email_change_token_new IS NULL);

  IF v_broken > 0 THEN
    RAISE EXCEPTION 'admin_tokens_still_null'
      USING DETAIL = 'Some administrator rows still hold NULL in GoTrue token columns.';
  END IF;

  RAISE NOTICE 'Служебные поля администраторов приведены к пустым строкам.';
END
$$;

COMMIT;
