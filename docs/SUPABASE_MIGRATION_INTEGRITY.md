# Supabase migration integrity gate

## TL;DR

`node scripts/supabase/check-migration-integrity.mjs` — обязательная статическая
проверка перед добавлением или изменением `supabase/migrations/**` и
`supabase/functions/**`.

Gate не исправляет историю и не подключается к production. Он допускает только
точно зафиксированный исторический baseline и падает на новом, изменённом или
уже устранённом исключении.

## Когда применять

- перед review любой миграции или Edge Function;
- перед merge ветки, затрагивающей `supabase/**`;
- перед clean restore/rehearsal;
- после восстановления отсутствующего SQL или исходника функции.

Gate не заменяет live schema export, backup, restore-test, RLS review и
сравнение с `supabase_migrations.schema_migrations`.

## Что проверяется

1. Повторяющиеся числовые префиксы migration-файлов.
2. Пустые и comment-only `.sql`.
3. URL конкретного `*.supabase.co` project внутри миграций.
4. Plaintext Vault secrets, `crypt('literal', ...)`, secret/JWT-подобные
   литералы и `INSERT ... app_secrets`.
5. Отсутствующий `supabase/functions/<name>/index.ts` для функций, на которые
   ссылаются SQL endpoint или клиентский `supabase.functions.invoke(...)`.
6. Полный SHA-256 каждого migration-файла: новый файл без регистрации, удаление,
   переименование или изменение истории блокирует gate независимо от того,
   создаёт ли новый текст статическую находку.

Secret/password values никогда не попадают в отчёт: для точного fingerprint
используется сокращённый SHA-256.

## Текущий baseline

Источник истины: `supabase/migration-integrity-baseline.json`.

На 2026-08-23 зафиксировано 22 существующих finding:

- 9 повторных migration numbers;
- 6 comment-only миграций;
- 3 hardcoded Cloud project URL;
- 1 plaintext Vault secret;
- 2 plaintext demo password literals;
- 1 отсутствующий исходник Edge Function `notify`.

Baseline также содержит `migrationHistory` с точным хэшем всех 128 исторических
файлов. Allowlist не означает, что риск принят или исправлен. Каждая запись содержит
конкретный fingerprint, обоснование сохранения и план устранения. Wildcard или
исключение целого правила не поддерживаются.

## Команды

Основной gate:

```bash
node scripts/supabase/check-migration-integrity.mjs
```

Машиночитаемый результат:

```bash
node scripts/supabase/check-migration-integrity.mjs --json
```

Redacted scan без применения baseline нужен только для review находок:

```bash
node scripts/supabase/check-migration-integrity.mjs --scan-only --json
```

Тесты gate:

```bash
node --test scripts/supabase/check-migration-integrity.test.mjs
```

## Как менять baseline

1. Для новой forward-only миграции после review добавить её путь и полный
   SHA-256 в `migrationHistory`. Для существующей истории хэш не обновлять:
   applied-файл неизменяем.
2. Запустить основной gate и убедиться, что finding действительно новый или
   существующий действительно устранён.
3. Проверить миграцию глазами и подтвердить, что production не менялся.
4. Для нового временного исключения вручную добавить точный fingerprint,
   `rule`, `justification` и `remediation`. Оба текста должны быть содержательнее
   30 символов.
5. Повторить gate и тесты.
6. Не удалять stale allowlist автоматически: stale означает, что долг изменился
   или устранён, и это требует review.

Нельзя обновлять baseline только ради зелёного CI. Для исправления prod-only
расхождений сначала нужны live read-only export, backup и rehearsal, затем новая
forward-only миграция. Исторические applied-файлы не переписываются.

## Безопасный live inventory

`scripts/supabase/db-inventory.sql` выполняется в одной транзакции
`REPEATABLE READ READ ONLY` и выводит только:

- версию Postgres и extensions;
- имена public tables/views/functions и counts;
- policy/grant metadata без выражений и function bodies;
- migration identifiers без SQL statements;
- aggregate Auth/Storage counts без PII и object paths;
- Realtime publication;
- cron names/schedule/active без command и connection fields;
- только имена Vault secrets и ключи `app_secrets`, без значений.

Wrapper требует сохранять отчёт по абсолютному пути вне репозитория, создаёт
файл с mode `0600`, печатает SHA-256 и не передаёт DB URL через argv:

```bash
SUPABASE_DB_URL="$READ_ONLY_DATABASE_URL" \
  scripts/supabase/collect-db-inventory.sh \
  /absolute/path/outside/xtrud/inventory
```

Использовать short-lived read-only database role. Wrapper намеренно подавляет
raw connection errors, потому что драйверы иногда включают connection string в
диагностику. При ошибке он не сохраняет partial report.

Inventory не получает Auth Dashboard settings, deployed Edge Function source,
function verify/auth mode, Function secrets, Storage bytes или DNS/TLS config.
Это отдельные read-only шаги runbook `docs/SUPABASE_BEGET_MIGRATION.md`.

## Подключение к CI

Gate уже подключён к `package.json`, `npm run quality:check` и GitHub Actions:

```bash
node scripts/supabase/check-migration-integrity.mjs
```

`--scan-only` в CI использовать нельзя: он показывает findings, но намеренно не
проверяет allowlist.
