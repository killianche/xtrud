-- 0117_resolve_login_email.sql
--
-- Вход «почта ИЛИ телефон» + пароль (2026-06-05). Auth-идентичность в Supabase —
-- настоящая почта (нужно для resetPasswordForEmail). Телефон хранится в
-- users_private.phone. Эта функция по введённому логину возвращает auth-email:
--   • если в логине есть '@' → это почта, возвращаем как есть (нормализованной);
--   • иначе это телефон → ищем email пользователя по последним 10 цифрам номера.
--
-- security definer: читает auth.users (недоступную анону напрямую). Возвращает
-- только email по точному совпадению номера — не раскрывает список пользователей.
-- Trade-off приватности (перебор «есть ли аккаунт на этот номер») принят для v1.

create or replace function public.resolve_login_email(p_login text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_digits text;
begin
  if p_login is null or length(trim(p_login)) = 0 then
    return null;
  end if;

  -- Почта — возвращаем как есть (вход по почте напрямую).
  if position('@' in p_login) > 0 then
    return lower(trim(p_login));
  end if;

  -- Телефон → последние 10 цифр (нормализация +7 / 8 / без кода).
  v_digits := regexp_replace(p_login, '\D', '', 'g');
  if length(v_digits) >= 11 and left(v_digits, 1) in ('7', '8') then
    v_digits := right(v_digits, 10);
  end if;
  v_digits := right(v_digits, 10);
  if length(v_digits) < 10 then
    return null;
  end if;

  select u.email
    into v_email
  from public.users_private up
  join auth.users u on u.id = up.user_id
  where right(regexp_replace(up.phone, '\D', '', 'g'), 10) = v_digits
  limit 1;

  return v_email;
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
