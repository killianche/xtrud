-- 0118_app_secrets.sql
--
-- Защищённое хранилище серверных секретов для edge functions (2026-06-05).
--
-- Зачем: edge-функция send-reset-email шлёт письмо сброса пароля через
-- интернет-API Unisender Go (SMTP между зарубежным Supabase и российским
-- Unisender не работает — таймаут). Для вызова API нужен API-ключ Unisender.
-- Класть ключ в код/репозиторий нельзя, а Supabase-секреты функций мы через
-- доступные инструменты задать не можем — поэтому держим ключ здесь.
--
-- Безопасность: RLS включён, политик НЕТ → ни anon, ни authenticated прочитать
-- не могут. Читает только service_role (он обходит RLS) — внутри edge-функции.
-- Дополнительно явный revoke для пущей надёжности.

create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
-- Никаких policy: для anon/authenticated select/insert/update/delete запрещены.

revoke all on public.app_secrets from anon, authenticated;

comment on table public.app_secrets is
  'Серверные секреты для edge functions. Читается ТОЛЬКО service_role (RLS deny-all для остальных). Значения здесь не коммитятся в git — вносятся вручную через execute_sql.';
