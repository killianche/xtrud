-- Migration 0078 — мастер может скрыть свой профиль из каталога.
--
-- Why. User feedback (2026-05-16): «добавь в профиль кнопку отключения
-- доступа, чтобы профиль не был виден клиентом». Мастер хочет на время
-- (отпуск, болезнь, перегруз) убраться из каталога без удаления аккаунта.
--
-- Семантика:
--   - is_hidden_from_search=true → мастер НЕ появляется в:
--     • /(tabs)/category/[id] (список мастеров в L2)
--     • любых будущих каталог-запросах
--   - Существующие отношения сохраняются:
--     • активные заказы (in_progress / awaiting_confirmation) работают
--     • чаты доступны
--     • отклики не отзываются
--   - Прямая ссылка /(tabs)/master/[id] — пока остаётся доступной (для
--     участников активных чатов / заказов). Будущее: можно добавить
--     soft-block если опрашивающий не участник.
--   - Это user-controlled toggle, отличается от admin-level master_status
--     (draft/pending/active/suspended/archived).

ALTER TABLE public.master_profiles
  ADD COLUMN IF NOT EXISTS is_hidden_from_search boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.master_profiles.is_hidden_from_search IS
  'Sprint 0078: мастер сам скрыл себя из каталога. Filtered out from /category/[id] и любых master-catalog запросов. Activates через /profile/settings → toggle «Скрыть профиль от клиентов». Не влияет на существующие чаты/заказы.';

-- Partial index — ускоряет каталог-запросы (большинство мастеров не скрыты,
-- поэтому фильтр selective и BTREE-индекс на WHERE = false полезен).
CREATE INDEX IF NOT EXISTS master_profiles_visible_idx
  ON public.master_profiles (user_id)
  WHERE is_hidden_from_search = false;
