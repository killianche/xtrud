-- 0184 — специалист узнаёт об отзыве.
--
-- ЗАЧЕМ (FACT, 2026-09-11). Владелец получил отзыв и нигде этого не увидел.
-- Отзыв создают две функции — submit_master_review и confirm_work_done, — и
-- обе пишут его молча: ни уведомления в приложении, ни push. Значение
-- review_received в перечислении notification_type было, но его никто не
-- создавал.
--
-- Триггер на таблице, а не вызов внутри функций: третья функция, если
-- появится, не должна снова «забыть» сказать специалисту. Сбой уведомления
-- отзыв не отменяет — ловим и пишем предупреждение.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_author text;
  v_text text := NULLIF(btrim(coalesce(NEW.text, '')), '');
  v_body text;
BEGIN
  SELECT NULLIF(btrim(first_name), '') INTO v_author FROM public.users WHERE id = NEW.author_id;
  v_body := coalesce(v_author, 'Клиент') || ': ' || NEW.rating || ' из 5';
  IF v_text IS NOT NULL THEN
    v_body := v_body || ' — «' || left(v_text, 100)
           || CASE WHEN length(v_text) > 100 THEN '…' ELSE '' END || '»';
  END IF;

  BEGIN
    PERFORM public.notify_user(
      NEW.target_id,
      'Новый отзыв',
      v_body,
      jsonb_build_object('type', 'review_received', 'review_id', NEW.id, 'rating', NEW.rating)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_review_received: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_review_received() FROM PUBLIC;

-- Новый видимый отзыв клиента специалисту.
DROP TRIGGER IF EXISTS reviews_notify_target ON public.reviews;
CREATE TRIGGER reviews_notify_target
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  WHEN (NEW.direction = 'client_to_master' AND NEW.status = 'visible')
  EXECUTE FUNCTION public.trg_notify_review_received();

-- Отзыв прошёл проверку (pending → visible) — для специалиста он тоже новый.
-- Возврат из скрытых (hidden → visible) новостью не считается.
DROP TRIGGER IF EXISTS reviews_notify_target_published ON public.reviews;
CREATE TRIGGER reviews_notify_target_published
  AFTER UPDATE OF status ON public.reviews
  FOR EACH ROW
  WHEN (NEW.direction = 'client_to_master' AND OLD.status = 'pending' AND NEW.status = 'visible')
  EXECUTE FUNCTION public.trg_notify_review_received();

-- Отзывы, о которых специалисты так и не узнали: запись в «Уведомлениях»,
-- без push — задним числом телефон не беспокоим.
INSERT INTO public.notifications (user_id, type, title, body, data, created_at)
SELECT r.target_id,
       'review_received',
       'Новый отзыв',
       coalesce(NULLIF(btrim(a.first_name), ''), 'Клиент') || ': ' || r.rating || ' из 5'
         || CASE WHEN NULLIF(btrim(coalesce(r.text, '')), '') IS NOT NULL
                 THEN ' — «' || left(btrim(r.text), 100)
                      || CASE WHEN length(btrim(r.text)) > 100 THEN '…' ELSE '' END || '»'
                 ELSE '' END,
       jsonb_build_object('type', 'review_received', 'review_id', r.id, 'rating', r.rating),
       r.created_at
  FROM public.reviews r
  LEFT JOIN public.users a ON a.id = r.author_id
 WHERE r.direction = 'client_to_master'
   AND r.status = 'visible'
   AND NOT EXISTS (
     SELECT 1 FROM public.notifications n
      WHERE n.user_id = r.target_id
        AND n.type = 'review_received'
        AND n.data->>'review_id' = r.id::text
   );

COMMIT;
