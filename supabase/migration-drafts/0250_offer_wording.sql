-- 0250: «отклик» → «предложение» в текстах, которые видит человек (№329, 2026-10-08).
--
-- Владелец, 2026-10-08: «вместо „откликнуться“ давай переименуем везде
-- „Предложить свои услуги“; отклики — предложения специалистов». Приложение,
-- админка и юридические тексты переименованы в коде; здесь — push и ошибки,
-- которые пишет сама база (10 функций). Меняются только строки в кавычках:
-- pg_get_functiondef → replace ровно одного вхождения → CREATE OR REPLACE
-- (права и владелец сохраняются). Логика функций не трогается. Старые
-- уведомления в таблице notifications не переписываются.
--
-- Откат: 0250_offer_wording_rollback.sql (обратные замены).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  r record;
  v_def text;
  v_cnt int;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0250_must_run_as_postgres';
  END IF;
  -- Тела функций — живые (md5 prosrc сверяется до замены).
  FOR r IN SELECT * FROM (VALUES
    ('xtrud_private.order_responses_require_category()', 'af80074f9b57e4329526e61ff301263f'),
    ('public.trg_notify_new_response()', 'f55275615d08d8ceda8482729515a095'),
    ('public.guard_content_author_active()', 'b7463030376205022f8ef52d590b7d63'),
    ('public.withdraw_response(uuid)', 'd94190970913f821356e7ea2519a347b'),
    ('public.trg_notify_response_rejected()', 'b013271bda82ca46b0c0a000036f822b'),
    ('public.submit_order_response(uuid,text,order_price_kind,integer,text,text,text,text)', '7c89e94538367d97ec44dc7e86e1574a'),
    ('public.pick_order_master(uuid,uuid)', '607edea538cb8062d5c84d489b0c5465'),
    ('public.guard_order_lifecycle_direct_update()', '0acbc17122f883405e66b2f57c5b285b'),
    ('public.archive_response(uuid,boolean)', '406f3bf065423977bdc79c5f4dd6f4f5'),
    ('xtrud_private.guard_order_response_counterparty_update()', 'f30e2e3e491a632f1ac65ff72682bbf3')
  ) AS t(sig, md5) LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = r.sig::regprocedure) IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '0250_function_changed: %', r.sig;
    END IF;
  END LOOP;
  -- Каждая замена — ожидаемое число вхождений (обычно одно).
  FOR r IN SELECT * FROM (VALUES
    ('xtrud_private.order_responses_require_category()', 'Откликаться на такие задания могут специалисты категории', 'Предлагать услуги в таких заданиях могут специалисты категории', 1),
    ('public.trg_notify_new_response()', '''Новый отклик на заказ''', '''Новое предложение по заданию''', 1),
    ('public.guard_content_author_active()', 'публикация, отклики и отзывы недоступны', 'публикация, предложения и отзывы недоступны', 1),
    ('public.withdraw_response(uuid)', 'На вашу заявку ещё откликнутся.', 'Другие специалисты ещё предложат свои услуги.', 1),
    ('public.trg_notify_response_rejected()', '''Отклик отклонён''', '''Предложение отклонено''', 1),
    ('public.submit_order_response(uuid,text,order_price_kind,integer,text,text,text,text)', 'Вы уже откликнулись на это задание. Отклик можно отозвать и отправить заново.', 'Вы уже предложили свои услуги в этом задании. Предложение можно отозвать и отправить заново.', 1),
    ('public.submit_order_response(uuid,text,order_price_kind,integer,text,text,text,text)', 'По вашему отклику уже принято решение, отправить новый нельзя.', 'По вашему предложению уже принято решение, отправить новое нельзя.', 1),
    ('public.pick_order_master(uuid,uuid)', 'Этот отклик уже неактуален. Обновите экран.', 'Это предложение уже неактуально. Обновите экран.', 1),
    ('public.guard_order_lifecycle_direct_update()', 'Исполнителя выбирают кнопкой в отклике.', 'Исполнителя выбирают кнопкой в предложении.', 1),
    ('public.archive_response(uuid,boolean)', 'Не указан отклик или действие.', 'Не указано предложение или действие.', 1),
    ('public.archive_response(uuid,boolean)', '''Отклик не найден.''', '''Предложение не найдено.''', 2),
    ('public.archive_response(uuid,boolean)', 'В архив можно убрать только отклик, по которому всё решено.', 'В архив можно убрать только предложение, по которому всё решено.', 1),
    ('xtrud_private.guard_order_response_counterparty_update()', 'Решение по отклику уже принято, изменить его нельзя.', 'Решение по предложению уже принято, изменить его нельзя.', 1),
    ('xtrud_private.guard_order_response_counterparty_update()', 'Отклик может изменить только его автор.', 'Предложение может изменить только его автор.', 1),
    ('xtrud_private.guard_order_response_counterparty_update()', 'Этот статус отклика так поменять нельзя.', 'Этот статус предложения так поменять нельзя.', 1)
  ) AS t(sig, old_text, new_text, expected) LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    v_cnt := (length(v_def) - length(replace(v_def, r.old_text, ''))) / length(r.old_text);
    IF v_cnt <> r.expected THEN
      RAISE EXCEPTION '0250_anchor: % (% вхождений): %', r.sig, v_cnt, r.old_text;
    END IF;
    EXECUTE replace(v_def, r.old_text, r.new_text);
  END LOOP;
END;
$$;

COMMIT;
