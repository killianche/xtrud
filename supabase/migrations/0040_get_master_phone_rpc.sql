-- 0040_get_master_phone_rpc.sql
--
-- Публичный RPC для получения телефона мастера без полного публичного доступа
-- к users.phone (приватное поле по 0001_init.sql).
--
-- Зачем: на master/[id] нужны кнопки «Позвонить» и «WhatsApp» доступные анонам
-- (без обязательной авторизации). Решение пользователя 2026-05-14: «публичный
-- phone всем мастерам» (см. история решений в STATUS.md).
--
-- Подход: SECURITY DEFINER функция, фильтрует только профили is_master=true.
-- Не меняет RLS на users — все остальные приватные поля (birth_year, gender,
-- last_active_at) остаются защищены. Phone клиентов остаётся приватным.

-- NOTE: phone живёт в auth.users (не в public.users — последняя содержит
-- только профильные поля). Поэтому JOIN с auth для получения телефона.
CREATE OR REPLACE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT au.phone
  FROM auth.users au
  JOIN public.users pu ON pu.id = au.id
  WHERE pu.id = p_master_id
    AND pu.is_master = true
    AND pu.status = 'active';
$$;

COMMENT ON FUNCTION public.get_master_phone(uuid) IS
  'Возвращает phone мастера из auth.users для tel:/wa.me на /master/[id]. Только is_master=true AND status=active. Не отдаёт phone клиентов.';

REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_master_phone(uuid) TO anon, authenticated;
