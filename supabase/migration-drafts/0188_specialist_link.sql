-- 0188 — ссылка специалиста: соцсеть или сайт с работами.
--
-- ЗАЧЕМ. Владелец (2026-09-10) просил показывать в профиле мастера
-- «контактные данные — номер телефона, ссылки какие-то»; в модели были
-- только телефон и WhatsApp. DECISION владельца (2026-09-11): «всё, что
-- оставлял невыполненным, тоже выполни».
--
-- Одна ссылка, по желанию. Отдельная колонка, а не параметр
-- set_specialist_contacts: старые сборки зовут эту функцию с тремя
-- параметрами и затирали бы ссылку при каждом сохранении контактов.
-- Проверка формата — в базе: только http(s), хост с точкой, без пробелов,
-- до 300 символов. Это чужой текст, открывается во внешнем браузере.

BEGIN;

ALTER TABLE public.master_profiles
  ADD COLUMN IF NOT EXISTS link_url text;

ALTER TABLE public.master_profiles
  DROP CONSTRAINT IF EXISTS master_profiles_link_url_format;
ALTER TABLE public.master_profiles
  ADD CONSTRAINT master_profiles_link_url_format CHECK (
    link_url IS NULL
    OR (
      length(link_url) <= 300
      AND link_url ~* '^https?://[^[:space:]/?#]+\.[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
    )
  );

COMMENT ON COLUMN public.master_profiles.link_url IS
  'Соцсеть или сайт специалиста (по желанию). Только http(s).';

-- Читать — как остальные публичные поля профиля (у anon права по колонкам,
-- у authenticated — на таблицу). Писать — только своё (RLS update_own).
GRANT SELECT (link_url) ON public.master_profiles TO anon;
GRANT UPDATE (link_url) ON public.master_profiles TO authenticated;

COMMIT;
