-- Migration 0025 — индексы на FK по результатам Supabase advisor (Sprint A).
--
-- Advisor запущен 2026-05-12, нашёл 2 unindexed foreign key:
--   - public.messages.sender_id → public.users.id
--   - public.order_responses.l2_id → public.categories_l2.id
--
-- Без индексов:
--   - DELETE / UPDATE на родительской таблице делает seq-scan дочерней
--     для проверки FK (CASCADE).
--   - JOIN'ы по этим FK медленнее.
--
-- Не делаем CONCURRENTLY: таблицы маленькие (десятки строк сейчас) и индексы
-- создаются быстро. CONCURRENTLY имеет смысл для multi-million row таблиц.

CREATE INDEX IF NOT EXISTS messages_sender_id_idx
  ON public.messages (sender_id);

CREATE INDEX IF NOT EXISTS order_responses_l2_id_idx
  ON public.order_responses (l2_id);

COMMENT ON INDEX public.messages_sender_id_idx IS
  'Sprint 25: индекс для FK messages.sender_id → users.id (advisor unindexed_foreign_keys).';
COMMENT ON INDEX public.order_responses_l2_id_idx IS
  'Sprint 25: индекс для FK order_responses.l2_id → categories_l2.id (advisor unindexed_foreign_keys).';
