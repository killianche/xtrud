-- Minimal pre-0120 schema used only to execute the universal forward drafts in
-- an isolated local PostgreSQL cluster. It is not a production schema backup.

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
END
$roles$;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TYPE public.category_urgency AS ENUM ('urgent', 'week', 'month');
CREATE TYPE public.category_seasonality AS ENUM (
  'year_round',
  'summer',
  'winter',
  'wedding_season'
);
CREATE TYPE public.order_status AS ENUM ('draft', 'open', 'cancelled', 'expired');
CREATE TYPE public.report_target_type AS ENUM ('user', 'order', 'review', 'message');

CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  contact_phone text,
  is_master boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.users_private (
  user_id uuid PRIMARY KEY REFERENCES public.users(id),
  phone text
);

CREATE TABLE public.categories_l1 (
  id text PRIMARY KEY,
  name_ru text NOT NULL,
  icon text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.categories_l2 (
  id text PRIMARY KEY,
  l1_id text NOT NULL REFERENCES public.categories_l1(id),
  name_ru text NOT NULL,
  icon text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.categories_l3 (
  id text PRIMARY KEY,
  l2_id text NOT NULL REFERENCES public.categories_l2(id),
  name_ru text NOT NULL,
  icon text,
  avg_check_rub integer,
  urgency_typical public.category_urgency NOT NULL DEFAULT 'week',
  seasonality public.category_seasonality NOT NULL DEFAULT 'year_round',
  requires_license boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order) VALUES
  ('construction', 'Строительство и ремонт', 'Hammer', 1),
  ('home-services', 'Дом и быт', 'Home', 2);

INSERT INTO public.categories_l2
  (id, l1_id, name_ru, icon, sort_order, is_visible, is_active)
VALUES
  ('plumbing', 'construction', 'Сантехника', 'Droplet', 1, true, true),
  ('cleaning', 'home-services', 'Клининг', 'Sparkles', 1, true, true);

INSERT INTO public.categories_l3
  (id, l2_id, name_ru, icon, sort_order)
VALUES
  ('faucet-replace', 'plumbing', 'Замена смесителя', 'Droplet', 1),
  ('plumbing-fixture-02', 'plumbing', 'Тестовая услуга 02', 'Droplet', 2),
  ('plumbing-fixture-03', 'plumbing', 'Тестовая услуга 03', 'Droplet', 3),
  ('plumbing-fixture-04', 'plumbing', 'Тестовая услуга 04', 'Droplet', 4),
  ('plumbing-fixture-05', 'plumbing', 'Тестовая услуга 05', 'Droplet', 5),
  ('plumbing-fixture-06', 'plumbing', 'Тестовая услуга 06', 'Droplet', 6),
  ('plumbing-fixture-07', 'plumbing', 'Тестовая услуга 07', 'Droplet', 7),
  ('plumbing-fixture-08', 'plumbing', 'Тестовая услуга 08', 'Droplet', 8),
  ('plumbing-fixture-09', 'plumbing', 'Тестовая услуга 09', 'Droplet', 9),
  ('plumbing-fixture-10', 'plumbing', 'Тестовая услуга 10', 'Droplet', 10),
  ('plumbing-fixture-11', 'plumbing', 'Тестовая услуга 11', 'Droplet', 11),
  ('home-cleaning', 'cleaning', 'Уборка дома', 'Sparkles', 1);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.users(id),
  l2_id text NOT NULL REFERENCES public.categories_l2(id),
  l3_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  status public.order_status NOT NULL DEFAULT 'open',
  city_id text,
  district text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  master_id uuid NOT NULL REFERENCES public.users(id),
  l2_id text NOT NULL REFERENCES public.categories_l2(id)
);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.users(id),
  target_type public.report_target_type NOT NULL,
  target_id uuid NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_read_fixture ON public.orders FOR SELECT USING (true);
CREATE POLICY orders_update_fixture ON public.orders
  FOR UPDATE USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
CREATE POLICY responses_read_fixture ON public.order_responses FOR SELECT USING (true);
CREATE POLICY responses_insert_fixture ON public.order_responses FOR INSERT WITH CHECK (true);
CREATE POLICY responses_update_fixture ON public.order_responses FOR UPDATE USING (true);

-- Fixture state models the required post-compatibility phase before draft 0122:
-- contact_phone is the public master work number; users_private.phone remains a
-- private auth identifier and is never a fallback. Broad anonymous catalogue
-- access has already been removed by the preceding, separately released phase.
CREATE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pu.contact_phone
  FROM public.users pu
  WHERE pu.id = p_master_id
    AND auth.uid() IS NOT NULL
    AND pu.is_master = true
    AND pu.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.order_responses response
      JOIN public.orders order_row ON order_row.id = response.order_id
      WHERE response.master_id = p_master_id
        AND order_row.client_id = auth.uid()
    );
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.orders TO anon;
-- A post-compatibility phase exposes public contact_phone only through the
-- eligibility RPC, not by broad table/column SELECT. Other public profile
-- columns stay readable for the synthetic role matrix.
REVOKE SELECT ON public.users FROM authenticated;
GRANT SELECT (id, is_master, status) ON public.users TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_master_phone(uuid) TO authenticated;
