-- 0041_confirm_work_done.sql
--
-- Фича «Подтвердить выполнение работы» (Sprint J).
--
-- Зачем: клиент должен иметь возможность подтвердить что мастер выполнил работу,
-- даже если заказа в xtrud не было (общался напрямую). После подтверждения у
-- мастера в профиле растёт счётчик «выполнено работ», параллельно может быть
-- оставлен отзыв.
--
-- 3 сценария входа (см. discussion в чате 2026-05-14):
--   A. Есть заказ в xtrud, picked_master_id уже стоит → просто статус → completed
--   B. Есть заказ, нет picked_master → выбрать из откликов + status → completed
--   C. Заказа нет вообще → создать ad-hoc order сразу со status=completed

-- 1. orders.completed_at — когда подтверждено (для счётчика «выполнено за месяц»).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.orders.completed_at IS
  'Когда заказ подтверждён клиентом как выполненный. Set'ится атомарно через RPC confirm_work_done().';

-- 2. orders.created_via — отличить классические orders от ad-hoc completion.
DO $$ BEGIN
  CREATE TYPE public.order_created_via AS ENUM ('wizard', 'ad_hoc_completion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_via public.order_created_via NOT NULL DEFAULT 'wizard';

COMMENT ON COLUMN public.orders.created_via IS
  'wizard — классический wizard /orders/new. ad_hoc_completion — клиент пост-фактум подтвердил оффлайн-работу через /master/[id].';

-- 3. RPC confirm_work_done — атомарно завершить заказ.
--    - Существующий заказ (сценарий A/B): status → completed, completed_at, picked_master_id.
--    - Ad-hoc (сценарий C): создать новый order со status=completed, created_via=ad_hoc_completion.
--    Инкрементит master_profiles.closed_deals в обоих случаях.
--    Опционально создаёт review.
CREATE OR REPLACE FUNCTION public.confirm_work_done(
  p_master_id uuid,
  p_order_id uuid DEFAULT NULL,           -- A/B: ID существующего заказа
  p_l2_id text DEFAULT NULL,              -- C: категория для ad-hoc
  p_title text DEFAULT NULL,              -- C: что было выполнено (краткое)
  p_review_rating int DEFAULT NULL,       -- 1-5, опционально
  p_review_text text DEFAULT NULL         -- опционально
)
RETURNS uuid  -- возвращает order_id (существующий или новый)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid := auth.uid();
  v_order_id uuid;
  v_l2 text;
  v_default_city text;
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Подтверждение работы требует авторизации';
  END IF;

  -- Проверить что мастер реально мастер.
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_master_id AND is_master = true AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Мастер не найден или неактивен';
  END IF;

  IF p_order_id IS NOT NULL THEN
    -- Сценарий A/B: завершаем существующий заказ.
    UPDATE public.orders
    SET
      status = 'completed',
      completed_at = now(),
      picked_master_id = p_master_id,
      updated_at = now()
    WHERE id = p_order_id
      AND client_id = v_client_id
      AND status IN ('open', 'in_progress')
    RETURNING id, l2_id INTO v_order_id, v_l2;

    IF v_order_id IS NULL THEN
      RAISE EXCEPTION 'Заказ не найден или уже завершён';
    END IF;
  ELSE
    -- Сценарий C: ad-hoc — создаём заказ ретроспективно.
    IF p_l2_id IS NULL THEN
      RAISE EXCEPTION 'Для ad-hoc подтверждения нужна категория (p_l2_id)';
    END IF;

    -- Берём первый активный город для clien'а если нет (грязно, но MVP).
    SELECT id INTO v_default_city FROM public.cities WHERE is_active = true ORDER BY sort_order LIMIT 1;

    INSERT INTO public.orders (
      client_id, l2_id, title, description, city_id,
      status, completed_at, picked_master_id, created_via,
      budget_mode, urgency
    ) VALUES (
      v_client_id, p_l2_id,
      COALESCE(p_title, 'Работа выполнена'),
      COALESCE(p_review_text, ''),
      COALESCE((SELECT city_id FROM public.users WHERE id = v_client_id), v_default_city),
      'completed', now(), p_master_id, 'ad_hoc_completion',
      'negotiable', 'flexible'
    ) RETURNING id, l2_id INTO v_order_id, v_l2;
  END IF;

  -- Инкремент счётчика у мастера.
  UPDATE public.master_profiles
  SET closed_deals = closed_deals + 1, updated_at = now()
  WHERE user_id = p_master_id;

  -- Опциональный отзыв.
  IF p_review_rating IS NOT NULL THEN
    IF p_review_rating < 1 OR p_review_rating > 5 THEN
      RAISE EXCEPTION 'Оценка должна быть 1-5';
    END IF;
    INSERT INTO public.reviews (
      author_id, target_id, order_id, l2_id, direction, rating, text, status
    ) VALUES (
      v_client_id, p_master_id, v_order_id, v_l2, 'client_to_master',
      p_review_rating, p_review_text, 'visible'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_work_done(uuid, uuid, text, text, int, text) IS
  'Подтвердить что мастер выполнил работу. Сценарии A/B (existing order) или C (ad-hoc create). Инкрементит closed_deals, опционально создаёт review.';

REVOKE ALL ON FUNCTION public.confirm_work_done(uuid, uuid, text, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_work_done(uuid, uuid, text, text, int, text) TO authenticated;
