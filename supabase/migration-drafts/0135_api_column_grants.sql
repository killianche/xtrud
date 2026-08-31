-- ЧЕРНОВИК. Шаг 1 «закалка базы» из docs/ADMIN_PANEL.md §9.1, часть 1 из 4:
-- колоночные гранты для API-ролей anon и authenticated.
--
-- НЕ ПРИМЕНЯТЬ ПО ИМЕНИ ФАЙЛА. Условия продвижения — supabase/migration-drafts/README.md.
--
-- ===========================================================================
-- ЧТО ИМЕННО СЛОМАНО (FACT, read-only production, 2026-08-31)
-- ===========================================================================
--
-- RLS в PostgreSQL ограничивает СТРОКИ, но не КОЛОНКИ. Колонки ограничиваются
-- только грантами. В production действуют дефолтные гранты Supabase:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='master_profiles';
--   -> anon и authenticated: DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--      TRUNCATE, UPDATE
--
-- То есть UPDATE выдан на ВСЕ колонки: 21 у users, 27 у master_profiles,
-- 37 у orders, 11 у order_responses. Политика master_profiles_update_own
-- (supabase/migrations/0001_init.sql:311) разрешает мастеру писать свою
-- строку целиком, включая ranking_score — балл, по которому сортируется
-- каталог. Мастер поднимает себя в выдаче одним PATCH-запросом.
--
-- ===========================================================================
-- ЛОВУШКА, ИЗ-ЗА КОТОРОЙ ОЧЕВИДНОЕ РЕШЕНИЕ НЕ РАБОТАЕТ
-- ===========================================================================
--
-- Наивное «REVOKE UPDATE (ranking_score) ON public.master_profiles FROM
-- authenticated» НЕ ДЕЛАЕТ НИЧЕГО. Команда завершается успешно, WARNING не
-- выдаётся, привилегия остаётся. Проверено на локальном восстановлении живой
-- схемы (PostgreSQL 17), пример вывода:
--
--   REVOKE UPDATE (ranking_score) ON public.master_profiles FROM authenticated;
--   -- REVOKE
--   SELECT has_column_privilege('authenticated','public.master_profiles',
--                               'ranking_score','UPDATE');
--   -- t   <-- привилегия НА МЕСТЕ
--
-- Это документированное поведение PostgreSQL: «if a role has been granted
-- privileges on a table, then revoking the same privileges from individual
-- columns will have no effect». Табличный грант перекрывает колоночный.
--
-- Поэтому единственный работающий порядок — снять привилегию на уровне
-- ТАБЛИЦЫ и выдать обратно явный список колонок. Это делает модель
-- fail-closed: новая колонка по умолчанию не пишется никем, пока её не
-- внесут в список осознанно.
--
-- ===========================================================================
-- ПОЧЕМУ СПИСОК РАЗРЕШЁННЫХ КОЛОНОК ШИРЕ, ЧЕМ ХОЧЕТСЯ
-- ===========================================================================
--
-- Часть привилегированных колонок пишется не клиентом напрямую, а функциями
-- и триггерами, объявленными SECURITY INVOKER. Они исполняются с правами
-- ВЫЗЫВАЮЩЕГО, то есть роли authenticated, и без гранта падают с
-- «permission denied» прямо в опубликованном iOS-приложении. Полный список
-- получен запросом к живой базе, а не догадкой:
--
--   SELECT proname FROM pg_proc
--    WHERE pronamespace='public'::regnamespace AND NOT prosecdef
--      AND prosrc ~* '(update|insert into)\s+(public\.)?(users|master_profiles|orders|order_responses)';
--
--   mark_feed_seen()               -> users.last_seen_feed_at
--   complete_master_onboarding()   -> users.*, INSERT master_profiles(status)
--   finalize_master_onboarding()   -> users.is_master/active_role/onboarding_completed_at
--   accept_response()              -> order_responses.status, orders.status, orders.picked_master_id
--   mark_order_responses_viewed()  -> order_responses.status
--   update_order_responses_count() -> orders.responses_count   (триггер)
--   recalc_master_rating()         -> master_profiles.rating_overall_*, users.rating_as_client_*  (триггер)
--
-- Каждая колонка, оставленная в списке разрешённых по этой причине, помечена
-- ниже именем функции, которая её удерживает. Это долг, а не решение:
-- следующая задача — перевести эти функции в SECURITY DEFINER и сузить
-- список ещё раз. Здесь так поступлено только с recalc_master_rating(),
-- потому что это чистый пересчёт агрегата без пользовательского ввода, и без
-- него мастер может выставить себе rating_overall_avg = 5.0 напрямую.
-- accept_response() и update_order_responses_count() СОЗНАТЕЛЬНО не
-- трогаются: у первой смена режима меняет контракт выбора исполнителя
-- (черновик 0133_order_picked_master.sql), у второй — начнёт менять данные,
-- которые сейчас молча не обновляются из-за RLS.
--
-- ===========================================================================
-- ЧТО ЭТА МИГРАЦИЯ НЕ ДЕЛАЕТ
-- ===========================================================================
--
--  * не трогает service_role: он не попадает в браузер и в клиент
--    (docs/ADMIN_PANEL.md §6), а Edge Functions работают под ним с
--    users_private и notification_tokens;
--  * не трогает SELECT: сужение чтения — отдельная задача (users_select_all
--    сегодня отдаёт всю таблицу даже anon, это записано отдельно);
--  * не трогает users.status. Его пишет действующая админка в приложении
--    (src/features/admin/use-admin.ts:80). Порядок из docs/ADMIN_PANEL.md §10
--    обязателен: сначала работает веб-панель, потом урезается мобильная.
--    Замок на status — черновик 0126_suspension_enforcement.sql;
--  * не создаёт и не меняет ни одной политики RLS.
--
-- Откат: 0136_revert_api_column_grants.sql, восстанавливает ACL из снимка,
-- который делает эта миграция.

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1. Preflight — fail-closed
-- ===========================================================================

DO $preflight$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'api_column_grants_requires_database_owner'
      USING DETAIL = format('current_user = %L; гранты меняет только владелец базы', current_user);
  END IF;

  FOREACH v_missing IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_missing) THEN
      RAISE EXCEPTION 'api_column_grants_missing_api_role'
        USING DETAIL = format('роль %L не существует; это не тот backend, под который писался черновик', v_missing);
    END IF;
  END LOOP;

  FOREACH v_missing IN ARRAY ARRAY['users', 'master_profiles', 'orders', 'order_responses'] LOOP
    IF to_regclass('public.' || v_missing) IS NULL THEN
      RAISE EXCEPTION 'api_column_grants_missing_table'
        USING DETAIL = format('public.%I отсутствует', v_missing);
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_missing)::regclass) THEN
      RAISE EXCEPTION 'api_column_grants_rls_disabled'
        USING DETAIL = format('RLS выключен на public.%I: сужение грантов без RLS даст ложное чувство защиты', v_missing);
    END IF;
  END LOOP;

  -- Проверка самой ловушки на живой базе: убеждаемся, что REVOKE на уровне
  -- колонки действительно бессилен, прежде чем полагаться на табличный REVOKE.
  IF NOT has_table_privilege('authenticated', 'public.master_profiles', 'UPDATE') THEN
    RAISE NOTICE 'api_column_grants: табличный UPDATE у authenticated уже снят — миграция идемпотентна.';
  END IF;
END
$preflight$;

-- ===========================================================================
-- 2. Снимок ACL до изменения — на нём стоит откат 0136
-- ===========================================================================

DROP TABLE IF EXISTS public.api_grants_baseline_0135;

CREATE TABLE public.api_grants_baseline_0135 (
  captured_at timestamptz NOT NULL DEFAULT now(),
  table_name  text NOT NULL,
  column_name text,              -- NULL = ACL таблицы
  acl         aclitem[],
  meta        jsonb              -- прочее состояние «до», которое нужно откату
);

CREATE UNIQUE INDEX api_grants_baseline_0135_key
  ON public.api_grants_baseline_0135 (table_name, coalesce(column_name, ''));

COMMENT ON TABLE public.api_grants_baseline_0135 IS
  'ACL таблиц и колонок ДО миграции 0135. Единственный источник для отката 0136. Не удалять, пока 0135 не откатана или не закреплена отдельным решением.';

REVOKE ALL ON public.api_grants_baseline_0135 FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.api_grants_baseline_0135 (table_name, column_name, acl)
SELECT c.relname, NULL, c.relacl
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('users', 'master_profiles', 'orders', 'order_responses');

INSERT INTO public.api_grants_baseline_0135 (table_name, column_name, acl)
SELECT c.relname, a.attname, a.attacl
  FROM pg_class c
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('users', 'master_profiles', 'orders', 'order_responses');

-- Режим исполнения recalc_master_rating() «до» — его восстанавливает 0136.
INSERT INTO public.api_grants_baseline_0135 (table_name, column_name, acl, meta)
SELECT 'pg_proc:recalc_master_rating', NULL, NULL,
       jsonb_build_object('prosecdef', p.prosecdef, 'owner', pg_get_userbyid(p.proowner))
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname = 'recalc_master_rating'
   AND p.pronargs = 0;

-- ===========================================================================
-- 3. recalc_master_rating() -> SECURITY DEFINER
-- ===========================================================================
--
-- Без этого шага rating_overall_avg / rating_overall_count и
-- rating_as_client_* обязаны остаться писабельными для authenticated, потому
-- что триггер на public.reviews исполняется с правами автора отзыва. А это
-- значит, что мастер может выставить себе рейтинг 5.0 напрямую: политика
-- master_profiles_update_own разрешает ему писать свою строку.
--
-- Функция не принимает пользовательского ввода: она пересчитывает агрегат из
-- public.reviews. Смена режима исполнения не меняет её результат.

DO $recalc$
DECLARE
  v_oid oid;
  v_owner name;
  v_secdef boolean;
  v_config text[];
BEGIN
  SELECT p.oid, pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_oid, v_owner, v_secdef, v_config
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'recalc_master_rating'
     AND p.pronargs = 0;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'api_column_grants_missing_recalc_master_rating'
      USING DETAIL = 'Триггер пересчёта рейтинга не найден; без него нельзя доказать, что рейтинговые колонки можно закрыть.';
  END IF;

  IF v_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'api_column_grants_recalc_owned_by_api_role'
      USING DETAIL = format('recalc_master_rating() принадлежит роли %L: SECURITY DEFINER дал бы права API-роли, а не владельца.', v_owner);
  END IF;

  IF v_config IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_config) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'api_column_grants_recalc_without_search_path'
      USING DETAIL = 'SECURITY DEFINER без закреплённого search_path небезопасен. Сначала закрепить search_path отдельной миграцией.';
  END IF;

  IF v_secdef THEN
    RAISE NOTICE 'api_column_grants: recalc_master_rating() уже SECURITY DEFINER — шаг идемпотентен.';
  ELSE
    EXECUTE 'ALTER FUNCTION public.recalc_master_rating() SECURITY DEFINER';
    RAISE NOTICE 'api_column_grants: recalc_master_rating() переведена в SECURITY DEFINER (владелец %).', v_owner;
  END IF;
END
$recalc$;


-- ===========================================================================
-- 4. Гранты
-- ===========================================================================

DO $grants$
DECLARE
  --  allow — колонка остаётся писабельной для authenticated;
  --  deny  — колонка становится непишущейся.
  --  Сумма allow+deny обязана совпасть с живым набором колонок таблицы,
  --  иначе миграция падает (пункт 4.1).
  --
  --  users
  --    last_seen_feed_at  — удерживает mark_feed_seen()          (SECURITY INVOKER)
  --    status             — удерживает админка в приложении, docs/ADMIN_PANEL.md §10
  --    is_master / active_role / onboarding_completed_at / first_name /
  --    last_name / city_id / district — complete_master_onboarding(),
  --                                     finalize_master_onboarding() и прямой PATCH
  --    avatar_url / contact_phone      — прямой PATCH клиента
  --
  --  master_profiles
  --    user_id — цель ON CONFLICT в upsert клиента (RLS всё равно требует
  --              auth.uid() = user_id, подменить владельца нельзя)
  --    status  — use-finalize-master-onboarding.ts публикует профиль
  --
  --  orders
  --    picked_master_id — удерживает accept_response()            (SECURITY INVOKER)
  --    responses_count  — удерживает update_order_responses_count() (триггер, INVOKER)
  --
  --  order_responses
  --    status — удерживают accept_response() и mark_order_responses_viewed()
  r RECORD;
  v_extra text;
  v_ghost text;
  v_col text;
  v_sql text;
  v_bad text;
BEGIN
  CREATE TEMP TABLE _api_grant_spec_0135 (
    tbl   text NOT NULL,
    priv  text NOT NULL,
    allow text[] NOT NULL,
    deny  text[] NOT NULL,
    PRIMARY KEY (tbl, priv)
  ) ON COMMIT DROP;

  INSERT INTO _api_grant_spec_0135 (tbl, priv, allow, deny) VALUES
  ('users', 'UPDATE',
   ARRAY['first_name','last_name','avatar_url','city_id','district','active_role',
         'is_master','onboarding_completed_at','contact_phone','last_seen_feed_at','status'],
   ARRAY['id','is_client','rating_as_client_avg','rating_as_client_count','created_at',
         'updated_at','is_admin','is_demo','last_active_at','username']),

  ('users', 'INSERT',
   ARRAY['id','first_name','last_name','avatar_url','city_id','district','active_role',
         'is_master','onboarding_completed_at','contact_phone'],
   ARRAY['is_client','rating_as_client_avg','rating_as_client_count','status','created_at',
         'updated_at','last_seen_feed_at','is_admin','is_demo','last_active_at','username']),

  ('master_profiles', 'UPDATE',
   ARRAY['user_id','bio','experience_years','has_tools','has_transport','whatsapp_phone',
         'whatsapp_same_as_phone','status','is_hidden_from_search'],
   ARRAY['verification_level','closed_deals','rating_overall_avg','rating_overall_count',
         'created_at','updated_at','work_schedule','languages','tax_status','inn','team_size',
         'home_clients_policy','account_type','legal_name','ogrn','availability_status',
         'availability_until','ranking_score']),

  ('master_profiles', 'INSERT',
   ARRAY['user_id','bio','experience_years','has_tools','has_transport','whatsapp_phone',
         'whatsapp_same_as_phone','status'],
   ARRAY['verification_level','closed_deals','rating_overall_avg','rating_overall_count',
         'created_at','updated_at','work_schedule','languages','tax_status','inn','team_size',
         'home_clients_policy','account_type','legal_name','ogrn','availability_status',
         'availability_until','is_hidden_from_search','ranking_score']),

  ('orders', 'UPDATE',
   ARRAY['l2_id','title','contact_name','description','city_id','district','urgency',
         'preferred_date','budget_kind','budget_value','photo_urls','status','cancel_reason',
         'cancelled_by','picked_master_id','responses_count'],
   ARRAY['id','client_id','l3_ids','executor_type','contact_mode','created_at','updated_at',
         'expires_at','completed_at','created_via','picked_at','master_marked_done_at',
         'awaiting_confirmation_until','completion_kind','last_activity_at','dispute_opened_by',
         'dispute_reason','disputed_at','resolved_at','resolved_by','resolution_kind']),

  ('orders', 'INSERT',
   ARRAY['client_id','l2_id','title','contact_name','description','city_id','district',
         'urgency','preferred_date','budget_kind','budget_value','photo_urls','status'],
   ARRAY['id','l3_ids','executor_type','contact_mode','picked_master_id','responses_count',
         'created_at','updated_at','expires_at','completed_at','created_via','picked_at',
         'master_marked_done_at','awaiting_confirmation_until','completion_kind',
         'last_activity_at','cancelled_by','cancel_reason','dispute_opened_by','dispute_reason',
         'disputed_at','resolved_at','resolved_by','resolution_kind']),

  ('order_responses', 'UPDATE',
   ARRAY['status'],
   ARRAY['id','order_id','master_id','l2_id','lead_time','message','created_at','updated_at',
         'price_kind','price_value']),

  ('order_responses', 'INSERT',
   ARRAY['order_id','master_id','l2_id','lead_time','message','price_kind','price_value'],
   ARRAY['id','status','created_at','updated_at']);

  -- 4.1 Инвентарь колонок. Если у живой таблицы есть колонка, не названная ни
  --     в allow, ни в deny — схема ушла вперёд относительно черновика, и
  --     продолжать нельзя: новая колонка либо потеряет нужный грант, либо
  --     тихо останется открытой. Это же ловит и обратный случай.
  FOR r IN SELECT * FROM _api_grant_spec_0135 ORDER BY tbl, priv LOOP
    SELECT string_agg(c.column_name, ', ' ORDER BY c.column_name) INTO v_extra
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = r.tbl
       AND c.column_name <> ALL (r.allow || r.deny);

    IF v_extra IS NOT NULL THEN
      RAISE EXCEPTION 'api_column_grants_column_inventory_drift'
        USING DETAIL = format('public.%I (%s): колонки не классифицированы черновиком: %s', r.tbl, r.priv, v_extra),
              HINT = 'Внести каждую новую колонку в allow или deny осознанно и пересверить с live read-only снимком.';
    END IF;

    SELECT string_agg(k, ', ' ORDER BY k) INTO v_ghost
      FROM unnest(r.allow || r.deny) k
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema = 'public' AND c.table_name = r.tbl
                          AND c.column_name = k);

    IF v_ghost IS NOT NULL THEN
      RAISE EXCEPTION 'api_column_grants_column_inventory_drift'
        USING DETAIL = format('public.%I (%s): черновик перечисляет несуществующие колонки: %s', r.tbl, r.priv, v_ghost),
              HINT = 'Черновик писался под другую версию схемы. Пересверить с live read-only снимком.';
    END IF;

    IF EXISTS (SELECT 1 FROM unnest(r.allow) a JOIN unnest(r.deny) d ON a = d) THEN
      RAISE EXCEPTION 'api_column_grants_column_in_both_lists'
        USING DETAIL = format('public.%I (%s)', r.tbl, r.priv);
    END IF;
  END LOOP;

  -- 4.2 anon не проходит ни одну политику записи: все они требуют auth.uid(),
  --     который у anon равен NULL. Грант на запись — чистый излишек, и он же
  --     маскирует ошибку: отказ выглядит как «0 строк», а не «нет прав».
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
    ON public.users, public.master_profiles, public.orders, public.order_responses
    FROM anon;

  -- 4.3 authenticated: сначала снять ТАБЛИЧНЫЕ привилегии — иначе колоночный
  --     REVOKE бессилен (см. шапку файла), затем выдать явные списки.
  REVOKE TRUNCATE, TRIGGER, REFERENCES
    ON public.users, public.master_profiles, public.orders, public.order_responses
    FROM authenticated;

  -- DELETE осмысленна только у orders: там три DELETE-политики и
  -- src/features/orders/use-delete-order.ts. У остальных трёх таблиц
  -- DELETE-политик нет вовсе — грант ничего не открывает, только шумит.
  REVOKE DELETE ON public.users, public.master_profiles, public.order_responses FROM authenticated;

  REVOKE UPDATE, INSERT
    ON public.users, public.master_profiles, public.orders, public.order_responses
    FROM authenticated;

  FOR r IN SELECT * FROM _api_grant_spec_0135 ORDER BY tbl, priv LOOP
    v_sql := format('GRANT %s (%s) ON public.%I TO authenticated',
                    r.priv,
                    (SELECT string_agg(quote_ident(c), ', ' ORDER BY c) FROM unnest(r.allow) c),
                    r.tbl);
    EXECUTE v_sql;
  END LOOP;

  -- 4.4 Самопроверка. Она существует именно потому, что колоночный REVOKE
  --     умеет молча ничего не делать. Миграция обязана падать, если
  --     фактический ACL не совпал с намерением, а не оставлять ложное
  --     «применено».
  FOR r IN SELECT * FROM _api_grant_spec_0135 ORDER BY tbl, priv LOOP
    -- запрещённое обязано быть запрещено
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_bad
      FROM unnest(r.deny) c
     WHERE has_column_privilege('authenticated', ('public.' || r.tbl)::regclass, c, r.priv);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'api_column_grants_revoke_did_not_take_effect'
        USING DETAIL = format('public.%I: у authenticated остался %s на колонках: %s', r.tbl, r.priv, v_bad),
              HINT = 'Скорее всего где-то остался ТАБЛИЧНЫЙ грант: колоночный REVOKE его не перебивает.';
    END IF;

    -- разрешённое обязано остаться разрешённым
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_bad
      FROM unnest(r.allow) c
     WHERE NOT has_column_privilege('authenticated', ('public.' || r.tbl)::regclass, c, r.priv);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'api_column_grants_lost_required_privilege'
        USING DETAIL = format('public.%I: у authenticated пропал %s на колонках: %s', r.tbl, r.priv, v_bad);
    END IF;

    -- табличная привилегия обязана исчезнуть, иначе колоночная модель фиктивна
    IF has_table_privilege('authenticated', ('public.' || r.tbl)::regclass, r.priv) THEN
      RAISE EXCEPTION 'api_column_grants_table_level_privilege_survived'
        USING DETAIL = format('public.%I: табличный %s у authenticated не снят', r.tbl, r.priv);
    END IF;

    -- anon не должен иметь запись ни на одной колонке
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_bad
      FROM unnest(r.allow || r.deny) c
     WHERE has_column_privilege('anon', ('public.' || r.tbl)::regclass, c, r.priv);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'api_column_grants_anon_still_writable'
        USING DETAIL = format('public.%I: у anon остался %s на колонках: %s', r.tbl, r.priv, v_bad);
    END IF;
  END LOOP;

  -- TRUNCATE обходит RLS полностью, поэтому её отсутствие проверяется явно.
  FOREACH v_col IN ARRAY ARRAY['users', 'master_profiles', 'orders', 'order_responses'] LOOP
    IF has_table_privilege('authenticated', ('public.' || v_col)::regclass, 'TRUNCATE')
       OR has_table_privilege('anon', ('public.' || v_col)::regclass, 'TRUNCATE') THEN
      RAISE EXCEPTION 'api_column_grants_truncate_survived'
        USING DETAIL = format('public.%I: TRUNCATE у API-роли не снят; TRUNCATE не подчиняется RLS', v_col);
    END IF;
  END LOOP;

  RAISE NOTICE 'api_column_grants: колоночная модель применена и проверена на всех четырёх таблицах.';
END
$grants$;

COMMENT ON COLUMN public.master_profiles.ranking_score IS
  'Балл ранжирования каталога. Считается только recompute_master_ranking_scores() (SECURITY DEFINER, cron). С миграции 0135 недоступен на запись ролям anon и authenticated.';
