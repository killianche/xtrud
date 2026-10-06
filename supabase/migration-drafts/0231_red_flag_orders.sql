-- 0231: «красный флаг» — теневое скрытие запрещённых заданий (№253, 2026-10-06).
--
-- Владелец: «всё, что касается салонов красоты, маникюр, педикюр, музыка и
-- подобные, пластические операции — это Red Flag. Их нельзя добавлять. Если
-- кто-то пытается добавить — для него должно выглядеть как добавлено, но на
-- самом деле скрыто. В админке — список скрытых заданий, админ может
-- посмотреть и открыть». DECISION владельца: уроки музыки тоже под запретом —
-- категорию music-lessons убрать из каталога.
--
-- Было: любое задание со статусом open видно всем (RLS orders_read_open_or_own),
-- уходит в рассылку специалистам (orders_notify_masters_on_insert →
-- order_broadcast_queue → cron process_order_broadcast_queue), «Без категории»
-- зовёт админов push-ом (0230). Модерационное скрытие (admin_hide_order)
-- закрывает задание и пишет автору — для красного флага это запрещено.
--
-- Стало (вариант B — состояние скрытия в закрытой таблице, схема orders не
-- меняется):
--   * xtrud_private.red_flag_terms — словарь: kind 'block' (регулярное
--     выражение по тексту), 'allow' (фрагменты, вырезаемые до проверки:
--     «музыкальный центр»), 'category' (id категории — music-lessons).
--     Неверное выражение в словарь не попадёт (CHECK компилирует его).
--   * xtrud_private.order_shadow_hides — одна строка на задание: hidden
--     (cleared_at IS NULL) или открыто админом (cleared_at). Автор, гость и
--     специалисты таблицу не видят: у authenticated табличный SELECT на
--     orders, новые колонки в orders автор прочитал бы через select=*.
--   * Триггер orders_red_flag_check (AFTER INSERT / UPDATE OF title,
--     description, l2_id, extra_l2_ids; SECURITY DEFINER): текст публикации
--     или изменённый автором текст совпал со словарём — задание скрыто,
--     строка из очереди рассылки убрана. Открытое админом задание снова
--     скрывается, только если автор изменил текст (или категорию на
--     запрещённую). Чистая правка автора скрытие НЕ снимает (fail-closed).
--   * RLS: ограничительная политика orders_red_flag_restrictive (SELECT,
--     anon/authenticated) — скрытое видят только автор, выбранный
--     исполнитель и админ (is_admin_session внутри SD-функции: у anon нет
--     EXECUTE на is_admin_session). Список скрытых id — один InitPlan на
--     запрос, как current_user_blocked_counterparties.
--   * Рассылка: process_order_broadcast_queue не рассылает скрытое (убирает
--     из очереди) — единая точка для публикации, 0230-повторной рассылки и
--     reopen. Push админам «Без категории» (0230) по скрытому не уходит.
--   * Отклик на скрытое невозможен: триггер order_responses_red_flag_guard
--     (INSERT и withdrawn→sent). can_respond_to_order не меняется: старые
--     клиенты на allowed=false показали бы «добавьте категорию».
--   * Автор ничего не получает: ни уведомлений, ни отличий в своей ленте.
--   * Backfill: открытые задания, совпавшие со словарём, скрыты (source =
--     'backfill'), без уведомлений.
--   * Каталог: music-lessons и её услуги выключены (is_active = false,
--     is_visible = false), слова поиска удалены (ветка синонимов
--     search_categories не смотрит is_active). Не удалена: в бандле каталога
--     опубликованных сборок она есть (src/generated/task-catalog.json),
--     удаление дало бы ошибку FK при публикации из старой сборки; такое
--     задание скрывается правилом kind='category'.
--   * Админ-RPC (is_admin_session, SECURITY DEFINER, без телефонов):
--     admin_list_shadow_hidden_orders(p_limit), admin_unhide_order(p_order_id,
--     p_reason) — открыть и один раз на задание поставить в рассылку,
--     admin_hide_order_shadow(p_order_id, p_reason) — скрыть открытое вручную.
--     Журнал: order_shadow_hide, order_shadow_unhide.
--
-- Отвергнуто: колонки orders.shadow_hidden_at/… (вариант A) — у authenticated
-- табличный SELECT на orders (relacl authenticated=rdm), автор увидел бы
-- признак скрытия; закрыть — переводом на поколоночные гранты, что ломает
-- запросы select=* опубликованных клиентов. Отказ при публикации (вариант C) —
-- противоречит DECISION «должно выглядеть как добавлено».
--
-- Откат: 0231_red_flag_orders_rollback.sql (журнал admin_actions append-only —
-- ограничение действий остаётся в редакции 0231).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
-- После применения: admin_list_shadow_hidden_orders, admin_unhide_order,
-- admin_hide_order_shadow — в server/src/rpc/routes.ts RPC_ALLOWLIST;
-- каталог: EXPO_PUBLIC_API_URL=https://api.xtrud.pro npm run catalog:generate.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0231_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.red_flag_terms') IS NOT NULL
     OR to_regclass('xtrud_private.order_shadow_hides') IS NOT NULL
     OR to_regprocedure('public.admin_unhide_order(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION '0231_already_applied';
  END IF;
  -- Ограничение журнала — ровно редакция 0230 (прочитано с базы 2026-10-06).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '73818c6cd8110686ccbe9ec457155aea' THEN
    RAISE EXCEPTION '0231_admin_actions_action_check_changed';
  END IF;
  -- Переписываются от живых тел 2026-10-06.
  IF md5(pg_get_functiondef('public.process_order_broadcast_queue(integer)'::regprocedure))
       IS DISTINCT FROM '7bf7c4fa520096615d213e101f6a5154'
     OR md5(pg_get_functiondef('xtrud_private.orders_uncategorized_events()'::regprocedure))
       IS DISTINCT FROM 'fc81688d080fce49e8dc2c112e422710' THEN
    RAISE EXCEPTION '0231_dependency_changed';
  END IF;
  IF to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL THEN
    RAISE EXCEPTION '0231_dependencies_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('orders_red_flag_check', 'order_responses_red_flag_guard'))
     OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.orders'::regclass
                                          AND polname = 'orders_red_flag_restrictive') THEN
    RAISE EXCEPTION '0231_name_taken';
  END IF;
  -- music-lessons: ровно как прочитано; ссылок нет (иначе — решение заново).
  IF NOT EXISTS (SELECT 1 FROM public.categories_l2
                  WHERE id = 'music-lessons' AND l1_id = 'tutors' AND name_ru = 'Уроки музыки')
     OR (SELECT count(*) FROM public.categories_l3 WHERE l2_id = 'music-lessons') <> 3
     OR (SELECT count(*) FROM public.category_terms WHERE l2_id = 'music-lessons') <> 4
     OR EXISTS (SELECT 1 FROM public.category_terms
                 WHERE l3_id IN (SELECT id FROM public.categories_l3 WHERE l2_id = 'music-lessons')) THEN
    RAISE EXCEPTION '0231_music_lessons_changed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Журнал админки: + order_shadow_hide, order_shadow_unhide.
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
  'order_set_category', 'category_create',
  'order_shadow_hide', 'order_shadow_unhide'
]::text[]));

-- ---------------------------------------------------------------------------
-- Словарь. Выражения — POSIX ARE PostgreSQL по тексту, приведённому к
-- нижнему регистру, ё → е, всё кроме букв, цифр и дефиса → пробел.
-- \m / \M — начало / конец слова. Кириллица в \m и регистре проверена на
-- живой базе (ctype en_US.UTF-8).
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.red_flag_terms (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('block', 'allow', 'category')),
  topic text NOT NULL CHECK (topic IN ('beauty', 'plastic', 'tattoo', 'music')),
  pattern text NOT NULL CHECK (length(pattern) BETWEEN 2 AND 300),
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, pattern),
  -- Компилирует выражение: неверное в словарь не попадёт и не уронит
  -- публикацию заданий.
  CONSTRAINT red_flag_terms_pattern_compiles
    CHECK (kind = 'category' OR textregexeq('', pattern) IS NOT NULL)
);
REVOKE ALL ON TABLE xtrud_private.red_flag_terms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE xtrud_private.red_flag_terms_id_seq FROM PUBLIC, anon, authenticated;

INSERT INTO xtrud_private.red_flag_terms (kind, topic, pattern, note) VALUES
  -- Салоны красоты и услуги салона.
  ('block', 'beauty', '\mсалон[а-я]{0,3}\s+(красоты|маникюр|педикюр|ногт|бров|ресниц|эпиляц|депиляц)', 'салон красоты / маникюра; голое «салон» (машины, химчистка салона) — нет'),
  ('block', 'beauty', '\mбьюти|\mbeauty', 'бьюти-мастер'),
  ('block', 'beauty', '\mманикюр', 'маникюр, маникюрша, маникюрный'),
  ('block', 'beauty', '\mпедикюр', 'педикюр'),
  ('block', 'beauty', '\mmanicure|\mpedicure|\mnail\s*art', 'латиница'),
  ('block', 'beauty', '\mногт(и|ей|ям|ями|ях|евой|евого|евые|евых|евым|евая|евую)\M|\mноготок|\mноготоч', 'ногти; «ноготь» (вросший) — нет'),
  ('block', 'beauty', '\mгель[- ]?лак|\mшеллак', 'покрытие ногтей'),
  ('block', 'beauty', '\mнаращиван[а-я]*\s+(ногт|ресниц|волос)', 'наращивание ногтей / ресниц / волос'),
  ('block', 'beauty', '\mресниц|\mлэшмейк|\mлешмейк', 'ресницы'),
  ('block', 'beauty', '\mбров(ь|и|ей|ям|ями|ях|ист|истка|истку|исты)\M', 'брови; «бровка» (откос, тротуар) — нет'),
  ('block', 'beauty', '\mвизаж|\mмакияж|\mмейкап|\mmake[- ]?up', 'визаж, макияж'),
  ('block', 'beauty', '\mдепиляц|\mэпиляц|\mшугаринг|\mваксинг', 'удаление волос'),
  ('block', 'beauty', '\mкосметолог', 'косметолог, косметология; «косметический ремонт» — нет'),
  ('block', 'beauty', '\mчистк[а-я]*\s+лица|\mпилинг|\mмассаж[а-я]*\s+лица', 'уход за лицом'),
  ('block', 'beauty', '\mпарикмахер|\mбарбер|\mприческ', 'парикмахер; «стрижка газона» — нет'),
  ('block', 'beauty', '\m(стрижк|окрашиван|укладк|кератин|мелирован|колорирован|ламинирован)[а-я]*\s+([а-я]+\s+)?волос', 'услуги для волос; «укладка плитки» — нет'),
  ('block', 'beauty', '\mламинирован[а-я]*\s+(ресниц|бровей)', 'ламинирование ресниц / бровей'),
  -- Пластика и инъекции.
  ('block', 'plastic', '\mпластическ[а-я]*\s+(операц|хирург)', 'пластическая операция / хирург'),
  ('block', 'plastic', '\mэстетическ[а-я]*\s+(хирург|медицин)', 'эстетическая хирургия'),
  ('block', 'plastic', '\m(рино|блефаро|маммо|абдомино|хейло|ото)пласт|\mлипосакц|\mлипофилинг', 'названия операций'),
  ('block', 'plastic', '\mподтяжк[а-я]*\s+(лица|груди|век)|\mувеличени[а-я]*\s+(губ|груди)', 'подтяжка, увеличение'),
  ('block', 'plastic', '\mботокс|\mbotox|\mфиллер|\mгиалурон|\mбиоревитализ|\mмезотерап|\mконтурн[а-я]*\s+пластик', 'инъекции'),
  -- Тату и пирсинг.
  ('block', 'tattoo', '\mтатуаж|\mтату\M|\mтатуиров|\mтату[- ]?(мастер|салон)|\mtattoo', 'тату, татуировка, татуаж'),
  ('block', 'tattoo', '\mперманентн[а-я]*\s+макияж', 'перманентный макияж'),
  ('block', 'tattoo', '\mпирсинг|\mpiercing|\mпроколоть\s+(уши|ухо|нос|пупок)|\mпрокол[а-я]*\s+(ушей|уха|носа|пупка)', 'пирсинг'),
  -- Музыка во всех видах.
  ('block', 'music', '\mмузык', 'музыка, музыкант, музыкальный (кроме вырезанного allow: музыкальный центр, колонка)'),
  ('block', 'music', '\mmusic|\mкараоке|\mkaraoke|\mсольфеджио', 'музыка, караоке, сольфеджио'),
  ('block', 'music', '\mди[- ]?дже|\mdj\M|\mдиджеинг', 'диджей, ди-джей, dj'),
  ('block', 'music', '\mвокал|\mпев(ец|ца|цу|цом|цы|цов|ица|ицу|ицы|иц|ицей)\M|\mпесн[яиюеоь]|\mпесен\M', 'вокал, певец / певица, песни'),
  ('block', 'music', '\mгитар|\mскрипк|\mскрипач|\mсинтезатор|\mсаксофон|\mукулеле|\mбалалайк|\mаккордеон|\mбаянист|\mпианист|\mбарабанщик|\mансамбл|\mоркестр', 'инструменты и исполнители, не встречающиеся в бытовых заданиях'),
  ('block', 'music', '\m(урок|заняти|обучен|научи|учит|репетитор|преподава|игр|сыгра|настро|настройщ)[а-я]*(\s+[а-я]+){0,3}\s+(пианино|фортепиано|роял|барабан|баян|синтезатор|флейт|домбр|дудук)', 'пианино / рояль / барабан / баян — только в музыкальном контексте: «перевезти пианино», «барабан стиральной машины» — нет'),
  ('block', 'music', '\mзвукорежисс|\mзвукооператор|\mзвукозапис|\mаранжиров|\mбитмейк|\mсведени[а-я]*\s+(трек|песн)|\mзвук[а-я]*\s+на\s+(свадьб|мероприят|праздник|торжеств|банкет|юбилей)', 'звук на мероприятие; «звукоизоляция» — нет'),
  -- Вырезается до проверки: аудиотехника — это ремонт техники, а не музыка.
  ('allow', 'music', '\mмузыкальн[а-я]*\s+(центр|колонк|систем)[а-я]*', 'ремонт музыкального центра / колонки'),
  -- Категория каталога (публикация из бандла старых сборок).
  ('category', 'music', 'music-lessons', 'Уроки музыки — DECISION владельца 2026-10-06');

-- ---------------------------------------------------------------------------
-- Состояние скрытия.
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.order_shadow_hides (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('auto', 'backfill', 'admin')),
  topic text NOT NULL,
  matched text,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  hidden_by uuid,
  cleared_at timestamptz,
  cleared_by uuid,
  broadcast_released_at timestamptz
);
REVOKE ALL ON TABLE xtrud_private.order_shadow_hides FROM PUBLIC, anon, authenticated;
CREATE INDEX order_shadow_hides_hidden_idx
  ON xtrud_private.order_shadow_hides (hidden_at DESC) WHERE cleared_at IS NULL;

-- Совпадение текста со словарём: первая тема и найденный фрагмент.
CREATE FUNCTION xtrud_private.red_flag_match(p_title text, p_description text)
 RETURNS TABLE(topic text, matched text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  -- Невидимые символы вырезаются, латинские двойники кириллицы («Маникюp»
  -- с латинской p) проверяются вторым вариантом текста — проверка
  -- безопасности 0231, F1. Пробелы между буквами и транслит не ловятся —
  -- такое админ скрывает вручную.
  WITH r AS (
    SELECT regexp_replace(
             translate(lower(coalesce(p_title, '') || ' ' || coalesce(p_description, '')), 'ё', 'е'),
             '[\u00AD\u200B-\u200F\u2060\uFEFF]', '', 'g') AS t
  ), n AS (
    SELECT btrim(regexp_replace(r.t || ' | ' || translate(r.t, 'aeopcxykmhtb', 'аеорсхукмнтв'),
                                '[^а-яa-z0-9-]+', ' ', 'g')) AS t
      FROM r
  ), a AS (
    SELECT string_agg('(?:' || r.pattern || ')', '|' ORDER BY r.id) AS re
      FROM xtrud_private.red_flag_terms r
     WHERE r.kind = 'allow' AND r.is_active
  ), c AS (
    SELECT CASE WHEN a.re IS NULL THEN n.t ELSE regexp_replace(n.t, a.re, ' ', 'g') END AS t
      FROM n, a
  )
  SELECT r.topic, regexp_substr(c.t, r.pattern)
    FROM c, xtrud_private.red_flag_terms r
   WHERE r.kind = 'block' AND r.is_active AND c.t ~ r.pattern
   ORDER BY r.id
   LIMIT 1;
$function$;

-- Скрытые id для RLS. Админу — пустой список (видит всё). SD: anon не
-- может вызвать is_admin_session и прочитать xtrud_private напрямую.
CREATE FUNCTION xtrud_private.shadow_hidden_order_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN public.is_admin_session() THEN '{}'::uuid[]
              ELSE coalesce((SELECT array_agg(h.order_id)
                               FROM xtrud_private.order_shadow_hides h
                              WHERE h.cleared_at IS NULL), '{}'::uuid[])
         END;
$function$;

CREATE FUNCTION xtrud_private.order_is_shadow_hidden(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM xtrud_private.order_shadow_hides h
                  WHERE h.order_id = p_order_id AND h.cleared_at IS NULL);
$function$;

-- Проверка при публикации и правке автором. Имя триггера по алфавиту между
-- orders_notify_masters_on_insert и orders_uncategorized_events: последний
-- уже видит строку скрытия.
CREATE FUNCTION xtrud_private.orders_red_flag_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_text_changed boolean := TG_OP = 'INSERT'
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description;
  v_cat_changed boolean := TG_OP = 'INSERT'
    OR NEW.l2_id IS DISTINCT FROM OLD.l2_id
    OR NEW.extra_l2_ids IS DISTINCT FROM OLD.extra_l2_ids;
  v_topic text;
  v_matched text;
BEGIN
  IF NOT v_text_changed AND NOT v_cat_changed THEN
    RETURN NULL;
  END IF;

  IF v_cat_changed THEN
    SELECT r.topic, r.pattern INTO v_topic, v_matched
      FROM xtrud_private.red_flag_terms r
     WHERE r.kind = 'category' AND r.is_active
       AND (r.pattern = NEW.l2_id OR r.pattern = ANY (coalesce(NEW.extra_l2_ids, '{}'::text[])))
     ORDER BY r.id
     LIMIT 1;
  END IF;
  IF v_topic IS NULL AND v_text_changed THEN
    SELECT m.topic, m.matched INTO v_topic, v_matched
      FROM xtrud_private.red_flag_match(NEW.title, NEW.description) m;
  END IF;
  IF v_topic IS NULL THEN
    RETURN NULL;  -- чистая правка скрытие не снимает (fail-closed)
  END IF;

  INSERT INTO xtrud_private.order_shadow_hides AS h (order_id, source, topic, matched)
  VALUES (NEW.id, 'auto', v_topic, left(v_matched, 120))
  ON CONFLICT (order_id) DO UPDATE
     SET topic = EXCLUDED.topic,
         matched = EXCLUDED.matched,
         source = CASE WHEN h.cleared_at IS NULL THEN h.source ELSE 'auto' END,
         hidden_at = CASE WHEN h.cleared_at IS NULL THEN h.hidden_at ELSE now() END,
         hidden_by = CASE WHEN h.cleared_at IS NULL THEN h.hidden_by ELSE NULL END,
         cleared_at = NULL,
         cleared_by = NULL;

  DELETE FROM public.order_broadcast_queue WHERE order_id = NEW.id;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER orders_red_flag_check
  AFTER INSERT OR UPDATE OF title, description, l2_id, extra_l2_ids ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.orders_red_flag_check();

-- Отклик на скрытое: новый и повторный (withdrawn → sent).
CREATE FUNCTION xtrud_private.order_responses_red_flag_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'withdrawn' AND NEW.status = 'sent') THEN
    RETURN NEW;
  END IF;
  IF xtrud_private.order_is_shadow_hidden(NEW.order_id) THEN
    RAISE EXCEPTION 'Задание больше недоступно.'
      USING errcode = 'P0001', DETAIL = 'order_unavailable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER order_responses_red_flag_guard
  BEFORE INSERT OR UPDATE OF status ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.order_responses_red_flag_guard();

-- RLS: скрытое видят автор, выбранный исполнитель и админ.
CREATE POLICY orders_red_flag_restrictive ON public.orders
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    (client_id = (SELECT auth.uid()))
    OR (picked_master_id = (SELECT auth.uid()))
    OR NOT (id = ANY (COALESCE((SELECT xtrud_private.shadow_hidden_order_ids()), '{}'::uuid[])))
  );

REVOKE ALL ON FUNCTION xtrud_private.red_flag_match(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.orders_red_flag_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.order_responses_red_flag_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.order_is_shadow_hidden(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.shadow_hidden_order_ids() FROM PUBLIC;
-- Нужна политике под ролью запроса (как current_user_blocked_counterparties).
GRANT EXECUTE ON FUNCTION xtrud_private.shadow_hidden_order_ids() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Рассылка специалистам: скрытое не рассылается (живое тело 2026-10-06 +
-- одно условие).
-- ---------------------------------------------------------------------------
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
-- 0230 «Без категории»: по скрытому заданию админов не зовём и повторную
-- рассылку не тратим (живое тело 2026-10-06 + одно условие).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION xtrud_private.orders_uncategorized_events()
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
  -- 0231: скрытое красным флагом — ни push админам, ни рассылки.
  IF xtrud_private.order_is_shadow_hidden(NEW.id) THEN
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

-- ---------------------------------------------------------------------------
-- Backfill: открытые задания, совпавшие со словарём, — скрыть молча.
-- ---------------------------------------------------------------------------
INSERT INTO xtrud_private.order_shadow_hides (order_id, source, topic, matched)
SELECT o.id, 'backfill', coalesce(cat.topic, m.topic), left(coalesce(cat.pattern, m.matched), 120)
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT r.topic, r.pattern FROM xtrud_private.red_flag_terms r
     WHERE r.kind = 'category' AND r.is_active
       AND (r.pattern = o.l2_id OR r.pattern = ANY (o.extra_l2_ids))
     ORDER BY r.id LIMIT 1) cat ON true
  LEFT JOIN LATERAL xtrud_private.red_flag_match(o.title, o.description) m ON true
 WHERE o.status = 'open'
   AND (cat.topic IS NOT NULL OR m.topic IS NOT NULL);

DELETE FROM public.order_broadcast_queue q
 USING xtrud_private.order_shadow_hides h
 WHERE h.order_id = q.order_id AND h.cleared_at IS NULL;

-- ---------------------------------------------------------------------------
-- Каталог: «Уроки музыки» выключить, слова поиска убрать.
-- ---------------------------------------------------------------------------
DELETE FROM public.category_terms WHERE l2_id = 'music-lessons';
UPDATE public.categories_l3 SET is_active = false WHERE l2_id = 'music-lessons';
UPDATE public.categories_l2 SET is_active = false, is_visible = false, is_featured = false
 WHERE id = 'music-lessons';

-- ---------------------------------------------------------------------------
-- Админка: список скрытых. Без телефонов, контактов и адреса.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_shadow_hidden_orders(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, title text, description_short text, status public.order_status,
               topic text, matched text, source text, hidden_at timestamptz,
               created_at timestamptz, l2_id text, city_id text, city_name text,
               district text, village text, responses_count integer, client_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.title, left(o.description, 200), o.status, h.topic, h.matched, h.source,
         h.hidden_at, o.created_at, o.l2_id, o.city_id, c.name, o.district, o.village,
         o.responses_count, o.client_id
    FROM xtrud_private.order_shadow_hides h
    JOIN public.orders o ON o.id = h.order_id
    LEFT JOIN public.cities c ON c.id = o.city_id
   WHERE h.cleared_at IS NULL
   ORDER BY (o.status = 'open') DESC, h.hidden_at DESC, o.id DESC
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$function$;

-- Открыть: снять скрытие, пометить «разрешено админом»; открытое задание —
-- в рассылку специалистам, как при публикации (один раз на задание).
CREATE FUNCTION public.admin_unhide_order(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.order_status;
  v_hide xtrud_private.order_shadow_hides%ROWTYPE;
  v_notify boolean := false;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT o.status INTO v_status FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  SELECT * INTO v_hide FROM xtrud_private.order_shadow_hides h
   WHERE h.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_hide.cleared_at IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'changed', false, 'notified', false);
  END IF;

  v_notify := v_status = 'open' AND v_hide.broadcast_released_at IS NULL;
  UPDATE xtrud_private.order_shadow_hides
     SET cleared_at = now(), cleared_by = auth.uid(),
         broadcast_released_at = CASE WHEN v_notify THEN now() ELSE broadcast_released_at END
   WHERE order_id = p_order_id;
  IF v_notify THEN
    INSERT INTO public.order_broadcast_queue (order_id) VALUES (p_order_id)
    ON CONFLICT (order_id) DO UPDATE SET attempts = 0, queued_at = now();
  END IF;

  PERFORM public.admin_log_action(
    'order_shadow_unhide', 'order', p_order_id, v_reason, NULL,
    jsonb_build_object('topic', v_hide.topic, 'matched', v_hide.matched,
                       'source', v_hide.source, 'status', v_status, 'notified', v_notify));

  RETURN jsonb_build_object('order_id', p_order_id, 'changed', true, 'notified', v_notify);
END;
$function$;

-- Скрыть открытое задание вручную тем же способом (автор не узнает).
CREATE FUNCTION public.admin_hide_order_shadow(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.order_status;
  v_rows int;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT o.status INTO v_status FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'order_not_open' USING errcode = 'P0001';
  END IF;

  INSERT INTO xtrud_private.order_shadow_hides AS h (order_id, source, topic, matched, hidden_by)
  VALUES (p_order_id, 'admin', 'manual', left(v_reason, 120), auth.uid())
  ON CONFLICT (order_id) DO UPDATE
     SET source = 'admin', topic = 'manual', matched = left(v_reason, 120),
         hidden_at = now(), hidden_by = auth.uid(), cleared_at = NULL, cleared_by = NULL
   WHERE h.cleared_at IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'changed', false);
  END IF;
  DELETE FROM public.order_broadcast_queue WHERE order_id = p_order_id;

  PERFORM public.admin_log_action('order_shadow_hide', 'order', p_order_id, v_reason, NULL,
                                  jsonb_build_object('status', v_status));
  RETURN jsonb_build_object('order_id', p_order_id, 'changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_shadow_hidden_orders(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unhide_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_hide_order_shadow(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_shadow_hidden_orders(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unhide_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_hide_order_shadow(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Проверки.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fail text;
BEGIN
  IF has_function_privilege('anon', 'public.admin_list_shadow_hidden_orders(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_unhide_order(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_hide_order_shadow(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.red_flag_match(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.order_is_shadow_hidden(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.orders_red_flag_check()', 'EXECUTE')
     OR has_table_privilege('authenticated', 'xtrud_private.order_shadow_hides', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'xtrud_private.order_shadow_hides', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'xtrud_private.red_flag_terms', 'SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_function_privilege('anon', 'xtrud_private.shadow_hidden_order_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION '0231_grants_wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'music-lessons' AND (is_active OR is_visible))
     OR EXISTS (SELECT 1 FROM public.category_terms WHERE l2_id = 'music-lessons') THEN
    RAISE EXCEPTION '0231_catalog_wrong';
  END IF;
  -- Словарь: должно скрываться / не должно.
  SELECT string_agg(t, '; ') INTO v_fail FROM (
    SELECT 'miss: ' || t AS t FROM unnest(ARRAY[
      'Маникюр на дому', 'Нужен мастер педикюра', 'Наращивание ресниц', 'Коррекция бровей',
      'Салон красоты ищет', 'Макияж на свадьбу', 'Шугаринг', 'Косметолог', 'Ботокс',
      'Пластическая операция носа', 'Сделать тату', 'Татуировка на руке', 'Пирсинг',
      'Уроки музыки для ребёнка', 'Диджей на свадьбу', 'Ди-джей', 'DJ на праздник',
      'Научиться играть на гитаре', 'Уроки фортепиано', 'Настройка пианино', 'Певица на юбилей',
      'Вокал', 'Караоке', 'Сольфеджио', 'Звук на мероприятие', 'Музыкант на вечер',
      'Гель-лак', 'Барабанщик', 'Маникюp на дому', 'нoгти нарастить',
      'маник​юр']) t
     WHERE NOT EXISTS (SELECT 1 FROM xtrud_private.red_flag_match(t, NULL))
    UNION ALL
    SELECT 'false: ' || t FROM unnest(ARRAY[
      'Ремонт стиральной машины', 'Не крутится барабан стиральной машины', 'Перевезти пианино',
      'Химчистка салона', 'Химчистка салона автомобиля', 'Ремонт музыкального центра',
      'Бровка дороги, укрепить откос', 'Косметический ремонт квартиры', 'Стрижка газона',
      'Укладка плитки', 'Звукоизоляция стен', 'Пластиковые окна', 'Перенести рояль на 3 этаж',
      'Вросший ноготь — нет, починить дверь', 'Ремонт музыкальной колонки',
      'Ремонт Bosch, Electrolux, Samsung', 'Toyota Camry тормоза', 'Настроить роутер Keenetic']) t
     WHERE EXISTS (SELECT 1 FROM xtrud_private.red_flag_match(t, NULL))
  ) s;
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION '0231_dictionary_wrong: %', v_fail;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
