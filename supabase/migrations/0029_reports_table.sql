-- Migration 0029 — антифрод: жалобы на пользователей / заказы / отзывы / сообщения.
--
-- Sprint I.4. Любой authenticated юзер может пожаловаться. Админы (см. Sprint
-- I.5) — модерируют. Пока админ-RLS = пустой; админский список ещё не введён.
-- В I.5 добавим колонку users.is_admin и policy для админов.

CREATE TYPE public.report_target_type AS ENUM ('user', 'order', 'review', 'message');

CREATE TYPE public.report_reason AS ENUM (
  'spam',                  -- спам, мусорные сообщения
  'fraud',                 -- мошенничество, обман
  'inappropriate',         -- непристойное / оскорбительное содержание
  'fake_profile',          -- фейковый профиль / самозванец
  'fake_review',           -- накрученный отзыв
  'off_platform',          -- предлагает работать вне платформы
  'safety',                -- угроза безопасности
  'other'
);

CREATE TYPE public.report_status AS ENUM (
  'pending',
  'reviewed',     -- админ посмотрел, решает
  'resolved',     -- меры приняты (бан/скрытие)
  'dismissed'     -- жалоба отклонена
);

CREATE TABLE public.reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type   public.report_target_type NOT NULL,
  target_id     uuid NOT NULL, -- сознательно НЕ FK: target может быть message/review/order/user,
                               -- проверяем в админ-UI; CASCADE по типам пишем для конкретных таблиц вручную.
  reason        public.report_reason NOT NULL,
  description   text CHECK (description IS NULL OR length(description) BETWEEN 0 AND 2000),
  status        public.report_status NOT NULL DEFAULT 'pending',

  reviewed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  admin_note    text CHECK (admin_note IS NULL OR length(admin_note) <= 2000),

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reports_reporter_not_self_user CHECK (
    target_type != 'user' OR reporter_id != target_id
  )
);

COMMENT ON TABLE public.reports IS
  'Sprint 29: жалобы на пользователей/заказы/отзывы/сообщения. Модерация в Sprint 30 (админка).';

CREATE INDEX reports_status_idx ON public.reports (status, created_at DESC);
CREATE INDEX reports_target_idx ON public.reports (target_type, target_id, created_at DESC);
CREATE INDEX reports_reporter_idx ON public.reports (reporter_id, created_at DESC);

CREATE TRIGGER reports_set_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- INSERT: только сам репортёр (auth.uid() = reporter_id)
CREATE POLICY reports_insert_own ON public.reports
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = reporter_id);

-- SELECT: репортёр видит свои жалобы. Админ-policy добавим в Sprint I.5.
CREATE POLICY reports_select_own ON public.reports
  FOR SELECT USING ((SELECT auth.uid()) = reporter_id);

-- UPDATE / DELETE: только админы (через Sprint I.5).
-- Пока — никто не может, что соответствует контракту.
