-- 0104_admin_demo_account.sql
-- Демо-аккаунт администратора (для админки: рейтинг мастеров, модерация).
-- Логин по demo-схеме (email/пароль под капотом):
--   телефон  +7 900 000-00-99
--   email    79000000099@xtrud-demo.local
--   пароль   xtrud   (OTP-заглушка: любые 6 цифр)
--
-- Создаём клонированием рабочего demo auth-юзера (+79000000001), чтобы не
-- воспроизводить руками инварианты GoTrue. Явные списки колонок — без
-- generated-колонок (auth.users.confirmed_at, auth.identities.email).
-- Триггер on_auth_user_created создаёт public.users → ставим is_admin=true.
-- Идемпотентно: пропускаем, если админ уже есть или нет demo-датасета.

do $$
declare
  v_admin_id uuid := 'ad000000-0000-0000-0000-000000000001';
  v_admin_email text := '79000000099@xtrud-demo.local';
  v_src_email text := '79000000001@xtrud-demo.local';
  v_src_id uuid;
begin
  if exists (select 1 from auth.users where email = v_admin_email) then
    return;
  end if;

  select id into v_src_id from auth.users where email = v_src_email;
  if v_src_id is null then
    return;
  end if;

  -- 1. Клон auth.users (явные колонки, без generated confirmed_at).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    invited_at, confirmation_token, confirmation_sent_at, recovery_token,
    recovery_sent_at, email_change_token_new, email_change, email_change_sent_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    created_at, updated_at, phone, phone_confirmed_at, phone_change,
    phone_change_token, phone_change_sent_at, email_change_token_current,
    email_change_confirm_status, banned_until, reauthentication_token,
    reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
  )
  select
    instance_id, v_admin_id, aud, role, v_admin_email, encrypted_password, email_confirmed_at,
    invited_at, confirmation_token, confirmation_sent_at, recovery_token,
    recovery_sent_at, email_change_token_new, email_change, email_change_sent_at,
    null, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    now(), now(), '+79000000099', phone_confirmed_at, phone_change,
    phone_change_token, phone_change_sent_at, email_change_token_current,
    email_change_confirm_status, banned_until, reauthentication_token,
    reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
  from auth.users where id = v_src_id;

  -- 2. Identity (email-провайдер) с новыми id / sub / email.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_admin_id, 'email', v_admin_id::text,
    jsonb_build_object(
      'sub', v_admin_id::text,
      'email', v_admin_email,
      'email_verified', true,
      'phone_verified', true
    ),
    now(), now(), now()
  );

  -- 3. Профиль (создан триггером) → делаем админом.
  update public.users
  set is_admin = true,
      first_name = 'Админ',
      last_name = 'xtrud',
      active_role = 'client',
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      is_demo = true,
      status = 'active'
  where id = v_admin_id;
end $$;
