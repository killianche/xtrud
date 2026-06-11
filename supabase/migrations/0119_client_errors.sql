-- Журнал ошибок клиентского приложения (iOS/Android/web).
-- Зачем: в App Store-сборке не было видимости ошибок (Sentry без DSN неактивен).
-- Приложение пишет сюда каждую необработанную JS-ошибку (fatal и нет) — мы
-- читаем через SQL/дашборд и чиним по точному стеку, не дожидаясь жалоб.
-- Принцип: INSERT разрешён всем (anon + authenticated) — это write-only
-- «почтовый ящик»; SELECT/UPDATE/DELETE — никому (только service_role в обход RLS).
-- Применена в облако через MCP apply_migration 2026-06-11 (client_errors_log).

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- user_id опционален: ошибки бывают и у гостей. Не FK — чтобы запись
  -- не падала, если аккаунт удалён между ошибкой и вставкой.
  user_id uuid,
  platform text not null check (platform in ('ios','android','web')),
  app_version text,
  is_fatal boolean not null default false,
  message text not null check (char_length(message) <= 2000),
  stack text check (char_length(stack) <= 12000),
  context text check (char_length(context) <= 400)
);

create index client_errors_created_at_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Запись ошибок: разрешена всем ролям клиента (гость и залогиненный).
create policy client_errors_insert_any
  on public.client_errors
  for insert
  to anon, authenticated
  with check (true);

-- Чтения/изменения/удаления политик нет = запрещены (RLS deny-by-default).
-- service_role читает в обход RLS (для нас/админки).
