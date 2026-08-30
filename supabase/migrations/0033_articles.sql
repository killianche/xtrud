-- Migration 0033 — Раздел «Полезное»: статьи / контент-маркетинг.
--
-- Sprint I.9. PROJECT_MAP §5.16. Контент пишут админы / партнёры.
-- Простая модель: title + slug + cover_url + body (markdown) + l1_id (опц
-- категория). Опубликованные статьи видны всем.

CREATE TYPE public.article_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE public.articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) BETWEEN 2 AND 100),
  title        text NOT NULL CHECK (length(title) BETWEEN 5 AND 200),
  excerpt      text CHECK (excerpt IS NULL OR length(excerpt) <= 500),
  body_md      text NOT NULL CHECK (length(body_md) BETWEEN 50 AND 50000),
  cover_url    text,
  category_l1_id text REFERENCES public.categories_l1(id) ON DELETE SET NULL,
  author_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status       public.article_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.articles IS
  'Sprint 33: контент раздела «Полезное». Markdown в body_md.';

CREATE INDEX articles_published_idx
  ON public.articles (published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE INDEX articles_l1_idx
  ON public.articles (category_l1_id, published_at DESC)
  WHERE status = 'published' AND category_l1_id IS NOT NULL;

CREATE TRIGGER articles_set_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- SELECT: published — все, draft/archived — только админ
CREATE POLICY articles_read_published ON public.articles
  FOR SELECT USING (status = 'published' OR public.is_current_user_admin());

-- INSERT/UPDATE/DELETE: только админ
CREATE POLICY articles_insert_admin ON public.articles
  FOR INSERT WITH CHECK (public.is_current_user_admin());

CREATE POLICY articles_update_admin ON public.articles
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

CREATE POLICY articles_delete_admin ON public.articles
  FOR DELETE USING (public.is_current_user_admin());

-- ============================================================================
-- Seed: пара статей для preview (контент админа = главный test-master)
-- ============================================================================

INSERT INTO public.articles (
  slug, title, excerpt, body_md, cover_url,
  category_l1_id, author_id, status, published_at
) VALUES (
  'kak-vybrat-mastera',
  'Как выбрать мастера: 7 правил',
  'Несколько простых принципов, которые помогут не нарваться на халтурщика и сэкономить нервы.',
  E'# Как выбрать мастера\n\nКаждый из нас рано или поздно сталкивается с задачей выбрать исполнителя — для ремонта, машины, праздника. Вот 7 правил.\n\n## 1. Смотрите портфолио\n\nФотографии работ — лучший индикатор. Если их нет — это уже плохой знак.\n\n## 2. Читайте отзывы\n\nОбращайте внимание не только на оценку, но и на детали комментариев. Если все отзывы одинаковые — возможно, накручены.\n\n## 3. Спрашивайте про материалы\n\nХороший мастер сразу скажет, какие материалы будет использовать, и сможет обосновать выбор.\n\n## 4. Не торопитесь с предоплатой\n\nПолную предоплату можно платить только проверенным. Для новых — 30-50% хватает.\n\n## 5. Фиксируйте сроки\n\nСогласуйте точные даты начала и завершения. Это дисциплинирует.\n\n## 6. Не экономьте на главном\n\nДешёвый мастер на сложной работе — почти всегда переделка через год.\n\n## 7. Доверяйте интуиции\n\nЕсли что-то «не то» уже при первом разговоре — лучше найти другого. Их много.',
  'https://picsum.photos/seed/xtrud-article-1/1200/800',
  'construction',
  'f0000002-0000-0000-0000-000000000002',
  'published',
  now() - interval '5 days'
), (
  'samozanyatost-v-ingushetii',
  'Самозанятость в Ингушетии: гайд для мастера',
  'Как открыть статус самозанятого за 10 минут, какие налоги платить и какие лимиты.',
  E'# Самозанятость для мастера\n\nЕсли вы регулярно зарабатываете на услугах — статус самозанятого экономит налоги и даёт легальность.\n\n## Как открыть\n\n1. Скачайте приложение «Мой налог»\n2. Зарегистрируйтесь по паспорту и СНИЛС\n3. Подтвердите регистрацию — занимает 10 минут\n\n## Налог\n\n- 4% при работе с физлицами\n- 6% при работе с юр.лицами\n- Лимит дохода: 2.4 млн ₽ в год\n\n## Плюсы\n\n- Не нужно ИП и кассу\n- Можно совмещать с основной работой\n- Чек выдаётся прямо из приложения\n\n## Минусы\n\n- Нет пенсионных отчислений (но можно платить вручную)\n- Лимит дохода ограничивает рост\n\n## Что дальше\n\nКогда вырастете больше 2.4 млн — пора открывать ИП. Это уже другой гайд.',
  'https://picsum.photos/seed/xtrud-article-2/1200/800',
  null,
  'f0000002-0000-0000-0000-000000000002',
  'published',
  now() - interval '2 days'
), (
  'kak-zachistit-vannu',
  'Как почистить ванну от налёта своими руками',
  'Простые рецепты с подручными средствами, которые реально работают.',
  E'# Чистка ванны\n\nИзвестковый налёт и ржавчина появляются в любой ванне. Не обязательно покупать дорогую химию.\n\n## Рецепт 1: лимонная кислота\n\n1. Возьмите 100 г лимонной кислоты\n2. Растворите в 1 литре тёплой воды\n3. Нанесите на стенки, оставьте на 30 минут\n4. Смойте\n\nПодходит для чугунных и стальных ванн.\n\n## Рецепт 2: сода + перекись\n\nДля акрила лучше мягкие средства:\n\n1. Смешайте соду и перекись водорода 1:1\n2. Нанесите пастой\n3. Через 15 минут смойте\n\n## Что НЕ делать\n\n- Не используйте абразивные порошки на акриле — поцарапаете\n- Не смешивайте хлор и кислоту — будет токсичный газ',
  'https://picsum.photos/seed/xtrud-article-3/1200/800',
  'home-services',
  'f0000002-0000-0000-0000-000000000002',
  'published',
  now() - interval '1 day'
);
