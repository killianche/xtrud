-- Закрытие анонимного чтения персональных данных.
--
-- Проверено на живом production 2026-08-31: политика users_select_all
-- разрешает SELECT всем (USING true), а роль anon имеет табличный SELECT,
-- то есть каждая колонка. Публичный ключ лежит в опубликованном бандле
-- приложения, поэтому «аноним» — это любой человек с интернетом.
--
-- Масштаб измерен на восстановленной копии, а не предположен: среди
-- НЕ-demo пользователей contact_phone заполнен у 7 клиентов и у 0 мастеров.
-- То есть это не «публичный рабочий номер бизнеса», как предполагает
-- комментарий в src/features/master-profile/use-update-master-profile.ts,
-- а личные номера обычных людей.
--
-- ЛОВУШКА, из-за которой очевидное решение было бы пустым: REVOKE SELECT
-- (contact_phone) не делает ничего, пока роли выдан ТАБЛИЧНЫЙ SELECT, и
-- молчит при этом. Поэтому снимается табличная привилегия и выдаётся явный
-- список колонок.
--
-- Список намеренно широкий: убраны только те колонки, которых анонимный
-- клиент не касается. Узкий список сломал бы уже отправленную в TestFlight
-- сборку 14 — анонимные экраны (карточка мастера, карточка клиента, заказ,
-- поиск) читают users и через вложенные выборки PostgREST, где привилегия
-- нужна на каждую колонку.
--
-- authenticated НЕ трогается: use-user-record делает select("*"), а `*`
-- требует привилегии на все колонки. Сужение для авторизованных требует
-- сначала изменить клиент и выпустить новую сборку.

BEGIN;

CREATE TABLE IF NOT EXISTS public.anon_read_baseline_0143 (
  table_name text NOT NULL,
  acl        text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name)
);
REVOKE ALL ON TABLE public.anon_read_baseline_0143 FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.anon_read_baseline_0143 (table_name, acl)
SELECT c.relname, coalesce(c.relacl::text, '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('users','master_profiles')
ON CONFLICT (table_name) DO NOTHING;

DO $$
DECLARE
  v_users_deny     text[] := ARRAY['contact_phone','is_admin'];
  v_masters_deny   text[] := ARRAY['inn','legal_name','ogrn'];
  v_cols           text;
  v_leaked         text;
BEGIN
  -- users
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='users'
     AND NOT (column_name = ANY (v_users_deny));
  EXECUTE 'REVOKE SELECT ON TABLE public.users FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.users TO anon', v_cols);

  -- master_profiles
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='master_profiles'
     AND NOT (column_name = ANY (v_masters_deny));
  EXECUTE 'REVOKE SELECT ON TABLE public.master_profiles FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.master_profiles TO anon', v_cols);

  -- Самопроверка: запрещённые колонки обязаны стать недоступными,
  -- а разрешённые — остаться доступными. Без этого миграция может
  -- «пройти» и ничего не сделать.
  SELECT string_agg(x, ', ') INTO v_leaked FROM (
    SELECT 'users.'||c AS x FROM unnest(v_users_deny) c
     WHERE has_column_privilege('anon','public.users',c,'SELECT')
    UNION ALL
    SELECT 'master_profiles.'||c FROM unnest(v_masters_deny) c
     WHERE has_column_privilege('anon','public.master_profiles',c,'SELECT')
  ) s;
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'anon_read_scope_still_readable'
      USING DETAIL = 'Anon still reads: ' || v_leaked;
  END IF;

  IF NOT has_column_privilege('anon','public.users','first_name','SELECT')
     OR NOT has_column_privilege('anon','public.users','avatar_url','SELECT')
     OR NOT has_column_privilege('anon','public.users','rating_as_client_avg','SELECT')
     OR NOT has_column_privilege('anon','public.users','is_demo','SELECT')
     OR NOT has_column_privilege('anon','public.master_profiles','bio','SELECT')
     OR NOT has_column_privilege('anon','public.master_profiles','whatsapp_phone','SELECT')
  THEN
    RAISE EXCEPTION 'anon_read_scope_broke_public_screens'
      USING DETAIL = 'A column required by anonymous screens lost its privilege.';
  END IF;

  RAISE NOTICE 'anon_read_scope: анонимное чтение телефонов и реквизитов закрыто, публичные экраны сохранены.';
END
$$;

COMMIT;
