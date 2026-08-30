-- Таблица просмотров мастера. Считаем 2 события:
--   impression — карточка мастера попала клиенту в видимость в ленте
--   profile_open — клиент открыл /master/[id]
--
-- Защита от накрутки: один (viewer_session_id, master_id, view_type)
-- считается раз в 24 часа.

CREATE TABLE IF NOT EXISTS public.master_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewer_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  viewer_session_id text NOT NULL,
  view_type text NOT NULL CHECK (view_type IN ('impression','profile_open')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_views_master_type_created
  ON public.master_views (master_id, view_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_views_dedup
  ON public.master_views (master_id, viewer_session_id, view_type, created_at);

ALTER TABLE public.master_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY master_views_select_own
  ON public.master_views FOR SELECT
  USING ((SELECT auth.uid()) = master_id);

CREATE OR REPLACE FUNCTION public.record_master_view(
  p_master_id uuid,
  p_view_type text,
  p_session_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
BEGIN
  IF v_viewer_id IS NOT NULL AND v_viewer_id = p_master_id THEN
    RETURN;
  END IF;

  IF p_view_type NOT IN ('impression','profile_open') THEN
    RAISE EXCEPTION 'invalid_view_type' USING errcode = 'P0001';
  END IF;

  IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.master_views
    WHERE master_id = p_master_id
      AND viewer_session_id = p_session_id
      AND view_type = p_view_type
      AND created_at > now() - interval '24 hours'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.master_views (master_id, viewer_id, viewer_session_id, view_type)
  VALUES (p_master_id, v_viewer_id, p_session_id, p_view_type);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_master_view(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_master_view(uuid, text, text) TO authenticated, anon;

COMMENT ON FUNCTION public.record_master_view IS
'Запись просмотра карточки/профиля мастера. 24h cooldown по (master_id, viewer_session_id, view_type). Self-views игнорируются.';

CREATE OR REPLACE FUNCTION public.get_my_master_view_stats()
RETURNS TABLE(impressions int, profile_opens int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*) FILTER (WHERE view_type = 'impression')::int AS impressions,
    COUNT(*) FILTER (WHERE view_type = 'profile_open')::int AS profile_opens
  FROM public.master_views
  WHERE master_id = (SELECT auth.uid())
    AND created_at > now() - interval '7 days';
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_master_view_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_master_view_stats() TO authenticated;
