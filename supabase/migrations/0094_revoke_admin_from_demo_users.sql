-- 0094 — P0-04 LAUNCH_READINESS: убрать is_admin=true с demo-пользователей.
-- Магомед (f0000002-...) был хардкодом помечен is_admin=true в миграции
-- 0030_admin_flag_and_policies.sql. Для прод-запуска demo не должны иметь
-- admin-прав (модерация очереди reports, видимость admin-only RLS).
--
-- Идемпотентно: WHERE is_demo = true.

UPDATE public.users
   SET is_admin = false
 WHERE is_demo = true
   AND is_admin = true;

COMMENT ON COLUMN public.users.is_admin IS
  'Sprint 0094: admin-флаг. Demo-пользователи (is_demo=true) НЕ должны иметь is_admin=true. Реальные администраторы выдаются вручную через Supabase Dashboard.';
