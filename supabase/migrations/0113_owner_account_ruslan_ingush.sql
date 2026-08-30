-- 0113_owner_account_ruslan_ingush.sql
--
-- Личный аккаунт владельца продукта на его номере +7 928 920-40-29.
-- Запрошено 2026-05-28. На номере уже был анонимный аккаунт (first_name
-- 'Хамзат', без email/пароля) — перенастраиваем ЕГО под владельца, не плодя
-- второй аккаунт на тот же номер (номер уникален в users_private).
--   Имя       Руслан
--   Юзернейм  @ingush
--   Логин (демо-схема, пока нет SMS): email 79289204029@xtrud-demo.local,
--             пароль xtrud (наследуем от рабочего demo-юзера), OTP — любые 6 цифр.
--   Роль: клиент (мастером можно стать в приложении; юзернейм повторно не спросят).
--
-- Фронт: номер добавлен в DEMO_EXTRA_PHONES (src/lib/auth.ts), чтобы demo-вход
-- по нему направлялся через email/пароль. После подключения SMS список убрать.
--
-- Применено к prod через MCP apply_migration (owner_account_ruslan_ingush_repurpose).
-- Идемпотентно.

do $$
declare
  v_owner_id uuid := '8e87643a-179e-4c23-92e1-8f082b32516d';
  v_owner_email text := '79289204029@xtrud-demo.local';
  v_pwd text;
begin
  select encrypted_password into v_pwd
  from auth.users where email = '79000000001@xtrud-demo.local';
  if v_pwd is null then
    return;
  end if;

  update auth.users
  set email = v_owner_email,
      encrypted_password = v_pwd,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      is_anonymous = false,
      aud = 'authenticated',
      role = 'authenticated',
      updated_at = now()
  where id = v_owner_id
    and email IS DISTINCT FROM v_owner_email;

  if not exists (
    select 1 from auth.identities
    where user_id = v_owner_id and provider = 'email'
  ) then
    insert into auth.identities (
      id, user_id, provider, provider_id, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_owner_id, 'email', v_owner_id::text,
      jsonb_build_object(
        'sub', v_owner_id::text,
        'email', v_owner_email,
        'email_verified', true,
        'phone_verified', true
      ),
      now(), now(), now()
    );
  end if;

  update public.users
  set first_name = 'Руслан',
      last_name = null,
      username = coalesce(username, 'ingush'),
      is_client = true,
      active_role = 'client',
      city_id = coalesce(city_id, 'magas'),
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      status = 'active'
  where id = v_owner_id;
end $$;
