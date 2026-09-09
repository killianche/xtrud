-- 0181 — отклик одним вызовом: сервер сам решает, вставить или оживить.
--
-- ЗАЧЕМ (FACT, 2026-09-09). Мастер отозвал отклик 7 сентября и сегодня
-- попробовал откликнуться снова. Приложение решало «вставить новый или
-- оживить отозванный» по своему запросу «есть ли уже мой отклик», а тот
-- ответ пролежал в памяти 23 минуты (проверено по логу nginx: запрос в
-- 11:05, попытки отклика в 11:28). Клиент считал, что отклика нет, слал
-- INSERT и упирался в UNIQUE(order_id, master_id) — сервер отвечал 409, а
-- человек читал «Не удалось отправить отклик. Попробуйте ещё раз». Повтор
-- не мог сработать никогда: шесть попыток подряд, все 409.
--
-- Решение: убрать выбор с клиента. Одна функция — она сама смотрит, что
-- есть в базе, и делает нужное. Устаревший кэш больше ни на что не влияет.
--
-- SECURITY INVOKER намеренно: функция работает от имени вызывающего, и все
-- политики RLS (свой master_id, блокировки, «задание принимает отклики»)
-- продолжают действовать как при обычной вставке. Дублировать проверки
-- безопасности внутри функции нельзя — они разъедутся.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_order_response(
  p_order_id uuid,
  p_l2_id text,
  p_price_kind public.order_price_kind,
  p_price_value integer,
  p_lead_time text,
  p_message text,
  p_contact_phone text,
  p_whatsapp_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_master uuid := auth.uid();
  v_id uuid;
  v_status public.response_status;
BEGIN
  IF v_master IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;

  SELECT id, status INTO v_id, v_status
    FROM public.order_responses
   WHERE order_id = p_order_id AND master_id = v_master;

  -- Отклика ещё не было — обычная вставка под теми же политиками.
  IF v_id IS NULL THEN
    INSERT INTO public.order_responses
      (order_id, master_id, l2_id, price_kind, price_value,
       lead_time, message, contact_phone, whatsapp_phone)
    VALUES
      (p_order_id, v_master, p_l2_id, p_price_kind, p_price_value,
       NULLIF(btrim(p_lead_time), ''), NULLIF(btrim(p_message), ''),
       NULLIF(btrim(p_contact_phone), ''), NULLIF(btrim(p_whatsapp_phone), ''))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- Отозванный оживляем с новыми условиями (0172).
  IF v_status = 'withdrawn' THEN
    -- l2_id и updated_at не трогаем: у роли authenticated на них нет прав
    -- (осознанное ограничение), категория берётся из задания и не меняется,
    -- а время обновления ставит триггер order_responses_set_updated_at.
    UPDATE public.order_responses
       SET status = 'sent',
           price_kind = p_price_kind,
           price_value = p_price_value,
           lead_time = NULLIF(btrim(p_lead_time), ''),
           message = NULLIF(btrim(p_message), ''),
           contact_phone = NULLIF(btrim(p_contact_phone), ''),
           whatsapp_phone = NULLIF(btrim(p_whatsapp_phone), '')
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- Дальше — случаи, когда повторять нечего. Текст пишем такой, чтобы
  -- человек понял, что делать, а не жал кнопку впустую.
  IF v_status IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'Вы уже откликнулись на это задание. Отклик можно отозвать и отправить заново.'
      USING ERRCODE = 'P0001', DETAIL = 'response_exists';
  END IF;

  IF v_status = 'accepted' THEN
    RAISE EXCEPTION 'Вас уже выбрали исполнителем по этому заданию.'
      USING ERRCODE = 'P0001', DETAIL = 'response_accepted';
  END IF;

  RAISE EXCEPTION 'По вашему отклику уже принято решение, отправить новый нельзя.'
    USING ERRCODE = 'P0001', DETAIL = 'response_decided';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_order_response(
  uuid, text, public.order_price_kind, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_order_response(
  uuid, text, public.order_price_kind, integer, text, text, text, text) TO authenticated;

COMMIT;
