-- Отклик без обязательного сообщения.
--
-- DECISION владельца 2026-09-01: отклик — это «я готов сделать» плюс цена,
-- срок и контакты. Сочинять текст от 10 символов человек не должен.
--
-- Сейчас обязательность записана в ДВУХ местах: схема формы в клиенте и
-- ограничение в базе (0009_orders_and_responses.sql:117). Снять только в
-- клиенте нельзя — каждая отправка упрётся в 400 от PostgREST. Поэтому
-- миграция идёт ПЕРВОЙ, клиент следом: additive backend → совместимый клиент
-- (docs/AGENT_WORKFLOW.md §4).
--
-- Существующие отклики с текстом не трогаются и продолжают отображаться.
--
-- Порядок внутри миграции важен: сначала снимается ограничение, потом
-- колонка делается необязательной. Наоборот PostgreSQL не пропустит —
-- CHECK на length(NULL) даёт NULL, что для CHECK означает «прошло», но
-- существующие строки при этом остаются проверяться.

BEGIN;

ALTER TABLE public.order_responses
  DROP CONSTRAINT IF EXISTS order_responses_message_check;

ALTER TABLE public.order_responses
  ALTER COLUMN message DROP NOT NULL;

-- Верхняя граница остаётся: это защита от вставки мегабайта текста, а не
-- продуктовое требование. Нижней нет — пустой отклик допустим.
ALTER TABLE public.order_responses
  ADD CONSTRAINT order_responses_message_length
  CHECK (message IS NULL OR length(message) <= 1000);

COMMENT ON COLUMN public.order_responses.message IS
  'Optional note from the responder. Was mandatory (10..1000) until 2026-09-01: the owner reduced a response to «ready» + price + lead time + contacts.';

DO $$
DECLARE
  v_notnull boolean;
  v_oldcheck boolean;
BEGIN
  SELECT attnotnull INTO v_notnull
    FROM pg_attribute
   WHERE attrelid = 'public.order_responses'::regclass
     AND attname = 'message';

  IF v_notnull THEN
    RAISE EXCEPTION 'response_message_still_required'
      USING DETAIL = 'order_responses.message is still NOT NULL.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.order_responses'::regclass
       AND conname = 'order_responses_message_check'
  ) INTO v_oldcheck;

  IF v_oldcheck THEN
    RAISE EXCEPTION 'response_message_min_length_still_enforced'
      USING DETAIL = 'The 10-character minimum is still in place.';
  END IF;

  RAISE NOTICE 'Отклик больше не требует текста; верхняя граница 1000 сохранена.';
END
$$;

COMMIT;
