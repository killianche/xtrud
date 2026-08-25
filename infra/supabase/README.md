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
- `.supabase-commit` и `.supabase-docker-tree` — exact Git commit и tree
  каталога `docker/`; tag сам по себе не считается immutable pin;
- `.cli-version` — точная стабильная версия Supabase CLI для dump/restore;
- `.postgres-image` — immutable `tag@sha256` образ PostgreSQL для узкого
  provider-ledger export и raw-clone rehearsal;
- `image-digests.json` — exact `tag@sha256` всех runtime images отдельно для
  `linux/amd64` и `linux/arm64`;
- `docker-compose.rehearsal.yml` — статически проверяемый overlay exact-stack:
  все images берутся из digest-pinned env, Envoy публикуется только на loopback,
  host ports Supavisor полностью удалены, а asymmetric JWT/JWKS variables
  включены без мутации exact upstream compose;
- `rehearsal.env.example` — arm64 rehearsal values/template с `.test` URL и
  placeholders вместо секретов; для amd64 refs берутся из `image-digests.json`;
- `upstream-v0.8.0.env.names` — полный список обязательных имён upstream env;
- `.env.example` — проверяемый names-only values contract без секретов;
- `Caddyfile.example` — fail-closed TLS proxy с allowlist публичного API;
- `docs/SUPABASE_BEGET_MIGRATION.md` — gates, acceptance, cutover и rollback.
- `docs/RESTORE_ORCHESTRATION_CONTRACT.md` — обязательная state machine,
  evidence и adversarial gates для двух clean restore.

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
сервере и архивируется вместе с upstream commit SHA, docker tree, image digests
и config fingerprint. Rehearsal overlay в Git привязан только к этому snapshot:
`self-hosted/v0.8.0`, commit `241bb11c0627f2981746d37033f57dbfa81d29b0`,
docker tree `1077f34b29998b93ec5c6ffd942e5e0feea6d72d`. Внешний Beget S3 не
считается настроенным, пока отдельный reviewed overlay и итоговый
`docker compose config` не докажут передачу endpoint/credentials в Storage API.

Rendered Compose сам по себе не доказывает, из какого upstream source
он получен. Поэтому source binding — отдельный fail-closed gate: tag,
commit, `docker/` tree и upstream metadata в `image-digests.json` должны
совпасть до любого render/pull/start. Прохождение image/port validator
не заменяет эту проверку.

В production Envoy host-port должен быть `127.0.0.1:8000`, а не
`0.0.0.0:8000`; isolated rehearsal использует `127.0.0.1:18000`. Caddy
публикует только Auth/REST/Realtime/Storage/Functions/GraphQL prefixes; Studio,
pg-meta, analytics и новые неизвестные upstream routes закрыты по умолчанию.

## Exact-stack rehearsal contract

Минимальная версия Docker Compose — **2.24.4**. Overlay использует официальный
`!override`, чтобы базовый Envoy port не остался вторым публичным binding, и
`!reset`, чтобы полностью удалить оба host ports Supavisor. Более старый Compose
не является допустимым fallback.

1. Получи upstream Git commit из `.supabase-commit` и fail-closed сравни
   `git rev-parse HEAD`, `git describe --exact-match --tags HEAD` и
   `git rev-parse HEAD:docker` с тремя tracked pins.
2. Работай с точной копией upstream `docker/`, не с веткой `master` и не с
   отдельно скачанным mutable `docker-compose.yml`.
   `scripts/supabase/prepare-exact-rehearsal.sh` делает fail-closed sparse
   checkout во внешний `/private/tmp/xtrud-exact-stack.<id>` и сверяет оба pin.
3. Помести `docker-compose.rehearsal.yml` рядом с upstream compose, скопируй
   `rehearsal.env.example` во внешний mode-0600 `.env.rehearsal`, замени все
   placeholders свежими rehearsal-only значениями.
4. Для arm64 оставь template refs; для amd64 атомарно замени все 11 refs на
   `images.*.amd64` из `image-digests.json` и выставь `XTRUD_TARGET_ARCH=amd64`.
5. До запуска проверь только безопасные поля итоговой модели. Полный вывод
   `docker compose config` запрещён: он содержит раскрытые secrets.

```bash
docker compose version --short # должно быть >= 2.24.4
docker compose --env-file .env.rehearsal \
  -f docker-compose.yml -f docker-compose.rehearsal.yml config --images
docker compose --env-file .env.rehearsal \
  -f docker-compose.yml -f docker-compose.rehearsal.yml config --services
```

`config --images` должен вернуть только 11 refs с `@sha256:` выбранной
архитектуры. В итоговой модели единственный host binding — Envoy
`127.0.0.1:<XTRUD_REHEARSAL_API_PORT>:8000/tcp`; Supavisor, Studio и pg-meta не
имеют host ports. В rendered environment должны присутствовать
`GOTRUE_JWT_KEYS`, `API_JWT_JWKS`, `JWT_JWKS` и `SUPABASE_JWKS`; секретные
значения в лог не выводятся. Фактический запуск, restore и smoke являются
отдельным gate: наличие этих tracked файлов его не закрывает.

Rendered validator принимает только модель, связанную с уже проверенным exact
snapshot: copied rehearsal overlay обязан byte-match tracked overlay. Bind
mounts разрешены только из `snapshot/stack`, а host namespaces, root user,
`cap_add`, devices и отключение security profiles запрещены.

Для четырёх текущих Edge Functions нужен `FUNCTIONS_VERIFY_JWT=false`:
`register-user` и `send-reset-email` — публичные anonymous flows,
`notify` проверяет `x-notify-secret`, `send-sms` — Standard Webhooks
signature. Gateway-wide JWT не заменяет эти route-specific controls. Перед
любым rollout обязателен отдельный negative-auth QA каждого маршрута;
один общий health check этот gate не закрывает.

Production overlay в Git сейчас отсутствует. Поэтому запуск
`check-runtime-env.mjs --mode production` **запрещён** и не закрывает
никакой release gate. Сначала нужны versioned reviewed production overlay,
отдельный production validator и redacted rendered-config assertions.

Versioned restore orchestration ещё не реализован. Это **P1 / NO-GO**
для runtime restore, full-stack rehearsal и production cutover: ручная
последовательность команд из runbook не считается воспроизводимым
restore tool.

## Локальные gates

```bash
node scripts/supabase/check-env-contract.mjs
npm run supabase:backup-safety:test
npm run supabase:rehearsal-contract:test
bash -n scripts/supabase/prepare-exact-rehearsal.sh
# На подготовленном snapshot до render/pull/start:
node scripts/supabase/check-upstream-snapshot.mjs \
  --snapshot /private/tmp/xtrud-exact-stack.manual-check
# После создания private mode-0600 runtime env вне Git:
node scripts/supabase/check-runtime-env.mjs \
  --env /absolute/private/runtime.env --mode rehearsal --arch arm64
# Rendered JSON содержит secrets: mode 0600, не печатать, удалить сразу после:
node scripts/supabase/check-rendered-rehearsal.mjs \
  --config /absolute/private/rendered-compose.json \
  --snapshot /private/tmp/xtrud-exact-stack.manual-check --arch arm64
bash -n scripts/supabase/collect-db-inventory.sh \
  scripts/supabase/create-encrypted-cloud-backup.sh \
  scripts/supabase/verify-encrypted-cloud-backup.sh \
  scripts/supabase/lib/secure-artifact.sh
# После restore на disposable target:
psql --file scripts/supabase/validate-restored-foreign-keys.sql "$TARGET_DB_URL"
```

Inventory и logical dump требуют абсолютный output вне Git, `umask 077` и
явное шифрование age/GPG. Plaintext inventory вообще не создаётся; dump-файлы
существуют только в приватном transient staging и удаляются EXIT trap. Запуск
против Cloud всё равно является внешней операцией и требует отдельного
разрешения, short-lived credential и утверждённого backup window. Wrapper
отказывается работать с другой CLI-версией или mutable PostgreSQL image.
Итоговый bundle содержит официальные `roles/schema/data`, project migration
ledger и forensic-only provider schemas/ledgers. Последние нельзя применять
поверх готового self-hosted stack без отдельного full-stack rehearsal. Verifier
fail-closed принимает только полный format-v1 bundle, сверяет exact entries и
каждый SHA-256. Внутренние Storage vector tables исключены по актуальному
официальному backup runbook.

## Required external gates

1. Новый отдельный Beget VPS не меньше 4 vCPU / 8 GiB / 100 GiB.
2. Отдельные Beget S3 buckets/credentials для app objects и backups.
3. Read-only inventory и encrypted dump Cloud.
4. Versioned restore orchestration, два clean rehearsal restore и route-specific
   negative-auth QA всех четырёх Functions.
5. Переходный iOS release на `https://api.xtrud.pro`.
6. Final maintenance window и cutover только после всех acceptance checks.
7. Реализованный WAL/PITR pipeline с alerting и успешным point-in-time restore;
   одного nightly logical dump для RPO 15 минут недостаточно.
