-- 0069_orders_remove_price_range.sql
--
-- Убрать диапазоны цен из заказов и откликов мастеров (фидбэк user 2026-05-15:
-- «убрать диапазоны из всех заказов, чтобы была только одна цена»).
--
-- Новая модель: kind enum (fixed | from | up_to | negotiable) + одно числовое
-- значение. Кейсы:
--   - fixed       — «1 500 ₽» (точная цена)
--   - from        — «от 1 500 ₽» (ниже определённой цены не возьмётся)
--   - up_to       — «до 5 000 ₽» (выше определённой цены не готов заплатить)
--   - negotiable  — «Цена договорная» (без числа)
--
-- Изменения:
--   1. Новый enum `order_price_kind` вместо `order_budget_mode` ('exact'/'range'/'negotiable').
--   2. orders: budget_mode → budget_kind, budget_min → budget_value, drop budget_max.
--   3. order_responses: price_mode → price_kind, price_min → price_value, drop price_max.
--   4. Backfill: exact→fixed, range+min→from, range+max→up_to (max переезжает в value),
--      range+both→from (берём min — продающий формат), negotiable→negotiable.
--   5. Старый enum `order_budget_mode` удаляется через CASCADE (после DROP COLUMN на нём
--      уже никто не висит, но CASCADE для надёжности).
--   6. RPC `start_chat_with_master` (0053) пересоздан под новую схему.

BEGIN;

-- ============================================================================
-- 1. Новый enum
-- ============================================================================

CREATE TYPE public.order_price_kind AS ENUM ('fixed', 'from', 'up_to', 'negotiable');

COMMENT ON TYPE public.order_price_kind IS
  'Способ задания цены: fixed=точно, from=«от Х», up_to=«до Х», negotiable=договорная. Используется orders.budget_kind и order_responses.price_kind.';

-- ============================================================================
-- 2. orders — добавить новые колонки, backfill, удалить старые
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN budget_kind public.order_price_kind,
  ADD COLUMN budget_value int CHECK (budget_value IS NULL OR budget_value >= 0);

UPDATE public.orders SET
  budget_kind = CASE
    WHEN budget_mode = 'exact' THEN 'fixed'::public.order_price_kind
    WHEN budget_mode = 'negotiable' THEN 'negotiable'::public.order_price_kind
    WHEN budget_mode = 'range' AND budget_min IS NOT NULL THEN 'from'::public.order_price_kind
    WHEN budget_mode = 'range' AND budget_max IS NOT NULL THEN 'up_to'::public.order_price_kind
    ELSE 'negotiable'::public.order_price_kind
  END,
  budget_value = CASE
    WHEN budget_mode = 'exact' THEN budget_min
    WHEN budget_mode = 'range' AND budget_min IS NOT NULL THEN budget_min
    WHEN budget_mode = 'range' AND budget_max IS NOT NULL THEN budget_max
    ELSE NULL
  END;

ALTER TABLE public.orders
  ALTER COLUMN budget_kind SET NOT NULL,
  ALTER COLUMN budget_kind SET DEFAULT 'negotiable',
  DROP CONSTRAINT IF EXISTS orders_budget_range_valid,
  DROP COLUMN budget_min,
  DROP COLUMN budget_max,
  DROP COLUMN budget_mode,
  ADD CONSTRAINT orders_budget_kind_value_check CHECK (
    (budget_kind = 'negotiable' AND budget_value IS NULL)
    OR (budget_kind <> 'negotiable' AND budget_value IS NOT NULL AND budget_value >= 0)
  );

COMMENT ON COLUMN public.orders.budget_kind IS
  'Способ задания бюджета: fixed/from/up_to/negotiable. См. public.order_price_kind.';
COMMENT ON COLUMN public.orders.budget_value IS
  'Числовое значение бюджета в ₽. NULL для negotiable, обязательно для остальных.';

-- ============================================================================
-- 3. order_responses — аналогично
-- ============================================================================

ALTER TABLE public.order_responses
  ADD COLUMN price_kind public.order_price_kind,
  ADD COLUMN price_value int CHECK (price_value IS NULL OR price_value >= 0);

UPDATE public.order_responses SET
  price_kind = CASE
    WHEN price_mode = 'exact' THEN 'fixed'::public.order_price_kind
    WHEN price_mode = 'negotiable' THEN 'negotiable'::public.order_price_kind
    WHEN price_mode = 'range' AND price_min IS NOT NULL THEN 'from'::public.order_price_kind
    WHEN price_mode = 'range' AND price_max IS NOT NULL THEN 'up_to'::public.order_price_kind
    ELSE 'negotiable'::public.order_price_kind
  END,
  price_value = CASE
    WHEN price_mode = 'exact' THEN price_min
    WHEN price_mode = 'range' AND price_min IS NOT NULL THEN price_min
    WHEN price_mode = 'range' AND price_max IS NOT NULL THEN price_max
    ELSE NULL
  END;

ALTER TABLE public.order_responses
  ALTER COLUMN price_kind SET NOT NULL,
  ALTER COLUMN price_kind SET DEFAULT 'negotiable',
  DROP CONSTRAINT IF EXISTS order_responses_price_range_valid,
  DROP COLUMN price_min,
  DROP COLUMN price_max,
  DROP COLUMN price_mode,
  ADD CONSTRAINT order_responses_price_kind_value_check CHECK (
    (price_kind = 'negotiable' AND price_value IS NULL)
    OR (price_kind <> 'negotiable' AND price_value IS NOT NULL AND price_value >= 0)
  );

COMMENT ON COLUMN public.order_responses.price_kind IS
  'Способ задания цены в отклике мастера. См. public.order_price_kind.';
COMMENT ON COLUMN public.order_responses.price_value IS
  'Числовое значение предложенной цены в ₽. NULL для negotiable.';

-- ============================================================================
-- 4. Удаляем старый enum (на нём уже никто не висит — обе колонки удалены)
-- ============================================================================

DROP TYPE public.order_budget_mode;

-- ============================================================================
-- 5. Пересоздать RPC start_chat_with_master под новую схему
--    (раньше использовал price_mode='exact'/'range' + price_min/price_max).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_chat_with_master(
  p_order_id uuid, p_master_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_client_id uuid;
  v_chat_id uuid;
  v_response public.order_responses%ROWTYPE;
  v_welcome text;
  v_price_text text;
  v_value_fmt text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT client_id INTO v_client_id FROM public.orders WHERE id = p_order_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_client_id <> v_caller THEN
    RAISE EXCEPTION 'Forbidden: only order owner can start chat' USING ERRCODE = '42501';
  END IF;
  IF v_client_id = p_master_id THEN
    RAISE EXCEPTION 'client and master must differ' USING ERRCODE = '23514';
  END IF;
  SELECT id INTO v_chat_id FROM public.chats
  WHERE order_id = p_order_id AND master_id = p_master_id;
  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;
  INSERT INTO public.chats (order_id, client_id, master_id)
  VALUES (p_order_id, v_client_id, p_master_id) RETURNING id INTO v_chat_id;
  SELECT * INTO v_response FROM public.order_responses
  WHERE order_id = p_order_id AND master_id = p_master_id
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    -- Формат числа в русской типографике: пробел как тысячный разделитель.
    v_value_fmt := CASE
      WHEN v_response.price_value IS NOT NULL
        THEN replace(to_char(v_response.price_value, 'FM999G999G999'), ',', ' ')
      ELSE NULL
    END;
    v_price_text := CASE
      WHEN v_response.price_kind = 'fixed' AND v_value_fmt IS NOT NULL
        THEN v_value_fmt || ' ₽'
      WHEN v_response.price_kind = 'from' AND v_value_fmt IS NOT NULL
        THEN 'от ' || v_value_fmt || ' ₽'
      WHEN v_response.price_kind = 'up_to' AND v_value_fmt IS NOT NULL
        THEN 'до ' || v_value_fmt || ' ₽'
      ELSE 'Цена договорная'
    END;
    v_welcome := 'Мой отклик: ' || v_price_text;
    IF v_response.lead_time IS NOT NULL AND length(trim(v_response.lead_time)) > 0 THEN
      v_welcome := v_welcome || E'\nСрок: ' || v_response.lead_time;
    END IF;
    IF v_response.message IS NOT NULL AND length(trim(v_response.message)) > 0 THEN
      v_welcome := v_welcome || E'\n\n' || v_response.message;
    END IF;
    INSERT INTO public.messages (chat_id, sender_id, text, created_at)
    VALUES (v_chat_id, p_master_id, v_welcome, now());
  END IF;
  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_chat_with_master(uuid, uuid) TO authenticated;

COMMIT;
