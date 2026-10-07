-- 0238: управление каталогом из веб-админки (№284, 2026-10-07).
--
-- Владелец: «добавлять, удалять, менять категории и подкатегории, переносить
-- задания из категории в категорию — супер удобно». Решение экрана —
-- docs/ADMIN_CATALOG_2026-10.md («Удалить» = «Слить в…», строка остаётся).
--
-- Было: из админки — только создать подкатегорию (admin_create_category),
-- показать/скрыть, открыть отклики, назначить категорию одному заданию.
--
-- Стало (только новые функции; живые функции и схема orders не меняются):
--   * admin_update_category(p_l2_id, p_name_ru, p_icon, p_l1_id, p_terms, p_reason)
--     — имя / иконка / раздел / синонимы; NULL = «не трогать». Правила имени,
--     иконки и синонимов — те же, что у admin_create_category (0230).
--   * admin_merge_category(p_from_l2, p_into_l2, p_reason, p_notify) — «удаление с
--     переносом»: задания (основная и дополнительные категории), категории
--     специалистов (без дублей, счётчики складываются), услуги специалистов,
--     подкатегории l3, синонимы (без дублей) + имя from как синоним into,
--     неразобранные подсказки нейросети. from: is_active = false,
--     is_visible = false; строка остаётся ради истории.
--   * admin_move_orders(p_order_ids, p_into_l2, p_reason, p_notify) — до 200
--     заданий. p_notify = false (в обеих) — перенос без рассылки.
--   * Переадресация слитых категорий (ревью безопасности 0238, п.3):
--     xtrud_private.category_redirects(from_l2 → into_l2) пишет слияние;
--     BEFORE-триггеры orders_a_category_redirect, master_categories_a_redirect,
--     master_services_a_redirect подменяют from → into (цепочки до конца,
--     защита от циклов) раньше всех остальных BEFORE-триггеров (имя по
--     алфавиту первое), а AFTER-триггеры (orders_red_flag_check,
--     orders_uncategorized_events) видят уже подменённую строку. Нужно для
--     опубликованных сборок: во встроенном каталоге остаются id слитых
--     категорий. У специалиста уже есть into — вставка from пропускается.
--   * process_order_broadcast_queue (ревью 0238, п.1): специалист, которому
--     по этому заданию уже приходило «Новая заявка» (notifications.data
--     kind = 'new_order', order_id), повторно его не получает. Тело — живое
--     2026-10-07 плюс одно условие; индекс notifications_new_order_idx.
--   * admin_list_category_orders(p_l2_id, p_status, p_limit) — без ПДн.
--   * admin_rename_section(p_l1_id, p_name_ru, p_reason).
--   * admin_reorder(p_kind 'l1'|'l2', p_ids, p_reason) — sort_order по массиву.
--   * admin_list_categories: + l1_icon, l1_sort_order, icon, terms, total_orders
--     (смена типа результата → DROP + CREATE, права прежние).
--   * Рассылка специалистам при переносе открытого задания — через ту же
--     order_broadcast_queue → process_order_broadcast_queue, что и при
--     публикации. Повтор не шлётся: xtrud_private.order_category_broadcasts
--     помнит (задание, категория), которым рассылка уже была; задание, уже
--     стоящее в очереди, повторно не ставится; из «Без категории» рассылку
--     ставит живой триггер orders_uncategorized_events (0230), а не мы.
--     Скрытые красным флагом (0231) не рассылаются (проверка после UPDATE —
--     триггер orders_red_flag_check срабатывает на смену категории).
--   * Журнал: + category_update, category_merge, section_rename,
--     catalog_reorder; перенос задания — прежнее order_set_category.
--
-- Не переносится (история): reviews.l2_id, order_responses.l2_id — FK
-- RESTRICT, строка from остаётся, ссылки целы.
--
-- Откат: 0238_admin_catalog_management_rollback.sql (функции и таблица
-- отметок; admin_list_categories — в редакции до 0238; данные слияний и
-- переносов не возвращаются — журнал admin_actions хранит id для ручного
-- возврата; ограничение действий журнала остаётся в редакции 0238, журнал
-- append-only).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0238_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_merge_category(text,text,text,boolean)') IS NOT NULL
     OR to_regclass('xtrud_private.order_category_broadcasts') IS NOT NULL THEN
    RAISE EXCEPTION '0238_already_applied';
  END IF;
  IF to_regprocedure('public.admin_update_category(text,text,text,text,text[],text)') IS NOT NULL
     OR to_regprocedure('public.admin_move_orders(uuid[],text,text,boolean)') IS NOT NULL
     OR to_regprocedure('public.admin_list_category_orders(text,text,integer)') IS NOT NULL
     OR to_regprocedure('public.admin_rename_section(text,text,text)') IS NOT NULL
     OR to_regprocedure('public.admin_reorder(text,text[],text)') IS NOT NULL
     OR to_regprocedure('xtrud_private.catalog_check_name(text)') IS NOT NULL
     OR to_regprocedure('xtrud_private.catalog_norm_terms(text[])') IS NOT NULL
     OR to_regprocedure('xtrud_private.catalog_requeue_after_move(uuid,text[],boolean)') IS NOT NULL
     OR to_regprocedure('xtrud_private.category_resolve(text)') IS NOT NULL
     OR to_regprocedure('xtrud_private.orders_category_redirect()') IS NOT NULL
     OR to_regprocedure('xtrud_private.master_category_redirect()') IS NOT NULL
     OR to_regclass('xtrud_private.category_redirects') IS NOT NULL
     OR to_regclass('public.notifications_new_order_idx') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname IN ('orders_a_category_redirect', 'master_categories_a_redirect',
                                  'master_services_a_redirect')) THEN
    RAISE EXCEPTION '0238_name_taken';
  END IF;
  -- Переадресация должна идти первой среди BEFORE-триггеров (имена по
  -- алфавиту): живые BEFORE-триггеры orders / master_* — не раньше её имени.
  IF EXISTS (SELECT 1 FROM pg_trigger t
              WHERE NOT t.tgisinternal
                AND (t.tgtype & 2) = 2  -- BEFORE
                AND ((t.tgrelid = 'public.orders'::regclass
                      AND t.tgname COLLATE "C" < 'orders_a_category_redirect')
                  OR (t.tgrelid = 'public.master_categories'::regclass
                      AND t.tgname COLLATE "C" < 'master_categories_a_redirect')
                  OR (t.tgrelid = 'public.master_services'::regclass
                      AND t.tgname COLLATE "C" < 'master_services_a_redirect'))) THEN
    RAISE EXCEPTION '0238_trigger_order_changed';
  END IF;
  -- Ограничение журнала — редакция 0231 (прочитано с базы 2026-10-07).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '1e1180c99b94170e3de133b256b11c70' THEN
    RAISE EXCEPTION '0238_admin_actions_action_check_changed';
  END IF;
  -- Заменяемая функция и то, на что опирается решение (живые редакции 2026-10-07).
  IF md5(pg_get_functiondef('public.admin_list_categories()'::regprocedure))
       IS DISTINCT FROM '25164883881dd65c1ccb8f9af2671222'
     OR md5(pg_get_functiondef('public.admin_create_category(text,text,text,text[])'::regprocedure))
       IS DISTINCT FROM '0e9632a183cab75ec30ef5362293377e'
     OR md5(pg_get_functiondef('public.process_order_broadcast_queue(integer)'::regprocedure))
       IS DISTINCT FROM '4ac02f4e403feafb0baba4486b971f6a'
     OR md5(pg_get_functiondef('xtrud_private.orders_uncategorized_events()'::regprocedure))
       IS DISTINCT FROM 'd09ed32557429d4ee1183c5be60bb6bc'
     OR md5(pg_get_functiondef('xtrud_private.orders_red_flag_check()'::regprocedure))
       IS DISTINCT FROM '58a4a312bed4e25996db79395ae1e898'
     OR md5(pg_get_functiondef('public.orders_normalize_extra_l2_ids()'::regprocedure))
       IS DISTINCT FROM 'd3b46b49f3badb50b1f59612a529fd44'
     OR md5(pg_get_functiondef('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)'::regprocedure))
       IS DISTINCT FROM 'e56e354ac146b3eb9d211231f55ce546' THEN
    RAISE EXCEPTION '0238_dependency_changed';
  END IF;
  IF to_regprocedure('public.is_admin_session()') IS NULL
     OR to_regprocedure('xtrud_private.order_is_shadow_hidden(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'uncategorized') THEN
    RAISE EXCEPTION '0238_dependencies_missing';
  END IF;
  IF (SELECT array_to_string(proacl, ',') FROM pg_proc
       WHERE oid = 'public.admin_list_categories()'::regprocedure)
     IS DISTINCT FROM 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION '0238_admin_list_categories_acl_changed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Журнал админки: + category_update, category_merge, section_rename,
-- catalog_reorder. Полный живой список (0231) плюс новые.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order',
  'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve',
  'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone',
  'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update',
  'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show',
  'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses',
  'set_require_login', 'instagram_approve', 'instagram_reject', 'experience_badge_grant',
  'experience_badge_revoke', 'set_composer_start', 'set_composer_form',
  'order_set_category', 'category_create', 'order_shadow_hide', 'order_shadow_unhide',
  'category_update', 'category_merge', 'section_rename', 'catalog_reorder'
]::text[]));

-- ---------------------------------------------------------------------------
-- Отметки рассылки: какой категории по заданию специалистов уже звали.
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.order_category_broadcasts (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  l2_id text NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, l2_id)
);
REVOKE ALL ON TABLE xtrud_private.order_category_broadcasts FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Переадресация слитых категорий: from → into. Пишет только слияние.
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.category_redirects (
  from_l2 text PRIMARY KEY REFERENCES public.categories_l2(id) ON DELETE CASCADE,
  into_l2 text NOT NULL REFERENCES public.categories_l2(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_l2 <> into_l2)
);
REVOKE ALL ON TABLE xtrud_private.category_redirects FROM PUBLIC, anon, authenticated;

-- Конечная категория цепочки A → B → C. Цикл или слишком длинная цепочка —
-- вернуть исходное значение (строку тогда отвергнут обычные проверки).
CREATE FUNCTION xtrud_private.category_resolve(p_l2 text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cur text := p_l2;
  v_next text;
  v_seen text[] := ARRAY[p_l2];
BEGIN
  IF p_l2 IS NULL THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..16 LOOP
    SELECT r.into_l2 INTO v_next FROM xtrud_private.category_redirects r WHERE r.from_l2 = v_cur;
    IF NOT FOUND THEN
      RETURN v_cur;
    END IF;
    IF v_next = ANY (v_seen) THEN
      RAISE WARNING 'category_redirects cycle at %', v_next;
      RETURN p_l2;
    END IF;
    v_seen := v_seen || v_next;
    v_cur := v_next;
  END LOOP;
  RAISE WARNING 'category_redirects chain too long from %', p_l2;
  RETURN p_l2;
END;
$function$;

-- Задания: основная и дополнительные категории. Срабатывает первым из
-- BEFORE-триггеров orders (orders_a… < orders_author_active_guard <
-- orders_normalize_extra_l2_ids < orders_uncategorized_extras).
CREATE FUNCTION xtrud_private.orders_category_redirect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM xtrud_private.category_redirects) THEN
    RETURN NEW;
  END IF;
  NEW.l2_id := xtrud_private.category_resolve(NEW.l2_id);
  IF NEW.extra_l2_ids IS NOT NULL AND cardinality(NEW.extra_l2_ids) > 0 THEN
    NEW.extra_l2_ids := ARRAY(SELECT xtrud_private.category_resolve(x)
                                FROM unnest(NEW.extra_l2_ids) WITH ORDINALITY AS t(x, pos)
                               ORDER BY pos);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER orders_a_category_redirect
  BEFORE INSERT OR UPDATE OF l2_id, extra_l2_ids ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.orders_category_redirect();

-- Категории и услуги специалиста. У master_categories UNIQUE (master_id,
-- l2_id): если строка into у специалиста уже есть, вставка/правка from
-- пропускается (а не падает).
CREATE FUNCTION xtrud_private.master_category_redirect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_into text;
BEGIN
  IF NEW.l2_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_into := xtrud_private.category_resolve(NEW.l2_id);
  IF v_into IS NOT DISTINCT FROM NEW.l2_id THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'master_categories'
     AND EXISTS (SELECT 1 FROM public.master_categories m
                  WHERE m.master_id = NEW.master_id AND m.l2_id = v_into
                    AND (TG_OP = 'INSERT' OR m.id <> NEW.id)) THEN
    RETURN NULL;
  END IF;
  NEW.l2_id := v_into;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER master_categories_a_redirect
  BEFORE INSERT OR UPDATE OF l2_id ON public.master_categories
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.master_category_redirect();

CREATE TRIGGER master_services_a_redirect
  BEFORE INSERT OR UPDATE OF l2_id ON public.master_services
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.master_category_redirect();

REVOKE ALL ON FUNCTION xtrud_private.category_resolve(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.orders_category_redirect() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.master_category_redirect() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Рассылка: не звать повторно того, кому по заданию уже приходило
-- «Новая заявка». Живое тело 2026-10-07 + одно условие NOT EXISTS.
-- ---------------------------------------------------------------------------
CREATE INDEX notifications_new_order_idx
  ON public.notifications ((data->>'order_id'), user_id)
  WHERE data->>'kind' = 'new_order';

CREATE OR REPLACE FUNCTION public.process_order_broadcast_queue(p_batch integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
  v_order public.orders%ROWTYPE;
  v_category_name text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_master record;
  v_done int := 0;
BEGIN
  FOR v_item IN
    SELECT order_id FROM public.order_broadcast_queue
    WHERE attempts < 3
    ORDER BY queued_at
    LIMIT p_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
    -- Задание уже закрыто, удалено или скрыто красным флагом (0231) —
    -- рассылать нечего. Открыть скрытое — admin_unhide_order поставит снова.
    IF NOT FOUND OR v_order.status <> 'open'
       OR xtrud_private.order_is_shadow_hidden(v_item.order_id) THEN
      DELETE FROM public.order_broadcast_queue WHERE order_id = v_item.order_id;
      CONTINUE;
    END IF;

    SELECT cl2.name_ru INTO v_category_name FROM public.categories_l2 cl2 WHERE cl2.id = v_order.l2_id;
    v_title := CASE WHEN v_category_name IS NOT NULL THEN 'Новая заявка: ' || v_category_name ELSE 'Новая заявка' END;
    v_body := left(v_order.title, 80);
    v_data := jsonb_build_object('kind', 'new_order', 'order_id', v_order.id, 'l2_id', v_order.l2_id, 'city_id', v_order.city_id);

    BEGIN
      FOR v_master IN
        SELECT mp.user_id
        FROM public.master_profiles mp
        JOIN public.users u ON u.id = mp.user_id
        WHERE mp.status = 'active'
          -- Мастер любой из категорий задания (0195), одно уведомление на человека.
          AND EXISTS (
            SELECT 1 FROM public.master_categories mc
             WHERE mc.master_id = mp.user_id
               AND (mc.l2_id = v_order.l2_id OR mc.l2_id = ANY (v_order.extra_l2_ids))
          )
          -- 0238: по этому заданию человеку «Новая заявка» уже приходила
          -- (перенос или слияние категорий) — второй раз не шлём.
          AND NOT EXISTS (
            SELECT 1 FROM public.notifications n
             WHERE n.user_id = mp.user_id
               AND n.data->>'kind' = 'new_order'
               AND n.data->>'order_id' = v_order.id::text
          )
          AND u.status = 'active'
          AND COALESCE(mp.is_hidden_from_search, false) = false
          AND mp.user_id <> v_order.client_id
          AND (
            -- Зон нет — работает по всей Ингушетии.
            NOT EXISTS (SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id)
            OR EXISTS (
              SELECT 1 FROM public.master_service_areas msa
               WHERE msa.master_id = mp.user_id
                 -- 0212: район включает свои города и сёла; село — свой район и само село.
                 AND xtrud_private.area_matches_place(msa.kind::text, msa.location_id,
                                                      v_order.city_id, v_order.district, v_order.village)
            )
          )
      LOOP
        PERFORM public.notify_user(v_master.user_id, v_title, v_body, v_data);
      END LOOP;
      DELETE FROM public.order_broadcast_queue WHERE order_id = v_item.order_id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.order_broadcast_queue SET attempts = attempts + 1 WHERE order_id = v_item.order_id;
      RAISE WARNING 'order_broadcast %: %', v_item.order_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_done;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Проверки имени и синонимов — те же правила, что в admin_create_category.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.catalog_check_name(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  c_forbidden constant text := '(https?://|supabase|anon_key|service_role|avg_check|price)';
  c_allowed constant text := '^[А-Яа-яЁёA-Za-z0-9 ,.«»()/+–—-]+$';
  c_letter constant text := '[А-Яа-яЁёA-Za-z]';
  c_invisible constant text := '[\u0001-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]';
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 60 OR v_name ~* c_forbidden
     OR coalesce(p_name, '') ~ c_invisible
     OR v_name !~ c_allowed OR v_name !~ c_letter THEN
    RAISE EXCEPTION 'bad_name' USING errcode = '22023';
  END IF;
  RETURN v_name;
END;
$function$;

CREATE FUNCTION xtrud_private.catalog_norm_terms(p_terms text[])
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  c_forbidden constant text := '(https?://|supabase|anon_key|service_role|avg_check|price)';
  c_allowed constant text := '^[А-Яа-яЁёA-Za-z0-9 ,.«»()/+–—-]+$';
  c_letter constant text := '[А-Яа-яЁёA-Za-z]';
  c_invisible constant text := '[\u0001-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]';
  v_terms text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT t), '{}') INTO v_terms
    FROM (SELECT btrim(regexp_replace(lower(x), '\s+', ' ', 'g')) AS t
            FROM unnest(coalesce(p_terms, '{}'::text[])) AS x) s
   WHERE t IS NOT NULL AND t <> '';
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_terms, '{}'::text[])) x WHERE x ~ c_invisible) THEN
    RAISE EXCEPTION 'bad_term' USING errcode = '22023';
  END IF;
  IF cardinality(v_terms) > 30 THEN
    RAISE EXCEPTION 'too_many_terms' USING errcode = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_terms) t
              WHERE length(t) < 2 OR length(t) > 80 OR t ~* c_forbidden
                 OR t !~ c_allowed OR t !~ c_letter) THEN
    RAISE EXCEPTION 'bad_term' USING errcode = '22023';
  END IF;
  RETURN v_terms;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Рассылка после переноса открытого задания. Зовётся после UPDATE orders.
-- p_old_cats — категории задания до переноса (основная + дополнительные):
-- их специалистов уже звали при публикации. p_queued_before — стояло ли
-- задание в очереди до UPDATE. Возвращает true, если рассылка встала сейчас
-- (нами или триггером 0230 при уходе из «Без категории»).
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.catalog_requeue_after_move(p_order_id uuid, p_old_cats text[],
                                                         p_queued_before boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY INVOKER  -- зовут только SECURITY DEFINER-функции 0238 (владелец postgres)
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status public.order_status;
  v_new_cats text[];
  v_rows int := 0;
BEGIN
  SELECT o.status, array[o.l2_id] || o.extra_l2_ids INTO v_status, v_new_cats
    FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND OR v_status <> 'open' OR xtrud_private.order_is_shadow_hidden(p_order_id) THEN
    RETURN false;
  END IF;

  INSERT INTO xtrud_private.order_category_broadcasts (order_id, l2_id)
  SELECT p_order_id, c FROM unnest(coalesce(p_old_cats, '{}'::text[])) c
   WHERE c IS NOT NULL
  ON CONFLICT DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.order_broadcast_queue q WHERE q.order_id = p_order_id) THEN
    -- Рассылка уже ждёт (публикация или триггер 0230): она прочитает новую
    -- категорию сама. Только отмечаем.
    INSERT INTO xtrud_private.order_category_broadcasts (order_id, l2_id)
    SELECT p_order_id, c FROM unnest(v_new_cats) c
    ON CONFLICT DO NOTHING;
    RETURN NOT coalesce(p_queued_before, false);
  END IF;

  INSERT INTO xtrud_private.order_category_broadcasts (order_id, l2_id)
  SELECT p_order_id, c FROM unnest(v_new_cats) c WHERE c <> 'uncategorized'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;  -- специалистов этих категорий по заданию уже звали
  END IF;
  INSERT INTO public.order_broadcast_queue (order_id) VALUES (p_order_id)
  ON CONFLICT (order_id) DO UPDATE SET attempts = 0, queued_at = now();
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.catalog_check_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.catalog_norm_terms(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.catalog_requeue_after_move(uuid, text[], boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_categories: + l1_icon, l1_sort_order, icon, terms, total_orders.
-- Первые десять колонок — прежние, в прежнем порядке (админка читает их).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.admin_list_categories();

CREATE FUNCTION public.admin_list_categories()
 RETURNS TABLE(l1_id text, l1_name text, l2_id text, l2_name text, is_active boolean,
               is_visible boolean, sort_order integer, open_orders integer, masters integer,
               open_responses boolean, l1_icon text, l1_sort_order integer, icon text,
               terms text[], total_orders integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT l1.id, l1.name_ru, l2.id, l2.name_ru, l2.is_active, l2.is_visible, l2.sort_order,
         coalesce(oc.n, 0), coalesce(mc.n, 0), l2.open_responses,
         l1.icon, l1.sort_order, l2.icon, coalesce(tm.terms, '{}'::text[]), coalesce(ta.n, 0)
    FROM public.categories_l2 l2
    JOIN public.categories_l1 l1 ON l1.id = l2.l1_id
    LEFT JOIN (SELECT o.l2_id, count(*)::int AS n FROM public.orders o
                WHERE o.status = 'open' GROUP BY o.l2_id) oc ON oc.l2_id = l2.id
    LEFT JOIN (SELECT m.l2_id, count(DISTINCT m.master_id)::int AS n FROM public.master_categories m
                GROUP BY m.l2_id) mc ON mc.l2_id = l2.id
    LEFT JOIN (SELECT t.l2_id, array_agg(t.term ORDER BY t.term) AS terms
                 FROM public.category_terms t WHERE t.l2_id IS NOT NULL
                GROUP BY t.l2_id) tm ON tm.l2_id = l2.id
    -- Все задания (кроме черновиков), где категория основная или дополнительная:
    -- столько перейдёт при слиянии.
    LEFT JOIN (SELECT x.c AS l2_id, count(DISTINCT o.id)::int AS n
                 FROM public.orders o
                 CROSS JOIN LATERAL unnest(array[o.l2_id] || o.extra_l2_ids) AS x(c)
                WHERE o.status <> 'draft'
                GROUP BY x.c) ta ON ta.l2_id = l2.id
   ORDER BY l1.sort_order, l1.id, l2.sort_order, l2.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- admin_update_category: имя, иконка, раздел, синонимы. NULL — не трогать.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_update_category(p_l2_id text, p_name_ru text, p_icon text,
                                             p_l1_id text, p_terms text[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old public.categories_l2%ROWTYPE;
  v_name text;
  v_icon text;
  v_l1 text;
  v_sort int;
  v_terms text[];
  v_old_terms text[];
  v_existing text;
  v_changed boolean := false;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_l2_id IS NULL OR p_l2_id = 'uncategorized' THEN
    RAISE EXCEPTION 'bad_category' USING errcode = '22023';
  END IF;

  -- Имя проверяется на дубль без гонки с admin_create_category.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_create_category', 0));

  SELECT * INTO v_old FROM public.categories_l2 c WHERE c.id = p_l2_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
  END IF;

  v_name := CASE WHEN p_name_ru IS NULL THEN v_old.name_ru
                 ELSE xtrud_private.catalog_check_name(p_name_ru) END;
  IF v_name IS DISTINCT FROM v_old.name_ru THEN
    SELECT c.id INTO v_existing FROM public.categories_l2 c
     WHERE c.id <> p_l2_id
       AND regexp_replace(lower(c.name_ru), '[^а-яёa-z0-9]+', '', 'g')
           = regexp_replace(lower(v_name), '[^а-яёa-z0-9]+', '', 'g')
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'category_exists' USING errcode = '23505', DETAIL = v_existing;
    END IF;
  END IF;

  v_icon := coalesce(nullif(btrim(coalesce(p_icon, '')), ''), v_old.icon);
  IF v_icon !~ '^[A-Z][A-Za-z0-9]{1,39}$' THEN
    RAISE EXCEPTION 'bad_icon' USING errcode = '22023';
  END IF;

  v_l1 := coalesce(nullif(btrim(coalesce(p_l1_id, '')), ''), v_old.l1_id);
  v_sort := v_old.sort_order;
  IF v_l1 IS DISTINCT FROM v_old.l1_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories_l1 l1 WHERE l1.id = v_l1 AND l1.is_active) THEN
      RAISE EXCEPTION 'section_not_found' USING errcode = 'P0002';
    END IF;
    -- В конец нового раздела.
    SELECT coalesce(max(c.sort_order), 0) + 10 INTO v_sort
      FROM public.categories_l2 c
     WHERE c.l1_id = v_l1 AND c.id <> 'uncategorized' AND c.sort_order < 9999;
  END IF;

  IF v_name IS DISTINCT FROM v_old.name_ru OR v_icon IS DISTINCT FROM v_old.icon
     OR v_l1 IS DISTINCT FROM v_old.l1_id THEN
    UPDATE public.categories_l2
       SET name_ru = v_name, icon = v_icon, l1_id = v_l1, sort_order = v_sort
     WHERE id = p_l2_id;
    v_changed := true;
  END IF;

  SELECT coalesce(array_agg(t.term ORDER BY t.term), '{}') INTO v_old_terms
    FROM public.category_terms t WHERE t.l2_id = p_l2_id;

  IF p_terms IS NOT NULL THEN
    v_terms := xtrud_private.catalog_norm_terms(p_terms);
    -- Совпавшие сохраняют свой вес; лишние удаляются; новые — с весом 100.
    DELETE FROM public.category_terms t
     WHERE t.l2_id = p_l2_id
       AND btrim(regexp_replace(lower(t.term), '\s+', ' ', 'g')) <> ALL (v_terms);
    INSERT INTO public.category_terms (l2_id, term, weight)
    SELECT p_l2_id, x, 100 FROM unnest(v_terms) x
     WHERE NOT EXISTS (SELECT 1 FROM public.category_terms t
                        WHERE t.l2_id = p_l2_id
                          AND btrim(regexp_replace(lower(t.term), '\s+', ' ', 'g')) = x);
    SELECT coalesce(array_agg(t.term ORDER BY t.term), '{}') INTO v_terms
      FROM public.category_terms t WHERE t.l2_id = p_l2_id;
    IF v_terms IS DISTINCT FROM v_old_terms THEN
      v_changed := true;
    END IF;
  ELSE
    v_terms := v_old_terms;
  END IF;

  IF v_changed THEN
    PERFORM public.admin_log_action(
      'category_update', 'category', '00000000-0000-0000-0000-000000000000'::uuid, v_reason, NULL,
      jsonb_build_object('l2_id', p_l2_id,
        'from', jsonb_build_object('name', v_old.name_ru, 'icon', v_old.icon,
                                   'l1_id', v_old.l1_id, 'terms', to_jsonb(v_old_terms)),
        'to', jsonb_build_object('name', v_name, 'icon', v_icon,
                                 'l1_id', v_l1, 'terms', to_jsonb(v_terms))));
  END IF;

  RETURN jsonb_build_object('l2_id', p_l2_id, 'l1_id', v_l1, 'name_ru', v_name, 'icon', v_icon,
                            'terms', to_jsonb(v_terms), 'changed', v_changed);
END;
$function$;

-- ---------------------------------------------------------------------------
-- admin_merge_category: «удалить с переносом» from → into.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_merge_category(p_from_l2 text, p_into_l2 text, p_reason text,
                                            p_notify boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from public.categories_l2%ROWTYPE;
  v_into public.categories_l2%ROWTYPE;
  v_o record;
  v_old_cats text[];
  v_qb boolean;
  v_main int := 0;
  v_extra int := 0;
  v_open int := 0;
  v_notified int := 0;
  v_main_ids uuid[] := '{}';
  v_extra_ids uuid[] := '{}';
  v_masters_moved int := 0;
  v_masters_merged int := 0;
  v_merged_ids uuid[];
  v_services int := 0;
  v_l3 int := 0;
  v_terms_dropped int := 0;
  v_terms_moved int := 0;
  v_name_term boolean := false;
  v_ai int := 0;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_from_l2 IS NULL OR p_into_l2 IS NULL
     OR p_from_l2 = 'uncategorized' OR p_into_l2 = 'uncategorized' THEN
    RAISE EXCEPTION 'bad_category' USING errcode = '22023';
  END IF;
  IF p_from_l2 = p_into_l2 THEN
    RAISE EXCEPTION 'same_category' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_create_category', 0));

  -- Обе строки — в порядке id, без взаимной блокировки.
  PERFORM 1 FROM public.categories_l2 c WHERE c.id IN (p_from_l2, p_into_l2)
   ORDER BY c.id FOR UPDATE;
  SELECT * INTO v_from FROM public.categories_l2 c WHERE c.id = p_from_l2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002', DETAIL = 'from';
  END IF;
  SELECT * INTO v_into FROM public.categories_l2 c WHERE c.id = p_into_l2;
  IF NOT FOUND OR NOT v_into.is_active OR NOT v_into.is_visible THEN
    RAISE EXCEPTION 'target_not_available' USING errcode = 'P0002', DETAIL = 'into';
  END IF;

  -- 1. Задания: основная и дополнительные категории.
  FOR v_o IN
    SELECT o.id, o.l2_id, o.extra_l2_ids, o.status FROM public.orders o
     WHERE o.l2_id = p_from_l2 OR p_from_l2 = ANY (o.extra_l2_ids)
     ORDER BY o.id
     FOR UPDATE
  LOOP
    v_old_cats := array[v_o.l2_id] || v_o.extra_l2_ids;
    v_qb := EXISTS (SELECT 1 FROM public.order_broadcast_queue q WHERE q.order_id = v_o.id);
    UPDATE public.orders o
       SET l2_id = CASE WHEN o.l2_id = p_from_l2 THEN p_into_l2 ELSE o.l2_id END,
           -- from → into; выключенные дополнительные убираются (иначе
           -- orders_normalize_extra_l2_ids отвергнет строку); дубли и
           -- совпадение с основной убирает тот же триггер.
           extra_l2_ids = coalesce((
             SELECT array_agg(s.y ORDER BY s.pos)
               FROM (SELECT CASE WHEN x = p_from_l2 THEN p_into_l2 ELSE x END AS y, pos
                       FROM unnest(o.extra_l2_ids) WITH ORDINALITY AS t(x, pos)) s
              WHERE EXISTS (SELECT 1 FROM public.categories_l2 c WHERE c.id = s.y AND c.is_active)),
             '{}'::text[])
     WHERE o.id = v_o.id;
    IF v_o.l2_id = p_from_l2 THEN
      v_main := v_main + 1;
      v_main_ids := v_main_ids || v_o.id;
    ELSE
      v_extra := v_extra + 1;
      v_extra_ids := v_extra_ids || v_o.id;
    END IF;
    IF v_o.status = 'open' THEN
      v_open := v_open + 1;
      IF coalesce(p_notify, true)
         AND xtrud_private.catalog_requeue_after_move(v_o.id, v_old_cats, v_qb) THEN
        v_notified := v_notified + 1;
      END IF;
    END IF;
  END LOOP;

  -- 2. Категории специалистов. Уже есть into — счётчики складываются,
  --    строка from удаляется (UNIQUE (master_id, l2_id)).
  WITH dup AS (
    SELECT f.id AS from_id, i.id AS into_id, f.master_id,
           f.rating_avg AS f_avg, f.rating_count AS f_cnt, f.closed_deals AS f_deals,
           f.l3_ids AS f_l3, f.category_bio AS f_bio
      FROM public.master_categories f
      JOIN public.master_categories i ON i.master_id = f.master_id AND i.l2_id = p_into_l2
     WHERE f.l2_id = p_from_l2
  ), upd AS (
    UPDATE public.master_categories i
       SET rating_count = i.rating_count + d.f_cnt,
           rating_avg = CASE
             WHEN i.rating_avg IS NULL THEN d.f_avg
             WHEN d.f_avg IS NULL THEN i.rating_avg
             WHEN i.rating_count + d.f_cnt > 0 THEN
               round((i.rating_avg * i.rating_count + d.f_avg * d.f_cnt)
                     / (i.rating_count + d.f_cnt), 2)
             ELSE i.rating_avg END,
           closed_deals = i.closed_deals + d.f_deals,
           l3_ids = ARRAY(SELECT DISTINCT x FROM unnest(i.l3_ids || d.f_l3) x),
           category_bio = coalesce(i.category_bio, d.f_bio)
      FROM dup d
     WHERE i.id = d.into_id
    RETURNING d.from_id, d.master_id
  )
  -- v_merged_ids — id строк from, которые удаляются.
  SELECT coalesce(array_agg(u.from_id), '{}') INTO v_merged_ids FROM upd u;
  DELETE FROM public.master_categories m WHERE m.id = ANY (v_merged_ids);
  GET DIAGNOSTICS v_masters_merged = ROW_COUNT;

  UPDATE public.master_categories m SET l2_id = p_into_l2 WHERE m.l2_id = p_from_l2;
  GET DIAGNOSTICS v_masters_moved = ROW_COUNT;

  -- 3. Услуги специалистов и подкатегории l3.
  UPDATE public.master_services s SET l2_id = p_into_l2 WHERE s.l2_id = p_from_l2;
  GET DIAGNOSTICS v_services = ROW_COUNT;
  UPDATE public.categories_l3 l3 SET l2_id = p_into_l2 WHERE l3.l2_id = p_from_l2;
  GET DIAGNOSTICS v_l3 = ROW_COUNT;

  -- 4. Синонимы: дубли (без учёта регистра и пробелов) удаляются, остальные
  --    переходят; имя from становится синонимом into (искали по старому
  --    имени — найдут into).
  DELETE FROM public.category_terms t
   WHERE t.l2_id = p_from_l2
     AND EXISTS (SELECT 1 FROM public.category_terms i
                  WHERE i.l2_id = p_into_l2
                    AND btrim(regexp_replace(lower(i.term), '\s+', ' ', 'g'))
                        = btrim(regexp_replace(lower(t.term), '\s+', ' ', 'g')));
  GET DIAGNOSTICS v_terms_dropped = ROW_COUNT;
  DELETE FROM public.category_terms t
   WHERE t.l2_id = p_from_l2
     AND t.id NOT IN (SELECT DISTINCT ON (btrim(regexp_replace(lower(x.term), '\s+', ' ', 'g'))) x.id
                        FROM public.category_terms x WHERE x.l2_id = p_from_l2
                       ORDER BY btrim(regexp_replace(lower(x.term), '\s+', ' ', 'g')),
                                x.weight DESC, x.id);
  UPDATE public.category_terms t SET l2_id = p_into_l2 WHERE t.l2_id = p_from_l2;
  GET DIAGNOSTICS v_terms_moved = ROW_COUNT;
  IF lower(v_from.name_ru) <> lower(v_into.name_ru)
     AND NOT EXISTS (SELECT 1 FROM public.category_terms i
                      WHERE i.l2_id = p_into_l2
                        AND btrim(regexp_replace(lower(i.term), '\s+', ' ', 'g'))
                            = btrim(regexp_replace(lower(v_from.name_ru), '\s+', ' ', 'g'))) THEN
    INSERT INTO public.category_terms (l2_id, term, weight)
    VALUES (p_into_l2, btrim(regexp_replace(lower(v_from.name_ru), '\s+', ' ', 'g')), 100);
    v_name_term := true;
  END IF;

  -- 5. Неразобранные подсказки нейросети («не уверена») смотрят на into.
  UPDATE xtrud_private.order_ai_classifications a
     SET suggested_l2 = p_into_l2, updated_at = now()
   WHERE a.suggested_l2 = p_from_l2 AND a.status = 'unsure';
  GET DIAGNOSTICS v_ai = ROW_COUNT;

  -- 6. from выключается и скрывается; строка остаётся (история, FK).
  UPDATE public.categories_l2 SET is_active = false, is_visible = false, is_featured = false
   WHERE id = p_from_l2;

  -- 7. Переадресация: старые сборки по-прежнему шлют id from. Цепочки
  --    сразу сокращаются (X → from становится X → into).
  UPDATE xtrud_private.category_redirects r SET into_l2 = p_into_l2 WHERE r.into_l2 = p_from_l2;
  INSERT INTO xtrud_private.category_redirects (from_l2, into_l2)
  VALUES (p_from_l2, p_into_l2)
  ON CONFLICT (from_l2) DO UPDATE SET into_l2 = EXCLUDED.into_l2, created_at = now();

  v_result := jsonb_build_object(
    'from', p_from_l2, 'into', p_into_l2,
    'orders_main', v_main, 'orders_extra', v_extra, 'orders_open', v_open,
    'notified', v_notified,
    'masters_moved', v_masters_moved, 'masters_merged', v_masters_merged,
    'services_moved', v_services, 'l3_moved', v_l3,
    'terms_moved', v_terms_moved, 'terms_dropped', v_terms_dropped,
    'name_term_added', v_name_term, 'ai_suggestions_moved', v_ai);

  PERFORM public.admin_log_action(
    'category_merge', 'category', '00000000-0000-0000-0000-000000000000'::uuid, v_reason, NULL,
    v_result || jsonb_build_object(
      'from_name', v_from.name_ru, 'into_name', v_into.name_ru,
      'from_was', jsonb_build_object('is_active', v_from.is_active,
                                     'is_visible', v_from.is_visible,
                                     'is_featured', v_from.is_featured),
      'main_order_ids', to_jsonb(v_main_ids), 'extra_order_ids', to_jsonb(v_extra_ids)));

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- admin_move_orders: до 200 заданий в одну категорию (основной).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_move_orders(p_order_ids uuid[], p_into_l2 text, p_reason text,
                                         p_notify boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ids uuid[];
  v_into public.categories_l2%ROWTYPE;
  v_o record;
  v_qb boolean;
  v_moved int := 0;
  v_unchanged int := 0;
  v_notified int := 0;
  v_hidden int := 0;
  v_found int;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_into_l2 IS NULL OR p_into_l2 = 'uncategorized' THEN
    RAISE EXCEPTION 'bad_category' USING errcode = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_ids
    FROM unnest(coalesce(p_order_ids, '{}'::uuid[])) x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 OR cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION 'bad_order_ids' USING errcode = '22023';
  END IF;

  SELECT * INTO v_into FROM public.categories_l2 c WHERE c.id = p_into_l2 FOR SHARE;
  IF NOT FOUND OR NOT v_into.is_active OR NOT v_into.is_visible THEN
    RAISE EXCEPTION 'target_not_available' USING errcode = 'P0002';
  END IF;

  SELECT count(*) INTO v_found FROM public.orders o WHERE o.id = ANY (v_ids);
  IF v_found <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;

  FOR v_o IN
    SELECT o.id, o.l2_id, o.extra_l2_ids, o.status, o.title FROM public.orders o
     WHERE o.id = ANY (v_ids) ORDER BY o.id FOR UPDATE
  LOOP
    IF v_o.l2_id = p_into_l2 THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;
    v_qb := EXISTS (SELECT 1 FROM public.order_broadcast_queue q WHERE q.order_id = v_o.id);
    UPDATE public.orders o
       SET l2_id = p_into_l2,
           extra_l2_ids = coalesce((
             SELECT array_agg(t.x ORDER BY t.pos)
               FROM unnest(o.extra_l2_ids) WITH ORDINALITY AS t(x, pos)
              WHERE EXISTS (SELECT 1 FROM public.categories_l2 c WHERE c.id = t.x AND c.is_active)),
             '{}'::text[])
     WHERE o.id = v_o.id;
    v_moved := v_moved + 1;
    IF NOT coalesce(p_notify, true) THEN
      -- Без рассылки: снять и ту, что поставил триггер 0230 при уходе из
      -- «Без категории»; рассылку публикации, ждавшую до переноса, не трогаем.
      IF NOT v_qb THEN
        DELETE FROM public.order_broadcast_queue q WHERE q.order_id = v_o.id;
      END IF;
    ELSIF v_o.status = 'open' THEN
      IF xtrud_private.order_is_shadow_hidden(v_o.id) THEN
        v_hidden := v_hidden + 1;
      ELSIF xtrud_private.catalog_requeue_after_move(
              v_o.id, array[v_o.l2_id] || v_o.extra_l2_ids, v_qb) THEN
        v_notified := v_notified + 1;
      END IF;
    END IF;
    PERFORM public.admin_log_action(
      'order_set_category', 'order', v_o.id, v_reason, NULL,
      jsonb_build_object('from', v_o.l2_id, 'to', p_into_l2, 'status', v_o.status,
                         'title', v_o.title, 'bulk', true));
  END LOOP;

  RETURN jsonb_build_object('into', p_into_l2, 'into_name', v_into.name_ru,
                            'moved', v_moved, 'unchanged', v_unchanged,
                            'notified', v_notified, 'hidden_not_notified', v_hidden);
END;
$function$;

-- ---------------------------------------------------------------------------
-- admin_list_category_orders: задания категории. Без телефонов, контактов,
-- адреса и id клиента.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_category_orders(p_l2_id text, p_status text DEFAULT 'open',
                                                  p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, title text, status public.order_status, created_at timestamptz,
               responses_count integer, city_name text, district text, village text,
               is_main boolean, is_hidden boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF coalesce(p_status, 'open') NOT IN ('open', 'all') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  IF p_l2_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories_l2 c WHERE c.id = p_l2_id) THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
  END IF;
  RETURN QUERY
  SELECT o.id, o.title, o.status, o.created_at, o.responses_count,
         c.name, o.district, o.village, (o.l2_id = p_l2_id),
         xtrud_private.order_is_shadow_hidden(o.id)
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
   WHERE (o.l2_id = p_l2_id OR p_l2_id = ANY (o.extra_l2_ids))
     AND o.status <> 'draft'
     AND (coalesce(p_status, 'open') = 'all' OR o.status = 'open')
   ORDER BY (o.status = 'open') DESC, o.created_at DESC, o.id DESC
   LIMIT least(greatest(coalesce(p_limit, 100), 1), 200);
END;
$function$;

-- ---------------------------------------------------------------------------
-- admin_rename_section: имя раздела (l1). Новый раздел — только сборкой.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_rename_section(p_l1_id text, p_name_ru text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old text;
  v_name text;
  v_existing text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  v_name := xtrud_private.catalog_check_name(p_name_ru);

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_create_category', 0));

  SELECT l1.name_ru INTO v_old FROM public.categories_l1 l1 WHERE l1.id = p_l1_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'section_not_found' USING errcode = 'P0002';
  END IF;
  IF v_old = v_name THEN
    RETURN jsonb_build_object('l1_id', p_l1_id, 'name_ru', v_name, 'changed', false);
  END IF;
  SELECT l1.id INTO v_existing FROM public.categories_l1 l1
   WHERE l1.id <> p_l1_id
     AND regexp_replace(lower(l1.name_ru), '[^а-яёa-z0-9]+', '', 'g')
         = regexp_replace(lower(v_name), '[^а-яёa-z0-9]+', '', 'g')
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'section_exists' USING errcode = '23505', DETAIL = v_existing;
  END IF;

  UPDATE public.categories_l1 SET name_ru = v_name WHERE id = p_l1_id;

  PERFORM public.admin_log_action(
    'section_rename', 'category', '00000000-0000-0000-0000-000000000000'::uuid, v_reason, NULL,
    jsonb_build_object('l1_id', p_l1_id, 'from', v_old, 'to', v_name));

  RETURN jsonb_build_object('l1_id', p_l1_id, 'name_ru', v_name, 'changed', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- admin_reorder: порядок разделов ('l1') или подкатегорий одного раздела
-- ('l2'). Переданные — первыми по порядку массива, остальные — после, в
-- прежнем порядке. «Без категории» не переставляется.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_reorder(p_kind text, p_ids text[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_n int := cardinality(coalesce(p_ids, '{}'::text[]));
  v_l1 text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('l1', 'l2') THEN
    RAISE EXCEPTION 'bad_kind' USING errcode = '22023';
  END IF;
  IF v_n = 0 OR v_n > 500
     OR EXISTS (SELECT 1 FROM unnest(p_ids) x WHERE x IS NULL)
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> v_n THEN
    RAISE EXCEPTION 'bad_ids' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_create_category', 0));

  IF p_kind = 'l1' THEN
    IF (SELECT count(*) FROM public.categories_l1 l1 WHERE l1.id = ANY (p_ids)) <> v_n THEN
      RAISE EXCEPTION 'section_not_found' USING errcode = 'P0002';
    END IF;
    SELECT jsonb_agg(l1.id ORDER BY l1.sort_order, l1.id) INTO v_before FROM public.categories_l1 l1;
    WITH ranked AS (
      SELECT l1.id,
             row_number() OVER (ORDER BY coalesce(p.pos, v_n + 1), l1.sort_order, l1.id) AS rn
        FROM public.categories_l1 l1
        LEFT JOIN unnest(p_ids) WITH ORDINALITY AS p(id, pos) ON p.id = l1.id
    )
    UPDATE public.categories_l1 l1 SET sort_order = r.rn::int
      FROM ranked r WHERE r.id = l1.id AND l1.sort_order IS DISTINCT FROM r.rn::int;
    SELECT jsonb_agg(l1.id ORDER BY l1.sort_order, l1.id) INTO v_after FROM public.categories_l1 l1;
  ELSE
    IF 'uncategorized' = ANY (p_ids) THEN
      RAISE EXCEPTION 'bad_category' USING errcode = '22023';
    END IF;
    IF (SELECT count(*) FROM public.categories_l2 c WHERE c.id = ANY (p_ids)) <> v_n THEN
      RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
    END IF;
    IF (SELECT count(DISTINCT c.l1_id) FROM public.categories_l2 c WHERE c.id = ANY (p_ids)) <> 1 THEN
      RAISE EXCEPTION 'mixed_sections' USING errcode = '22023';
    END IF;
    SELECT c.l1_id INTO v_l1 FROM public.categories_l2 c WHERE c.id = p_ids[1];
    SELECT jsonb_agg(c.id ORDER BY c.sort_order, c.id) INTO v_before
      FROM public.categories_l2 c WHERE c.l1_id = v_l1 AND c.id <> 'uncategorized';
    WITH ranked AS (
      SELECT c.id,
             row_number() OVER (ORDER BY coalesce(p.pos, v_n + 1), c.sort_order, c.id) AS rn
        FROM public.categories_l2 c
        LEFT JOIN unnest(p_ids) WITH ORDINALITY AS p(id, pos) ON p.id = c.id
       WHERE c.l1_id = v_l1 AND c.id <> 'uncategorized'
    )
    UPDATE public.categories_l2 c SET sort_order = (r.rn * 10)::int
      FROM ranked r WHERE r.id = c.id AND c.sort_order IS DISTINCT FROM (r.rn * 10)::int;
    SELECT jsonb_agg(c.id ORDER BY c.sort_order, c.id) INTO v_after
      FROM public.categories_l2 c WHERE c.l1_id = v_l1 AND c.id <> 'uncategorized';
  END IF;

  IF v_before IS DISTINCT FROM v_after THEN
    PERFORM public.admin_log_action(
      'catalog_reorder', 'category', '00000000-0000-0000-0000-000000000000'::uuid, v_reason, NULL,
      jsonb_build_object('kind', p_kind, 'l1_id', v_l1, 'from', v_before, 'to', v_after));
  END IF;

  RETURN jsonb_build_object('kind', p_kind, 'l1_id', v_l1, 'order', v_after,
                            'changed', v_before IS DISTINCT FROM v_after);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Права: только authenticated (внутри is_admin_session()) и service_role.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_list_categories() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_category(text, text, text, text, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_merge_category(text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_move_orders(uuid[], text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_category_orders(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rename_section(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reorder(text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_category(text, text, text, text, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_merge_category(text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_move_orders(uuid[], text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_category_orders(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rename_section(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reorder(text, text[], text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Проверки.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.admin_list_categories()',
    'public.admin_update_category(text,text,text,text,text[],text)',
    'public.admin_merge_category(text,text,text,boolean)',
    'public.admin_move_orders(uuid[],text,text,boolean)',
    'public.admin_list_category_orders(text,text,integer)',
    'public.admin_rename_section(text,text,text)',
    'public.admin_reorder(text,text[],text)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0238_grants_wrong %', v_fn;
    END IF;
  END LOOP;
  -- Закрытые функции и таблицы: ни anon, ни authenticated, ни PUBLIC.
  FOREACH v_fn IN ARRAY ARRAY[
    'xtrud_private.catalog_requeue_after_move(uuid,text[],boolean)',
    'xtrud_private.catalog_check_name(text)',
    'xtrud_private.catalog_norm_terms(text[])',
    'xtrud_private.category_resolve(text)',
    'xtrud_private.orders_category_redirect()',
    'xtrud_private.master_category_redirect()']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR (SELECT p.proacl IS NULL
                  OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
             FROM pg_proc p WHERE p.oid = v_fn::regprocedure) THEN
      RAISE EXCEPTION '0238_private_grants_wrong %', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['xtrud_private.order_category_broadcasts',
                              'xtrud_private.category_redirects']
  LOOP
    IF has_table_privilege('anon', v_fn, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', v_fn, 'SELECT,INSERT,UPDATE,DELETE')
       OR (SELECT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 0)
             FROM pg_class c WHERE c.oid = v_fn::regclass) THEN
      RAISE EXCEPTION '0238_private_table_grants_wrong %', v_fn;
    END IF;
  END LOOP;
  -- Невидимый символ в имени (U+202E) отвергается.
  BEGIN
    PERFORM xtrud_private.catalog_check_name('Покос' || chr(8238) || 'травы');
    RAISE EXCEPTION '0238_invisible_passed';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;  -- bad_name
  END;
  -- Порядок триггеров: переадресация — первая среди BEFORE.
  IF (SELECT t.tgname FROM pg_trigger t
       WHERE t.tgrelid = 'public.orders'::regclass AND NOT t.tgisinternal AND (t.tgtype & 2) = 2
       ORDER BY t.tgname COLLATE "C" LIMIT 1) IS DISTINCT FROM 'orders_a_category_redirect'
     OR (SELECT t.tgname FROM pg_trigger t
          WHERE t.tgrelid = 'public.master_categories'::regclass AND NOT t.tgisinternal AND (t.tgtype & 2) = 2
          ORDER BY t.tgname COLLATE "C" LIMIT 1) IS DISTINCT FROM 'master_categories_a_redirect' THEN
    RAISE EXCEPTION '0238_trigger_order_wrong';
  END IF;
  IF xtrud_private.catalog_check_name('  Покос   травы ') IS DISTINCT FROM 'Покос травы'
     OR xtrud_private.catalog_norm_terms(ARRAY['Газон', 'газон ', ' косить  траву'])
        IS DISTINCT FROM ARRAY['газон', 'косить траву'] THEN
    RAISE EXCEPTION '0238_checks_wrong';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
