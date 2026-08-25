# Перенос xtrud: Supabase Cloud → Beget

> Статус на 2026-08-25: проверенные DB и Storage ciphertext вынесены на текущий
> Beget web VPS как off-machine copy; новый backend VPS, S3 и DNS ещё не
> созданы. Production Cloud DB password подтверждён владельцем и проверен через
> session pooler. Любой dump содержит персональные данные и секреты, поэтому
> хранится только зашифрованно вне Git.

## 1. Решение

Переносим официальный self-hosted Supabase Docker целиком на **новый отдельный
VPS Beget**, а объекты Supabase Storage — в **Beget S3**. Существующий VPS
`62.113.106.30` остаётся web-сервером.

```text
Пользователь
  ├─ https://xtrud.pro              -> текущий Beget VPS / Caddy / web static
  └─ https://api.xtrud.pro          -> новый Beget VPS / Caddy
                                         └─ официальный Supabase Docker stack
                                              ├─ Envoy API gateway
                                              ├─ Auth / PostgREST / Realtime
                                              ├─ Edge Runtime
                                              ├─ PostgreSQL
                                              └─ Storage API -> Beget S3

Отдельный Beget S3 bucket
  └─ зашифрованные backups и restore manifests
```

Почему не текущий VPS: аудит показал 2 CPU, 2.9 GiB RAM, диск 38 GiB с 78%
занятости, активный swap и несколько чужих по отношению к xtrud сервисов. Даже
официальный минимум Supabase выше по RAM, а общий failure domain создаст риск
одновременной потери сайта и backend.

## 2. Целевая конфигурация

### Новый VPS Beget

- Ubuntu 24.04 LTS, российская площадка;
- предпочтительно 6 vCPU / 12 GiB RAM / 150 GiB NVMe;
- допустимый нижний порог для запуска: 4 vCPU / 8 GiB RAM / 100 GiB NVMe;
- отдельный non-root sudo-пользователь, Docker Engine + Compose plugin;
- наружу только TCP 22, 80, 443;
- PostgreSQL, Studio, Docker socket и внутренние сервисы не публикуются;
- Studio доступна только через SSH tunnel/VPN;
- SSH только по ключу; после проверки второй сессией отключены password auth и
  прямой root login, TCP 22 ограничен allowlist операторов, где это возможно;
- gateway привязан на host к `127.0.0.1:8000`; UFW дополнен правилами
  `DOCKER-USER`, потому что опубликованные Docker ports могут обходить UFW;
- Docker images закреплены единым upstream snapshot, указанным в
  `infra/supabase/.supabase-version`.

### Storage и backup

- отдельный bucket Beget S3 для application objects;
- отдельный bucket и отдельные credentials для backups;
- versioning/lifecycle включаются в кабинете Beget;
- private bucket `master-verifications` проверяется отдельно: в нём паспортные
  фото и селфи;
- nightly encrypted logical backup + WAL/PITR pipeline;
- restore-test на пустую инсталляцию не реже одного раза в квартал.

Рабочие цели: RPO не более 15 минут, RTO не более 2 часов. Пока WAL/PITR и
успешный restore-test не подтверждены, backend не считается production-ready.

На текущем этапе WAL/PITR **не реализован**. До Gate B нужно выбрать и закрепить
конкретный инструмент (например WAL-G), его version/checksum и конфигурацию:

- `archive_mode`/`archive_command`, base-backup schedule и `restore_command`;
- отдельные минимальные S3 credentials только для backup bucket;
- versioning/retention/immutability и шифрование;
- alerts на `pg_stat_archiver.failed_count`, возраст последнего WAL/base backup,
  S3 errors и свободный диск;
- point-in-time restore на третью изолированную инсталляцию с замером RPO/RTO.

Nightly logical dump сам по себе не обеспечивает RPO 15 минут.

Промежуточная копия 2026-08-25 хранится на текущем web VPS в
`/var/backups/xtrud/supabase-cloud/`: DB и Storage ciphertext имеют права `0600`,
а удалённые размеры и SHA-256 совпадают с локальными. Это защищает от потери
одного Mac, но не является immutable backup и не устраняет общий failure domain
web-сервера. Закрывать S3/versioning/PITR gate этой копией запрещено.

## 3. Что переносится

| Module | Фактический объём |
|---|---|
| PostgreSQL/PostgREST | 31 public-таблица, view, RPC/functions, RLS, triggers, enums, FTS |
| Auth | email/password, вход по телефону через RPC, recovery, anonymous JIT/demo |
| Storage | `avatars`, `portfolio`, `category-covers`, `order-photos`, private `master-verifications`, dormant `chat-images` |
| Realtime | `orders`, `order_responses`, `notifications` — подтвердить live publication |
| Edge Functions | `register-user`, `send-reset-email`, dormant `send-sms`, отсутствующая в Git `notify` |
| Extensions | `pgcrypto`, `pg_trgm`, `pg_net`, `pg_cron`, Vault |
| Background | expire orders, availability/ranking; legacy lifecycle jobs не включать автоматически |

Локальные 128 migration-файлов не являются полным backup production. Есть
повторные номера, comment-only файлы, prod-only объекты и прямые записи в
`auth.*`. Канонический источник миграции — read-only logical dump live-базы, а
Git после сверки должен получить недостающие forward-only определения.

## 4. Непереносимые автоматически части

Официальный DB dump не переносит:

- байты Storage;
- исходники и конфиг Edge Functions;
- JWT/API keys, Vault/Function secrets;
- Auth settings, redirect allowlist и SMTP;
- DNS, TLS, firewall, monitoring и backup policy.

Отдельно должны быть восстановлены:

1. исходник deployed-функции `notify`;
2. `notify_secret`, Unisender key и остальные secrets через защищённый канал;
3. Realtime publication и allowlist cron jobs;
4. абсолютные Storage URL в данных;
5. пользовательские сессии — они станут недействительными с новыми JWT keys.

## 5. iOS и запрет split-brain

Опубликованная iOS 1.0.1 содержит
`https://wgeimsajvjkzrrnfrnkb.supabase.co` внутри binary. Web можно переключить
сразу, установленное приложение — нельзя. OTA contract в `app.json` сейчас не
настроен, поэтому миграция требует новой версии App Store.

### Если реальных пользователей, кроме тестовых, нет

1. Подготовить и проверить новый backend.
2. Выпустить iOS со стабильным `https://api.xtrud.pro` и экраном обязательного
   обновления для будущих breaking changes.
3. Объявить maintenance window.
4. Остановить записи в Cloud, сделать final dump и Storage delta.
5. Переключить web/DNS и открыть новый backend.
6. Старая iOS остаётся в maintenance/ошибке до обновления; два backend не
   принимают параллельные записи.

### Если реальные пользователи есть

1. Сначала выпустить переходную iOS-версию.
2. Дождаться согласованной доли обновлений и подготовить minimum-version gate.
3. Только затем заморозить Cloud writes и выполнять final cutover.
4. Нельзя разрешать старым и новым версиям писать в разные базы: это создаёт
   конфликт аккаунтов, заказов, откликов и фото.

## 6. Последовательность миграции

### Gate A — инвентаризация Cloud, только чтение

Снять и зафиксировать без вывода секретов:

- версии Postgres и extensions;
- schema, policies, grants, functions и triggers;
- row counts ключевых таблиц;
- `pg_publication_tables`, `cron.job`;
- buckets, object count и total bytes;
- Auth settings, redirect URLs и password policy;
- список deployed Functions, verify-JWT mode и только имена secrets;
- исходник `notify`.

Локальные safety-gates перед любым доступом:

```bash
node scripts/supabase/check-env-contract.mjs
npm run supabase:backup-safety:test
bash -n scripts/supabase/collect-db-inventory.sh \
  scripts/supabase/create-encrypted-cloud-backup.sh \
  scripts/supabase/verify-encrypted-cloud-backup.sh \
  scripts/supabase/lib/secure-artifact.sh
```

Read-only inventory сохраняется сразу в ciphertext. Значения URL/recipient нужно
загрузить из локального secret store, не вводить как inline assignment в shell
history:

```bash
scripts/supabase/collect-db-inventory.sh /absolute/path/outside/repo/inventory
```

По умолчанию row counts — estimates без полных scans. Точные counts разрешены
только в согласованное окно: добавить `--exact-counts` перед output path.

Полный encrypted logical bundle создаёт один wrapper:

```bash
scripts/supabase/create-encrypted-cloud-backup.sh \
  /absolute/path/outside/repo/backups
```

Оба wrapper требуют `BACKUP_ENCRYPTION=age|gpg` и `BACKUP_RECIPIENT`, абсолютный
output вне repo и `umask 077`; plaintext final artifact не создаётся. Dump SQL
живёт только в private transient staging под EXIT trap, затем tar stream сразу
шифруется. Формат v1 содержит `roles.sql`, `schema.sql`, `data.sql`, project
`migration-data.sql`, forensic `system-schema.sql` и два provider ledger в
`provider-ledger-data.sql`, а также manifest с exact entries, tool/image pins и
SHA-256. Проверка перед использованием:

```bash
BACKUP_IDENTITY=/absolute/private/age-key \
  scripts/supabase/verify-encrypted-cloud-backup.sh \
  /absolute/archive.tar.age
```

Raw `pg_dump` вместо Supabase CLI для обычных dumps не использовать:
официальный инструмент фильтрует platform internals и зарезервированные роли.
Единственное узкое исключение wrapper — data-only export двух provider-owned
ledger tables (`auth.schema_migrations`, `storage.migrations`) через immutable
Supabase PostgreSQL image, потому что CLI намеренно их исключает. Эти ledgers
forensic-only и не разрешены к применению поверх готового self-hosted stack.
Ограничение:
Supabase CLI получает привилегированный DB URL через `--db-url`; wrapper не
может доказать, что credential краткоживущий, а аргумент может быть виден
локальным process observers. Это break-glass операция только на доверенном
single-user host: без shell tracing/общего process access, в утверждённое окно,
с немедленной сменой project DB password или отзывом временной роли после
проверки архива.

CLI закреплён в `infra/supabase/.cli-version`, PostgreSQL image — immutable
`tag@sha256` в `infra/supabase/.postgres-image`; wrapper fail-closed проверяет
оба pin и исключает `storage.buckets_vectors` и `storage.vector_indexes`, как
требует текущий официальный backup runbook. Старые архивы без format-v1 manifest
и полного набора из семи entries verifier отвергает.

**Acceptance:** есть зашифрованный immutable архив, inventory manifest и
контрольные counts; секреты/PII не попали в Git, terminal log или chat.

### Gate B — изолированный target

1. Поднять официальный pinned Docker snapshot без public DNS.
2. Сгенерировать новые Postgres/JWT/API/Realtime/Storage/Dashboard secrets.
3. Сверить полный upstream env names-contract командой
   `node scripts/supabase/check-env-contract.mjs`; сгенерировать ключи штатными
   upstream utilities, а не вручную.
4. Проверить `docker compose config`: Envoy опубликован только как
   `127.0.0.1:8000:8000`, Postgres/Studio не имеют public host ports. Полный
   вывод содержит подставленные secrets: не писать его в chat/CI/manifest;
   сохранять только redacted assertions и SHA-256 fingerprint.
5. Применить fail-closed `infra/supabase/Caddyfile.example` и с внешнего host
   доказать, что разрешённые API prefixes доступны, а Studio/metadata — 404.
6. Настроить firewall, S3 и системный monitoring.
7. До отключения root/password SSH создать non-root sudo user, установить ключ,
   проверить отдельную вторую сессию и сохранить provider-console break-glass.
8. Проверить `pg_available_extensions` и конкретные версии.
9. Запретить cron/outbound `pg_net` до окончания restore.
10. Реализовать WAL/PITR и восстановить backup target на третью пустую
    инсталляцию.

**Acceptance:** health checks зелёные, Postgres/Studio не доступны из Интернета,
S3 private/public semantics работают, `docker compose config` и external deny
checks сохранены в manifest без secrets, PITR restore-test успешен в пределах
RPO/RTO.

### Gate C — два разных restore-контракта

`system-schema.sql` и `provider-ledger-data.sql` — снимок Cloud provider-owned
схем для forensic/raw PostgreSQL clone. Результат уже был проверен на disposable
PostgreSQL 17.6 с полным row-count и DDL parity, но это **не** доказательство
совместимости GoTrue, Storage API, Realtime и остальных сервисов target stack.
Поэтому эти два файла нельзя применять в cutover поверх официально поднятого
self-hosted Supabase. Для повторного raw-clone rehearsal нужен отдельный
versioned restore tool и redacted verification manifest; до их появления ручной
raw-clone не является release gate.

Кандидат для восстановления в уже инициализированный exact self-hosted stack —
только platform-filtered project contract:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$TARGET_DB_URL"
```

`migration-data.sql` применяется отдельным проверенным шагом только после
сверки project migration ledger target; его нельзя смешивать с provider-owned
ledger. Если target Auth/Storage service migrations отличаются, cutover
останавливается, а не «чинится» переносом Cloud ledgers.

Сначала расшифровать архив в mode-0700 staging на disposable target, проверить
SHA-256 из manifest и выполнять только там. Plaintext удалить сразу после
rehearsal; не переносить его в Git, chat, shell log или общий backup каталог.

После загрузки data обязательно отдельно проверить все FK, потому что
`session_replication_role=replica` временно обходил constraint triggers:

```bash
psql --dbname "$TARGET_DB_URL" \
  --file scripts/supabase/validate-restored-foreign-keys.sql
```

До запуска отдельно доказать, что target Postgres major совместим, а restore
role имеет право создать требуемые роли и выполнить
`SET session_replication_role = replica`. Команда выше — rehearsal recipe, а не
гарантия совместимости с ещё не созданным target. Ошибки исправляются
документированными forward-only patches, а не ручной правкой production.

**Acceptance:** полный exact self-hosted stack стартует после restore; login,
recovery, public/private Storage, Realtime и service migrations проходят smoke;
counts, FK/orphan checks, constraints, RLS и критичные RPC совпадают; повторный
restore с нуля воспроизводим и сохраняет redacted verification manifest.

### Gate D — Storage

1. Создать те же buckets, limits, MIME rules и policies.
2. Сначала подготовить и проверить внешний-S3 compose overlay. Переменные Beget
   endpoint/access key не считаются подключёнными, пока итоговый `docker compose
   config` не показывает их именно в Storage API.
3. На пустом bucket проверить Beget S3: SigV4, region, path-style/virtual-host
   addressing, CORS, multipart/TUS, presigned URL, MIME/size limits и delete.
4. Копировать через S3 API/rclone, не напрямую в Docker volume.
5. Сравнить count/bytes каждого bucket и выборочные checksums.
6. Сделать отдельный private read test для `master-verifications`; его
   credentials не использовать для backup bucket.
7. Транзакционно переписать только URL старого Supabase Storage origin в:
   `users.avatar_url`, `portfolio_items.url`, `orders.photo_urls` и найденных
   `cover_url`. Внешние CDN URL не менять.

**Acceptance:** проверенный overlay и его config fingerprint сохранены, bucket
credentials разделены, upload/read/delete public objects и private signed access
работают, counts/bytes совпадают, в данных не осталось нужных приложению URL
старого origin.

**Cloud source evidence 2026-08-25:** отдельный age-encrypted Storage artifact
содержит 6 buckets, 7 objects и 808 230 байт; manifest хранит per-object paths,
sizes и SHA-256 только внутри ciphertext. Decrypt/exact-entry/size/hash проверка
прошла, plaintext и временный service-role удалены. Это закрывает source backup,
но не target S3/API smoke и не offsite immutable-copy gate.

### Gate E — Auth, Functions и background

- настроить `SITE_URL`, `API_EXTERNAL_URL`, redirect allowlist и recovery;
- включить anonymous users только если JIT/demo остаётся;
- развернуть `register-user`, `send-reset-email` и восстановленный `notify`;
- dormant `send-sms` не включать без продуктового решения;
- закрепить Deno dependencies, убрать runtime-зависимость от случайной
  доступности `esm.sh`;
- заменить hardcoded cloud URL в `notify_user`;
- пересоздать secrets, Unisender key ротировать;
- явно восстановить Realtime publication;
- включить только `nightly_expire_orders`, availability/ranking jobs после
  проверки; legacy auto-confirm/cancel lifecycle jobs оставить выключенными.

**Acceptance:** регистрация, login email/phone, recovery, Realtime и ручной
вызов разрешённых jobs прошли; старый cloud hostname отсутствует в runtime SQL.

### Gate F — end-to-end rehearsal

Проверить на web и реальном iPhone:

- регистрация и повторный вход;
- recovery email + PKCE;
- client order → master response → client contact;
- reports/reviews;
- загрузку/чтение/удаление каждого класса файлов;
- private verification access;
- три Realtime subscription;
- logout/relogin после смены JWT;
- backup age/alert и полный restore-test.

### Gate G — production cutover

1. Заранее снизить DNS TTL.
2. Выпустить совместимую iOS-версию.
3. В maintenance window закрыть Cloud для новых записей.
4. Сделать final DB dump и Storage delta.
5. Восстановить target, повторить counts/checksums/smoke.
6. Сделать target backup до открытия записей.
7. Переключить `api.xtrud.pro`, web env и активировать новую iOS.
8. Включить разрешённые Functions/cron только после смены URL/secrets.
9. Потребовать повторный вход.
10. Наблюдать error rate, API/Auth/Storage/Realtime, DB locks/WAL/disk и backups.

## 7. Rollback

- До открытия target для записей Cloud остаётся source of truth; DNS можно
  вернуть назад без потери данных.
- После первой записи в target простой DNS rollback **запрещён**: он потеряет
  новые регистрации, заказы, отклики и файлы.
- После открытия записей основной путь — roll forward. Возврат в Cloud требует
  обратного DB/Storage delta и разрешения конфликтов Auth.
- Cloud-проект не удалять и не менять в течение согласованного rollback window.
- В final archive сохранить encrypted dumps, Storage manifest/checksums, counts,
  версии images и конфигурационный fingerprint без значений secrets.

## 8. Security и эксплуатация после переноса

- Alerts: API/Auth/Storage uptime, CPU/RAM/disk, DB connections/locks/WAL,
  backup age/result, S3 errors, SMTP/recovery errors.
- Disk warning 80%, alarm 90%.
- Secrets вне Git, отдельные credentials для app Storage и backup Storage.
- Обновление только whole pinned Supabase snapshot после backup и rehearsal.
- Ежедневный backup не считается рабочим без регулярного restore-test.
- В restore manifest фиксируются upstream tag + commit SHA, image digests,
  `docker compose config` fingerprint, Postgres major и tool versions.
- SSH hardening считается завершённым только после подтверждённой второй key-only
  сессии; provider console остаётся break-glass каналом.
- Self-hosting не отменяет внешний transfer персональных данных: Unisender,
  SMS.ru, Expo/APNs/FCM, Sentry и `esm.sh` документируются отдельно.
- До cutover закрыть подтверждённые P0 RLS/ACL риски из `PROJECT_OPERATIONS.md`.

## 9. Что нужно от владельца

Для продолжения внешней части нужны:

1. новый VPS Beget указанной конфигурации или разрешение создать/оплатить его;
2. два Beget S3 bucket и отдельные service credentials;
3. доступ к DNS зоны `xtrud.pro`;
4. санкционированный доступ для операций только чтения: project-scoped
   Read-Only role, если тариф её поддерживает; иначе владелец использует
   локальную Dashboard-сессию. Полный официальный dump обычно требует
   привилегированный project DB credential и выполняется отдельно как
   одноразовая break-glass операция с немедленной ротацией;
5. ответ, есть ли сейчас реальные iOS-пользователи помимо владельца и тестовых
   аккаунтов — от этого зависит порядок App Store transition.

Нельзя присылать в сообщение или сохранять в Git: пароль/PAT Supabase, project
DB URL/password, `service_role`/secret API keys, JWT private material, SSH
private key/root password, S3/DNS tokens, SMTP/Unisender/Function/Vault secrets,
backup passphrase/private key, dumps, PII-логи, `rclone.conf` и полный вывод
`docker compose config`. Они вводятся через локальный secret store или
mode-0600/root-owned env на целевом сервере.

Least privilege обязателен: VPS получает отдельного non-root sudo-user; DNS
token ограничен зоной `xtrud.pro`; application и backup S3 используют разные
bucket-scoped credentials; restore-reader не имеет Delete; migration-copy key
временный; inventory-role имеет `default_transaction_read_only=on` и не читает
значения Vault. Временные DB/PAT/S3/DNS/SSH credentials отзываются после сверки.

## 10. Официальные источники

- [Supabase self-hosting overview](https://supabase.com/docs/guides/self-hosting)
- [Docker installation and requirements](https://supabase.com/docs/guides/self-hosting/docker)
- [Restore Cloud project to self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Copy Storage through S3 API](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3)
- [Self-hosted S3 configuration](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
- [Self-hosted Edge Functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)
