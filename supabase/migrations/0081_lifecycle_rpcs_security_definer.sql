-- Migration 0081 — перевод lifecycle RPC на SECURITY DEFINER.
--
-- Bug. User feedback (2026-05-16) — клик «Прекратить сотрудничество» на
-- /orders/[id] валится с ошибкой `permission denied for function notify_user`.
--
-- Root cause. `notify_user` имеет REVOKE EXECUTE ... FROM authenticated
-- (миграция 0018) — это правильно, потому что она должна вызываться только
-- из триггеров (SECURITY DEFINER) и SECURITY DEFINER RPC, а не напрямую
-- клиентом (иначе авторизованный пользователь мог бы спамить push
-- любому user_id).
--
-- Но все lifecycle RPC в 0074 + terminate_cooperation в 0077 объявлены
-- SECURITY INVOKER → действуют от имени вызывающего authenticated юзера →
-- внутренний `PERFORM notify_user(...)` падает с permission denied.
--
-- Это касается ВСЕХ 6 функций (только terminate_cooperation замечен user'ом,
-- остальные ещё не были вызваны вживую):
--   - withdraw_response
--   - mark_order_done
--   - confirm_completion
--   - open_dispute
--   - reopen_order
--   - terminate_cooperation
--
-- Fix. SECURITY DEFINER: функция работает от роли owner (postgres) — у неё
-- есть EXECUTE на notify_user, плюс bypass RLS на orders/order_responses.
-- Это безопасно потому что каждая RPC внутри сама проверяет:
--   1. auth.uid() != NULL (отказ анонимам)
--   2. участие пользователя в заказе (client_id / picked_master_id / master_id)
--   3. валидный source-status для перехода
-- Т.е. SECURITY DEFINER не «открывает» функцию — он просто даёт ей доступ
-- к notify_user и убирает зависимость от RLS на таблицах (RLS они сами
-- реализуют через auth.uid() checks).
--
-- ALTER FUNCTION ... SECURITY DEFINER не меняет тело функции, GRANT/REVOKE
-- сохраняются. Безопасный nop в плане поведения, кроме нужного эффекта.

ALTER FUNCTION public.withdraw_response(uuid)        SECURITY DEFINER;
ALTER FUNCTION public.mark_order_done(uuid)          SECURITY DEFINER;
ALTER FUNCTION public.confirm_completion(uuid)       SECURITY DEFINER;
ALTER FUNCTION public.open_dispute(uuid, text)       SECURITY DEFINER;
ALTER FUNCTION public.reopen_order(uuid)             SECURITY DEFINER;
ALTER FUNCTION public.terminate_cooperation(uuid, text) SECURITY DEFINER;

COMMENT ON FUNCTION public.terminate_cooperation IS
  'Sprint 0077 + 0081: SECURITY DEFINER для доступа к notify_user. Обе стороны (client/picked_master) прекращают сотрудничество. Order in_progress/awaiting_confirmation → cancelled. Заменяет dispute-flow для типичных «работа не дошла до конца» случаев.';
