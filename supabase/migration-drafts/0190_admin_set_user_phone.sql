-- 0190 — админ может вернуть аккаунт человеку, сменив номер входа.
--
-- ЗАЧЕМ. Владелец (2026-09-11): «есть ли в админке восстановление аккаунтов,
-- чтобы аккаунт можно было вернуть человеку». Что уже было: карточка
-- показывает номер и адрес входа, есть смена пароля (admin_set_user_password)
-- и блокировка. Чего не было — смены номера: если человек потерял симкарту,
-- войти он больше не может, потому что вход по номеру.
--
-- Пароль по-прежнему не показывается никому: в базе только необратимый хеш.
--
-- Побочные действия намеренно оставлены прежними: триггер 0182 снимает
-- подтверждение личности при смене номера (номер подтверждал связь «этот
-- человек — этот аккаунт»), а сессии старого владельца отзываются здесь же.

BEGIN;

-- Журнал действий админа: в списке не было ни 'set_phone', ни 'set_password'
-- (FACT 2026-09-11). Та же ошибка, что закрывала подтверждение паспорта в
-- 0183: функция меняет данные, доходит до записи в журнал и падает на
-- ограничении — целиком, вместе с изменением.
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (
  action = ANY (ARRAY[
    'warn', 'suspend', 'unsuspend', 'ban', 'unban',
    'hide', 'unhide', 'hide_order',
    'dismiss_report', 'resolve_report', 'issue_signed_url',
    'verification_approve', 'verification_reject',
    'master_show', 'master_hide',
    'set_password', 'set_phone'
  ])
);

CREATE OR REPLACE FUNCTION public.admin_set_user_phone(
  p_user_id uuid,
  p_phone text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'xtrud_api', 'pg_temp'
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_email text;
  v_old_phone text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  -- Российский номер: 10 цифр после кода страны.
  IF length(v_digits) < 11 OR length(v_digits) > 15 THEN
    RAISE EXCEPTION 'Введите номер полностью, с кодом страны.'
      USING errcode = '22023', detail = 'phone_invalid';
  END IF;
  v_phone := '+' || v_digits;
  -- Адрес входа синтетический и собирается из номера — как при регистрации
  -- (xtrud_api.register_account), иначе вход по новому номеру не найдёт аккаунт.
  v_email := right(v_digits, 10) || '@phone.xtrud.pro';

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users_private
     WHERE user_id <> p_user_id
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = right(v_digits, 10)
  ) THEN
    RAISE EXCEPTION 'Этот номер уже занят другим аккаунтом.'
      USING errcode = '23505', detail = 'phone_taken';
  END IF;

  SELECT phone INTO v_old_phone FROM public.users_private WHERE user_id = p_user_id;

  UPDATE public.users_private SET phone = v_phone, updated_at = now() WHERE user_id = p_user_id;
  UPDATE auth.users SET email = v_email, updated_at = now() WHERE id = p_user_id;
  -- Старые входы отзываем: номер сменили, прежние сессии продолжать нельзя.
  UPDATE xtrud_api.refresh_tokens SET revoked_at = now()
   WHERE user_id = p_user_id AND revoked_at IS NULL;

  PERFORM public.admin_log_action(
    'set_phone', 'user', p_user_id, p_reason, NULL,
    jsonb_build_object('old_phone', v_old_phone, 'new_phone', v_phone)
  );

  RETURN jsonb_build_object('ok', true, 'phone', v_phone, 'login_email', v_email);
END;
$$;

-- Отзыв сессий требует прав на таблицу токенов API: владелец функции
-- (postgres) их не имеет, схема принадлежит supabase_admin. Выполнять от
-- supabase_admin (FACT 2026-09-11: без этого функция падала с «permission
-- denied for table refresh_tokens»):
--   GRANT UPDATE, SELECT ON xtrud_api.refresh_tokens TO postgres;

REVOKE ALL ON FUNCTION public.admin_set_user_phone(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_phone(uuid, text, text) TO authenticated;

COMMIT;
