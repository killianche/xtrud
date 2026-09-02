-- Настоящие открытые задания для ленты «Актуальные задания».
--
-- Публикуются ОТ АККАУНТА ВЛАДЕЛЬЦА, а не от выдуманных пользователей: это его
-- собственные задачи, и лента показывает настоящие строки таблицы orders, а не
-- подставные примеры. Интерфейс не утверждает того, чего нет в данных
-- (.claude/rules/design-quality.md §5).
--
-- Зачем нужно: на 2026-09-01 в базе не было ни одного открытого задания —
-- 17 истёкших, 11 завершённых, 4 отменённых. Блок на главной был пуст, и
-- увидеть, как выглядит лента, было нельзя.
--
-- Запуск:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < scripts/supabase/seed-showcase-orders.sql
--
-- Повторный запуск создаёт дубликаты: скрипт намеренно без ON CONFLICT, потому
-- что у заданий нет естественного ключа, а тихое «уже есть» скрыло бы ошибку.

BEGIN;
-- Задания публикуются от аккаунта владельца: это его тестовые задачи,
-- а не выдуманные пользователи. Так лента показывает настоящие строки.
SELECT id AS owner_id FROM public.users WHERE is_admin LIMIT 1 \gset

INSERT INTO public.orders
  (client_id, l2_id, title, description, city_id, district, urgency,
   budget_kind, budget_value, executor_type, contact_mode, status, created_at)
VALUES
  (:'owner_id','plumbing','Заменить смеситель на кухне',
   'Старый смеситель подтекает у основания. Новый уже куплен, нужен мастер со своим инструментом. Квартира на третьем этаже, лифт есть.',
   'nazran','Центральный','this_week','up_to',2500,'solo','phone_open','open', now() - interval '2 hours'),

  (:'owner_id','electrical','Повесить люстру и заменить два выключателя',
   'Люстра пятирожковая, потолок бетонный. Заодно поменять выключатели в коридоре и спальне на новые — они уже есть.',
   'magas',NULL,'this_week','up_to',3000,'solo','phone_open','open', now() - interval '5 hours'),

  (:'owner_id','furniture','Собрать кухонный гарнитур',
   'Гарнитур 3,2 метра, привезли в упаковке, инструкция есть. Нужна аккуратная сборка и навеска верхних шкафов.',
   'karabulak',NULL,'this_month','from',8000,'any','phone_open','open', now() - interval '1 day'),

  (:'owner_id','cleaning-post-renovation','Уборка после ремонта, двухкомнатная',
   'Закончили ремонт, нужна полная уборка: вымыть окна, убрать строительную пыль, отмыть плитку и сантехнику. Площадь около 60 квадратов.',
   'nazran','Насыр-Кортский','flexible','negotiable',NULL,'any','phone_open','open', now() - interval '1 day 4 hours'),

  (:'owner_id','doors','Установить межкомнатную дверь',
   'Одна дверь с коробкой и наличниками, проём готов. Старую дверь нужно снять и вынести.',
   'sunzha',NULL,'this_week','up_to',4000,'solo','phone_open','open', now() - interval '2 days'),

  (:'owner_id','climate','Промыть систему отопления в частном доме',
   'Дом одноэтажный, семь радиаторов. Батареи греют неравномерно, нижние секции холодные. Нужна промывка и проверка давления.',
   'malgobek',NULL,'this_month','negotiable',NULL,'any','phone_open','open', now() - interval '3 days');

SELECT count(*) AS открытых_заданий FROM public.orders WHERE status='open';
COMMIT;
