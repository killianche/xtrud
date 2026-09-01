-- Закрытие находок аудита 2026-08-31: отзывы, телефон мастера, бакет заказов.
--
-- Все три проверены измерением на живой базе, а не выведены из документации.
--
-- ЛОВУШКА, общая для всех трёх: REVOKE на колонку не делает ничего, пока роли
-- выдана табличная привилегия, и молчит об этом. Поэтому снимается табличная
-- и выдаётся явный список колонок.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Отзывы. Автор мог перенаправить свой отзыв на любого мастера и вернуть
--    скрытый модератором отзыв в видимые: политика reviews_update_own проверяет
--    только авторство, а UPDATE был выдан на все 11 колонок.
--
--    Клиент пишет ровно два набора (проверено кодом):
--      INSERT — order_id, author_id, target_id, l2_id, rating, text, direction
--      UPDATE — только status (модерация в приложении, use-admin.ts)
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.reviews FROM anon, authenticated;

GRANT INSERT (order_id, author_id, target_id, l2_id, rating, text, direction)
  ON public.reviews TO authenticated;

GRANT UPDATE (status) ON public.reviews TO authenticated;

-- Колоночный грант оставляет status писабельным и обычному автору, потому что
-- админ и пользователь — одна роль authenticated. Разделяет их триггер.
-- SECURITY INVOKER намеренно, как в применённой 0130. В SECURITY DEFINER
-- current_user равен владельцу функции, а не вызывающему, поэтому проверка
-- «это обслуживание владельцем базы» срабатывала бы ВСЕГДА и охранник был бы
-- пустым. Это найдено поведенческой проверкой, а не вычитано.
CREATE OR REPLACE FUNCTION public.guard_review_status_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = (SELECT auth.uid()) AND u.is_admin) THEN
    RAISE EXCEPTION 'Видимость отзыва меняет только модератор'
      USING ERRCODE = '42501',
            DETAIL = 'reviews.status is managed by moderators only';
  END IF;

  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.guard_review_status_column()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS reviews_guard_status_column ON public.reviews;
CREATE TRIGGER reviews_guard_status_column
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_status_column();

-- ---------------------------------------------------------------------------
-- 1b. Модерация отзывов не работала ВООБЩЕ — ни здесь, ни в облаке.
--
-- Найдено поведенческой проверкой: администратор получал «new row violates
-- row-level security policy» при попытке скрыть отзыв. Причина не в политике
-- обновления, а в политике ЧТЕНИЯ.
--
-- reviews_read_visible разрешает видеть отзыв, если он visible, либо ты автор,
-- либо ты адресат. Модератор — ни то, ни другое. PostgreSQL при UPDATE
-- проверяет, что новая строка остаётся видимой автору изменения по SELECT-
-- политике; скрытие отзыва делает его невидимым для самого модератора, и
-- операция отвергается.
--
-- Диагностировано исключением: обновление падало даже с политикой
-- WITH CHECK (true), то есть источник проверки был не в UPDATE-политиках.
--
-- Модератор обязан видеть скрытые отзывы — иначе он не сможет их вернуть.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS reviews_read_visible ON public.reviews;
CREATE POLICY reviews_read_visible ON public.reviews
  FOR SELECT
  USING (
    status = 'visible'::review_status
    OR (SELECT auth.uid()) = author_id
    OR (SELECT auth.uid()) = target_id
    OR public.is_current_user_admin()
  );

-- ---------------------------------------------------------------------------
-- 2. Телефон мастера. Функция возвращала COALESCE(contact_phone, users_private.phone),
--    то есть при незаполненном рабочем номере отдавала ЛИЧНЫЙ номер входа —
--    тот самый, который политика users_private_select_own закрывает. SECURITY
--    DEFINER обходил RLS. Измерено: у 2 активных мастеров contact_phone пуст.
--
--    Теперь отдаётся только явный публичный номер. Нет номера — нет ответа.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT pu.contact_phone
  FROM public.users pu
  WHERE pu.id = p_master_id
    AND pu.is_master = true
    AND pu.status = 'active';
$fn$;

COMMENT ON FUNCTION public.get_master_phone(uuid) IS
  'Returns only the explicit public contact phone. Never falls back to users_private.phone: that is the private sign-in number.';

-- ---------------------------------------------------------------------------
-- 3. Бакет фотографий заказов. Был публичным, и политика order_photos_public_read
--    разрешала анониму не скачивать по известной ссылке, а ПЕРЕЧИСЛЯТЬ объекты.
--    Фотографии заказов — это интерьеры квартир.
--
--    Проверено: в коде клиента бакет не упоминается ни разу, объектов 0.
--    Закрытие сейчас не ломает ничего и снимает вектор до появления данных.
-- ---------------------------------------------------------------------------

UPDATE storage.buckets SET public = false WHERE id = 'order-photos';
DROP POLICY IF EXISTS order_photos_public_read ON storage.objects;

-- ---------------------------------------------------------------------------
-- Самопроверка: молча пройти нельзя.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(x, '; ') INTO v_bad FROM (
    SELECT 'reviews.target_id всё ещё писабелен' AS x
      WHERE has_column_privilege('authenticated','public.reviews','target_id','UPDATE')
    UNION ALL
    SELECT 'reviews: остался табличный UPDATE'
      WHERE has_table_privilege('authenticated','public.reviews','UPDATE')
        AND NOT has_column_privilege('authenticated','public.reviews','target_id','UPDATE') IS NULL
        AND EXISTS (SELECT 1 FROM information_schema.role_table_grants
                     WHERE table_schema='public' AND table_name='reviews'
                       AND grantee='authenticated' AND privilege_type='UPDATE')
    UNION ALL
    SELECT 'get_master_phone всё ещё читает users_private'
      WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='get_master_phone'
                       AND p.prosrc ILIKE '%users_private%')
    UNION ALL
    SELECT 'бакет order-photos всё ещё публичный'
      WHERE EXISTS (SELECT 1 FROM storage.buckets WHERE id='order-photos' AND public)
    UNION ALL
    SELECT 'модератор не может скрыть отзыв: политика чтения не включает админа'
      WHERE NOT EXISTS (SELECT 1 FROM pg_policy
                         WHERE polrelid='public.reviews'::regclass
                           AND polname='reviews_read_visible'
                           AND pg_get_expr(polqual, polrelid) ILIKE '%is_current_user_admin%')
    UNION ALL
    SELECT 'триггер отзывов не создан'
      WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                         WHERE c.relname='reviews' AND t.tgname='reviews_guard_status_column')
    UNION ALL
    SELECT 'клиент не сможет создать отзыв: нет INSERT на rating'
      WHERE NOT has_column_privilege('authenticated','public.reviews','rating','INSERT')
  ) s;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'close_audit_findings_incomplete' USING DETAIL = v_bad;
  END IF;

  RAISE NOTICE 'Находки закрыты: отзывы, телефон мастера, бакет заказов.';
END
$$;

COMMIT;
