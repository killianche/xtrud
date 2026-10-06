-- 0230: задания без категории (№251, 2026-10-06).
--
-- Владелец: «если ни одна категория не подошла — задание всё равно
-- публикуется без категории. В админке видно задания без категории; мы
-- вручную создаём новую категорию и/или назначаем заданию категорию (пример:
-- „покосить траву на поле“). В дальнейшем чтобы такая категория была».
--
-- Было: orders.l2_id NOT NULL (FK categories_l2 RESTRICT); задание без
-- категории опубликовать нельзя. Создать категорию можно только SQL-ом.
--
-- Стало (вариант A — служебная скрытая категория, схема orders не меняется):
--   * categories_l2 'uncategorized' «Без категории»: is_active = true (её имя
--     читается карточкой задания через RLS categories_l2_read_active),
--     is_visible = false (нет в каталоге, выборе, поиске, бандле каталога);
--     open_responses = true — до назначения категории откликнуться может
--     специалист любой категории (иначе опубликованные клиенты показали бы
--     «добавьте в профиль категорию „Без категории“», а добавить её нельзя).
--     Переключается существующим admin_set_category_open_responses.
--   * Охрана служебной категории (триггеры, fail-closed):
--     - её нельзя показать, выключить, переименовать id или удалить;
--     - её нельзя добавить специалисту в master_categories;
--     - к ней нельзя добавить слова поиска (ветка синонимов search_categories
--       не фильтрует is_visible);
--     - она не бывает дополнительной категорией задания (тихо убирается из
--       extra_l2_ids).
--   * Задание попало в «Без категории» (публикация или правка автором) и оно
--     открыто → админам уведомление и push «Новое задание без категории»
--     (как заявки 0214) — один раз на задание (xtrud_private.
--     order_uncategorized_events); волна > 20 событий за час — без push.
--     Ошибка push не мешает публикации.
--   * Задание ушло из «Без категории» в настоящую категорию и оно открыто →
--     в order_broadcast_queue (один раз на задание): специалистов этой
--     категории уведомит тот же cron process_order_broadcast_queue, что и
--     при публикации.
--   * У задания в заглушке нет дополнительных категорий; заглушку нельзя
--     добавить в master_categories и master_services.
--   * Админ-RPC (все — is_admin_session()):
--     admin_list_uncategorized_orders(p_limit) — задания в заглушке без
--       телефонов, контактов и адреса;
--     admin_set_order_category(p_order_id, p_l2_id, p_reason) — перенос;
--     admin_create_category(p_l1_id, p_name_ru, p_icon, p_terms) — новая
--       видимая категория со словами поиска; id-слаг — транслитерация,
--       иначе 'cat-<8 hex>'.
--   * Журнал: новые действия order_set_category, category_create.
--
-- Отвергнуто: nullable orders.l2_id (вариант B) — опубликованные клиенты
-- шлют submit_order_response(p_l2_id = order.l2_id), а order_responses.l2_id
-- NOT NULL: отклик на такое задание падал бы у всех вышедших сборок.
--
-- Откат: 0230_uncategorized_orders_rollback.sql (задания из заглушки он не
-- переносит — сначала назначить им категории, иначе откат остановится;
-- журнал admin_actions append-only, поэтому ограничение действий остаётся
-- в редакции 0230).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
-- После применения: admin_list_uncategorized_orders, admin_set_order_category,
-- admin_create_category — в server/src/rpc/routes.ts RPC_ALLOWLIST.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0230_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_set_order_category(uuid,text,text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'uncategorized') THEN
    RAISE EXCEPTION '0230_already_applied';
  END IF;
  -- Ограничение журнала — ровно редакция 0229 (прочитано с базы 2026-10-06).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '1eaf8013220a10f01e4225a10eeb7174' THEN
    RAISE EXCEPTION '0230_admin_actions_action_check_changed';
  END IF;
  -- На эти функции опирается решение (не меняются): рассылка специалистам,
  -- постановка в очередь при публикации, правило откликов 0217, push,
  -- нормализация дополнительных категорий. Живые редакции 2026-10-06.
  IF md5(pg_get_functiondef('public.process_order_broadcast_queue(integer)'::regprocedure))
       IS DISTINCT FROM '7bf7c4fa520096615d213e101f6a5154'
     OR md5(pg_get_functiondef('public.trg_notify_masters_on_new_order()'::regprocedure))
       IS DISTINCT FROM '1397bfdc6c14d8a5907eeabdec04adc7'
     OR md5(pg_get_functiondef('xtrud_private.respond_block_category(uuid,uuid)'::regprocedure))
       IS DISTINCT FROM '129d2dba936c7b171d18eb03d58018a1'
     OR md5(pg_get_functiondef('public.notify_user(uuid,text,text,jsonb)'::regprocedure))
       IS DISTINCT FROM 'c7ceab5165a3dd51b21e508098f63bdc'
     OR md5(pg_get_functiondef('public.orders_normalize_extra_l2_ids()'::regprocedure))
       IS DISTINCT FROM 'd3b46b49f3badb50b1f59612a529fd44' THEN
    RAISE EXCEPTION '0230_dependency_changed';
  END IF;
  IF to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.categories_l1 WHERE id = 'handyman-moving') THEN
    RAISE EXCEPTION '0230_dependencies_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgname IN ('orders_uncategorized_extras', 'orders_uncategorized_events',
                               'master_categories_no_service_category',
                               'master_services_no_service_category',
                               'categories_l2_guard_service_category',
                               'category_terms_no_service_category')) THEN
    RAISE EXCEPTION '0230_trigger_name_taken';
  END IF;
  IF to_regclass('xtrud_private.order_uncategorized_events') IS NOT NULL THEN
    RAISE EXCEPTION '0230_table_name_taken';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Журнал админки: + order_set_category, category_create.
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
  'order_set_category', 'category_create'
]::text[]));

-- ---------------------------------------------------------------------------
-- Служебная категория.
-- ---------------------------------------------------------------------------
INSERT INTO public.categories_l2
  (id, l1_id, name_ru, icon, sort_order, is_active, is_visible, is_featured, open_responses)
VALUES
  ('uncategorized', 'handyman-moving', 'Без категории', 'DotsThree', 10000, true, false, false, true);

-- Охрана: не показать, не выключить, не переименовать, не удалить.
CREATE FUNCTION xtrud_private.categories_l2_guard_service_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.id <> 'uncategorized' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.is_visible
     OR NOT NEW.is_active
     OR NEW.is_featured THEN
    RAISE EXCEPTION 'Служебную категорию «Без категории» нельзя показать, выключить или удалить.'
      USING ERRCODE = '42501', DETAIL = 'service_category';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER categories_l2_guard_service_category
  BEFORE UPDATE OR DELETE ON public.categories_l2
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.categories_l2_guard_service_category();

-- Специалист не может «работать в категории Без категории».
CREATE FUNCTION xtrud_private.master_categories_no_service_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.l2_id = 'uncategorized' THEN
    RAISE EXCEPTION 'Эту категорию нельзя добавить в профиль.'
      USING ERRCODE = '22023', DETAIL = 'service_category';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER master_categories_no_service_category
  BEFORE INSERT OR UPDATE OF l2_id ON public.master_categories
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.master_categories_no_service_category();

-- То же для услуг в профиле (ревью безопасности 0230, F4).
CREATE TRIGGER master_services_no_service_category
  BEFORE INSERT OR UPDATE OF l2_id ON public.master_services
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.master_categories_no_service_category();

-- Слова поиска у заглушки сделали бы её подсказкой (ветка синонимов
-- search_categories не смотрит is_visible).
CREATE FUNCTION xtrud_private.category_terms_no_service_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.l2_id = 'uncategorized' THEN
    RAISE EXCEPTION 'У служебной категории не бывает слов поиска.'
      USING ERRCODE = '22023', DETAIL = 'service_category';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER category_terms_no_service_category
  BEFORE INSERT OR UPDATE OF l2_id ON public.category_terms
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.category_terms_no_service_category();

-- Заглушка не бывает дополнительной категорией, а у задания в заглушке нет
-- дополнительных (иначе open_responses заглушки открыл бы отклик всем при
-- настоящих категориях — ревью безопасности 0230, F3). Имя триггера по
-- алфавиту после orders_normalize_extra_l2_ids — срабатывает после неё.
CREATE FUNCTION xtrud_private.orders_uncategorized_extras()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.l2_id = 'uncategorized' THEN
    NEW.extra_l2_ids := '{}'::text[];
  ELSIF 'uncategorized' = ANY (NEW.extra_l2_ids) THEN
    NEW.extra_l2_ids := array_remove(NEW.extra_l2_ids, 'uncategorized');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER orders_uncategorized_extras
  BEFORE INSERT OR UPDATE OF extra_l2_ids, l2_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.orders_uncategorized_extras();

-- Журнал событий заглушки: одно уведомление админам и одна повторная
-- рассылка специалистам на задание. Без него автор переключением l2_id
-- (orders_owner_edit_open, грант UPDATE(l2_id)) слал бы push админам и
-- рассылку специалистам без конца (ревью безопасности 0230, F1).
CREATE TABLE xtrud_private.order_uncategorized_events (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  admin_notified_at timestamptz NOT NULL DEFAULT now(),
  rebroadcast_at timestamptz
);
REVOKE ALL ON TABLE xtrud_private.order_uncategorized_events FROM PUBLIC, anon, authenticated;
CREATE INDEX order_uncategorized_events_admin_notified_at_idx
  ON xtrud_private.order_uncategorized_events (admin_notified_at);

-- События: в заглушку — админам (один раз на задание); из заглушки —
-- специалистам через очередь рассылки при публикации (один раз на задание).
CREATE FUNCTION xtrud_private.orders_uncategorized_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid;
  v_rows int;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NULL;
  END IF;

  IF NEW.l2_id = 'uncategorized'
     AND (TG_OP = 'INSERT' OR OLD.l2_id IS DISTINCT FROM 'uncategorized') THEN
    INSERT INTO xtrud_private.order_uncategorized_events (order_id)
    VALUES (NEW.id)
    ON CONFLICT (order_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RETURN NULL;  -- по этому заданию админов уже звали
    END IF;
    -- Волна (больше 20 событий за час) — без push, только в админке:
    -- лимиты публикации ограничивают одного человека, а не всех.
    IF (SELECT count(*) FROM xtrud_private.order_uncategorized_events e
         WHERE e.admin_notified_at > now() - interval '1 hour') > 20 THEN
      RETURN NULL;
    END IF;
    FOR v_admin IN
      SELECT u.id FROM public.users u
       WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
    LOOP
      BEGIN
        -- Без ключа order_id: он включил бы задание в счётчики «моих
        -- заданий» админа (use-notifications.ts считает строки с order_id).
        PERFORM public.notify_user(
          v_admin,
          'Новое задание без категории',
          left(NEW.title, 80) || ' — откройте админку',
          jsonb_build_object('type', 'system', 'kind', 'uncategorized_order',
                             'uncategorized_order_id', NEW.id));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'uncategorized_order push %: %', NEW.id, SQLERRM;
      END;
    END LOOP;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.l2_id = 'uncategorized'
     AND NEW.l2_id IS DISTINCT FROM 'uncategorized' THEN
    INSERT INTO xtrud_private.order_uncategorized_events AS e (order_id, rebroadcast_at)
    VALUES (NEW.id, now())
    ON CONFLICT (order_id) DO UPDATE SET rebroadcast_at = now()
      WHERE e.rebroadcast_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.order_broadcast_queue (order_id) VALUES (NEW.id)
      ON CONFLICT (order_id) DO UPDATE SET attempts = 0, queued_at = now();
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER orders_uncategorized_events
  AFTER INSERT OR UPDATE OF l2_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.orders_uncategorized_events();

REVOKE ALL ON FUNCTION xtrud_private.categories_l2_guard_service_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.master_categories_no_service_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.category_terms_no_service_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.orders_uncategorized_extras() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.orders_uncategorized_events() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Слаг категории: транслитерация, только [a-z0-9-], до 40 символов.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.category_slug(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT btrim(left(btrim(regexp_replace(
           translate(
             replace(replace(replace(replace(replace(replace(replace(replace(
               lower(coalesce(p_name, '')),
               'щ', 'shch'), 'ж', 'zh'), 'х', 'kh'), 'ц', 'ts'),
               'ч', 'ch'), 'ш', 'sh'), 'ю', 'yu'), 'я', 'ya'),
             'абвгдеёзийклмнопрстуфыэъь',
             'abvgdeeziyklmnoprstufye'),
           '[^a-z0-9]+', '-', 'g'), '-'), 40), '-');
$function$;

REVOKE ALL ON FUNCTION xtrud_private.category_slug(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Админка: список заданий без категории. Без телефонов, контактов, адреса.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_uncategorized_orders(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, title text, description_short text, status public.order_status,
               created_at timestamptz, city_id text, city_name text, district text,
               village text, responses_count integer, client_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.title, left(o.description, 200), o.status, o.created_at,
         o.city_id, c.name, o.district, o.village, o.responses_count, o.client_id
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
   WHERE o.l2_id = 'uncategorized'
     AND o.status <> 'draft'
   ORDER BY (o.status = 'open') DESC, o.created_at DESC, o.id DESC
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Админка: назначить заданию категорию. Если задание открыто и уходит из
-- «Без категории», специалистов уведомит orders_uncategorized_events →
-- order_broadcast_queue → process_order_broadcast_queue (как при публикации).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_set_order_category(p_order_id uuid, p_l2_id text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old text;
  v_status public.order_status;
  v_name text;
  v_rb_before timestamptz;
  v_rb_after timestamptz;
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
  SELECT c.name_ru INTO v_name FROM public.categories_l2 c
   WHERE c.id = p_l2_id AND c.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
  END IF;

  SELECT o.l2_id, o.status INTO v_old, v_status
    FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  IF v_old = p_l2_id THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'l2_id', p_l2_id, 'changed', false,
                              'notified', false);
  END IF;

  -- «Специалисты уведомлены» — только если рассылка действительно встала в
  -- очередь сейчас (повторная рассылка — одна на задание, F1/INFO-1).
  SELECT e.rebroadcast_at INTO v_rb_before
    FROM xtrud_private.order_uncategorized_events e WHERE e.order_id = p_order_id;

  UPDATE public.orders SET l2_id = p_l2_id WHERE id = p_order_id;

  SELECT e.rebroadcast_at INTO v_rb_after
    FROM xtrud_private.order_uncategorized_events e WHERE e.order_id = p_order_id;

  PERFORM public.admin_log_action(
    'order_set_category', 'order', p_order_id, v_reason, NULL,
    jsonb_build_object('from', v_old, 'to', p_l2_id, 'status', v_status));

  RETURN jsonb_build_object(
    'order_id', p_order_id, 'l2_id', p_l2_id, 'l2_name', v_name, 'changed', true,
    'notified', (v_status = 'open' AND v_rb_before IS NULL AND v_rb_after IS NOT NULL));
END;
$function$;

-- ---------------------------------------------------------------------------
-- Админка: новая видимая категория со словами поиска.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_create_category(p_l1_id text, p_name_ru text, p_icon text,
                                             p_terms text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- То же, что отвергает scripts/catalog/check-bundled-task-catalog.mjs.
  c_forbidden constant text := '(https?://|supabase|anon_key|service_role|avg_check|price)';
  -- Управляющие и невидимые символы (U+202E и т.п. — ревью 0230, F5).
  -- Белый список (F6): буквы, цифры, пробел и обычная пунктуация; хотя бы
  -- одна буква. Невидимые и управляющие символы не проходят без перечисления.
  c_allowed constant text := '^[А-Яа-яЁёA-Za-z0-9 ,.«»()/+–—-]+$';
  c_letter constant text := '[А-Яа-яЁёA-Za-z]';
  c_invisible constant text := '[\u0001-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]';
  v_name text := btrim(regexp_replace(coalesce(p_name_ru, ''), '\s+', ' ', 'g'));
  v_l1_icon text;
  v_icon text;
  v_terms text[];
  v_base text;
  v_id text;
  v_n int := 1;
  v_existing text;
  v_sort int;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT l1.icon INTO v_l1_icon FROM public.categories_l1 l1
   WHERE l1.id = p_l1_id AND l1.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'section_not_found' USING errcode = 'P0002';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 60 OR v_name ~* c_forbidden
     OR coalesce(p_name_ru, '') ~ c_invisible
     OR v_name !~ c_allowed OR v_name !~ c_letter THEN
    RAISE EXCEPTION 'bad_name' USING errcode = '22023';
  END IF;

  v_icon := coalesce(nullif(btrim(coalesce(p_icon, '')), ''), v_l1_icon);
  IF v_icon !~ '^[A-Z][A-Za-z0-9]{1,39}$' THEN
    RAISE EXCEPTION 'bad_icon' USING errcode = '22023';
  END IF;

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

  -- Одна категория за раз: имя и id проверяются без гонки.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_create_category', 0));

  -- Дубль — то же имя без учёта регистра, пробелов и знаков
  -- («Покос травы!» = «покос  травы»).
  SELECT c.id INTO v_existing FROM public.categories_l2 c
   WHERE regexp_replace(lower(c.name_ru), '[^а-яёa-z0-9]+', '', 'g')
         = regexp_replace(lower(v_name), '[^а-яёa-z0-9]+', '', 'g')
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'category_exists' USING errcode = '23505', DETAIL = v_existing;
  END IF;

  v_base := xtrud_private.category_slug(v_name);
  IF v_base IS NULL OR length(v_base) < 3
     OR v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR v_base ~* c_forbidden THEN
    v_base := 'cat-' || substr(md5(gen_random_uuid()::text), 1, 8);
  END IF;
  v_id := v_base;
  WHILE EXISTS (SELECT 1 FROM public.categories_l2 c WHERE c.id = v_id) LOOP
    v_n := v_n + 1;
    IF v_n > 50 THEN
      v_id := 'cat-' || substr(md5(gen_random_uuid()::text), 1, 8);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.categories_l2 c WHERE c.id = v_id);
      RAISE EXCEPTION 'slug_exhausted' USING errcode = 'P0001';
    END IF;
    v_id := left(v_base, 36) || '-' || v_n;
  END LOOP;

  SELECT coalesce(max(c.sort_order), 0) + 10 INTO v_sort
    FROM public.categories_l2 c
   WHERE c.l1_id = p_l1_id AND c.is_visible AND c.sort_order < 9999;

  INSERT INTO public.categories_l2
    (id, l1_id, name_ru, icon, sort_order, is_active, is_visible, is_featured, open_responses)
  VALUES (v_id, p_l1_id, v_name, v_icon, v_sort, true, true, false, false);

  INSERT INTO public.category_terms (l2_id, term, weight)
  SELECT v_id, t, 100 FROM unnest(v_terms) t;

  PERFORM public.admin_log_action(
    'category_create', 'category', '00000000-0000-0000-0000-000000000000'::uuid,
    'Новая категория «' || v_name || '»', NULL,
    jsonb_build_object('l2_id', v_id, 'l1_id', p_l1_id, 'name', v_name, 'icon', v_icon,
                       'terms', to_jsonb(v_terms)));

  RETURN jsonb_build_object('l2_id', v_id, 'l1_id', p_l1_id, 'name_ru', v_name,
                            'icon', v_icon, 'terms_count', cardinality(v_terms));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_uncategorized_orders(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_order_category(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_category(text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_uncategorized_orders(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_order_category(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_category(text, text, text, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Проверки.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_list_uncategorized_orders(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_order_category(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_create_category(text,text,text,text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.category_slug(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.orders_uncategorized_events()', 'EXECUTE')
     OR has_table_privilege('authenticated', 'xtrud_private.order_uncategorized_events', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'xtrud_private.order_uncategorized_events', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '0230_grants_wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories_l2
                  WHERE id = 'uncategorized' AND is_active AND NOT is_visible AND open_responses) THEN
    RAISE EXCEPTION '0230_stub_wrong';
  END IF;
  IF xtrud_private.category_slug('Покос травы') IS DISTINCT FROM 'pokos-travy'
     OR xtrud_private.category_slug('Щётки, ящики и «Ёжик»') IS DISTINCT FROM 'shchetki-yashchiki-i-ezhik' THEN
    RAISE EXCEPTION '0230_slug_wrong';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
