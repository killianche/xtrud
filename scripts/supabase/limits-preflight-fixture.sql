-- Isolated local fixture modelling the CURRENT, published backend for two gaps:
--
--   supabase/migration-drafts/0131_order_publish_limit.sql   (gap Р4)
--   supabase/migration-drafts/0133_order_picked_master.sql   (gap Р1)
--
-- SOURCE OF TRUTH FOR THIS FIXTURE IS THE LIVE DATABASE, NOT THE GIT CHAIN.
-- Every object below was read read-only from production on 2026-08-30 in a
-- `SET default_transaction_read_only = on` session. That matters: production has
-- 138 applied migrations against 129 files in supabase/migrations/, so the Git
-- chain alone would have modelled the wrong "before" state. Specifically, all of
-- the following exist live and in no migration file:
--
--   * public.confirm_work_done(...)   SECURITY DEFINER, EXECUTE to authenticated,
--     writes orders.picked_master_id through an UPDATE that no RLS policy sees;
--   * public.reopen_order(uuid)       SECURITY DEFINER, moves cancelled/expired
--     back to 'open' with no capacity check at all;
--   * the eight RLS policies on public.orders, whose UPDATE pair
--     (orders_owner_edit_open) has USING covering 'cancelled' and 'expired'.
--
-- Three trigger/RPC bodies below are byte-identical copies of the live sources
-- (verified by md5(prosrc)); they are NOT paraphrases:
--
--   trg_notify_order_cancelled_or_expired  md5 2618a640a62ad6259c2213f175830cab
--   trg_notify_masters_on_new_order        md5 45d99130a906f3272de6b559f8a15e23
--   reopen_order                           md5 b619676a9253bfda053da19bd020672f
--
-- The first of those is replaced by draft 0133, which refuses to run unless the
-- body it is about to overwrite still hashes to that exact value. The fixture is
-- therefore also the proof that the guard matches reality rather than a guess.
--
-- One of those copies is itself evidence of the Git/live divergence. The live
-- body of trg_notify_masters_on_new_order is
-- supabase/migrations/0090_notify_masters_on_new_order.sql with its three inline
-- comments stripped, i.e. the function was re-created outside the tracked chain.
-- The fixture reproduces the LIVE body, not the file, and asserts the md5 below;
-- copying the migration file instead makes this fixture fail, which is how the
-- divergence was found.
--
-- public.notify_user is real live code too, but its body calls pg_net. Here it
-- is re-implemented to append to public.fixture_push_log so that "one INSERT
-- fans out a push to every matching master" is a counted fact in the assertions
-- instead of a claim in a comment.
--
-- Passing this fixture proves the drafts' internal contract against a synthetic
-- schema. It is NOT production approval — see supabase/migration-drafts/README.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA auth;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN;
  END IF;
END
$roles$;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types, exactly as live pg_enum reports them
-- ---------------------------------------------------------------------------

CREATE TYPE public.user_status AS ENUM ('active', 'suspended', 'banned', 'deleted');
CREATE TYPE public.order_status AS ENUM
  ('draft', 'open', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed', 'cancelled', 'expired');
CREATE TYPE public.response_status AS ENUM ('sent', 'viewed', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE public.order_price_kind AS ENUM ('fixed', 'from', 'up_to', 'negotiable');
CREATE TYPE public.order_urgency AS ENUM ('urgent', 'this_week', 'this_month', 'flexible', 'by_date');

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id          uuid PRIMARY KEY,
  first_name  text,
  is_master   boolean NOT NULL DEFAULT false,
  is_admin    boolean NOT NULL DEFAULT false,
  status      public.user_status NOT NULL DEFAULT 'active',
  city_id     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories_l1 (id text PRIMARY KEY, name_ru text NOT NULL);
CREATE TABLE public.categories_l2 (
  id text PRIMARY KEY,
  l1_id text NOT NULL REFERENCES public.categories_l1(id),
  name_ru text NOT NULL
);
CREATE TABLE public.cities (
  id text PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO public.categories_l1 (id, name_ru) VALUES ('construction', 'Строительство и ремонт');
INSERT INTO public.categories_l2 (id, l1_id, name_ru) VALUES
  ('plumbing',  'construction', 'Сантехника'),
  ('electrics', 'construction', 'Электрика');
INSERT INTO public.cities (id, is_active, sort_order) VALUES ('nazran', true, 1);

-- Column list and defaults copied from information_schema.columns on live.
-- Only the columns the two drafts read or write are reproduced; the legacy
-- dispute/completion columns are omitted because neither draft touches them.
CREATE TABLE public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  picked_master_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  picked_at         timestamptz,
  l2_id             text NOT NULL REFERENCES public.categories_l2(id),
  title             text NOT NULL,
  description       text,
  photo_urls        text[] NOT NULL DEFAULT ARRAY[]::text[],
  contact_name      text,
  city_id           text REFERENCES public.cities(id),
  district          text,
  status            public.order_status NOT NULL DEFAULT 'open',
  urgency           public.order_urgency NOT NULL DEFAULT 'flexible',
  budget_kind       public.order_price_kind NOT NULL DEFAULT 'negotiable',
  budget_value      int,
  cancel_reason     text,
  cancelled_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at      timestamptz,
  responses_count   int NOT NULL DEFAULT 0,
  last_activity_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  -- live pg_constraint definitions, verbatim
  CONSTRAINT orders_cancel_reason_check
    CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
  CONSTRAINT orders_picked_only_after_accept
    CHECK (picked_master_id IS NULL OR status = ANY (ARRAY[
      'in_progress'::public.order_status,
      'awaiting_confirmation'::public.order_status,
      'completed'::public.order_status,
      'disputed'::public.order_status,
      'cancelled'::public.order_status
    ]))
);

CREATE INDEX orders_client_id_idx ON public.orders USING btree (client_id);

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.order_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  master_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  l2_id       text NOT NULL REFERENCES public.categories_l2(id),
  message     text NOT NULL,
  lead_time   text,
  status      public.response_status NOT NULL DEFAULT 'sent',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, master_id)
);

CREATE TRIGGER order_responses_set_updated_at
BEFORE UPDATE ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- public.check_response_not_self() — byte-identical to live
-- (md5 4e2414b001bb0b8a7447edabc702aea5). It is why draft 0133 does NOT need a
-- separate "you cannot pick yourself" rule: an owner can never hold a response
-- on their own order, so the responder requirement already excludes them. The
-- assertions prove that implication instead of trusting it.
CREATE FUNCTION public.check_response_not_self()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
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
$function$;

CREATE TRIGGER order_responses_check_not_self
BEFORE INSERT ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.check_response_not_self();

CREATE TABLE public.order_status_log (
  id               bigserial PRIMARY KEY,
  order_id         uuid NOT NULL,
  from_status      public.order_status,
  to_status        public.order_status NOT NULL,
  transition_code  text,
  triggered_by     uuid,
  triggered_kind   text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.master_profiles (
  user_id               uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'active',
  is_hidden_from_search boolean NOT NULL DEFAULT false,
  closed_deals          int NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.master_categories (
  master_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  l2_id     text NOT NULL REFERENCES public.categories_l2(id),
  PRIMARY KEY (master_id, l2_id)
);

CREATE TABLE public.master_service_areas (
  master_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  location_id text NOT NULL,
  PRIMARY KEY (master_id, kind, location_id)
);

-- Every push the backend would send. public.notify_user is async through pg_net
-- in production; here it is synchronous and recorded, so "one INSERT fans out to
-- every matching master" becomes a number the assertions can compare.
CREATE TABLE public.fixture_push_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  title      text NOT NULL,
  body       text,
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.notify_user(p_user_id uuid, p_title text, p_body text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.fixture_push_log (user_id, title, body, data)
  VALUES (p_user_id, p_title, p_body, p_data);
END;
$$;

-- Live ACL: {postgres=X/postgres,service_role=X/postgres}. No API role may call it.
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Live trigger bodies, byte-identical (md5(prosrc) verified against production)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.trg_notify_masters_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_category_name text;
  v_title         text;
  v_body          text;
  v_data          jsonb;
  v_master        record;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  SELECT cl2.name_ru INTO v_category_name
  FROM public.categories_l2 cl2
  WHERE cl2.id = NEW.l2_id;

  v_title := CASE
    WHEN v_category_name IS NOT NULL THEN 'Новая заявка: ' || v_category_name
    ELSE 'Новая заявка'
  END;
  v_body := left(NEW.title, 80);
  v_data := jsonb_build_object(
    'kind',     'new_order',
    'order_id', NEW.id,
    'l2_id',    NEW.l2_id,
    'city_id',  NEW.city_id
  );

  FOR v_master IN
    SELECT mp.user_id
    FROM public.master_profiles mp
    JOIN public.master_categories mc
         ON mc.master_id = mp.user_id AND mc.l2_id = NEW.l2_id
    JOIN public.users u ON u.id = mp.user_id
    WHERE mp.status = 'active'
      AND u.status = 'active'
      AND COALESCE(mp.is_hidden_from_search, false) = false
      AND mp.user_id <> NEW.client_id
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.master_service_areas msa
          WHERE msa.master_id = mp.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.master_service_areas msa
          WHERE msa.master_id = mp.user_id
            AND msa.kind = 'city'
            AND msa.location_id = NEW.city_id
        )
      )
  LOOP
    PERFORM public.notify_user(v_master.user_id, v_title, v_body, v_data);
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER orders_notify_masters_on_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_masters_on_new_order();

CREATE FUNCTION public.trg_notify_order_cancelled_or_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_title text;
  v_resp record;
BEGIN
  IF NEW.status NOT IN ('cancelled', 'expired')
     OR COALESCE(OLD.status::text, '') = NEW.status::text THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.status = 'cancelled' THEN 'Клиент отменил заказ'
    WHEN NEW.status = 'expired'   THEN 'Заказ истёк'
  END;

  IF NEW.picked_master_id IS NOT NULL AND NEW.status = 'cancelled' THEN
    PERFORM public.notify_user(
      NEW.picked_master_id,
      v_title,
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id)
    );
  END IF;

  FOR v_resp IN
    SELECT id, master_id
    FROM public.order_responses
    WHERE order_id = NEW.id
      AND status IN ('sent', 'viewed')
  LOOP
    PERFORM public.notify_user(
      v_resp.master_id,
      v_title,
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id)
    );
  END LOOP;

  UPDATE public.order_responses
    SET status = 'withdrawn',
        updated_at = now()
    WHERE order_id = NEW.id
      AND status IN ('sent', 'viewed');

  RETURN NEW;
END;
$function$;

CREATE TRIGGER orders_notify_cancelled_or_expired
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_cancelled_or_expired();

-- Live COMMENT, verbatim. Draft 0133 overwrites it and draft 0134 must put it
-- back character for character, so the rollback assertions can compare.
COMMENT ON FUNCTION public.trg_notify_order_cancelled_or_expired() IS
  'Sprint 26: при cancel/expire заказа — push мастерам с активными откликами + withdraw их откликов + push picked_master при cancel из in_progress.';

-- The md5 the fixture claims must be the md5 the fixture built. If this fails,
-- the copy above drifted from production and draft 0133's guard is worthless.
DO $verify_live_copy$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5
  FROM pg_proc AS proc_row
  JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
  WHERE schema_row.nspname = 'public'
    AND proc_row.proname = 'trg_notify_order_cancelled_or_expired';

  IF v_md5 IS DISTINCT FROM '2618a640a62ad6259c2213f175830cab' THEN
    RAISE EXCEPTION
      'FIXTURE FAIL: the local copy of trg_notify_order_cancelled_or_expired is not the live body (md5 %)', v_md5;
  END IF;

  SELECT md5(prosrc) INTO v_md5
  FROM pg_proc AS proc_row
  JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
  WHERE schema_row.nspname = 'public'
    AND proc_row.proname = 'trg_notify_masters_on_new_order';

  IF v_md5 IS DISTINCT FROM '45d99130a906f3272de6b559f8a15e23' THEN
    RAISE EXCEPTION
      'FIXTURE FAIL: the local copy of trg_notify_masters_on_new_order is not the live body (md5 %)', v_md5;
  END IF;
END
$verify_live_copy$;

-- ---------------------------------------------------------------------------
-- RLS baseline: the eight live policies on public.orders, plus responses/users
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON public.users
  FOR SELECT USING ((SELECT auth.uid()) = id);
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY orders_read_open_or_own ON public.orders
  FOR SELECT USING (
    status = 'open'
    OR (SELECT auth.uid()) = client_id
    OR (SELECT auth.uid()) = picked_master_id
  );
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = client_id);
CREATE POLICY orders_owner_edit_open ON public.orders
  FOR UPDATE
  USING ((SELECT auth.uid()) = client_id
         AND status IN ('open', 'draft', 'cancelled', 'expired'))
  WITH CHECK ((SELECT auth.uid()) = client_id
              AND status IN ('open', 'draft', 'in_progress', 'cancelled', 'expired'));
CREATE POLICY orders_owner_change_status_in_progress ON public.orders
  FOR UPDATE
  USING ((SELECT auth.uid()) = client_id
         AND status IN ('open', 'in_progress', 'awaiting_confirmation'))
  WITH CHECK ((SELECT auth.uid()) = client_id
              AND status IN ('open', 'cancelled', 'completed', 'disputed',
                             'awaiting_confirmation', 'in_progress'));
CREATE POLICY orders_picked_master_lifecycle ON public.orders
  FOR UPDATE
  USING ((SELECT auth.uid()) = picked_master_id
         AND status IN ('in_progress', 'awaiting_confirmation'))
  WITH CHECK ((SELECT auth.uid()) = picked_master_id
              AND status IN ('in_progress', 'awaiting_confirmation', 'disputed', 'cancelled'));
CREATE POLICY orders_owner_delete_open ON public.orders
  FOR DELETE USING ((SELECT auth.uid()) = client_id AND status IN ('open', 'draft'));
CREATE POLICY orders_owner_delete_history ON public.orders
  FOR DELETE USING ((SELECT auth.uid()) = client_id AND status IN ('cancelled', 'expired'));
CREATE POLICY orders_delete_own_drafts ON public.orders
  FOR DELETE USING ((SELECT auth.uid()) = client_id AND status = 'draft');

CREATE POLICY order_responses_read_participants ON public.order_responses
  FOR SELECT USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (SELECT client_id FROM public.orders WHERE id = order_responses.order_id)
  );
CREATE POLICY order_responses_insert_own ON public.order_responses
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);
CREATE POLICY order_responses_update_own_or_client ON public.order_responses
  FOR UPDATE USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (SELECT client_id FROM public.orders WHERE id = order_responses.order_id)
  );
CREATE POLICY order_responses_update_own_master ON public.order_responses
  FOR UPDATE USING ((SELECT auth.uid()) = master_id)
  WITH CHECK ((SELECT auth.uid()) = master_id);

-- ---------------------------------------------------------------------------
-- Live SECURITY DEFINER paths that write the columns these drafts govern
-- ---------------------------------------------------------------------------

-- public.reopen_order(uuid) — byte-identical to live (md5 b619676a9253bfda053da19bd020672f).
-- Live ACL grants EXECUTE to authenticated. It is the reason gap Р4 cannot be
-- closed on INSERT alone: it walks an order back into 'open' with an UPDATE.
CREATE FUNCTION public.reopen_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid; v_status public.order_status; v_updated_at timestamptz;
  v_now timestamptz := now(); v_withdrawn_response record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT client_id, status, updated_at INTO v_client_id, v_status, v_updated_at
  FROM public.orders WHERE id = p_order_id;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_client_id != v_user_id THEN RAISE EXCEPTION 'not_order_owner' USING ERRCODE = '42501'; END IF;
  IF v_status NOT IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'order_not_reopenable' USING ERRCODE = 'P0001';
  END IF;
  IF v_updated_at < v_now - interval '7 days' THEN
    RAISE EXCEPTION 'reopen_window_expired' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.orders SET status = 'open', cancelled_by = NULL, cancel_reason = NULL,
    picked_master_id = NULL, picked_at = NULL, last_activity_at = v_now,
    expires_at = v_now + interval '14 days', updated_at = v_now
  WHERE id = p_order_id;
  FOR v_withdrawn_response IN
    SELECT master_id FROM public.order_responses WHERE order_id = p_order_id AND status = 'withdrawn' LIMIT 50
  LOOP
    PERFORM public.notify_user(v_withdrawn_response.master_id, 'Клиент возобновил заказ',
      'Заявка снова открыта. Можно откликнуться заново.',
      jsonb_build_object('type', 'order_reopened', 'order_id', p_order_id));
  END LOOP;
  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, v_status, 'open', 'T9', v_user_id, 'user', jsonb_build_object('reopen_window_left_days', 7));
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_order(uuid) TO authenticated;

DO $verify_reopen_copy$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc AS proc_row
  JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
  WHERE schema_row.nspname = 'public' AND proc_row.proname = 'reopen_order';
  IF v_md5 IS DISTINCT FROM 'b619676a9253bfda053da19bd020672f' THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the local copy of reopen_order is not the live body (md5 %)', v_md5;
  END IF;
END
$verify_reopen_copy$;

-- public.confirm_work_done(...) — SECURITY DEFINER, EXECUTE granted to
-- authenticated live. Only its first branch is modelled: the UPDATE that stamps
-- picked_master_id on an order without ever asking whether that master
-- responded. The live ad-hoc INSERT branch references a column budget_mode that
-- does not exist on live public.orders, so it raises at runtime and is not
-- modelled; that is recorded, not repaired, by this work.
CREATE FUNCTION public.confirm_work_done_fixture(p_master_id uuid, p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_client_id uuid := auth.uid();
  v_order_id uuid;
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Подтверждение работы требует авторизации';
  END IF;
  UPDATE public.orders
  SET status = 'completed', completed_at = now(), picked_master_id = p_master_id, updated_at = now()
  WHERE id = p_order_id AND client_id = v_client_id AND status IN ('open', 'in_progress')
  RETURNING id INTO v_order_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Заказ не найден или уже завершён';
  END IF;
  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_work_done_fixture(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_work_done_fixture(uuid, uuid) TO authenticated;

-- 0024_expire_orders_cron.sql shape: a server path with no JWT identity.
CREATE FUNCTION public.expire_old_orders_fixture()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count int;
BEGIN
  UPDATE public.orders SET status = 'expired' WHERE status = 'open' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_old_orders_fixture() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Assertion helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.fx_assert_denied(p_label text, p_sql text, p_expect_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_detail text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_message = MESSAGE_TEXT;
    IF p_expect_detail IS NOT NULL AND v_detail IS DISTINCT FROM p_expect_detail THEN
      RAISE EXCEPTION 'ASSERT FAIL [%]: denied for the wrong reason. expected DETAIL=% got DETAIL=% MESSAGE=%',
        p_label, p_expect_detail, COALESCE(v_detail, '<none>'), v_message;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERT FAIL [%]: the statement was NOT denied', p_label;
END;
$$;

CREATE FUNCTION public.fx_assert_allowed(p_label text, p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_message text;
  v_detail text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_message = MESSAGE_TEXT;
    RAISE EXCEPTION 'ASSERT FAIL [%]: the statement was denied. MESSAGE=% DETAIL=%',
      p_label, v_message, COALESCE(v_detail, '<none>');
  END;
END;
$$;

CREATE FUNCTION public.fx_assert(p_label text, p_condition boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]', p_label;
  END IF;
END;
$$;

CREATE FUNCTION public.fx_become(p_actor uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), false);
$$;

-- Publishes p_count open orders as the current JWT actor, one statement each,
-- so the fan-out trigger fires exactly as it would for a script hammering the
-- public REST endpoint.
CREATE FUNCTION public.fx_publish(p_client uuid, p_count int, p_title_prefix text DEFAULT 'Задание')
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 1..p_count LOOP
    INSERT INTO public.orders (client_id, l2_id, title, city_id, status)
    VALUES (p_client, 'plumbing', p_title_prefix || ' ' || v_i, 'nazran', 'open');
  END LOOP;
  RETURN p_count;
END;
$$;

CREATE FUNCTION public.fx_open_count(p_client uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
STABLE
AS $$
  SELECT count(*) FROM public.orders WHERE client_id = p_client AND status = 'open';
$$;

CREATE FUNCTION public.fx_order_id(p_client uuid, p_title text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
STABLE
AS $$
  SELECT id FROM public.orders WHERE client_id = p_client AND title = p_title;
$$;

CREATE FUNCTION public.fx_push_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
STABLE
AS $$
  SELECT count(*) FROM public.fixture_push_log;
$$;

CREATE FUNCTION public.fx_push_count_for(p_user uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
STABLE
AS $$
  SELECT count(*) FROM public.fixture_push_log WHERE user_id = p_user;
$$;

CREATE FUNCTION public.fx_last_push_title(p_user uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
STABLE
AS $$
  SELECT title FROM public.fixture_push_log WHERE user_id = p_user ORDER BY id DESC LIMIT 1;
$$;

CREATE FUNCTION public.fx_reset_pushes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.fixture_push_log;
$$;

-- Reads one order's guarded columns through the owner's own eyes is not enough:
-- the assertions must also read them when RLS would hide the row.
CREATE FUNCTION public.fx_order_field(p_order uuid, p_field text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
STABLE
AS $$
DECLARE
  v_value text;
BEGIN
  EXECUTE format('SELECT (to_jsonb(order_row) ->> %L) FROM public.orders AS order_row WHERE id = %L',
                 p_field, p_order)
  INTO v_value;
  RETURN v_value;
END;
$$;

-- Is an advisory transaction lock currently held by this backend? Draft 0131
-- claims race-free enforcement; without this the claim is unverifiable.
CREATE FUNCTION public.fx_holds_advisory_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted
  );
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_assert_denied(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_assert_allowed(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_assert(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_become(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_publish(uuid, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_open_count(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_order_id(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_push_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_push_count_for(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_last_push_title(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_reset_pushes() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_order_field(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_holds_advisory_lock() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- client_a  10000000-…-0001  the concurrency-cap assertions
-- master_b  20000000-…-0002  master, responds
-- client_c  30000000-…-0003  second client, proves the caps are per account
-- master_d  40000000-…-0004  master, responds
-- master_e  50000000-…-0005  master, NEVER responds — the Р1 negative case
-- client_f  60000000-…-0006  the 24-hour rate-cap assertions
-- client_g  70000000-…-0007  the Р1 picked-master assertions

INSERT INTO public.users (id, first_name, is_master, city_id) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Клиент А', false, 'nazran'),
  ('20000000-0000-4000-8000-000000000002', 'Мастер Б', true,  'nazran'),
  ('30000000-0000-4000-8000-000000000003', 'Клиент В', false, 'nazran'),
  ('40000000-0000-4000-8000-000000000004', 'Мастер Г', true,  'nazran'),
  ('50000000-0000-4000-8000-000000000005', 'Мастер Д', true,  'nazran'),
  ('60000000-0000-4000-8000-000000000006', 'Клиент Е', false, 'nazran'),
  ('70000000-0000-4000-8000-000000000007', 'Клиент Ж', false, 'nazran');

INSERT INTO public.master_profiles (user_id) VALUES
  ('20000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000005');

INSERT INTO public.master_categories (master_id, l2_id) VALUES
  ('20000000-0000-4000-8000-000000000002', 'plumbing'),
  ('40000000-0000-4000-8000-000000000004', 'plumbing'),
  ('50000000-0000-4000-8000-000000000005', 'plumbing');

-- ---------------------------------------------------------------------------
-- Baselines captured BEFORE the drafts
-- ---------------------------------------------------------------------------

CREATE TABLE public.fixture_policy_baseline AS
SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

CREATE TABLE public.fixture_function_baseline AS
SELECT proc_row.proname,
       md5(proc_row.prosrc) AS prosrc_md5,
       obj_description(proc_row.oid, 'pg_proc') AS proc_comment
FROM pg_proc AS proc_row
JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
WHERE schema_row.nspname = 'public'
  AND proc_row.proname IN ('trg_notify_order_cancelled_or_expired',
                           'trg_notify_masters_on_new_order',
                           'reopen_order');

CREATE TABLE public.fixture_trigger_baseline AS
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal;

-- ---------------------------------------------------------------------------
-- Proof that the CURRENT state really is broken
-- ---------------------------------------------------------------------------
-- Every "after" assertion is meaningless unless the "before" state has the
-- defect. These run as an ordinary authenticated PostgREST client.

SET ROLE authenticated;
SELECT public.fx_become('10000000-0000-4000-8000-000000000001');

-- Р4 (a): there is no server-side publication cap at all. Ten open orders, one
-- statement each, all accepted. The published client's MAX_ACTIVE_ORDERS = 3
-- (src/features/orders/order-publish-capacity.ts) never reaches the database.
SELECT public.fx_assert_allowed(
  'BASELINE Р4: ten open orders in a row are accepted',
  $$SELECT public.fx_publish('10000000-0000-4000-8000-000000000001', 10, 'Спам')$$
);
SELECT public.fx_assert(
  'BASELINE Р4: ten open orders really exist',
  public.fx_open_count('10000000-0000-4000-8000-000000000001') = 10
);

-- Р4 (b): each of those inserts fanned a push out to every matching master.
-- Three matching masters, ten orders — thirty pushes nobody can recall.
SELECT public.fx_assert(
  'BASELINE Р4: the AFTER INSERT trigger pushed 3 masters × 10 orders',
  public.fx_push_count() = 30
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- Р1: picked_master_id can be stamped with any master, through the live
-- SECURITY DEFINER RPC, on an order that master never saw. Today the column has
-- no meaning a review or a funnel could rely on.
SET ROLE authenticated;
SELECT public.fx_become('10000000-0000-4000-8000-000000000001');
SELECT public.fx_assert_allowed(
  'BASELINE Р1: confirm_work_done stamps a master who never responded',
  $$SELECT public.confirm_work_done_fixture(
      '50000000-0000-4000-8000-000000000005',
      (SELECT id FROM public.orders WHERE client_id = '10000000-0000-4000-8000-000000000001'
         AND status = 'open' ORDER BY title LIMIT 1))$$
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT public.fx_assert(
  'BASELINE Р1: an unrelated master is now the picked master',
  (SELECT count(*) FROM public.orders AS order_row
   WHERE order_row.picked_master_id = '50000000-0000-4000-8000-000000000005'
     AND NOT EXISTS (SELECT 1 FROM public.order_responses AS response_row
                     WHERE response_row.order_id = order_row.id
                       AND response_row.master_id = order_row.picked_master_id)) = 1
);

-- Р4 (c): reopen_order walks a closed order back into the feed with no capacity
-- check whatsoever. An INSERT-only limit would be decoration.
DO $baseline_reopen$
DECLARE
  v_order uuid;
BEGIN
  SELECT id INTO v_order FROM public.orders
  WHERE client_id = '10000000-0000-4000-8000-000000000001' AND status = 'open'
  ORDER BY title LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
  UPDATE public.orders SET status = 'cancelled', cancel_reason = 'no_longer_needed' WHERE id = v_order;
  PERFORM public.reopen_order(v_order);
  PERFORM set_config('request.jwt.claim.sub', '', false);

  IF (SELECT status FROM public.orders WHERE id = v_order) <> 'open' THEN
    RAISE EXCEPTION 'FIXTURE FAIL: reopen_order did not reopen the order in the baseline';
  END IF;
END
$baseline_reopen$;

-- Reset to a clean, known state: the demonstrations above must not leak into the
-- "after" phase. Legacy rows are recreated deliberately further down.
DELETE FROM public.orders;
DELETE FROM public.fixture_push_log;
DELETE FROM public.order_status_log;

-- ---------------------------------------------------------------------------
-- Legacy rows the drafts must not break
-- ---------------------------------------------------------------------------
-- Read from live on 2026-08-30:
--   completed / cancel_reason NULL          / picked set   → 11 rows
--   cancelled / 'stale_no_activity_30d'     / picked set   →  2 rows
--   cancelled / 'found_master'              / picked NULL  →  1 row
--   cancelled / 'no_longer_needed'          / picked NULL  →  1 row
-- One of the picked rows names a master with no response on that order.
-- Nothing here may become unwritable because of a new invariant.

INSERT INTO public.orders (id, client_id, l2_id, title, city_id, status, cancel_reason,
                           picked_master_id, picked_at, created_at)
VALUES
  ('aa000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'plumbing',
   'Легаси завершённый', 'nazran', 'completed', NULL,
   '20000000-0000-4000-8000-000000000002', now() - interval '90 days', now() - interval '90 days'),
  ('aa000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', 'plumbing',
   'Легаси протухший', 'nazran', 'cancelled', 'stale_no_activity_30d',
   '50000000-0000-4000-8000-000000000005', now() - interval '60 days', now() - interval '60 days'),
  ('aa000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000001', 'plumbing',
   'Легаси найден мастер', 'nazran', 'cancelled', 'found_master',
   NULL, NULL, now() - interval '45 days');

DO $baseline_sanity$
BEGIN
  IF (SELECT count(*) FROM public.orders WHERE status = 'open') <> 0 THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the after-phase must start with no open orders';
  END IF;
  IF (SELECT count(*) FROM public.fixture_push_log) <> 0 THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the push log must start empty';
  END IF;
  IF (SELECT count(*) FROM public.fixture_policy_baseline WHERE tablename = 'orders') <> 8 THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the live baseline has eight policies on public.orders, this fixture has %',
      (SELECT count(*) FROM public.fixture_policy_baseline WHERE tablename = 'orders');
  END IF;
END
$baseline_sanity$;

\echo 'PREFLIGHT OK: live-derived fixture built, baselines captured, gaps Р4 and Р1 demonstrated'
