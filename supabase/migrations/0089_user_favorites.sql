-- 0089_user_favorites.sql
-- Sprint 0089 — избранные мастера (wishlist).
-- AUDIT_LAUNCH_FUNCTIONAL_2026-05-19 #5: «клиент посмотрел 10 мастеров, ушёл,
-- через день не помнит кого выбирал».
--
-- Структура:
--   user_favorites (user_id, master_id, created_at)
--   - PK (user_id, master_id) — idempotent INSERT, не нужны дубли.
--   - FK на public.users (обе стороны), CASCADE ON DELETE — если пользователь
--     удалит аккаунт (миграция 0088), его favorites очистятся автоматически.
--
-- RLS: пользователь видит/правит ТОЛЬКО свои favorites. Никаких public-listings,
-- мастер не должен знать кто его добавил в избранное (privacy).

CREATE TABLE public.user_favorites (
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  master_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, master_id),
  -- Запрещаем self-favorite. RLS не справится с этим — добавляем constraint.
  CONSTRAINT user_favorites_no_self_favorite CHECK (user_id <> master_id)
);

COMMENT ON TABLE public.user_favorites IS
  'Sprint 0089: избранные мастера у клиента (wishlist). RLS — только owner видит и редактирует. Мастер не знает кто его добавил.';

CREATE INDEX user_favorites_user_idx ON public.user_favorites (user_id, created_at DESC);
CREATE INDEX user_favorites_master_idx ON public.user_favorites (master_id);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- SELECT только свои.
CREATE POLICY user_favorites_select_own ON public.user_favorites
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- INSERT — auth.uid() = user_id.
CREATE POLICY user_favorites_insert_own ON public.user_favorites
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- DELETE — auth.uid() = user_id.
CREATE POLICY user_favorites_delete_own ON public.user_favorites
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
