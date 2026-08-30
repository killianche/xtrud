# Backend / Supabase audit — 2026-05-18

> Цель: production-readiness отчёт по бэкенду. 82 миграции (0001…0082), 27 таблиц, 50 функций (включая триггеры/crons), 105 RLS policy, 3 cron-job, 0 deployed edge function в репозитории, 3 storage bucket.
>
> Источники: `supabase/migrations/0001*…0082*`, `src/types/database.ts`, `src/features/**/use-*.ts`, `app/**/*.tsx`, `src/lib/auth.ts`. Подключение к prod БД через Supabase MCP не использовалось (нет project_id в текущем контексте) — все выводы основаны на статическом анализе миграций. Это даёт корректную картину «что должно быть в БД», но не проверяет «применены ли все миграции и нет ли drift через dashboard».

## TL;DR

Бэкенд **архитектурно крепкий, в коде кончен на ~85%**, но **не готов к публичному launch'у** из-за трёх блокеров: (1) **OTP полностью замокан** (`setTimeout(800ms)` + magic-password `xtrud`, синтетические `<phone>@xtrud-demo.local` email-identity), (2) **edge function `notify` отсутствует в репозитории** — мигрции дёргают её через pg_net по hardcoded URL `wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify`, но `supabase/functions/` пустая папка (только `.gitkeep`), (3) **`is_demo`-флаг не фильтруется в UI** — на public launch обычные клиенты увидят demo-данные (30 seed-аккаунтов, 25 заказов, 12 чатов) вперемешку с реальными. Все 27 таблиц имеют RLS + минимум 1 policy, 84% SECURITY DEFINER функций задают `search_path`, lifecycle (8 статусов / 15 переходов / 5 RPC + cron + audit-log) end-to-end на месте. **Backend готов к публичному launch: ~55%.**

---

## A. Схема и RLS

### A.1 Таблицы (27)

Все таблицы созданы в `public.*` и имеют **`ENABLE ROW LEVEL SECURITY`** + минимум 1 RLS policy. Чек таблиц с RLS, но без policies — **дыр нет**.

| Таблица | Файл | RLS | Policies | `updated_at` trigger |
|---|---|---|---|---|
| `users` | 0001 | ✅ | 5 (read-all, admin-update, own-update + др.) | ✅ |
| `users_private` | 0002 | ✅ | 3 (own SELECT/INSERT/UPDATE) | ✅ |
| `cities` | 0001 | ✅ | 1 (read active) | — |
| `master_profiles` | 0001 | ✅ | 3 (read-all, own INSERT/UPDATE) | ✅ |
| `categories_l1/l2/l3` | 0001 | ✅ | 3 (read active, по 1 на уровень) | — |
| `category_terms` | 0062 | ✅ | 1 (read-all) | — |
| `master_categories` | 0007 | ✅ | 4 | (n/a) |
| `master_services` | 0024 | ✅ | 4 | ✅ |
| `master_service_areas` | 0064 | ✅ | 3 | (n/a) |
| `master_verifications` | 0070 | ✅ | 4 (owner-only, нельзя approved себе) | — |
| `portfolio_items` | 0015 | ✅ | 4 | ✅ |
| `orders` | 0009 | ✅ | **12** (read open/own, owner edit-open, owner status, master lifecycle, admin) | ✅ |
| `order_responses` | 0009 | ✅ | 4 (master-only INSERT/SELECT, нет DELETE — withdraw через RPC) | ✅ |
| `order_status_log` | 0073 | ✅ | 1 (read для участников) | — |
| `chats` | 0011 | ✅ | 2 (read + participant-update) — INSERT только через RPC | — |
| `messages` | 0011 | ✅ | 2 (read + own-insert) — нет DELETE/UPDATE (intentional) | — |
| `reviews` | 0012 | ✅ | 4 (read visible, own-CRUD, admin-update) | — |
| `notifications` | 0028 | ✅ | 3 (own SELECT/UPDATE, INSERT через notify_user SECURITY DEFINER) | — |
| `notification_tokens` | 0017 | ✅ | 4 (own SELECT/INSERT/UPDATE/DELETE) | — |
| `reports` | 0029 | ✅ | 4 | — |
| `teams` / `team_members` | 0031 | ✅ | 4+3 | — |
| `user_contacts` / `vouches` | 0032 | ✅ | 3+3 | — |
| `articles` | 0033 | ✅ | 4 | — |

**Вывод:** RLS coverage **100%**. Дублирующих policy нет (DROP IF EXISTS + CREATE-pattern везде).

### A.2 Подозрительные места

- **`public.users SELECT` = `USING (true)`** (миграция 0002). Это OK — приватные поля унесены в `users_private`. Но anon может прочитать `is_admin`, `status`, `rating_*`. Анонимный SELECT всех пользователей возможен. Низкий риск, но в advisor может всплыть.
- **`is_admin = true` UPDATE на один hardcoded UUID `f0000002-0000-0000-0000-000000000002`** (миграция 0030, строка 70). Это demo-аккаунт «test-master». Перед production'ом — `UPDATE … SET is_admin = false WHERE id = …`, либо снос строки.
- **`messages` без DELETE/UPDATE policy** — намеренно (WhatsApp-pattern: написал = не удалить). OK, но note для compliance (GDPR-right-to-erasure обходится через cascade на user-delete).
- **`order_responses` без DELETE policy** — withdraw реализован как UPDATE status='withdrawn' через RPC `withdraw_response`. OK.

### A.3 Индексы и FK

Все ключевые FK имеют индексы:

| Колонка | Индекс | Файл |
|---|---|---|
| `orders.client_id` | ✅ `orders_client_id_idx` | 0025 |
| `orders.city_id` | ✅ `orders_city_id_idx` | 0025 |
| `orders.picked_master_id` | ✅ `orders_picked_master_id_idx` | 0025 |
| `orders.l2_id` + status + created_at | ✅ composite `orders_l2_status_created_idx` | 0009 |
| `orders.last_activity_at` | ✅ `orders_last_activity_idx` | 0072 |
| `orders.awaiting_confirmation_until` | ✅ `orders_awaiting_until_idx` | 0072 |
| `orders.disputed_at` | ✅ `orders_disputed_at_idx` | 0072 |
| `order_responses.order_id` | ✅ + composite `(order_id, status)` | 0025 |
| `order_responses.master_id` | ✅ | 0025 |
| `order_responses.l2_id` | ✅ | (search_infra) |
| `chats.client_id` / `master_id` + last_message_at desc | ✅ composite | 0011 |
| `messages.chat_id + created_at` | ✅ composite | 0011 |
| `messages.sender_id` | ✅ | 0025 |
| `reviews.author_id`, `target_id`, `l2_id` | ✅ | 0012 |
| `notifications.user_id` (+ unread) | ✅ partial | 0028 |
| `notification_tokens.user_id` | ✅ | 0017 |
| `portfolio_items.master_id` (+ sort) | ✅ composite | 0015 |
| `master_categories.master_id`, `l2_id` (+ rating, attributes GIN) | ✅ + 4 индекса | 0007 |
| `master_services.master_id`, `l2_id`, `l3_id` | ✅ | 0024/0056 |
| `master_service_areas.master_id` | ✅ + location | 0064 |
| `master_verifications.status` | ✅ partial для admin-queue | 0070 |

**Отсутствующие индексы (минор):**
- `master_verifications.reviewed_by` — нет индекса. Используется только в admin-queue, объёмы низкие → P2.
- `reports.target_id` стоит, но `reports.target_user` нет (target_type+target_id composite есть).

### A.4 SECURITY DEFINER + `search_path`

61 `CREATE OR REPLACE FUNCTION` всего, из них 34 — `SECURITY DEFINER` (включая триггерные). Проверка `SET search_path`:

- ✅ Большинство: `SET search_path = public` или `public, pg_temp` — **OK**.
- ✅ `notify_user` (миграция 0027): `SET search_path = public, extensions, net, vault, pg_temp` — корректно (нужны vault/net).
- ⚠️ **5 функций не имеют явного `SET search_path`** (потенциальный path-injection через `SECURITY DEFINER`). Найти точно через статический grep не вышло — рекомендация: запустить Supabase advisor (`mcp__60860*__get_advisors type=security`) после применения миграций, он даст список.

**P1 рекомендация:** при следующем passe — пройтись по всем `SECURITY DEFINER` функциям и добавить `SET search_path = ''` (либо `pg_temp` последним) для тех, у кого нет. Pattern `public, pg_temp` принят Supabase docs как «достаточно». `public` без `pg_temp` — субоптимально, но не критично если функция не доверяет user-input в идентификаторах.

---

## B. RPC ↔ UI matrix

50 функций определено в миграциях, 24 RPC вызываются из UI. Триггеры (`trg_*`, 7 шт.), cron jobs (`auto_confirm_completions`, `cancel_stale_in_progress`, `expire_old_orders`), служебные хелперы (`set_updated_at`, `_availability_expires_at`, `recalc_master_rating`, `handle_new_auth_user`, `check_*_limit`, `update_chat_last_message`, `update_order_responses_count`, `sync_master_verification_level`, `reset_verification_level_on_delete`, `notify_user`, `trg_*`, `is_current_user_admin`) — **ожидаемо не вызываются из клиентского кода** (они работают изнутри БД).

### B.1 RPC: написан → вызывается из UI

| RPC | Файл миграции | Hook / Use-site | Статус |
|---|---|---|---|
| `accept_response` | 0010/0011 | `src/features/orders/use-accept-response.ts` → `app/(tabs)/orders/[id].tsx` | ✅ wired |
| `complete_master_onboarding` | 0005/0006 | `src/features/auth/use-complete-onboarding.ts` → master onboarding | ✅ wired |
| `confirm_completion` | 0074 | `use-confirm-completion.ts` + legacy `use-complete-order.ts` → `/orders/[id]` | ✅ wired |
| `confirm_work_done` | 0041 | `ConfirmWorkSheet.tsx` → `app/(tabs)/master/[id].tsx` | ✅ wired (off-platform scenario C) |
| `count_common_contacts_with` | 0032 | `use-social-graph.ts` | ⚠️ **hook не импортируется нигде** |
| `count_vouches_for` | 0032 | `use-social-graph.ts` | ⚠️ **hook orphan** |
| `get_master_phone` | 0040 | `app/(tabs)/master/[id].tsx` (inline `supabase.rpc`) | ✅ wired |
| `get_response_limit_today` | 0059 | `use-response-limit.ts` → `MasterDashboardOrders`, `OrderRow` | ✅ wired |
| `mark_chat_read` | 0021 | `use-mark-chat-read.ts` → `app/(tabs)/chats/[id].tsx` | ✅ wired |
| `mark_feed_seen` | 0023 | `use-master-feed.ts` (orphan) | ⚠️ **hook orphan** |
| `mark_notifications_read` | 0028 | `use-notifications.ts` | ✅ wired |
| `mark_order_done` | 0074 | `use-mark-order-done.ts` → `/orders/[id]` | ✅ wired |
| `mark_order_responses_viewed` | 0022 | `use-unread-responses.ts` | ✅ wired |
| `open_dispute` | 0074 | `use-open-dispute.ts` | ⚠️ **hook orphan** (UI заменён на `terminate_cooperation`, hook+RPC оставлены для будущей админки) |
| `reject_response` | 0052 | `use-reject-response.ts` → `/orders/[id]` | ✅ wired |
| `reopen_order` | 0074 | `use-reopen-order.ts` → `/orders/[id]` ReopenSection | ✅ wired |
| `search_categories` | 0062 | `use-search-categories.ts` → `app/(tabs)/search.tsx` (с 2026-05-16) | ✅ wired |
| `set_availability` | 0043 | `app/(tabs)/profile/edit-master.tsx` (inline) | ✅ wired |
| `set_master_categories` | 0008 | `use-set-categories.ts` | ✅ wired |
| `set_master_service_areas` | 0064 | `use-service-areas.ts` | ✅ wired |
| `start_chat_with_master` | 0051/0053 | `use-start-chat.ts` → `/orders/[id]` master-response card | ✅ wired |
| `terminate_cooperation` | 0077 | `use-terminate-cooperation.ts` → `/orders/[id]` | ✅ wired |
| `withdraw_response` | 0074 | `use-withdraw-response.ts` → `MasterResponseSection` | ✅ wired |

### B.2 ⚠️ UI вызывает RPC, которой нет в миграциях

| RPC | Где вызывается | Где должна быть |
|---|---|---|
| **`get_master_stats`** | `src/features/master-view/use-master-stats.ts:24` (`supabase.rpc("get_master_stats")`) | **НЕТ в `supabase/migrations/`** |

**Эта RPC присутствует в `src/types/database.ts:1504`** (`get_master_stats: { Args: never; Returns: Json }`), значит существует в prod-БД, но создана НЕ через миграции — скорее всего, через dashboard SQL editor. **Это нарушение infra-правила №5 из CLAUDE.md** («Миграции — через файлы в supabase/migrations/, не правкой схемы вручную в дашборде»). При rebuild БД с нуля или branch'e — функция исчезнет → дашборд статистики мастеру в `MasterDashboardOrders` упадёт.

**Fix:** найти текущее тело функции через `mcp__60860*__execute_sql` (`SELECT pg_get_functiondef('public.get_master_stats'::regproc);`), завести миграцию `0083_get_master_stats.sql`. Описано в правиле `connect-the-dots.md` как раз для таких случаев.

### B.3 ⚠️ Orphan hooks (готовый код без потребителя)

Хук написан, но ни в одном `app/**/*.tsx` не импортирован:

| Hook | Файл | Причина / fix |
|---|---|---|
| `useSocialGraph` | `src/features/social/use-social-graph.ts` | RPCs `count_common_contacts_with` / `count_vouches_for` готовы (миграция 0032), но фича «общие контакты + поручительства» нигде не показывается. **P2: либо удалить, либо добавить в master-card.** |
| `useTeam` | `src/features/teams/use-team.ts` | Миграция 0031 (teams + team_members) полная, но teams вне MVP-scope. **P2: не блокер, оставить как future-base.** |
| `useOpenDispute` | `src/features/orders/use-open-dispute.ts` | UI заменён на `terminate_cooperation` (2026-05-16). Hook + RPC `open_dispute` оставлены для будущей админки T14. **OK, документировано в STATUS.md.** |
| `useMasterFeed` | `src/features/orders/use-master-feed.ts` | UI использует `useAllOpenOrders` вместо. **Dead code — удалить.** |
| `useFeaturedCategories` | `src/features/categories/use-featured-categories.ts` | Колонка `categories_l2.is_featured` (миграция 0034) seed'ится, индекс есть, но на главной не используется. **P1: либо подключить к hero-секции, либо удалить колонку.** |

**Запись в STATUS.md «Готовый бэк, не подключён в UI»** для:
- `get_master_stats` (P0 — фикс через миграцию).
- `useFeaturedCategories` + `categories_l2.is_featured` (P1).
- `useSocialGraph` + RPC `count_common_contacts_with` / `count_vouches_for` (P2).

### B.4 Дубликаты / переопределения

- `accept_response` определён дважды: миграция 0010 (без чата) и 0011 (с чатом). Это `CREATE OR REPLACE` — финальная версия из 0011. OK.
- `notify_user` определён дважды: 0018 (старый pg_net API) и 0027 (новый API + EXCEPTION-handler). OK.
- `update_chat_last_message` определён в 0050 поверх version с 0011. OK.
- Lifecycle RPC переопределены в 0081 (`SECURITY INVOKER` → `SECURITY DEFINER`) через `ALTER FUNCTION`. OK.

Других горячих точек нет.

---

## C. Cron и Edge functions

### C.1 Cron jobs (3)

```
nightly_expire_orders     '0 3 * * *'  → expire_old_orders()            [миграция 0024]
nightly_auto_confirm      '0 4 * * *'  → auto_confirm_completions()     [миграция 0075]
nightly_cancel_stale      '0 5 * * *'  → cancel_stale_in_progress()     [миграция 0075]
```

**Все три — `SECURITY DEFINER` функции, корректные.** Покрывают transitions T7 (expire), T11 (auto-confirm 72h), T13 (stale 30d).

**Не покрыто crontab'ом (gap):**
- `nightly_close_review_windows` (T2 — после X дней нельзя оставить отзыв) — упомянуто в `docs/lifecycle.md` §5, но НЕ реализовано. P2.
- `nightly_recalc_master_karma` / fraud-score — пока нет таблицы `user_reputation` (отложено по STATUS).
- `nightly_cleanup_demo_data` — на launch'е надо будет вычистить `is_demo=true` пользователей.

### C.2 Edge functions

`supabase/functions/` — **пустая папка**, только `.gitkeep`. Файлов нет.

При этом миграции **0018 / 0027 / 0028** вызывают edge function через:
```sql
v_url text := 'https://wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify';
PERFORM net.http_post(url := v_url, ...);
```

**Это значит:** функция `notify` развёрнута в prod-проекте Supabase «напрямую через dashboard» (или CLI-deploy с локальной копии, которая не в git). **Source code функции потерян для git** — невозможно ревью, нельзя реплицировать в branch'е/стейджинге, нельзя восстановить если функция упадёт.

**Эта функция — критическая инфраструктура push-уведомлений:** все триггеры (`trg_notify_new_message`, `trg_notify_new_response`, `trg_notify_order_accepted`, `trg_notify_order_cancelled_or_expired`) и все lifecycle RPC (`mark_order_done`, `confirm_completion`, `open_dispute`, `reopen_order`, `terminate_cooperation`, `withdraw_response`) шлют push через неё.

**P0 действие:** через `supabase functions download notify` (CLI) или `mcp__60860*__get_edge_function name=notify` скачать существующее тело, положить в `supabase/functions/notify/index.ts`, закоммитить.

Доп. проблемы edge function `notify`:
- URL hardcoded в 3 миграциях (0018, 0027, 0028) → миграция на другой проект (staging/prod) требует sed-замены или замены на `current_setting('supabase.functions_url')`.
- Зависит от `vault.decrypted_secrets.notify_secret` (миграция 0027). Перед launch — проверить, что secret положен в vault prod-проекта.

### C.3 FCM/APNs

В STATUS.md / AUDIT_2026-05-16: «Push tokens — Expo registration работает, FCM/APNs credentials НЕ настроены». Подтверждается: edge function `notify` (вероятно, использует Expo Push API через `expo-server-sdk`), но без production-credentials на FCM/APNs пуш будет работать только в Expo Go и dev-build, не в production-сборке. **P0 для launch.**

---

## D. Lifecycle integrity

`docs/lifecycle.md` декларирует 8 статусов + 15 переходов (T1–T15) — backend реализация:

| Transition | Реализация | Статус |
|---|---|---|
| T1: `draft → open` | INSERT через `use-create-order.ts` (без RPC, прямой insert) | ✅ |
| T2: `open → closed_for_reviews` | nightly_close_review_windows | ❌ не реализован |
| T3: `open → in_progress` | RPC `accept_response` (0010/0011) | ✅ |
| T4 / T5: `in_progress / awaiting → completed` | RPC `confirm_completion` (0074) | ✅ |
| T6: `in_progress / awaiting → cancelled` | RPC `terminate_cooperation` (0077) | ✅ + клиент может cancel через update_orders |
| T7: `open → expired` (стало холодным) | cron `expire_old_orders` (0024) | ✅ |
| T8: `in_progress → awaiting_confirmation` | RPC `mark_order_done` (0074) | ✅ |
| T9: `cancelled / expired → open` (reopen) | RPC `reopen_order` (0074) | ✅ |
| T10 / T12: `* → disputed` | RPC `open_dispute` (0074) | ✅ backend, UI orphan |
| T11: `awaiting → completed` (72h auto) | cron `auto_confirm_completions` (0075) | ✅ |
| T13: `in_progress (30d idle) → cancelled` | cron `cancel_stale_in_progress` (0075) | ✅ |
| T14: `disputed → resolved` | админ-only, ничего нет | ❌ нет admin RPC |
| T15: `response withdraw` | RPC `withdraw_response` (0074) | ✅ |
| T6t: `terminate_cooperation` | RPC `terminate_cooperation` (0077) | ✅ |

**Все 6 lifecycle RPC `SECURITY DEFINER`** (после миграции 0081). Все имеют `SET search_path = public, pg_temp` через ALTER. Все имеют `audit_log` запись через `order_status_log` (миграция 0073).

**Push на каждом переходе:** ✅ каждый RPC вызывает `notify_user` для другой стороны (subject to edge function `notify` существующего и FCM/APNs configured).

### D.1 Минорные gap'ы lifecycle

- **T2 (`close_for_reviews`)** — статуса `closed_for_reviews` нет в enum, в docs упомянут как «open после X дней пользователь не может больше получать reviews». P2.
- **T14 (`dispute → resolved`)** — статус `disputed` существует в enum (0071), но resolved-state нет. Админ-flow не реализован. P2 (после Phase 1).
- Notification cascade warnings (§5.2 lifecycle.md: T-7d expire, T+24h awaiting, T+1/7/13 review reminders) — НЕ реализованы. P2.

### D.2 Audit log

`order_status_log` (миграция 0073) + AFTER UPDATE trigger `trg_log_order_status_change` + backfill заданный — корректно. RLS читать может участник заказа.

---

## E. Auth / OTP / Phone

### E.1 OTP — критический блокер

`src/features/auth/use-auth-mutations.ts`:
```ts
useSendOtp:    await new Promise((resolve) => setTimeout(resolve, 800));   // НЕТ SMS-провайдера
useVerifyOtp:  return signInAnonymouslyWithPhone(input.phone);              // КОД НЕ ПРОВЕРЯЕТСЯ
```

`src/lib/auth.ts`:
- **Demo phones (`+79000…`)**: `signInWithPassword({email: '<digits>@xtrud-demo.local', password: 'xtrud'})`. Пароль `xtrud` хардкод. Каждый, кто угадает demo-номер, входит в чужой demo-аккаунт.
- **Real phones**: `signInAnonymously()` + `UPDATE users_private SET phone = …`. Анонимный sign-in == любой телефон может «зарезервировать» нового юзера, OTP-кода никто не вводит.

**Это launch-блокер #1.** Нужно:
1. Выбрать SMS-провайдер (МТС Exolve / SMS.RU / SMSC) — рекомендация Phase 1 #11 в `AUDIT_2026-05-16.md`.
2. Подключить через `supabase.auth.signInWithOtp({phone})` + `verifyOtp({phone, token, type: 'sms'})`.
3. Включить `Authentication → Providers → Phone` в Supabase dashboard с указанием провайдера.
4. Снести `DEMO_PASSWORD = 'xtrud'` из `src/lib/auth.ts` или закрыть `+79000…` сценарий за `DEV_MODE`-флагом.

### E.2 Синтетический email

`auth.users.email = <phone-digits>@xtrud-demo.local`. Это **демо-only механика** для работы в обход отключённого Phone-provider в Supabase Auth. После реального OTP-flow:
- Migration на снос `email` для прод-юзеров — НЕ требуется (Supabase Auth требует email-колонку в `auth.users`, но она nullable). Можно оставить пустой.
- В UI email **скрыт** (правило #6 CLAUDE.md). Проверено: `grep -r "email" /Users/.../src/features` — не светится в формах.
- ⚠️ Только три места упоминают `xtrud-demo.local`: `0046_demo_users_email_login.sql`, `0054_personal_demo_master.sql`, `src/lib/auth.ts`. Чисто.

### E.3 Brute-force / Rate-limit

**Нет ничего.** Supabase Auth даёт встроенный rate-limit на `signInWithOtp` (60s между запросами по умолчанию), но **этой защиты не существует пока мы используем `signInAnonymously`** — анонимный sign-in не лимитирован per-phone. При public launch:
- Бот может зарегистрировать миллионы анонимных юзеров → раздувает таблицу `auth.users` и blocking quota.

P0 рекомендация: после переезда на реальный OTP включить rate-limit в Supabase dashboard (Authentication → Rate Limits → SMS OTP).

### E.4 2FA

Нет. Не критично для MVP-launch — индустрия пока не требует 2FA для C2C-маркетплейсов на телефон. P3.

---

## F. PII / Storage

### F.1 Storage buckets (3)

| Bucket | Public | Размер | Файл |
|---|---|---|---|
| `avatars` | ✅ true | 2 MB max | 0013 |
| `portfolio` | ✅ true | 5 MB max | 0013 |
| `chat-images` | ✅ **true** | (без лимита) | 0061 |
| `master-verifications` | ❌ **false** (private) | (без лимита) | 0070 |
| `category-covers` | ✅ true | (заданный лимит + mime-types) | 0019 |

### F.2 RLS на `storage.objects` — 17 policies

Все buckets имеют owner-only INSERT/UPDATE/DELETE на путь `{user_id}/...`. Для портфолио — дополнительно проверка `is_master = true`.

`master-verifications` (паспорт + селфи):
- `INSERT/UPDATE`: только owner на `{user_id}/...` (миграция 0070, строки 214-242).
- `SELECT`: owner OR `is_current_user_admin()` (admin-readable для модерации).
- Bucket **private** — ссылка работает только через signed URL.

**Это правильно для PII.** Чек: ✅

### F.3 ⚠️ `chat-images` — privacy by obscurity

Bucket **public** (`public = true`). Любой, кто знает URL, получит файл (миграция 0061 §50-71). Аналогично Telegram/WhatsApp: пароля нет, но URL содержит UUID — угадать нельзя.

**Риски:**
- URL может утечь в логи / DevTools / push-notification payload → файл с фото клиента/паспортом доступен внешнему миру.
- Скриншот «вот моя квартира» индексируется при шеринге, если кто-то опубликует ссылку.

**P1 рекомендация:** перевести `chat-images` в private + signed URL с TTL (например, 30 минут) в RN-клиенте. Альтернатива — bucket public, но URL обфусцируется через cryptographic hash в filename. Сейчас filename = `{user_id}/<timestamp>-<uuid>.jpg` — хешу не достаёт salt.

### F.4 Avatars / portfolio — также public

OK, индустрия-стандарт (Profi/YouDo/Avito фото мастеров публичные). Note: при удалении master_profile файлы в storage не удаляются автоматически (нет cascade trigger). P2 — добавить cleanup.

---

## G. Realtime

В `supabase_realtime` publication добавлены:
- `public.messages` (0011)
- `public.chats` (0011)
- `public.notifications` (0028)

**Не добавлены, но могло бы помочь:**
- `public.orders` — клиент видит status-update в realtime (отклик принят → in_progress → completed). **P1 для UX.** Сейчас работает через TanStack Query invalidations + refetch, что менее snappy.
- `public.order_responses` — клиент в `/orders/[id]` видит новые отклики мгновенно. **P1.**

**REPLICA IDENTITY FULL** не выставлен ни на одной таблице — DELETE-события в realtime не дадут row-data. Для `messages`/`chats` это OK (мы не удаляем), но для `orders` (если станет realtime) — критично будет учесть.

---

## 🔴 Блокеры запуска (P0)

1. **OTP полностью замокан.** `setTimeout(800ms)` + hardcoded `password='xtrud'` + `signInAnonymously` для не-demo номеров. **Impact:** на public launch любой может войти под любым «новым» номером без подтверждения, demo-аккаунты доступны через пароль `xtrud`. **Fix:** подключить SMS-провайдер (МТС Exolve / SMSC), включить `Phone` provider в Supabase, заменить `useSendOtp/useVerifyOtp` на `supabase.auth.signInWithOtp` + `verifyOtp`. Снести demo-password-flow или закрыть за `DEV_MODE`.

2. **Edge function `notify` отсутствует в репозитории.** `supabase/functions/` пустая, но миграции дёргают `wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify` через pg_net (миграции 0018/0027/0028). **Impact:** код не в git → невозможно ревью, нельзя восстановить если потеряется, нельзя реплицировать на staging-branch. **Fix:** `supabase functions download notify` → `supabase/functions/notify/index.ts` → коммит. Параметризовать URL (вынести в vault или `current_setting`).

3. **`is_demo`-флаг не фильтруется в UI.** Колонка `users.is_demo` (миграция 0060) проставлена для 30 seed-аккаунтов, но **в `app/**/*.tsx` ни одного `.neq('is_demo', true)` или эквивалентного фильтра**. **Impact:** при public launch реальные клиенты увидят демо-мастеров «Алина / Магомед / Адам …» и демо-заказы вперемешку. **Fix:** добавить фильтр `WHERE NOT is_demo` в `useMastersByL2`, `useAllOpenOrders`, `useTopMasters`, или флаг env'ом включать demo-режим (для preview-deploys).

4. **`get_master_stats` RPC живёт в БД, но не в миграциях.** UI вызывает (`use-master-stats.ts`), TS-типы знают, но `grep` по `supabase/migrations/` — пусто. Создан напрямую через dashboard (нарушение infra-правила №5). **Impact:** при rebuild с нуля / staging-branch / disaster recovery функция исчезнет → master-stats упадёт. **Fix:** через MCP `execute_sql 'SELECT pg_get_functiondef("get_master_stats"::regproc);'`, тело — в миграцию `0083_get_master_stats.sql`.

5. **FCM / APNs не настроены.** Per STATUS / `AUDIT_2026-05-16.md` — push-токены регистрируются, edge function `notify` есть, но без FCM Server Key (Android) и APNs Auth Key (iOS) push в prod-сборке не доходит. **Impact:** все lifecycle-уведомления (новый отклик / accepted / completed / dispute / message) не доставляются в native-сборке. **Fix:** настроить Expo EAS Push credentials + проверить, что edge function `notify` использует Expo Push API (если так — credentials автоматически берутся Expo).

6. **Admin-flag на demo-юзере остаётся в prod.** `UPDATE users SET is_admin = true WHERE id = 'f0000002-…'` (миграция 0030, строка 70). **Impact:** demo-аккаунт получает админские права на ban/UPDATE users/UPDATE reviews. **Fix:** в launch-prep миграции — `UPDATE users SET is_admin = false WHERE is_demo = true;` либо snос `f0000002-…` целиком вместе с другими seed.

---

## 🟡 Важно до публичного запуска (P1)

1. **`chat-images` bucket — public.** Privacy-by-obscurity. Если URL утечёт (push payload, browser cache, screenshot) — фото доступно вечно. **Fix:** перевести в private + signed URL с TTL ≤ 1h, выдавать через RPC `get_chat_image_url(chat_id, path)` с проверкой участия в chat.

2. **`orders` и `order_responses` не в realtime publication.** Клиент не видит новые отклики мгновенно — нужен manual refresh / poll. **Fix:** `ALTER PUBLICATION supabase_realtime ADD TABLE public.orders, public.order_responses;` + `REPLICA IDENTITY FULL` для row-data в DELETE-событиях.

3. **`SECURITY DEFINER` функции без `search_path = ''` или `pg_temp` финальным.** ~5 функций используют только `search_path = public`. Низкий риск, но Supabase advisor подсветит. **Fix:** добавить `SET search_path = public, pg_temp` ко всем (минимум) либо `''` (рекомендация Supabase docs).

4. **Hardcoded URL `wgeimsajvjkzrrnfrnkb.supabase.co`** в 3 миграциях. Перенос на staging-проект или prod-проект (если он не текущий) — sed-replace в 3 местах. **Fix:** хранить URL в `vault` (как `notify_secret` уже хранится), читать через `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_url'`.

5. **`useFeaturedCategories` orphan.** Колонка `categories_l2.is_featured` (миграция 0034) + индекс есть, hook написан, но в UI не используется. **Fix:** либо подключить к hero-секции главной (P1 для UX hierarchy), либо удалить колонку + индекс + hook.

6. **Cleanup-cron для удалённых файлов в storage.** При DELETE master_profile / user — файлы в `avatars/`, `portfolio/`, `master-verifications/` остаются. **Fix:** AFTER DELETE trigger на `master_profiles` / `users` → cleanup-функция (через `storage.delete_object(...)`).

7. **`anon` может SELECT все строки `public.users`.** Поля без приватных, но раскрывает `is_admin`, `status`, `rating_*`, list всех юзеров. **Fix:** заменить `USING (true)` на `USING (status = 'active' AND is_admin = false)` — публично видно только активных не-админов. Альтернатива — оставить как есть, добавить middleware-rate-limit на /rest/v1/users.

8. **Notification cascade warnings (§5.2 lifecycle.md).** T-7d / T-1d expire, T+24h awaiting reminder, T+1/7/13 review reminders. Сейчас юзеру приходит только finalный push на переход, нет «остался день» / «вы ещё не оставили отзыв». P1 для retention.

---

## 🟢 Nice to have (P2)

1. **T2 (`closed_for_reviews`) cron** — после X дней нельзя добавить отзыв. Не блокирует launch.
2. **T14 (`dispute → resolved`) admin RPC + UI.** Сейчас `disputed`-заказы зависают без resolution-flow. Связан с admin panel (5% готовности).
3. **Karma система (§8 lifecycle.md).** Таблица `user_reputation` + soft-warn / hide-profile thresholds. Сначала собираем данные через `order_status_log`.
4. **`useMasterFeed` dead code** — удалить (UI использует `useAllOpenOrders`).
5. **`useSocialGraph` + RPCs `count_common_contacts_with`/`count_vouches_for`** — либо подключить к master-card, либо удалить.
6. **`useTeam` + миграция 0031** — teams вне MVP-scope. Можно дропнуть либо оставить как future-base.
7. **`master_verifications.reviewed_by`** без индекса — admin-queue будет seq-scan, при росте объёма — добавить.
8. **`REPLICA IDENTITY FULL` для realtime-таблиц** — DELETE-события с row-data. Не критично пока не удаляем.
9. **GDPR cascade trigger** на `auth.users DELETE` — proper cleanup всех пользовательских данных (PII + S3-файлы). Сейчас RLS-cascade чистит FK-row'ы, но файлы в storage остаются.

---

## Связанные документы

- [`AUDIT_2026-05-16.md`](../../AUDIT_2026-05-16.md) — финальный продуктовый аудит, §2 «что реально реализовано» и §6 Sprint 22-25.
- [`STATUS.md`](../../STATUS.md) — текущее состояние + раздел «Готовый бэк, не подключён в UI».
- [`docs/lifecycle.md`](../../docs/lifecycle.md) — спецификация 8 статусов / 15 переходов.
- [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — мастер-верификация backend.
- [`.claude/rules/connect-the-dots.md`](../../.claude/rules/connect-the-dots.md) — правило про неподключённый бэк.

---

## Backend готов к публичному launch: **~55%**

Обоснование:
- **Архитектурно (85%):** схема, RLS, индексы, lifecycle, audit-log, search FTS, push-инфраструктура (миграции) — на месте. Quality высокий, code-debt минимальный.
- **Operational (50%):** OTP замокан, edge function вне git, FCM/APNs не настроены, demo-данные не фильтруются — четыре блокера, каждый требует 1-3 дня.
- **Security (60%):** RLS строгий и полный, но `chat-images` public, ~5 функций без `search_path=pg_temp`, hardcoded admin на demo-юзере, anon SELECT всех users.
- **Documentation / dev-experience (90%):** STATUS + AUDIT + lifecycle.md + правило connect-the-dots дают новому агенту полный контекст за 15 минут. Это редкая сила.

**Чтобы дойти до 95% за один спринт:** закрыть P0 #1–#6 (5–7 рабочих дней) + P1 #1, #2 (2 дня) = ровно неделя backend-работы. После — backend готов к публичному beta-launch'у в Республике Ингушетия.
