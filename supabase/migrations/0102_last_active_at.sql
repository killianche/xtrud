-- 0102_last_active_at.sql
-- Рейтинг мастеров, Этап 2: честная отметка онлайн-активности.
--
-- Why. В Этапе 1 под-балл «активность» (E) считался по прокси last_seen_feed_at
-- (когда мастер последний раз открывал ленту заказов) — узко. Заводим общую
-- отметку last_active_at: обновляется при любом заходе в приложение (фронт
-- дёргает touch_last_active() раз в сессию, троттл). Скоринг (миграция 0103)
-- читает coalesce(last_active_at, last_seen_feed_at).

alter table public.users
  add column if not exists last_active_at timestamptz;

-- Лёгкий «пинг» активности. SECURITY DEFINER, обновляет только свою строку.
create or replace function public.touch_last_active()
returns void
language sql
security definer
set search_path = public
as $$
  update public.users set last_active_at = now() where id = auth.uid();
$$;

revoke all on function public.touch_last_active() from public;
grant execute on function public.touch_last_active() to authenticated;
