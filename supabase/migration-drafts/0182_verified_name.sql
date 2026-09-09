-- 0182 — подтверждение паспортом привязано к имени.
--
-- ЗАЧЕМ (FACT, 2026-09-09). Значок «проверен» висел рядом с именем, но с
-- именем никак не был связан: в записи проверки хранились только фотографии
-- и статус, имя из документа не записывалось, а поле «Имя» в профиле
-- оставалось свободным для правки. Человек мог подтвердиться настоящим
-- паспортом и переименоваться в кого угодно — значок оставался. Интерфейс
-- утверждал непроверенное (design-quality §5).
--
-- КАК СДЕЛАНО. Подтверждённое имя человек не вводит: его вписывает админ с
-- документа, и оно попадает в профиль. Дальше поле имени закрыто на правку
-- (экран приложения), а на случай, если имя всё-таки изменится любым другим
-- путём — админкой, миграцией, ошибкой в коде, — стоит триггер, который
-- снимает подтверждение. Это последний рубеж, а не основной механизм.
--
-- ОТДЕЛЬНО: значок больше не привязан к статусу заявки.
-- Раньше повторная подача переводила статус в pending, а триггер тут же
-- гасил значок. Человек с опечаткой на сутки терял доверие. Теперь факт
-- пройденной проверки живёт в verified_at, а статус описывает только текущую
-- заявку: пока админ смотрит новую заявку, старый значок остаётся.

BEGIN;

-- 1. Что именно подтвердил админ.
ALTER TABLE public.master_verifications
  ADD COLUMN IF NOT EXISTS verified_first_name text,
  ADD COLUMN IF NOT EXISTS verified_last_name  text,
  -- Момент последнего успешного подтверждения. Переживает новую заявку:
  -- именно он, а не статус, отвечает за значок.
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  -- Подтверждение снято: имя или телефон изменились после проверки.
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text;

COMMENT ON COLUMN public.master_verifications.verified_first_name IS
  'Имя с документа, вписал админ при одобрении. Человек его не вводит.';
COMMENT ON COLUMN public.master_verifications.verified_last_name IS
  'Фамилия с документа, вписал админ при одобрении.';
COMMENT ON COLUMN public.master_verifications.verified_at IS
  'Когда проверка была пройдена. Значок зависит от него, а не от статуса заявки.';
COMMENT ON COLUMN public.master_verifications.revoked_at IS
  'Когда подтверждение снято автоматически (сменилось имя или телефон).';

-- 2. Значок = проверка пройдена и не снята. Статус заявки на него не влияет.
CREATE OR REPLACE FUNCTION public.sync_master_verification_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.master_profiles
     SET verification_level =
           CASE WHEN NEW.verified_at IS NOT NULL AND NEW.revoked_at IS NULL
                THEN 2 ELSE 1 END,
         updated_at = now()
   WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Триггер срабатывал только на смену статуса, а снятие меняет verified_at и
-- revoked_at — значок бы не погас. Пересоздаём с нужными событиями.
DROP TRIGGER IF EXISTS master_verifications_sync_level ON public.master_verifications;
CREATE TRIGGER master_verifications_sync_level
  AFTER INSERT OR UPDATE OF status, verified_at, revoked_at ON public.master_verifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_master_verification_level();

-- 3. Снятие подтверждения. Одна процедура на все причины, чтобы поведение
--    не разъехалось между сменой имени и сменой телефона.
CREATE OR REPLACE FUNCTION public.revoke_verification(p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.master_verifications
     SET revoked_at = now(), revoked_reason = p_reason
   WHERE user_id = p_user_id
     AND verified_at IS NOT NULL
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RETURN; END IF;

  -- Значок гасит триггер sync_master_verification_level на UPDATE выше.
  PERFORM public.notify_user(
    p_user_id,
    'Подтверждение личности снято',
    p_reason || ' Чтобы вернуть значок, отправьте фото паспорта заново в разделе «Я специалист».',
    jsonb_build_object('type', 'verification_revoked')
  );
END;
$$;

-- 4. Имя изменилось — подтверждение снимается.
--    Исключение одно: сам админ вписывает имя с документа при одобрении. Он
--    поднимает флаг в сессии, и триггер его пропускает.
CREATE OR REPLACE FUNCTION public.trg_revoke_verification_on_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(current_setting('xtrud.verification_sync', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name THEN
    RETURN NEW;
  END IF;
  PERFORM public.revoke_verification(NEW.id, 'Вы изменили имя в профиле.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_revoke_verification_on_name_change ON public.users;
CREATE TRIGGER users_revoke_verification_on_name_change
  AFTER UPDATE OF first_name, last_name ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_revoke_verification_on_name_change();

-- 5. Телефон изменился — это и есть передача аккаунта другому человеку.
--    Документ подтверждал связь «этот человек — этот аккаунт»; со сменой
--    номера связь больше не доказана.
CREATE OR REPLACE FUNCTION public.trg_revoke_verification_on_phone_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(current_setting('xtrud.verification_sync', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- Сравниваем по цифрам: «+7 928…» и «8 928…» — один и тот же номер.
  IF regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g')
     IS NOT DISTINCT FROM regexp_replace(coalesce(OLD.phone, ''), '\D', '', 'g') THEN
    RETURN NEW;
  END IF;
  PERFORM public.revoke_verification(NEW.user_id, 'Вы сменили номер телефона.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_private_revoke_verification_on_phone_change ON public.users_private;
CREATE TRIGGER users_private_revoke_verification_on_phone_change
  AFTER UPDATE OF phone ON public.users_private
  FOR EACH ROW EXECUTE FUNCTION public.trg_revoke_verification_on_phone_change();

-- 6. Одобрение: админ вписывает имя с документа, оно попадает в профиль.
DROP FUNCTION IF EXISTS public.admin_review_verification(uuid, boolean, text);
CREATE FUNCTION public.admin_review_verification(
  p_user_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_first  text := NULLIF(btrim(coalesce(p_first_name, '')), '');
  v_last   text := NULLIF(btrim(coalesce(p_last_name, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_verifications WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'verification_not_found' USING errcode = 'P0002';
  END IF;
  IF NOT p_approve AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  -- Одобрить без имени нельзя: значок утверждает именно имя.
  IF p_approve AND (v_first IS NULL OR v_last IS NULL) THEN
    RAISE EXCEPTION 'Впишите имя и фамилию так, как они указаны в документе.'
      USING errcode = 'P0001', DETAIL = 'name_required';
  END IF;

  IF p_approve THEN
    -- Флаг говорит триггерам: имя меняет админ по документу, снимать
    -- подтверждение не нужно.
    PERFORM set_config('xtrud.verification_sync', 'on', true);

    UPDATE public.users
       SET first_name = v_first, last_name = v_last, updated_at = now()
     WHERE id = p_user_id;

    UPDATE public.master_verifications
       SET status = 'approved',
           reviewed_at = now(),
           reviewed_by = auth.uid(),
           rejection_reason = NULL,
           verified_first_name = v_first,
           verified_last_name = v_last,
           verified_at = now(),
           revoked_at = NULL,
           revoked_reason = NULL
     WHERE user_id = p_user_id;

    PERFORM set_config('xtrud.verification_sync', 'off', true);
  ELSE
    -- Отказ по новой заявке не отменяет прежнее подтверждение: если человек
    -- уже был проверен, значок и прежнее имя остаются.
    UPDATE public.master_verifications
       SET status = 'rejected',
           reviewed_at = now(),
           reviewed_by = auth.uid(),
           rejection_reason = v_reason
     WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason, details)
  VALUES (auth.uid(), 'user', p_user_id,
          CASE WHEN p_approve THEN 'verification_approve' ELSE 'verification_reject' END,
          COALESCE(v_reason, 'Паспорт подтверждён'),
          CASE WHEN p_approve
               THEN jsonb_build_object('first_name', v_first, 'last_name', v_last)
               ELSE '{}'::jsonb END);

  PERFORM public.notify_user(
    p_user_id,
    CASE WHEN p_approve THEN 'Личность подтверждена' ELSE 'Паспорт не подтверждён' END,
    CASE WHEN p_approve
         THEN 'В вашем профиле появился значок проверенного специалиста. Имя и фамилия закреплены по документу.'
         ELSE 'Причина: ' || v_reason || '. Отправьте новое фото в разделе «Я специалист».' END,
    jsonb_build_object('type', CASE WHEN p_approve THEN 'verification_approved' ELSE 'verification_rejected' END)
  );
END;
$$;

ALTER FUNCTION public.admin_review_verification(uuid, boolean, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_review_verification(uuid, boolean, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text, text, text) TO authenticated;

-- 7. Удаление аккаунта: запись проверки уже удаляется в delete_my_account, а
--    триггер на удаление возвращает уровень 1. Здесь только страховка на
--    случай, если запись удалят иным путём.
CREATE OR REPLACE FUNCTION public.reset_verification_level_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.master_profiles
     SET verification_level = 1, updated_at = now()
   WHERE user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

-- 8. Перенос того, что уже есть: подтверждённым проставляем verified_at по
--    дате проверки, иначе значок погас бы у них при первом же обновлении.
UPDATE public.master_verifications
   SET verified_at = coalesce(reviewed_at, submitted_at)
 WHERE status = 'approved' AND verified_at IS NULL;

COMMIT;
