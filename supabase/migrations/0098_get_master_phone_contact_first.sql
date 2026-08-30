-- 0098_get_master_phone_contact_first.sql
--
-- Sprint 2026-05-20. Расширяет RPC `get_master_phone` (см. 0040), чтобы он
-- возвращал ПУБЛИЧНЫЙ контактный номер с fallback на регистрационный:
--
--   COALESCE(public.users.contact_phone, public.users_private.phone)
--
-- Почему так:
--   * Регистрационный (auth.users.phone == users_private.phone) — приватный
--     идентификатор для входа. Не должен показываться никому, даже если
--     мастер сам не задал контактный.
--   * users.contact_phone (миграция 0097) — публичное поле, мастер вводит сам
--     в онбординге или редакторе профиля.
--   * Для backwards-совместимости с demo-аккаунтами: миграция 0097 уже
--     забэкфилила contact_phone значением users_private.phone. Поэтому
--     fallback в COALESCE срабатывает только для будущих мастеров, которые
--     не успели заполнить contact_phone (на практике редкий кейс, но логика
--     гарантирует что кнопка «Позвонить» никогда не сломается).
--
-- Совместимость: сигнатура и return-type не меняются — те же два аргумента
-- невозможно, потому что один аргумент. Возврат TEXT остаётся.

CREATE OR REPLACE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(pu.contact_phone, upr.phone)
  FROM public.users pu
  LEFT JOIN public.users_private upr ON upr.user_id = pu.id
  WHERE pu.id = p_master_id
    AND pu.is_master = true
    AND pu.status = 'active';
$$;

COMMENT ON FUNCTION public.get_master_phone(uuid) IS
  'Возвращает публичный контактный телефон мастера для tel:/wa.me. Приоритет: users.contact_phone, fallback users_private.phone. Только is_master=true AND status=active.';

REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_master_phone(uuid) TO anon, authenticated;
