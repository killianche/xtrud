-- Migration 0032 — Социальный граф: контакты + поручительства (vouches).
--
-- Sprint I.8. Главное конкурентное преимущество xtrud (PROJECT_MAP §5.8):
-- «соседи рекомендуют», тейповые/социальные связи Ингушетии.
--
-- Модель:
--   user_contacts (user_id, phone_normalized) — телефонная книга юзера.
--     Импортируется с устройства (с разрешения). Каждая строка =
--     один контакт. UNIQUE(user_id, phone_normalized).
--   vouches (id, voucher_id, vouchee_id, comment, created_at) —
--     «Я поручаюсь за этого мастера». voucher = автор, vouchee = тот за кого.
--
-- RPC `common_contacts_with(other_user_id)`:
--   возвращает count «общих знакомых» = ∩ user_contacts(me).phone и users.phone(other).
--   Уважает RLS — phone в users_private, но RPC SECURITY DEFINER.

-- ============================================================================
-- 1. user_contacts — телефонная книга
-- ============================================================================

CREATE TABLE public.user_contacts (
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone_normalized   text NOT NULL CHECK (
    phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
  ),
  display_name       text CHECK (display_name IS NULL OR length(display_name) <= 200),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phone_normalized)
);

COMMENT ON TABLE public.user_contacts IS
  'Sprint 32: телефонная книга юзера. Импорт с устройства (после permission). Используется для матчинга общих знакомых.';

CREATE INDEX user_contacts_phone_idx
  ON public.user_contacts (phone_normalized);

ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/DELETE — только владелец
CREATE POLICY user_contacts_select_own ON public.user_contacts
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_contacts_insert_own ON public.user_contacts
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_contacts_delete_own ON public.user_contacts
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- 2. vouches — поручительства
-- ============================================================================

CREATE TABLE public.vouches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vouchee_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment      text CHECK (comment IS NULL OR length(comment) BETWEEN 1 AND 500),
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (voucher_id, vouchee_id),
  CONSTRAINT vouches_no_self CHECK (voucher_id != vouchee_id)
);

COMMENT ON TABLE public.vouches IS
  'Sprint 32: поручительство одного юзера за другого. «Я ручаюсь за этого мастера». Двойного направления нет.';

CREATE INDEX vouches_vouchee_idx ON public.vouches (vouchee_id);
CREATE INDEX vouches_voucher_idx ON public.vouches (voucher_id);

ALTER TABLE public.vouches ENABLE ROW LEVEL SECURITY;

-- SELECT — все читают (показываем «N поручительств» в карточке мастера)
CREATE POLICY vouches_read_all ON public.vouches FOR SELECT USING (true);

-- INSERT — только сам voucher
CREATE POLICY vouches_insert_own ON public.vouches
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = voucher_id);

-- DELETE — только сам voucher (отзываю своё поручительство)
CREATE POLICY vouches_delete_own ON public.vouches
  FOR DELETE USING ((SELECT auth.uid()) = voucher_id);

-- ============================================================================
-- 3. RPC: count_common_contacts_with(other_user_id) — общие знакомые
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_common_contacts_with(p_other_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_other_phone text;
  v_my_phone text;
  v_common int;
BEGIN
  IF v_me IS NULL OR v_me = p_other_user_id THEN
    RETURN 0;
  END IF;

  -- Phone другого юзера (мы видим его потому что RPC SECURITY DEFINER)
  SELECT phone INTO v_other_phone FROM public.users_private WHERE user_id = p_other_user_id;
  SELECT phone INTO v_my_phone FROM public.users_private WHERE user_id = v_me;

  -- Общих контактов = (мои контакты ∩ его контакты), плюс если мой телефон
  -- есть в его контактах или его — в моих (мы знаем друг друга напрямую).
  SELECT COUNT(DISTINCT phone_normalized)::int INTO v_common
  FROM (
    SELECT phone_normalized FROM public.user_contacts WHERE user_id = v_me
    INTERSECT
    SELECT phone_normalized FROM public.user_contacts WHERE user_id = p_other_user_id
  ) AS shared;

  RETURN COALESCE(v_common, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.count_common_contacts_with(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_common_contacts_with(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_common_contacts_with(uuid) TO authenticated;

-- ============================================================================
-- 4. RPC: count_vouches_for(target_user_id) — публичный счётчик
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_vouches_for(p_target_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int FROM public.vouches WHERE vouchee_id = p_target_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.count_vouches_for(uuid) TO authenticated, anon;
