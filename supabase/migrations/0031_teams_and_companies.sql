-- Migration 0031 — Бригады и компании.
-- Sprint I.6 + I.7. Расширяем master_profiles + новая таблица teams для членов.
--
-- Модель:
--   master_profiles.account_type ∈ ('solo', 'brigade', 'company') — тип аккаунта.
--   master_profiles.legal_name / inn / ogrn — для компаний.
--   teams (id, owner_id, name, created_at) — бригада/компания, лидер = owner_id.
--   team_members (team_id, user_id, role enum, joined_at) — состав.
--
-- Owner всегда член своей команды с role='owner'. Можно добавить master'ов.

CREATE TYPE public.master_account_type AS ENUM ('solo', 'brigade', 'company');

ALTER TABLE public.master_profiles
  ADD COLUMN IF NOT EXISTS account_type public.master_account_type NOT NULL DEFAULT 'solo',
  ADD COLUMN IF NOT EXISTS legal_name text CHECK (legal_name IS NULL OR length(legal_name) <= 200),
  ADD COLUMN IF NOT EXISTS ogrn text CHECK (ogrn IS NULL OR length(ogrn) BETWEEN 13 AND 15);

COMMENT ON COLUMN public.master_profiles.account_type IS
  'Sprint 31: тип аккаунта мастера. solo (одиночка, default), brigade (бригада), company (юр. лицо).';

CREATE TYPE public.team_member_role AS ENUM ('owner', 'member');

CREATE TABLE public.teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX teams_owner_id_idx ON public.teams (owner_id);

CREATE TRIGGER teams_set_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.team_members (
  team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role       public.team_member_role NOT NULL DEFAULT 'member',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX team_members_user_id_idx ON public.team_members (user_id);

-- RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- teams SELECT: публично читаемо для всех (как master_profiles)
CREATE POLICY teams_read_all ON public.teams
  FOR SELECT USING (true);

-- teams INSERT: владелец = текущий юзер
CREATE POLICY teams_insert_own ON public.teams
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = owner_id);

-- teams UPDATE/DELETE: только owner
CREATE POLICY teams_update_owner ON public.teams
  FOR UPDATE USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY teams_delete_owner ON public.teams
  FOR DELETE USING ((SELECT auth.uid()) = owner_id);

-- team_members SELECT: публично
CREATE POLICY team_members_read_all ON public.team_members
  FOR SELECT USING (true);

-- team_members INSERT: только owner команды может добавлять,
-- ИЛИ юзер сам себя (для leave — DELETE policy)
CREATE POLICY team_members_insert_owner ON public.team_members
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IN (SELECT owner_id FROM public.teams WHERE id = team_id)
  );

-- team_members DELETE: owner может всех, member может сам себя
CREATE POLICY team_members_delete_owner_or_self ON public.team_members
  FOR DELETE USING (
    (SELECT auth.uid()) IN (SELECT owner_id FROM public.teams WHERE id = team_id)
    OR (SELECT auth.uid()) = user_id
  );

-- ============================================================================
-- Trigger: при INSERT teams автоматом добавляем owner'а в team_members с role=owner
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_team_add_owner_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_team_add_owner_as_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_team_add_owner_as_member() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_team_add_owner_as_member() FROM authenticated;

CREATE TRIGGER teams_after_insert_add_owner
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.trg_team_add_owner_as_member();

-- Демо: главный test-master получает компанию для preview
UPDATE public.master_profiles
  SET account_type = 'company',
      legal_name = 'ИП Тестов М.А.',
      inn = '060100123456'
  WHERE user_id = 'f0000002-0000-0000-0000-000000000002';
