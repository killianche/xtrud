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

- На основе полученного PII-safe live inventory создать официальный encrypted
  roles/schema/data backup и выполнить успешный rehearsal restore.
- Live PII-safe inventory получен; переданный DB password сохранён в Keychain,
  но session pooler его отклоняет, пока владелец не применит уже открытую форму
  Dashboard password reset. После этого создать официальный encrypted
  roles/schema/data backup, выполнить restore rehearsal и снова ротировать
  пароль, поскольку первоначально он был передан через chat.
- Закрыть шесть promotion blockers отдельной forward-only security работой;
  только затем перенести проверенные drafts в новую последовательную migration
  chain и регенерировать `src/types/database.ts`.
- Подключить universal contracts к hooks/UI, закончить picker/feed/blocking/
  moderation и пройти E2E, web, iOS device и legacy iOS 1.0.1 compatibility QA.
- Создать отдельный Beget VPS/S3/DNS; текущий web VPS не использовать для
  self-hosted Supabase.
- Подтвердить юридические данные оператора, сроки хранения и правила для
  регулируемых категорий до публичного включения.
- Локальные commits созданы. Push, web deploy, Supabase migration, VPS cutover и
  store submission пока не выполнялись.
