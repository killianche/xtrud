-- 0183 — журнал админских действий принимает те действия, которые реально есть.
--
-- ЗАЧЕМ (FACT, 2026-09-09). Ограничение admin_actions_action_check разрешало
-- десять значений, но функции админки пишут другие. Каждая такая функция
-- падала на записи в журнал, а вместе с ней откатывалось и само действие:
--
--   admin_review_verification   → verification_approve / verification_reject
--   admin_set_master_visibility → master_show / master_hide
--   admin_hide_order            → hide_order
--
-- Проверка: за всё время в журнале лежит ровно одно действие — «warn», то
-- есть единственное, чьё значение попало в список. Подтвердить паспорт,
-- скрыть специалиста из каталога и скрыть задание было нельзя ни разу: в
-- базе ноль подтверждённых специалистов и заявка, висящая с момента подачи.
--
-- Ограничение оставляем белым списком: оно ловит опечатку в названии
-- действия, а такой список — часть контракта админки, а не формальность.

BEGIN;

ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (
  action = ANY (ARRAY[
    -- санкции к людям
    'warn', 'suspend', 'unsuspend', 'ban', 'unban',
    -- модерация содержимого
    'hide', 'unhide', 'hide_order',
    -- жалобы
    'dismiss_report', 'resolve_report',
    -- доступ к закрытым файлам
    'issue_signed_url',
    -- подтверждение личности
    'verification_approve', 'verification_reject',
    -- видимость специалиста в каталоге
    'master_show', 'master_hide'
  ])
);

COMMENT ON CONSTRAINT admin_actions_action_check ON public.admin_actions IS
  'Белый список действий админки. Добавляя действие в функцию, добавь его сюда: иначе функция молча откатится вместе с записью в журнал.';

COMMIT;
