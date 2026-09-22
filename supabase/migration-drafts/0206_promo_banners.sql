-- 0206: рекламные баннеры Главной — из админки.
--
-- Владелец, 2026-09-22: «баннер с кроссовками отключить; в админку добавить
-- функционал добавления баннера с фотографией — потом скажу включить и
-- скину свои».
--
-- Было: баннер зашит в код приложения (PromoBannerCarousel, «Кроссовки со
-- скидкой 20 %»).
-- Стало: таблица public.promo_banners. Приложение показывает только
-- включённые баннеры; нет ни одного — блок «Реклама» на Главной не
-- показывается вовсе. Фото загружает админ в публичное хранилище «promo»
-- (сервер пускает туда только администратора, в его собственную папку).
-- Добавить, включить/выключить, поменять ссылку, порядок и удалить — только
-- админ через admin_*-функции с записью в журнал действий.
--
-- Откат: DROP FUNCTION admin_*promo_banner*; DROP TABLE public.promo_banners;
-- вернуть прежние CHECK в admin_actions (списки ниже без promo_*).

BEGIN;

CREATE TABLE IF NOT EXISTS public.promo_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Путь в хранилище «promo»: <id админа>/<файл>. Нужен, чтобы удалить файл.
  image_path text NOT NULL
    CHECK (image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' AND image_path NOT LIKE '%..%'),
  image_url text NOT NULL,
  link_url text
    CHECK (link_url IS NULL OR (link_url ~* '^https?://\S+$' AND char_length(link_url) <= 500)),
  -- Название рекламодателя — для VoiceOver («Реклама: …»); на фото и так всё есть.
  title text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 80),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.promo_banners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promo_banners FROM PUBLIC, anon, authenticated;
-- Только нужные приложению колонки: id админа (created_by, image_path) гостю
-- не отдаём (ревью безопасности 2026-09-22).
GRANT SELECT (id, image_url, link_url, title, sort_order, is_active, created_at)
  ON TABLE public.promo_banners TO anon, authenticated;

-- Читать может любой, в том числе гость, — только включённые.
DROP POLICY IF EXISTS promo_banners_read_active ON public.promo_banners;
CREATE POLICY promo_banners_read_active ON public.promo_banners
  FOR SELECT TO anon, authenticated
  USING (is_active);

-- Журнал действий админа: новые действия и тип объекта.
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn','suspend','unsuspend','ban','unban','hide','unhide','hide_order','dismiss_report',
  'resolve_report','issue_signed_url','verification_approve','verification_reject',
  'master_show','master_hide','set_password','set_phone','set_order_limits','set_find_screen',
  'promo_banner_add','promo_banner_update','promo_banner_delete']));
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_target_type_check CHECK (target_type = ANY (ARRAY[
  'user','order','order_response','review','report','storage_object','settings','promo_banner']));

-- Все баннеры, включая выключенные, — для админки.
CREATE OR REPLACE FUNCTION public.admin_list_promo_banners()
RETURNS SETOF public.promo_banners
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM public.promo_banners ORDER BY sort_order, created_at;
END;
$$;

-- Нормализация ссылки: пусто → NULL; иначе только http(s).
CREATE OR REPLACE FUNCTION public.promo_banner_link(p_link text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v text := nullif(btrim(coalesce(p_link, '')), '');
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  IF v !~* '^https?://\S+$' OR char_length(v) > 500 THEN
    RAISE EXCEPTION 'Ссылка должна начинаться с https:// или http://'
      USING ERRCODE = '22023', DETAIL = 'bad_link';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_promo_banner(
  p_image_path text,
  p_link_url text DEFAULT NULL,
  p_title text DEFAULT NULL
)
RETURNS public.promo_banners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.promo_banners;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Фото — только из своей папки хранилища «promo» (так его и пускает сервер).
  IF p_image_path IS NULL
     OR p_image_path !~* ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'Сначала загрузите фото баннера.'
      USING ERRCODE = '22023', DETAIL = 'bad_image';
  END IF;
  IF v_title IS NOT NULL AND char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'Название — до 80 знаков.' USING ERRCODE = '22023', DETAIL = 'bad_title';
  END IF;
  -- Замок до подсчёта: два одновременных добавления не обойдут лимит.
  LOCK TABLE public.promo_banners IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM public.promo_banners) >= 20 THEN
    RAISE EXCEPTION 'Не больше 20 баннеров. Удалите ненужные.'
      USING ERRCODE = 'P0001', DETAIL = 'too_many';
  END IF;

  INSERT INTO public.promo_banners (image_path, image_url, link_url, title, sort_order, created_by)
  VALUES (
    p_image_path,
    'https://api.xtrud.pro/files/promo/' || p_image_path,
    public.promo_banner_link(p_link_url),
    v_title,
    coalesce((SELECT max(sort_order) FROM public.promo_banners), 0) + 1,
    v_uid
  )
  RETURNING * INTO v_row;

  PERFORM public.admin_log_action(
    'promo_banner_add', 'promo_banner', v_row.id, 'Новый рекламный баннер',
    NULL, jsonb_build_object('image_path', v_row.image_path, 'link_url', v_row.link_url));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_promo_banner(
  p_id uuid,
  p_link_url text,
  p_title text,
  p_is_active boolean
)
RETURNS public.promo_banners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.promo_banners;
  v_row public.promo_banners;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_title IS NOT NULL AND char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'Название — до 80 знаков.' USING ERRCODE = '22023', DETAIL = 'bad_title';
  END IF;
  SELECT * INTO v_old FROM public.promo_banners WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Баннер не найден.' USING ERRCODE = 'P0002', DETAIL = 'not_found';
  END IF;

  UPDATE public.promo_banners
     SET link_url = public.promo_banner_link(p_link_url),
         title = v_title,
         is_active = coalesce(p_is_active, is_active),
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  PERFORM public.admin_log_action(
    'promo_banner_update', 'promo_banner', p_id,
    CASE WHEN v_old.is_active IS DISTINCT FROM v_row.is_active
         THEN CASE WHEN v_row.is_active THEN 'Баннер включён' ELSE 'Баннер выключен' END
         ELSE 'Баннер изменён' END,
    NULL, jsonb_build_object(
      'old', jsonb_build_object('link_url', v_old.link_url, 'title', v_old.title, 'is_active', v_old.is_active),
      'new', jsonb_build_object('link_url', v_row.link_url, 'title', v_row.title, 'is_active', v_row.is_active)));
  RETURN v_row;
END;
$$;

-- Порядок: поменять местами с соседом выше (p_up) или ниже.
CREATE OR REPLACE FUNCTION public.admin_move_promo_banner(p_id uuid, p_up boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cur public.promo_banners;
  v_nb public.promo_banners;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Все строки под замок: порядок меняем целиком, без гонок.
  PERFORM 1 FROM public.promo_banners FOR UPDATE;
  SELECT * INTO v_cur FROM public.promo_banners WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Баннер не найден.' USING ERRCODE = 'P0002', DETAIL = 'not_found';
  END IF;
  IF p_up THEN
    SELECT * INTO v_nb FROM public.promo_banners
     WHERE (sort_order, created_at) < (v_cur.sort_order, v_cur.created_at)
     ORDER BY sort_order DESC, created_at DESC LIMIT 1;
  ELSE
    SELECT * INTO v_nb FROM public.promo_banners
     WHERE (sort_order, created_at) > (v_cur.sort_order, v_cur.created_at)
     ORDER BY sort_order, created_at LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN;  -- уже крайний
  END IF;
  -- Одинаковый sort_order у соседей (старые строки) — разводим явно.
  IF v_nb.sort_order = v_cur.sort_order THEN
    UPDATE public.promo_banners SET sort_order = v_cur.sort_order + CASE WHEN p_up THEN 1 ELSE -1 END,
           updated_at = now() WHERE id = v_cur.id;
    UPDATE public.promo_banners SET sort_order = v_cur.sort_order, updated_at = now() WHERE id = v_nb.id;
  ELSE
    UPDATE public.promo_banners SET sort_order = v_nb.sort_order, updated_at = now() WHERE id = v_cur.id;
    UPDATE public.promo_banners SET sort_order = v_cur.sort_order, updated_at = now() WHERE id = v_nb.id;
  END IF;
END;
$$;

-- Удаление строки; возвращает путь фото — админка удаляет сам файл.
CREATE OR REPLACE FUNCTION public.admin_delete_promo_banner(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.promo_banners;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.promo_banners WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Баннер не найден.' USING ERRCODE = 'P0002', DETAIL = 'not_found';
  END IF;
  PERFORM public.admin_log_action(
    'promo_banner_delete', 'promo_banner', p_id, 'Баннер удалён',
    NULL, jsonb_build_object('image_path', v_row.image_path, 'link_url', v_row.link_url));
  RETURN v_row.image_path;
END;
$$;

REVOKE ALL ON FUNCTION public.promo_banner_link(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_promo_banners() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_promo_banner(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_promo_banner(uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_move_promo_banner(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_promo_banner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_promo_banners() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_promo_banner(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_promo_banner(uuid, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_move_promo_banner(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_promo_banner(uuid) TO authenticated, service_role;

COMMIT;

-- PostgREST перечитывает схему: иначе новая таблица и функции отдают 404.
NOTIFY pgrst, 'reload schema';
