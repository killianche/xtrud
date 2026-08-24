# xtrud self-hosted Supabase

Этот каталог хранит только проектный deployment contract. Production secrets,
dumps, S3/rclone config, Docker volumes и generated upstream files сюда не
попадают.

## Почему compose не написан вручную

Supabase — связанный набор Postgres/Auth/PostgREST/Realtime/Storage/Edge
Runtime/Envoy/Studio/Supavisor. Самодельный compose легко смешивает несовместимые
версии. На target копируется **полный официальный snapshot**, закреплённый в
`.supabase-version`, затем поверх него применяется проверенный production env и
S3 config.

Обновление snapshot — отдельная операция: официальный changelog, backup,
rehearsal restore, smoke и только затем production.

## Файлы

- `.supabase-version` — единая закреплённая версия upstream stack;
- `.cli-version` — точная стабильная версия Supabase CLI для dump/restore;
- `upstream-v0.8.0.env.names` — полный список обязательных имён upstream env;
- `.env.example` — проверяемый names-only values contract без секретов;
- `Caddyfile.example` — fail-closed TLS proxy с allowlist публичного API;
- `docs/SUPABASE_BEGET_MIGRATION.md` — gates, acceptance, cutover и rollback.

## Target layout

```text
/opt/xtrud-supabase/
  upstream/          # exact official snapshot
  .env               # root-readable, not Git
  volumes/           # runtime state, not source
  functions.env      # provider secrets, not Git

/opt/xtrud-backups/
  staging/           # encrypted temporary backup material
  manifests/         # counts/checksums, no secrets
```

`docker-compose.yml` production-копии хранится как exact upstream snapshot на
сервере и архивируется вместе с upstream commit SHA, image digests и config
fingerprint. После первого успешного rehearsal допустимо добавить проверенный
overlay в Git; до проверки писать его по памяти запрещено. В частности, внешний
Beget S3 не считается настроенным, пока overlay и итоговый `docker compose
config` не докажут передачу endpoint/credentials в Storage API.

Envoy host-port должен быть `127.0.0.1:8000`, а не `0.0.0.0:8000`. Caddy
публикует только Auth/REST/Realtime/Storage/Functions/GraphQL prefixes; Studio,
pg-meta, analytics и новые неизвестные upstream routes закрыты по умолчанию.

## Локальные gates

```bash
node scripts/supabase/check-env-contract.mjs
node --test scripts/supabase/backup-safety.test.mjs
bash -n scripts/supabase/collect-db-inventory.sh \
  scripts/supabase/create-encrypted-cloud-backup.sh \
  scripts/supabase/lib/secure-artifact.sh
```

Inventory и logical dump требуют абсолютный output вне Git, `umask 077` и
явное шифрование age/GPG. Plaintext inventory вообще не создаётся; dump-файлы
существуют только в приватном transient staging и удаляются EXIT trap. Запуск
против Cloud всё равно является внешней операцией и требует отдельного
разрешения, short-lived credential и утверждённого backup window. Wrapper
отказывается работать с другой CLI-версией и исключает внутренние Storage vector
tables по актуальному официальному backup runbook.

## Required external gates

1. Новый отдельный Beget VPS не меньше 4 vCPU / 8 GiB / 100 GiB.
2. Отдельные Beget S3 buckets/credentials для app objects и backups.
3. Read-only inventory и encrypted dump Cloud.
4. Rehearsal restore и восстановление отсутствующей функции `notify`.
5. Переходный iOS release на `https://api.xtrud.pro`.
6. Final maintenance window и cutover только после всех acceptance checks.
7. Реализованный WAL/PITR pipeline с alerting и успешным point-in-time restore;
   одного nightly logical dump для RPO 15 минут недостаточно.
