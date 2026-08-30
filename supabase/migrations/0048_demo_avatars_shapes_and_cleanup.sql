-- 1. Аватары: avataaars → shapes (DiceBear). Сохраняем seed (последний сегмент URL'а).
--    Правило: используем только shapes (https://www.dicebear.com/styles/shapes/),
--    avataaars/personas/micah запрещены — выглядит «детским placeholder» и ломает
--    Vercel-эстетику. См. CLAUDE.md «АВАТАРЫ — ТОЛЬКО DiceBear shapes».
UPDATE public.users
SET avatar_url = regexp_replace(avatar_url, '/9\.x/avataaars/(png|svg)\?', '/9.x/shapes/png?')
WHERE avatar_url LIKE '%/avataaars/%';

-- 2. Заказы: убираем префикс 'demo: ' из title — был артефактом частичного seed'а.
UPDATE public.orders
SET title = regexp_replace(title, '^demo: ?', '', 'i')
WHERE title ILIKE 'demo:%';

-- 3. Свежее непрочитанное от Магомеда Алине по «Поклеить обои» — чтобы у клиента
--    стало 2 видимых unread-чата (Бекхан уже есть). Идемпотентность: проверяем
--    что такого текста ещё нет.
INSERT INTO public.messages (id, chat_id, sender_id, text, created_at)
SELECT
  gen_random_uuid(),
  '7f4d4993-e8bf-4ea4-b07b-8034f469ce25',
  'f0000002-0000-0000-0000-000000000002',
  'Добрый день! Закончил с первой стеной — пришлю фото в течение часа. Если что-то не нравится — переделаю.',
  now() - interval '15 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM public.messages
  WHERE chat_id = '7f4d4993-e8bf-4ea4-b07b-8034f469ce25'
    AND text LIKE 'Добрый день! Закончил с первой стеной%'
);

UPDATE public.chats
SET last_message_at = now() - interval '15 minutes',
    last_read_client_at = now() - interval '2 days'
WHERE id = '7f4d4993-e8bf-4ea4-b07b-8034f469ce25';
