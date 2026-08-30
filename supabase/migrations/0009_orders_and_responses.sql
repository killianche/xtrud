-- Migration 0009 — таблицы orders и order_responses.
--
-- Источник: CATEGORIES_AND_PROFILES.md §8.2 (orders) + §5.4 PROJECT_MAP (создание заказа).
-- Sprint 5 минимум: ключевые поля для MVP-flow. Опущено (sprint 6+):
--   geo_point (PostGIS), address_exact (только picked_master), gender_filter,
--   requires_tags, is_anonymous, attributes jsonb (cat-specific), views_count.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE public.order_urgency AS ENUM ('urgent', 'this_week', 'this_month', 'flexible');
CREATE TYPE public.order_budget_mode AS ENUM ('exact', 'range', 'negotiable');
CREATE TYPE public.order_executor_type AS ENUM ('any', 'solo', 'brigade', 'company');
CREATE TYPE public.order_contact_mode AS ENUM ('chat_only', 'phone_open', 'phone_masked');
CREATE TYPE public.order_status AS ENUM (
  'draft',          -- черновик (не опубликован)
  'open',           -- открыт, принимает отклики
  'in_progress',    -- мастер выбран, в работе
  'completed',      -- работа выполнена, можно ставить отзыв
  'cancelled',      -- клиент отменил
  'expired'         -- истёк expires_at без активности
);

CREATE TYPE public.response_status AS ENUM (
  'sent',       -- отклик отправлен
  'viewed',     -- клиент прочитал
  'accepted',   -- клиент выбрал этого мастера → order.status=in_progress
  'rejected',   -- клиент явно отклонил
  'withdrawn'   -- мастер отозвал свой отклик
);

-- ============================================================================
-- TABLE: orders
-- ============================================================================

CREATE TABLE public.orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Категория и услуги
  l2_id              text NOT NULL REFERENCES public.categories_l2(id) ON DELETE RESTRICT,
  l3_ids             text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Контент
  title              text NOT NULL CHECK (length(title) BETWEEN 5 AND 120),
  description        text NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),

  -- Локация
  city_id            text NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  district           text CHECK (district IS NULL OR length(district) <= 60),
  -- address_exact (видно только picked_master) — sprint 6
  -- geo_point geography(Point) — sprint 6 после установки PostGIS

  -- Параметры
  urgency            public.order_urgency NOT NULL DEFAULT 'flexible',
  budget_min         int CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max         int CHECK (budget_max IS NULL OR budget_max >= 0),
  budget_mode        public.order_budget_mode NOT NULL DEFAULT 'negotiable',
  executor_type      public.order_executor_type NOT NULL DEFAULT 'any',
  contact_mode       public.order_contact_mode NOT NULL DEFAULT 'chat_only',

  -- Статус и выбранный мастер
  status             public.order_status NOT NULL DEFAULT 'open',
  picked_master_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- Кэш счётчики
  responses_count    int NOT NULL DEFAULT 0,

  -- Тайминги
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '30 days'),

  -- Logical constraints
  CONSTRAINT orders_budget_range_valid
    CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max),
  CONSTRAINT orders_picked_only_if_in_progress
    CHECK (
      (picked_master_id IS NULL AND status NOT IN ('in_progress', 'completed'))
      OR (picked_master_id IS NOT NULL AND status IN ('in_progress', 'completed'))
    )
);

COMMENT ON TABLE public.orders IS 'Заявки клиентов. Sprint 5 минимум: без geo, без address_exact, без attributes JSONB.';
COMMENT ON COLUMN public.orders.l3_ids IS 'Опц. список конкретных L3-услуг внутри l2_id. Пустой массив = вся категория.';
COMMENT ON COLUMN public.orders.expires_at IS 'Через 30 дней без активности заявка автоматически переходит в expired (cron, sprint 6).';

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX orders_client_id_idx ON public.orders (client_id);
CREATE INDEX orders_l2_status_created_idx
  ON public.orders (l2_id, status, created_at DESC)
  WHERE status = 'open';
CREATE INDEX orders_city_id_idx ON public.orders (city_id);
CREATE INDEX orders_picked_master_id_idx
  ON public.orders (picked_master_id)
  WHERE picked_master_id IS NOT NULL;

-- ============================================================================
-- TABLE: order_responses
-- ============================================================================

CREATE TABLE public.order_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  master_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  l2_id        text NOT NULL REFERENCES public.categories_l2(id) ON DELETE RESTRICT,

  price_min    int CHECK (price_min IS NULL OR price_min >= 0),
  price_max    int CHECK (price_max IS NULL OR price_max >= 0),
  price_mode   public.order_budget_mode NOT NULL DEFAULT 'negotiable',
  lead_time    text CHECK (lead_time IS NULL OR length(lead_time) <= 100),
  message      text NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),

  status       public.response_status NOT NULL DEFAULT 'sent',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE(order_id, master_id),
  CONSTRAINT order_responses_price_range_valid
    CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max),
  CONSTRAINT order_responses_no_self_response
    CHECK (master_id != (
      -- Сервер-сайд этот CHECK не сможет проверить через FK (нужна функция).
      -- Заменяется на trigger ниже. Этот constraint просто документация intent.
      master_id
    ))
);

-- Удаляем псевдо-CHECK no_self_response — заменяем триггером (см. ниже).
ALTER TABLE public.order_responses DROP CONSTRAINT order_responses_no_self_response;

COMMENT ON TABLE public.order_responses IS 'Отклики мастеров на заявки. Один мастер — один отклик на заявку.';

CREATE TRIGGER order_responses_set_updated_at
BEFORE UPDATE ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX order_responses_order_id_idx ON public.order_responses (order_id);
CREATE INDEX order_responses_master_id_idx ON public.order_responses (master_id);
CREATE INDEX order_responses_order_status_idx ON public.order_responses (order_id, status);

-- ============================================================================
-- TRIGGER: не позволять мастеру откликаться на свой заказ (CATEGORIES_AND_PROFILES §5.6).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_response_not_self()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT client_id INTO v_client_id FROM public.orders WHERE id = NEW.order_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  IF v_client_id = NEW.master_id THEN
    RAISE EXCEPTION 'cannot_respond_to_own_order' USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_response_not_self() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_response_not_self() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_response_not_self() FROM authenticated;

CREATE TRIGGER order_responses_check_not_self
BEFORE INSERT ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.check_response_not_self();

-- ============================================================================
-- TRIGGER: автоматически обновлять orders.responses_count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_order_responses_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.orders SET responses_count = responses_count + 1 WHERE id = NEW.order_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.orders SET responses_count = GREATEST(0, responses_count - 1) WHERE id = OLD.order_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_order_responses_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_order_responses_count() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_order_responses_count() FROM authenticated;

CREATE TRIGGER order_responses_update_count
AFTER INSERT OR DELETE ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.update_order_responses_count();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_responses ENABLE ROW LEVEL SECURITY;

-- orders SELECT: открытые публично + свои черновики/завершённые
CREATE POLICY orders_read_open_or_own ON public.orders
  FOR SELECT USING (
    status IN ('open', 'in_progress', 'completed')
    OR (SELECT auth.uid()) = client_id
    OR (SELECT auth.uid()) = picked_master_id
  );

-- orders INSERT: только свои
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = client_id);

-- orders UPDATE: только владелец (мастер не правит — он только откликается)
CREATE POLICY orders_update_own ON public.orders
  FOR UPDATE USING ((SELECT auth.uid()) = client_id)
  WITH CHECK ((SELECT auth.uid()) = client_id);

-- orders DELETE: только владелец, только draft
CREATE POLICY orders_delete_own_drafts ON public.orders
  FOR DELETE USING ((SELECT auth.uid()) = client_id AND status = 'draft');

-- order_responses SELECT: участникам сделки
CREATE POLICY order_responses_read_participants ON public.order_responses
  FOR SELECT USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (
      SELECT client_id FROM public.orders WHERE id = order_responses.order_id
    )
  );

-- order_responses INSERT: только сам мастер (триггер дополнительно проверяет not-self)
CREATE POLICY order_responses_insert_own ON public.order_responses
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);

-- order_responses UPDATE: master может withdraw, client может accept/reject
CREATE POLICY order_responses_update_own_or_client ON public.order_responses
  FOR UPDATE USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (
      SELECT client_id FROM public.orders WHERE id = order_responses.order_id
    )
  );
