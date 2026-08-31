-- Local fixture for the "закалка базы" drafts 0135..0142
-- (docs/ADMIN_PANEL.md §2 / §6 / §9.1, step 1).
--
-- It models the CURRENT published backend for the four tables the hardening
-- touches. Every fact below was read out of production READ-ONLY on 2026-08-31
-- (SET default_transaction_read_only = on) and re-verified against a local
-- restore of `pg_dump --schema-only` taken WITH privileges.
--
-- WHY THIS FIXTURE MUST CARRY GRANTS
-- ----------------------------------
-- A rehearsal schema captured with --no-privileges is worthless for this work.
-- Without grants every "теперь нельзя" assertion passes for the wrong reason:
-- the role simply never had the privilege. The whole subject of draft 0135 is
-- the privilege layer, so the fixture reproduces the live Supabase default:
--
--   GRANT ALL ON <table> TO anon, authenticated, service_role
--
-- verified live: anon and authenticated hold DELETE, INSERT, REFERENCES,
-- SELECT, TRIGGER, TRUNCATE, UPDATE on public.users, public.master_profiles,
-- public.orders and public.order_responses, i.e. UPDATE on all 21 / 27 / 37 /
-- 11 columns respectively.
--
-- WHAT IS REPRODUCED, AND WHY IT IS LOAD-BEARING
-- ----------------------------------------------
--  * The applied migration 0130 (users_guard_privilege_columns). It blocks
--    UPDATE of is_admin/is_demo for everyone but current_user = 'postgres'.
--    It does NOT cover INSERT — that gap is one of the things 0135 closes.
--    -v p0130=skip models the pre-0130 world, -v p0130=foreign models an
--    unrelated object squatting on the name.
--  * The applied CHECK users_demo_is_never_admin from 0131.
--  * Every SECURITY INVOKER path that writes these tables on behalf of
--    `authenticated`. These are the reason the allowlist in 0135 cannot be as
--    narrow as it looks like it should be, and a fixture without them produces
--    a draft that passes locally and breaks the published iOS client:
--       mark_feed_seen()                -> users.last_seen_feed_at
--       complete_master_onboarding()    -> users.*, master_profiles INSERT
--       finalize_master_onboarding()    -> users.is_master/active_role/...
--       accept_response()               -> order_responses.status,
--                                          orders.status/picked_master_id
--       mark_order_responses_viewed()   -> order_responses.status
--       update_order_responses_count()  -> orders.responses_count (trigger)
--       recalc_master_rating()          -> master_profiles.rating_overall_*,
--                                          users.rating_as_client_*  (trigger)
--  * SECURITY DEFINER paths owned by postgres, which must keep working with no
--    API grant at all: touch_last_active(), set_username(),
--    recompute_master_ranking_scores(), is_current_user_admin().
--  * auth.sessions and auth.mfa_factors, because 0137 reads the assurance
--    level from the DATABASE and not from the JWT claim (docs/ADMIN_PANEL.md
--    §6: "признак админа проверяется чтением БД ... отзыв прав должен
--    действовать мгновенно").
--
-- This proves the drafts' internal contract only. It is not production
-- approval; see supabase/migration-drafts/README.md.

\set ON_ERROR_STOP on
\if :{?p0130}
\else
  \set p0130 'applied'
\endif

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles and the auth schema
-- ---------------------------------------------------------------------------

DO $roles$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'ALTER ROLE service_role BYPASSRLS';
  END IF;
  -- The assertion harness runs statements as anon/authenticated via SET ROLE.
  -- Live Supabase grants these to postgres as well.
  EXECUTE 'GRANT anon, authenticated, service_role TO ' || quote_ident(current_user);
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Copied from live: auth.uid() and auth.jwt() read request.jwt.claims.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE TYPE auth.aal_level AS ENUM ('aal1', 'aal2', 'aal3');
CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn', 'phone');
CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified');

CREATE TABLE auth.sessions (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  factor_id  uuid,
  aal        auth.aal_level,
  not_after  timestamptz
);

CREATE TABLE auth.mfa_factors (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL,
  friendly_name text,
  factor_type   auth.factor_type NOT NULL,
  status        auth.factor_status NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  secret        text
);

-- Live: anon/authenticated have USAGE on auth but no privileges on these
-- tables. Only supabase_auth_admin and the database owner can read them.
REVOKE ALL ON auth.sessions, auth.mfa_factors FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types (copied verbatim from the live dump)
-- ---------------------------------------------------------------------------

CREATE TYPE public.user_status          AS ENUM ('active', 'suspended', 'banned', 'deleted');
CREATE TYPE public.user_active_role     AS ENUM ('client', 'master');
CREATE TYPE public.master_status        AS ENUM ('draft', 'pending', 'active', 'suspended', 'archived');
CREATE TYPE public.availability_status  AS ENUM ('today', 'this_week', 'next_week', 'unspecified', 'unavailable');
CREATE TYPE public.master_account_type  AS ENUM ('solo', 'brigade', 'company');
CREATE TYPE public.tax_status           AS ENUM ('individual', 'self_employed', 'individual_entrepreneur', 'legal_entity');
CREATE TYPE public.home_clients_policy  AS ENUM ('anytime', 'with_male_present', 'women_only');
CREATE TYPE public.order_status         AS ENUM ('draft', 'open', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed', 'cancelled', 'expired');
CREATE TYPE public.order_urgency        AS ENUM ('urgent', 'this_week', 'this_month', 'flexible', 'by_date');
CREATE TYPE public.order_executor_type  AS ENUM ('any', 'solo', 'brigade', 'company');
CREATE TYPE public.order_contact_mode   AS ENUM ('chat_only', 'phone_open', 'phone_masked');
CREATE TYPE public.order_created_via    AS ENUM ('wizard', 'ad_hoc_completion');
CREATE TYPE public.order_price_kind     AS ENUM ('fixed', 'from', 'up_to', 'negotiable');
CREATE TYPE public.response_status      AS ENUM ('sent', 'viewed', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE public.review_direction     AS ENUM ('client_to_master', 'master_to_client');
CREATE TYPE public.review_status        AS ENUM ('visible', 'hidden', 'pending');
CREATE TYPE public.report_target_type   AS ENUM ('user', 'order', 'review', 'message');
CREATE TYPE public.report_status        AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');
CREATE TYPE public.report_reason        AS ENUM ('spam', 'fraud', 'inappropriate', 'fake_profile', 'fake_review', 'off_platform', 'safety', 'other');

CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables — column names and order copied from the live dump
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id                     uuid PRIMARY KEY,
  first_name             text,
  last_name              text,
  avatar_url             text,
  city_id                text,
  district               text,
  is_client              boolean NOT NULL DEFAULT true,
  is_master              boolean NOT NULL DEFAULT false,
  rating_as_client_avg   numeric(2,1),
  rating_as_client_count integer NOT NULL DEFAULT 0,
  status                 public.user_status NOT NULL DEFAULT 'active',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  onboarding_completed_at timestamptz,
  active_role            public.user_active_role NOT NULL DEFAULT 'client',
  last_seen_feed_at      timestamptz,
  is_admin               boolean NOT NULL DEFAULT false,
  is_demo                boolean NOT NULL DEFAULT false,
  contact_phone          text,
  last_active_at         timestamptz,
  username               text,
  CONSTRAINT users_active_role_requires_master_flag CHECK (active_role = 'client' OR is_master = true),
  CONSTRAINT users_demo_is_never_admin CHECK (NOT (is_demo AND is_admin)),
  CONSTRAINT users_username_format_chk CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,30}$')
);

CREATE TABLE public.master_profiles (
  user_id                uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  bio                    text,
  status                 public.master_status NOT NULL DEFAULT 'draft',
  verification_level     integer NOT NULL DEFAULT 1,
  closed_deals           integer NOT NULL DEFAULT 0,
  rating_overall_avg     numeric(2,1),
  rating_overall_count   integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  experience_years       integer,
  has_tools              boolean NOT NULL DEFAULT false,
  has_transport          boolean NOT NULL DEFAULT false,
  work_schedule          jsonb NOT NULL DEFAULT '{}'::jsonb,
  languages              text[] NOT NULL DEFAULT ARRAY['ru'::text],
  tax_status             public.tax_status,
  inn                    text,
  team_size              integer NOT NULL DEFAULT 1,
  home_clients_policy    public.home_clients_policy,
  account_type           public.master_account_type NOT NULL DEFAULT 'solo',
  legal_name             text,
  ogrn                   text,
  availability_status    public.availability_status NOT NULL DEFAULT 'unspecified',
  availability_until     timestamptz,
  is_hidden_from_search  boolean NOT NULL DEFAULT false,
  whatsapp_phone         text,
  whatsapp_same_as_phone boolean NOT NULL DEFAULT false,
  ranking_score          numeric NOT NULL DEFAULT 0,
  CONSTRAINT master_profiles_whatsapp_xor CHECK (NOT (whatsapp_same_as_phone = true AND whatsapp_phone IS NOT NULL))
);

CREATE TABLE public.orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  l2_id                       text NOT NULL,
  l3_ids                      text[] NOT NULL DEFAULT ARRAY[]::text[],
  title                       text NOT NULL,
  description                 text,
  city_id                     text,
  district                    text,
  urgency                     public.order_urgency NOT NULL DEFAULT 'flexible',
  executor_type               public.order_executor_type NOT NULL DEFAULT 'any',
  contact_mode                public.order_contact_mode NOT NULL DEFAULT 'chat_only',
  status                      public.order_status NOT NULL DEFAULT 'open',
  picked_master_id            uuid REFERENCES public.users(id),
  responses_count             integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  completed_at                timestamptz,
  created_via                 public.order_created_via NOT NULL DEFAULT 'wizard',
  budget_kind                 public.order_price_kind NOT NULL DEFAULT 'negotiable',
  budget_value                integer,
  picked_at                   timestamptz,
  master_marked_done_at       timestamptz,
  awaiting_confirmation_until timestamptz,
  completion_kind             text,
  last_activity_at            timestamptz,
  cancelled_by                uuid,
  cancel_reason               text,
  dispute_opened_by           uuid,
  dispute_reason              text,
  disputed_at                 timestamptz,
  resolved_at                 timestamptz,
  resolved_by                 uuid,
  resolution_kind             text,
  photo_urls                  text[] NOT NULL DEFAULT '{}'::text[],
  contact_name                text,
  preferred_date              date,
  CONSTRAINT orders_budget_kind_value_check CHECK (
    (budget_kind = 'negotiable' AND budget_value IS NULL)
    OR (budget_kind <> 'negotiable' AND budget_value IS NOT NULL AND budget_value >= 0)),
  CONSTRAINT orders_picked_only_after_accept CHECK (
    picked_master_id IS NULL
    OR status = ANY (ARRAY['in_progress', 'awaiting_confirmation', 'completed', 'disputed', 'cancelled']::public.order_status[])),
  CONSTRAINT orders_title_check CHECK (length(title) >= 5 AND length(title) <= 120)
);

CREATE TABLE public.order_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  master_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  l2_id       text NOT NULL,
  lead_time   text,
  message     text NOT NULL,
  status      public.response_status NOT NULL DEFAULT 'sent',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  price_kind  public.order_price_kind NOT NULL DEFAULT 'negotiable',
  price_value integer,
  CONSTRAINT order_responses_message_check CHECK (length(message) >= 10 AND length(message) <= 1000),
  CONSTRAINT order_responses_price_kind_value_check CHECK (
    (price_kind = 'negotiable' AND price_value IS NULL)
    OR (price_kind <> 'negotiable' AND price_value IS NOT NULL AND price_value >= 0))
);

CREATE TABLE public.reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid,
  author_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  direction  public.review_direction NOT NULL,
  rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       text,
  status     public.review_status NOT NULL DEFAULT 'visible',
  l2_id      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type public.report_target_type NOT NULL,
  target_id   uuid NOT NULL,
  reason      public.report_reason NOT NULL,
  description text,
  status      public.report_status NOT NULL DEFAULT 'pending',
  admin_note  text,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at            BEFORE UPDATE ON public.users            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER master_profiles_set_updated_at  BEFORE UPDATE ON public.master_profiles  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_set_updated_at           BEFORE UPDATE ON public.orders           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_responses_set_updated_at  BEFORE UPDATE ON public.order_responses  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- SECURITY INVOKER writers — the reason the 0135 allowlist is what it is
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.update_order_responses_count() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.orders SET responses_count = responses_count + 1 WHERE id = NEW.order_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.orders SET responses_count = GREATEST(0, responses_count - 1) WHERE id = OLD.order_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER order_responses_update_count
  AFTER INSERT OR DELETE ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_order_responses_count();

CREATE FUNCTION public.recalc_master_rating() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_target uuid; v_direction public.review_direction;
  v_avg numeric(2,1); v_count int;
BEGIN
  v_target := COALESCE(NEW.target_id, OLD.target_id);
  v_direction := COALESCE(NEW.direction, OLD.direction);
  IF v_target IS NULL OR v_direction IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT ROUND(AVG(rating)::numeric, 1)::numeric(2,1), COUNT(*)
    INTO v_avg, v_count
    FROM public.reviews
   WHERE target_id = v_target AND direction = v_direction AND status = 'visible';
  IF v_direction = 'client_to_master' THEN
    UPDATE public.master_profiles
       SET rating_overall_avg = v_avg, rating_overall_count = COALESCE(v_count, 0)
     WHERE user_id = v_target;
  ELSIF v_direction = 'master_to_client' THEN
    UPDATE public.users
       SET rating_as_client_avg = v_avg, rating_as_client_count = COALESCE(v_count, 0)
     WHERE id = v_target;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER reviews_recalc_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_master_rating();

CREATE FUNCTION public.mark_feed_seen() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.users SET last_seen_feed_at = now() WHERE id = (SELECT auth.uid());
END;
$$;

CREATE FUNCTION public.mark_order_responses_viewed(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND client_id = (SELECT auth.uid())) THEN
    RETURN;
  END IF;
  UPDATE public.order_responses SET status = 'viewed' WHERE order_id = p_order_id AND status = 'sent';
END;
$$;

CREATE FUNCTION public.accept_response(p_response_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order_id uuid; v_master_id uuid; v_order_client uuid; v_order_status public.order_status;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING errcode = '28000'; END IF;
  SELECT order_id, master_id INTO v_order_id, v_master_id FROM public.order_responses WHERE id = p_response_id;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'response_not_found' USING errcode = 'P0002'; END IF;
  SELECT client_id, status INTO v_order_client, v_order_status FROM public.orders WHERE id = v_order_id;
  IF v_order_client != v_user_id THEN RAISE EXCEPTION 'not_order_owner' USING errcode = '42501'; END IF;
  IF v_order_status != 'open' THEN RAISE EXCEPTION 'order_not_open' USING errcode = 'P0001'; END IF;
  UPDATE public.order_responses SET status = 'accepted' WHERE id = p_response_id;
  UPDATE public.order_responses SET status = 'rejected'
   WHERE order_id = v_order_id AND id != p_response_id AND status IN ('sent', 'viewed');
  UPDATE public.orders SET status = 'in_progress', picked_master_id = v_master_id WHERE id = v_order_id;
END;
$$;

CREATE FUNCTION public.complete_master_onboarding(
  p_first_name text, p_last_name text, p_city_id text, p_district text,
  p_bio text, p_experience_years integer, p_has_tools boolean, p_has_transport boolean)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING errcode = '28000'; END IF;
  UPDATE public.users
     SET first_name = p_first_name, last_name = p_last_name,
         city_id = CASE WHEN NULLIF(p_city_id, '') IS NULL THEN city_id ELSE p_city_id END,
         district = NULLIF(p_district, ''), is_master = true,
         active_role = 'master', onboarding_completed_at = now()
   WHERE id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002'; END IF;
  INSERT INTO public.master_profiles (user_id, bio, experience_years, has_tools, has_transport, status)
  VALUES (v_user_id, NULLIF(p_bio, ''), p_experience_years, p_has_tools, p_has_transport, 'pending')
  ON CONFLICT (user_id) DO UPDATE
    SET bio = EXCLUDED.bio, experience_years = EXCLUDED.experience_years,
        has_tools = EXCLUDED.has_tools, has_transport = EXCLUDED.has_transport;
END;
$$;

CREATE FUNCTION public.finalize_master_onboarding() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING errcode = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'master_profile_missing' USING errcode = 'P0002';
  END IF;
  UPDATE public.users
     SET is_master = true, active_role = 'master',
         onboarding_completed_at = COALESCE(onboarding_completed_at, now())
   WHERE id = v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER paths — must keep working with no API grant at all
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.touch_last_active() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.users SET last_active_at = now() WHERE id = auth.uid();
END;
$$;

CREATE FUNCTION public.set_username(p_username text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.users SET username = lower(p_username) WHERE id = auth.uid();
END;
$$;

CREATE FUNCTION public.recompute_master_ranking_scores() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.master_profiles SET ranking_score = 42 WHERE status = 'active';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE FUNCTION public.is_current_user_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true);
$$;

-- EXECUTE-гранты скопированы с живых proacl (read-only, 2026-08-31). Это не
-- косметика: если выдать функциям больше или меньше прав, чем в production,
-- проверки «клиент продолжает работать» доказывают чужой контракт.
--   accept_response, complete_master_onboarding, finalize_master_onboarding,
--   touch_last_active, set_username, is_current_user_admin
--       -> postgres, authenticated, service_role
--   mark_feed_seen, mark_order_responses_viewed
--       -> дополнительно PUBLIC и anon (живое состояние)
--   recalc_master_rating, update_order_responses_count,
--   recompute_master_ranking_scores
--       -> только postgres и service_role
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recompute_master_ranking_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_master_ranking_scores() TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_order_responses_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_responses_count() TO service_role;

REVOKE EXECUTE ON FUNCTION public.recalc_master_rating() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_master_rating() TO service_role;

REVOKE EXECUTE ON FUNCTION public.accept_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_response(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.complete_master_onboarding(text, text, text, text, text, integer, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_master_onboarding(text, text, text, text, text, integer, boolean, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_master_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_master_onboarding() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.touch_last_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_username(text) TO authenticated, service_role;

-- mark_feed_seen и mark_order_responses_viewed в production доступны PUBLIC:
-- гранты намеренно не трогаются.

-- ---------------------------------------------------------------------------
-- RLS and the live policy set (expressions copied from pg_policies)
-- ---------------------------------------------------------------------------

ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports         ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_all  ON public.users FOR SELECT USING (true);
CREATE POLICY users_insert_own  ON public.users FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY users_update_own  ON public.users FOR UPDATE USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY users_admin_update ON public.users FOR UPDATE USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

CREATE POLICY master_profiles_read_all   ON public.master_profiles FOR SELECT USING (true);
CREATE POLICY master_profiles_insert_own ON public.master_profiles FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY master_profiles_update_own ON public.master_profiles FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY orders_read_open_or_own ON public.orders FOR SELECT
  USING (status = 'open' OR (SELECT auth.uid()) = client_id OR (SELECT auth.uid()) = picked_master_id);
CREATE POLICY orders_insert_own ON public.orders FOR INSERT WITH CHECK ((SELECT auth.uid()) = client_id);
CREATE POLICY orders_owner_edit_open ON public.orders FOR UPDATE
  USING ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['open','draft','cancelled','expired']::public.order_status[]))
  WITH CHECK ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['open','draft','in_progress','cancelled','expired']::public.order_status[]));
CREATE POLICY orders_owner_change_status_in_progress ON public.orders FOR UPDATE
  USING ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['open','in_progress','awaiting_confirmation']::public.order_status[]))
  WITH CHECK ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['open','cancelled','completed','disputed','awaiting_confirmation','in_progress']::public.order_status[]));
CREATE POLICY orders_picked_master_lifecycle ON public.orders FOR UPDATE
  USING ((SELECT auth.uid()) = picked_master_id AND status = ANY (ARRAY['in_progress','awaiting_confirmation']::public.order_status[]))
  WITH CHECK ((SELECT auth.uid()) = picked_master_id AND status = ANY (ARRAY['in_progress','awaiting_confirmation','disputed','cancelled']::public.order_status[]));
CREATE POLICY orders_owner_delete_open ON public.orders FOR DELETE
  USING ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['open','draft']::public.order_status[]));
CREATE POLICY orders_owner_delete_history ON public.orders FOR DELETE
  USING ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['cancelled','expired']::public.order_status[]));

CREATE POLICY order_responses_read_participants ON public.order_responses FOR SELECT
  USING ((SELECT auth.uid()) = master_id
         OR (SELECT auth.uid()) IN (SELECT o.client_id FROM public.orders o WHERE o.id = order_responses.order_id));
CREATE POLICY order_responses_insert_own ON public.order_responses FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);
CREATE POLICY order_responses_update_own_master ON public.order_responses FOR UPDATE
  USING ((SELECT auth.uid()) = master_id) WITH CHECK ((SELECT auth.uid()) = master_id);
CREATE POLICY order_responses_update_own_or_client ON public.order_responses FOR UPDATE
  USING ((SELECT auth.uid()) = master_id
         OR (SELECT auth.uid()) IN (SELECT o.client_id FROM public.orders o WHERE o.id = order_responses.order_id));

CREATE POLICY reviews_read_visible ON public.reviews FOR SELECT USING (status = 'visible' OR (SELECT auth.uid()) = author_id);
CREATE POLICY reviews_insert_own   ON public.reviews FOR INSERT WITH CHECK ((SELECT auth.uid()) = author_id);
CREATE POLICY reports_insert_own   ON public.reports FOR INSERT WITH CHECK ((SELECT auth.uid()) = reporter_id);
CREATE POLICY reports_admin_select ON public.reports FOR SELECT USING (public.is_current_user_admin());

-- ---------------------------------------------------------------------------
-- The live Supabase default grants. THIS BLOCK IS THE POINT OF THE FIXTURE.
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT ALL ON public.users, public.master_profiles, public.orders,
             public.order_responses, public.reviews, public.reports
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The APPLIED migration 0130 (supabase/migrations/0130_guard_user_privilege_columns.sql)
-- ---------------------------------------------------------------------------

\if :{?p0130}
\endif

SELECT :'p0130' = 'skip'    AS p0130_skip \gset
SELECT :'p0130' = 'foreign' AS p0130_foreign \gset

\if :p0130_skip
  \echo 'FIXTURE: modelling the world BEFORE migration 0130 (no is_admin lock).'
\elif :p0130_foreign
  \echo 'FIXTURE: an UNRELATED object squatting on the 0130 name.'
  CREATE FUNCTION public.guard_user_privilege_columns() RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
\else
  \echo 'FIXTURE: migration 0130 is APPLIED (production state on 2026-08-31).'
  CREATE FUNCTION public.guard_user_privilege_columns() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $fn$
  BEGIN
    IF current_user = 'postgres' THEN RETURN NEW; END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'Изменение прав администратора запрещено'
        USING ERRCODE = '42501', DETAIL = 'users.is_admin is managed by the database owner only';
    END IF;
    IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
      RAISE EXCEPTION 'Изменение признака тестового аккаунта запрещено'
        USING ERRCODE = '42501', DETAIL = 'users.is_demo is managed by the database owner only';
    END IF;
    RETURN NEW;
  END
  $fn$;
  REVOKE ALL ON FUNCTION public.guard_user_privilege_columns() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER users_guard_privilege_columns
    BEFORE UPDATE ON public.users FOR EACH ROW
    EXECUTE FUNCTION public.guard_user_privilege_columns();
\endif

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

INSERT INTO public.users (id, first_name, is_client, is_master, active_role, status, is_admin, is_demo, onboarding_completed_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Клиент',        true,  false, 'client', 'active', false, false, now()),
  ('a0000000-0000-4000-8000-000000000002', 'Мастер',        true,  true,  'master', 'active', false, false, now()),
  ('a0000000-0000-4000-8000-000000000003', 'ДругойМастер',  true,  true,  'master', 'active', false, false, now()),
  ('a0000000-0000-4000-8000-000000000004', 'НовыйМастер',   true,  false, 'client', 'active', false, false, NULL),
  ('a0000000-0000-4000-8000-000000000009', 'Администратор', true,  false, 'client', 'active', true,  false, now()),
  ('a0000000-0000-4000-8000-00000000000a', 'Жертва',        true,  false, 'client', 'active', false, false, now()),
  -- Заблокированный администратор: права остались, а аккаунт закрыт. Нужен,
  -- чтобы проверить, что is_admin_session() смотрит не только на is_admin.
  ('a0000000-0000-4000-8000-00000000000c', 'БывшийАдмин',   true,  false, 'client', 'banned', true,  false, now());

INSERT INTO public.master_profiles (user_id, bio, status, experience_years, ranking_score, rating_overall_avg, rating_overall_count, verification_level, closed_deals) VALUES
  ('a0000000-0000-4000-8000-000000000002', 'био', 'active', 5, 12.5, 4.5, 3, 2, 7),
  ('a0000000-0000-4000-8000-000000000003', 'био', 'active', 3,  9.0, 4.0, 2, 1, 2);

INSERT INTO public.orders (id, client_id, l2_id, title, description, status) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'l2-plumbing', 'Починить кран на кухне', 'описание', 'open'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'l2-plumbing', 'Второй заказ клиента', 'описание', 'open');

INSERT INTO public.order_responses (id, order_id, master_id, l2_id, message) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'l2-plumbing', 'Готов сделать сегодня'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'l2-plumbing', 'Тоже готов помочь');

INSERT INTO public.reports (id, reporter_id, target_type, target_id, reason, description) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'user',
   'a0000000-0000-4000-8000-00000000000a', 'spam', 'жалоба для журнала');

-- Sessions: the admin holds BOTH an aal1 and an aal2 session, so the drafts can
-- be tested for "password alone is not enough" without inventing a second admin.
INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'totp', 'totp', 'verified');

INSERT INTO auth.sessions (id, user_id, aal, not_after) VALUES
  ('50000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'aal2', NULL),
  ('50000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', 'aal1', NULL),
  ('50000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'aal2', NULL),
  ('50000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'aal1', NULL),
  ('50000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000c', 'aal2', NULL);

\echo 'FIXTURE: current-state schema ready (grants INCLUDED — see the header).'
