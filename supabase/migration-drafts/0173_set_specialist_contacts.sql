-- 0173: контакты специалиста одним вызовом (QA 2026-09-07: два UPDATE без
-- транзакции — при сбое второго телефон уже записан, WhatsApp нет).
-- Ограничение master_profiles_whatsapp_xor: «тот же номер» — whatsapp_phone
-- NULL и флаг true; отдельный номер — флаг false.

CREATE OR REPLACE FUNCTION public.set_specialist_contacts(p_phone text, p_whatsapp text, p_same boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_wa text := CASE WHEN p_same THEN NULL ELSE NULLIF(btrim(COALESCE(p_whatsapp, '')), '') END;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;
  IF v_wa IS NOT NULL AND length(regexp_replace(v_wa, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'whatsapp_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'master_profile_missing' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.users SET contact_phone = v_phone, updated_at = now() WHERE id = v_user_id;
  UPDATE public.master_profiles
     SET whatsapp_phone = v_wa, whatsapp_same_as_phone = COALESCE(p_same, false), updated_at = now()
   WHERE user_id = v_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_specialist_contacts(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_specialist_contacts(text, text, boolean) TO authenticated;
