# Session summary — 2026-08-24

## TL;DR

Совет из бизнес-директора, директора разработки, дизайнера, разработчика, QA и
ревьюера подготовил и проверил локальный feature-off фундамент универсальной
доски. Локальная foundation получила GO; пользовательская функция и production
rollout остаются NO-GO до live backend, integration и platform gates.

## Закрытые задачи

1. **Совет качества** — закреплён обязательный порядок ролей и двусторонний
   go/no-go в `.claude/rules/agent-delegation.md`; добавлен отдельный
   `qa-engineer` adapter и автоматический governance check.
2. **Продуктовый контракт** — зафиксировано расширение существующих
   `orders/order_responses`, 10 пользовательских L1, unknown path, hidden
   fallback, matching, moderation, blocking и поэтапный rollout в
   `docs/UNIVERSAL_TASK_BOARD.md`.
3. **Backend foundation** — draft migrations `0120`–`0122` изолированы в
   `supabase/migration-drafts/`; runnable chain по-прежнему заканчивается 0119.
   Добавлены preflight/postflight fixtures и fail-closed promotion gate.
4. **Безопасный auth-return** — anonymous JIT signup удалён; обычный
   login/register возвращает только законного владельца к сохранённой форме без
   автоматической публикации.
5. **Изоляция черновика** — owner/session binding, TTL 14 дней, generation
   storage, UTF-8 byte chunks, serialized operations, one-shot guest claim и
   nonthrowing revoke закрывают cross-account/stale-draft сценарии.
6. **Universal client contracts** — добавлены payload mapper, location scope и
   stable tuple cursor, но они намеренно не подключены к live hooks до promotion
   backend drafts и регенерации типов.
7. **Регрессия навигации** — видимая Back-кнопка phone auth явно отзывает guest
   journey до `useSafeBack()`; system Back и успешный AuthGate `REPLACE` имеют
   разные проверенные семантики.
8. **Проверка** — `npm run quality:check` прошёл полностью: governance,
   migration integrity, 10 universal SQL fixture tests, security/release/legal,
   TypeScript, Biome, 13 test files / 107 tests, версии и 25 static assets.
   Cold production export прошёл с `demo-login=false`/`demo-data=false`.
   Независимые QA и code-review не нашли P0/P1 и дали Local foundation GO.
9. **Очистка диска** — после проверки удалены ignored/reproducible `ios/Pods`
   (410 МБ), `dist` (14 МБ) и `.expo` (32 КБ). Исходники, dirty worktree и
   `node_modules` сохранены; итоговый размер проекта около 756 МБ.
10. **Live Supabase Gate A** — Dashboard SQL Editor выполнил PII-safe read-only
    inventory. Результат зашифрован `age` в потоке, вынесен из Git и проверен
    обратной расшифровкой/JSON validation без plaintext artifact.
11. **Live map** — подтверждены PostgreSQL 17.6, 31 public tables, 95 functions
    (42 security-definer), 104 policies, 724 API grants, 138 migration ledger
    rows, 54 Auth users, 6 Storage buckets/7 objects, 1 Realtime table и 5 cron
    jobs. Обнаружены активные legacy lifecycle cron и отсутствие orders/
    order_responses в Realtime publication; production не менялся.
12. **Edge Function recovery** — deployed `notify` скачан из Dashboard code
    view и восстановлен byte-for-byte в `supabase/functions/notify/index.ts`;
    source SHA-256 совпал. Integrity baseline debt уменьшен с 22 до 21.
13. **Backup crypto** — установлен `age 1.3.1`, private recipient key создан
    mode 0600 вне Git. До полноценного backup нужна его офлайн-копия.
14. **Access hardening** — migration runbook уточняет break-glass DB credential,
    запрет вывода resolved compose secrets, полный secret denylist, least
    privilege и обязательную ротацию.
15. **Runtime contract** — попытка воспроизводимой установки на прежнем Node
    20.18.0 доказала несовместимость с React Native/Metro/Vite/Rolldown. Канон
    local/CI/EAS исправлен на 20.19.4; `npm ci`, quality gate, online audit и
    cold production export на нём прошли. Bundle собран без demo login/data.
16. **Git consolidation** — GitHub `main` read-only подтверждён на `f5cff28`,
    все локальные изменения сохранены в логических commits release-ветки без
    `.env.local`, backup, private keys, `dist`, Pods и `node_modules`.
17. **Beget inventory** — live VPS подтверждён как web-only: 2 CPU/2.9 GiB RAM,
    38 GiB диск, активный swap и пять чужих production Docker-контейнеров.
    Backend на этом хосте получил hard NO-GO; нужен отдельный Beget VPS + S3.
18. **GitHub + web release** — шесть проверенных commits fast-forward отправлены
    в `main`. На Beget создан timestamped web/Caddy backup, production export
    атомарно выложен; оба домена, legal/support/account-deletion/AASA и manifest
    прошли HTTP smoke, demo выключено. Исправлен ложный exit=1 cleanup trap после
    успешного swap и исключены macOS xattrs из deploy-архива.
19. **Local backup runtime** — установлен Colima 0.10.3 + Docker CLI 29.7.2,
    runtime проверен контейнером. Supabase CLI закреплён на стабильном 2.115.0 с
    опубликованным SHA-256; backup wrapper проверяет exact version и исключает
    внутренние Storage vector tables. Safety tests и quality gate проходят.
20. **Encrypted Cloud DB clone** — создан age-encrypted format-v1 bundle вне
    Git, проверен decrypt/checksum и восстановлен в чистый PostgreSQL 17.6.
    Row counts 63 таблиц и DDL inventory совпали. Provider schemas/ledgers
    классифицированы forensic-only: до full self-hosted stack smoke они не
    являются cutover-рецептом. Wrapper закрепляет CLI и image digest, не кладёт
    DB URL значением в Docker argv, а fail-closed verifier отвергает старые
    неполные архивы. Точный format-v1 artifact отдельно восстановлен с нуля:
    aggregate/DDL parity совпали, 76 FK не содержат orphan rows. Четыре старых
    artifact перенесены в private `superseded/`. Отдельный Storage ciphertext
    содержит все 6 buckets / 7 objects / 808 230 байт с per-object SHA-256;
    decrypt/size/hash verification прошёл, временный service-role удалён.
21. **Cloud access + Beget backup copy** — 2026-08-25 владелец явно закрепил
    выбранный Cloud DB password и запретил дальнейшую автоматическую ротацию;
    основная запись Keychain дважды прошла read-only session-pooler проверку,
    временный секрет удалён. DB и Storage ciphertext скопированы на текущий
    Beget VPS в mode `0600`, удалённые размеры и SHA-256 совпали с локальными.
    Копия off-machine, но не immutable/S3 и не снимает требование отдельного
    backend VPS/S3 перед cutover.
22. **Exact-stack static safety contract** — после независимого CTO/QA/security
    review закреплены upstream commit + docker tree и 11 multi-arch image
    digests. Rehearsal overlay оставляет только loopback Envoy, удаляет host
    ports Supavisor и подключает JWT/JWKS без изменения upstream compose.
    No-output gates проверяют private mode-0600 runtime env и rendered JSON:
    placeholders/defaults, JWT/key consistency, `.test` URLs, exact images и
    published ports. Реальный Compose 2.24.4 render для amd64/arm64 и 15 contract
    tests прошли. Containers/restore не запускались: Compose plugin отсутствует,
    после точечной очистки caches на Mac доступно около 14 GiB, а restore
    orchestration остаётся отдельным P1. Контрольный sparse bootstrap прошёл
    pre-copy и post-copy validator; временный snapshot после проверки удалён.

## Новые правила и решения

- Автор реализации не является единственным проверяющим — QA и code-review
  работают после разработки, а замечания возвращаются обоим директорам.
- Универсальное задание не создаёт вторую доменную сущность: расширяются только
  `orders` и `order_responses`.
- Непроверенный SQL не попадает в runnable migrations. Promotion возможен
  только после live inventory, backup, rehearsal restore и всех fail-closed
  assertions.
- Backend security migration, universal feature activation и Beget cutover —
  три отдельных production change с собственными gates и rollback.

## Новые компоненты / паттерны

- `PublishAuthSheet` (`src/features/auth/PublishAuthSheet.tsx`) — обычный
  login/register из формы задания без anonymous account и auto-publish.
- `order-draft-store` / `order-draft-policy` (`src/lib/`) — versioned,
  owner-isolated draft и явная lifecycle-policy auth journey.
- `auth-return` / `auth-return-url-store` (`src/features/auth`, `src/lib`) —
  allowlist, TTL и one-shot возврат вместо произвольного redirect URL.
- `universal-publish-contract` / `universal-feed-cursor`
  (`src/features/orders/`) — чистые backward-compatible helpers, которые нельзя
  подключать к live запросам до backend/type promotion.
- `supabase/migration-drafts/` — карантин для проверяемых forward-only SQL drafts,
  не альтернативная migration chain.

## Anti-patterns обнаруженные в сессии

- Любой `REPLACE` нельзя трактовать как пользовательский Back: AuthGate success
  и UI Back имеют разные cleanup-семантики.
- Нельзя хранить временные photo URI как устойчивую persistence: после
  cold/reload они недействительны и могут раскрыть чужой локальный путь.
- Нельзя восстанавливать draft без точного owner/session binding или claim по
  одному лишь наличию авторизации.
- Нельзя применять Git migration chain к production как доказанную истину без
  live schema/ledger snapshot и backup.
- Нельзя объявлять universal feature готовой по наличию SQL drafts и unit tests:
  feature-off foundation и пользовательский rollout — разные состояния.

## Открытые вопросы / TODO

- DB logical clone backup, raw PostgreSQL rehearsal и полный Storage blob export
  с checksums выполнены; отдельная ciphertext-копия с совпавшими SHA находится
  на текущем Beget VPS. Следом нужны именно immutable S3 copy и full exact
  self-hosted stack rehearsal на отдельном Beget VPS/S3.
- Cloud DB password подтверждён владельцем, проверен и сохранён в основной
  записи Keychain. Не выполнять новую автоматическую ротацию без отдельной
  явной команды владельца.
- Exact-stack static contract готов, но runtime rehearsal не начинать до
  освобождения минимум 30–40 GiB, установки Compose >=2.24.4 и review
  versioned restore orchestration. Нужны два clean restore, QA Auth/REST/RLS/
  Storage/Realtime/Functions и только затем Beget VPS/S3 gate.
- Закрыть шесть promotion blockers отдельной forward-only security работой;
  только затем перенести проверенные drafts в новую последовательную migration
  chain и регенерировать `src/types/database.ts`.
- Подключить universal contracts к hooks/UI, закончить picker/feed/blocking/
  moderation и пройти E2E, web, iOS device и legacy iOS 1.0.1 compatibility QA.
- Создать отдельный Beget VPS/S3/DNS; текущий web VPS не использовать для
  self-hosted Supabase.
- Подтвердить юридические данные оператора, сроки хранения и правила для
  регулируемых категорий до публичного включения.
- GitHub push и web deploy выполнены. Supabase migration, backend VPS cutover и
  store submission не выполнялись.
