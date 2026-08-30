-- 0110_remove_chat_messaging.sql
--
-- Полное удаление переписки между пользователями. Решение владельца 2026-05-28:
-- «чат, переписка между двумя людьми нам не нужна. Как таковая.»
--
-- Контекст: экраны чата в приложении удалены ещё 2026-05-20 (переход на модель
-- доски объявлений — клиент звонит/пишет мастеру напрямую по телефону/WhatsApp).
-- В базе оставались осиротевшие таблицы chats/messages (9 чатов, 45 сообщений —
-- демо-данные), связанные функции и триггеры, а также хранилище chat-images.
--
-- Применено к prod через MCP apply_migration (имя remove_chat_messaging_entirely)
-- + отдельный шаг по хранилищу (storage). Этот файл — копия в репозитории как
-- источник истины. Проверено: на chats/messages не ссылается ни один внешний
-- ключ и ни одна колонка в других таблицах — каскад безопасен.

-- 1. accept_response: убрать единственную связь с чатом (создание чата при
--    принятии отклика). Остальная логика без изменений. CREATE OR REPLACE
--    сохраняет существующие гранты.
CREATE OR REPLACE FUNCTION public.accept_response(p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_master_id uuid;
  v_order_client uuid;
  v_order_status public.order_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT order_id, master_id INTO v_order_id, v_master_id
  FROM public.order_responses
  WHERE id = p_response_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING errcode = 'P0002';
  END IF;

  SELECT client_id, status INTO v_order_client, v_order_status
  FROM public.orders
  WHERE id = v_order_id;

  IF v_order_client != v_user_id THEN
    RAISE EXCEPTION 'not_order_owner' USING errcode = '42501';
  END IF;

  IF v_order_status != 'open' THEN
    RAISE EXCEPTION 'order_not_open' USING errcode = 'P0001';
  END IF;

  UPDATE public.order_responses
    SET status = 'accepted'
    WHERE id = p_response_id;

  UPDATE public.order_responses
    SET status = 'rejected'
    WHERE order_id = v_order_id
      AND id != p_response_id
      AND status IN ('sent', 'viewed');

  UPDATE public.orders
    SET status = 'in_progress',
        picked_master_id = v_master_id
    WHERE id = v_order_id;
END;
$function$;

-- 2. Чисто-чатовые функции (в приложении не вызываются).
DROP FUNCTION IF EXISTS public.start_chat_with_master(uuid, uuid);
DROP FUNCTION IF EXISTS public.mark_chat_read(uuid);

-- 3. Таблицы переписки (CASCADE: триггеры на messages, FK messages→chats,
--    RLS-политики, индексы).
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chats CASCADE;

-- 4. Осиротевшие триггер-функции.
DROP FUNCTION IF EXISTS public.trg_bump_order_activity_on_message() CASCADE;
DROP FUNCTION IF EXISTS public.trg_notify_new_message() CASCADE;
DROP FUNCTION IF EXISTS public.update_chat_last_message() CASCADE;
DROP FUNCTION IF EXISTS public.trg_mark_sender_read() CASCADE;

-- 5. Хранилище фото из чата. Прямое удаление файлов из storage.objects
--    заблокировано защитой Supabase (protect_delete). Поэтому: снимаем все
--    правила доступа и закрываем bucket от публичного просмотра — фото из чата
--    становится недоступным никому (вопрос приватности закрыт). Пустой bucket
--    с 1 осиротевшим демо-файлом можно удалить вручную в панели Supabase.
DROP POLICY IF EXISTS chat_images_delete_own ON storage.objects;
DROP POLICY IF EXISTS chat_images_public_read ON storage.objects;
DROP POLICY IF EXISTS chat_images_upload_own ON storage.objects;
UPDATE storage.buckets SET public = false WHERE id = 'chat-images';
