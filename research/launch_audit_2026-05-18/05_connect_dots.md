# Connect-the-dots audit — 2026-05-18

## TL;DR

Найдено **1 phantom RPC** (`get_master_stats` — UI зовёт, миграции нет; компонент `MasterStatsBlock` сирота). **1 полностью бесхозная подсистема — паспорт-верификация** (миграция 0070 со схемой, RLS, триггерами и колонкой `verification_level` — но ноль UI). **3 hook'а без consumer'а** (`use-social-graph`, `use-team`, `use-master-feed`). **3 «висящих» компонента** (`MasterStatsBlock`, `MasterRecentEvents`, плюс мёртвый код в `use-complete-order` deprecated wrapper). **1 утечка приватности**: `useTopMasters` не фильтрует `is_hidden_from_search`. Lifecycle T1–T15 — закрыто 13/15 (T14 admin-only, T11/T13 cron'ы — by design).

Источники, использованные в аудите:
- 85 миграций (`supabase/migrations/0001…0082`) — 50 функций, 25 таблиц, 4 cron-задачи.
- 105 файлов в `src/features/**`, 39 экранов в `app/**`.
- `docs/lifecycle.md` — таблица переходов T1–T15.

---

## 1. Orphan RPC (бэк готов — UI не зовёт)

| RPC | Файл миграции | Должно вызываться в | Приоритет |
|---|---|---|---|
| `open_dispute(p_order_id, p_reason)` | `0074_lifecycle_rpcs.sql:280` | Кнопка «Открыть спор» на `/orders/[id]` (T10/T12). По комментарию в коде — намеренно скрыт, заменён на `terminate_cooperation` (фидбэк user 2026-05-16, «спор слишком тяжёлый»). Hook `useOpenDispute` существует, но не импортируется ни в одном экране. RPC оставлен «для будущей админки через service_role». | **Низкий** (осознанное решение, документировано). Решить: оставлять RPC + hook, или дропать миграцию. |
| `count_common_contacts_with(p_target_user_id)` | `0032_social_graph.sql` | Социальный граф на странице мастера/клиента («N общих знакомых»). Hook `useCommonContactsCount` есть. **Никогда не используется ни на одном экране.** | **Средний** — Social graph целиком оторван от UI. |
| `count_vouches_for(p_target_user_id)` | `0032_social_graph.sql` | Бейдж «N поручительств» на профиле мастера. Hook `useVouchesCount` есть. **Ни на одном экране не вызывается.** | **Средний** — то же. |

**Также мёртвый код в DB (cron/trigger-only, by design — НЕ ошибка):**
`auto_confirm_completions`, `cancel_stale_in_progress`, `expire_old_orders`, `expire_availability`, `recalc_master_rating`, `sync_master_verification_level`, `reset_verification_level_on_delete`, `handle_new_auth_user`, все `trg_*`, `_availability_expires_at`, `set_updated_at`, `update_chat_last_message`, `update_order_responses_count`, `check_master_categories_limit`, `check_master_services_limit`, `check_portfolio_items_limit`, `check_daily_response_limit`, `check_response_not_self`, `is_current_user_admin`. Все они triggers / cron / RLS-helpers и не должны вызываться из UI.

---

## 2. Orphan tables

| Таблица | Миграция | Возможное назначение | Дропать или подключить? |
|---|---|---|---|
| **`master_verifications`** | `0070_master_verifications.sql:54` | Паспорт-верификация мастеров (selfie + passport + status). Backend: схема + RLS + private Storage bucket + 2 trigger'а на синхронизацию `master_profiles.verification_level`. **Готов на 100%.** | **Подключить.** Запланированный UI flow есть в `docs/VERIFICATION.md`. **Нигде в `app/**` или `src/features/**` нет ни одного `.from("master_verifications")`, ни одного компонента с «верификация».** Аналогично — колонка `master_profiles.verification_level` нигде в UI не читается (бейдж «паспорт подтверждён» невидим). |
| `order_status_log` | `0073_order_status_log.sql` | Audit-log переходов статуса заказа. | **By design** — заполняется триггером `trg_log_order_status_change`. Для UI пока не нужен (можно показать timeline на `/orders/[id]` — nice-to-have, не дыра). |
| `teams`, `team_members` | `0031_teams_and_companies.sql` | Команды/компании (мастер с подчинёнными). Hooks `useTeamByOwner`, `useTeamMembers` есть. | **Подключить или дропать.** Ни один экран не показывает «команда мастера». См. п.5. |
| `user_contacts`, `vouches` | `0032_social_graph.sql` | Социальный граф (контакты, поручительства). Hooks есть. | **Подключить или дропать.** См. п.5. |
| `notification_tokens`, `notifications`, `reports`, `articles`, `categories_l*`, `category_terms`, `cities`, `portfolio_items`, `master_*`, `chats`, `messages`, `orders`, `order_responses`, `users`, `users_private`, `reviews` | разные | используются | ✅ ok |

---

## 3. Phantom RPC (UI зовёт — бэка нет)

| Вызов в коде | file:line | Что должно быть в БД |
|---|---|---|
| `supabase.rpc("get_master_stats")` | `src/features/master-view/use-master-stats.ts:24` | `CREATE FUNCTION get_master_stats() RETURNS JSON` — должен вернуть `{responses_total, accepted, completed, ...}`. **В миграциях такой функции НЕТ** (проверено `grep -l "get_master_stats" supabase/migrations/*.sql` → пусто). В `src/types/database.ts:1504` тип объявлен, но это типизация под РАЗ генерили types, а функцию потом снесли (или никогда не создавали). Компонент `MasterStatsBlock` дёргает этот hook → при рендере → 500 Internal Error от Supabase. |

**Симптом:** если что-то в UI вызовет `MasterStatsBlock` — будет рантайм-ошибка «function public.get_master_stats() does not exist». Сейчас НЕ вызывается (см. п.5), поэтому ошибка не всплывает.

---

## 4. Phantom tables

| `.from('xxx')` | file:line | Что должно быть в БД |
|---|---|---|

Ни одной не найдено. Все 21 таблиц, к которым обращается UI через `.from()`, существуют в миграциях.

---

## 5. Hooks без consumer'а

| Хук | Файл | Что должно использовать |
|---|---|---|
| `useCommonContactsCount`, `useVouchesCount`, `useMyVouches`, `useAddVouch`, `useUpsertContacts` | `src/features/social/use-social-graph.ts` | Профили `/master/[id]` и `/client/[id]` (бейджи «N общих знакомых», «N поручительств», CTA «поручиться»). **Ни один экран не импортирует этот файл.** |
| `useTeamByOwner`, `useTeamMembers` | `src/features/teams/use-team.ts` | Блок «Команда» на странице мастера (если `account_type='team'`). **Ни один экран не импортирует.** |
| `useMasterFeed` | `src/features/orders/use-master-feed.ts` | Был заменён на `useAllOpenOrders` для `/orders/search/index.tsx`. Старый hook остался + `feed-page.ts` + тесты `feed-page.test.ts`. **Никто не импортирует.** |
| `useMarkFeedSeen` | `src/features/orders/use-unread-feed.ts:55-65` | Должен дёргаться на mount `/(tabs)/orders/index.tsx`, чтобы сбросить badge. **Ни один экран его не зовёт.** Counter висит, пока не зайдут в конкретный feed-screen, который вместо него юзает `useUnreadFeedCount` (read-only). |
| `useOpenDispute` | `src/features/orders/use-open-dispute.ts` | Был на `/orders/[id]`, удалён по фидбэку 2026-05-16. Hook остался. |

**Также: `useCompleteOrder`** (`src/features/orders/use-complete-order.ts`) — DEPRECATED re-export `useConfirmCompletion`. Используется ровно в одном месте: `app/(tabs)/orders/[id].tsx:42` (плюс legacy import рядом с актуальным `useConfirmCompletion` на строке 43). **Дублирующийся импорт в одном файле.** Один из них можно дропнуть.

---

## 6. Двойные источники истины

| Сущность | Старый источник | Новый источник | Что удалить |
|---|---|---|---|
| Поиск категорий | `useSearchableServices` (`src/features/categories/use-searchable-services.ts`) — client-side ILIKE через `.from("categories_l2/3")` | `useSearchCategories` (`src/features/categories/use-search-categories.ts`) — RPC `search_categories` с synonym/FTS/trigram | ✅ **CLOSED 2026-05-16:** оба используются в `app/(tabs)/search.tsx` намеренно — старый для browse-mode (пустой запрос → flat list ~60 записей), новый для query-mode (≥2 символов). Документировано в шапке. **Не дублирование.** |
| Завершение заказа клиентом | `confirm_work_done(p_order_id, p_master_id, ...)` (RPC 0041, 6 параметров, sprint 0042) | `confirm_completion(p_order_id, p_skip_review?)` (RPC 0074, 2 параметра, T4/T5) | **Оба RPC живут в БД.** `confirm_work_done` вызывается из `ConfirmWorkSheet.tsx` (ad-hoc подтверждение оффлайн-работы с master/[id]), `confirm_completion` — из `CompletionSection` на `/orders/[id]`. **Разные сценарии, разные параметры.** OK, не дублирование, но название похожее → читаемость страдает. Можно переименовать `confirm_work_done` → `confirm_offline_work` для ясности. |
| `useCompleteOrder` vs `useConfirmCompletion` | `use-complete-order.ts` (deprecated re-export) | `use-confirm-completion.ts` (актуальный) | **Drop `useCompleteOrder` и его import в `/orders/[id].tsx:42`.** Прямо рядом строка 43 уже импортирует актуальный hook. |
| `useMasterFeed` vs `useAllOpenOrders` | `use-master-feed.ts` + `feed-page.ts` + `feed-page.test.ts` | `use-all-open-orders.ts` | Старый не используется, можно дропнуть весь набор `feed-page.*` (если тест не покрывает другие места). |
| `MasterStatsBlock` + `useMasterStats` + RPC `get_master_stats` | компонент / hook / тип | (новый) `MasterRecentEvents` + `useNotifications` | **`MasterStatsBlock` не рендерится из `MasterHomeContent`** — заменён на простой `<ResponseLimitBadge variant="pill" />`. Сам компонент остался, hook остался, RPC в типах есть, в БД — нет. **Дропать всю цепочку либо реализовать RPC.** |

---

## 7. Lifecycle T1–T15 полнота

| Transition | RPC | Hook | UI CTA | Статус |
|---|---|---|---|---|
| **T1** open creation | (INSERT) | `useCreateOrder` | `/orders/new` (создание) | ✅ |
| **T2** open → cancelled | (UPDATE) | `useCancelOrder` | `/orders/[id]` (кнопка «Отменить заказ» для клиента) | ✅ |
| **T3** open → in_progress | `accept_response` | `useAcceptResponse` | `/orders/[id]` (выбор отклика) | ✅ |
| **T4** in_progress → completed | `confirm_completion` | `useConfirmCompletion` | `/orders/[id]` CompletionSection | ✅ |
| **T5** awaiting_confirmation → completed | `confirm_completion` | `useConfirmCompletion` | `/orders/[id]` CompletionSection | ✅ |
| **T6** in_progress/awaiting → cancelled | (UPDATE) | `useCancelOrder` | `/orders/[id]` (через terminate_cooperation для активных) | ⚠️ Частично: CTA «прекратить сотрудничество» (terminate_cooperation) заменил «отменить с in_progress». Прямой UPDATE через `useCancelOrder` для in_progress — теоретически есть, но кнопки нет. OK by design. |
| **T7** open → expired | cron `expire_old_orders` (03:00) | n/a | n/a | ✅ |
| **T8** in_progress → awaiting_confirmation | `mark_order_done` | `useMarkOrderDone` | `/orders/[id]` CompletionSection (мастер) | ✅ |
| **T9** cancelled/expired → open | `reopen_order` | `useReopenOrder` | `/orders/[id]` ReopenSection | ✅ |
| **T10** awaiting → disputed | `open_dispute` | `useOpenDispute` | **НЕТ CTA** (намеренно: заменён на terminate_cooperation) | ⚠️ Намеренно скрыт. Hook не импортируется ни в одном экране. RPC есть. |
| **T11** awaiting → completed (auto) | cron `auto_confirm_completions` (04:00) | n/a | n/a | ✅ |
| **T12** in_progress → disputed | `open_dispute` | `useOpenDispute` | **НЕТ CTA** | ⚠️ см. T10 |
| **T13** in_progress → cancelled (stale) | cron `cancel_stale_in_progress` (05:00) | n/a | n/a | ✅ |
| **T14** disputed → completed/cancelled | manual support | n/a | TBD (admin UI) | ❌ Admin UI отсутствует. По текущему scope OK — disputed-заказов создаваться не должно (T10/T12 не вызываются). |
| **T15** active → withdrawn (master) | `withdraw_response` | `useWithdrawResponse` | `/orders/[id]` (мастер отзывает отклик) | ✅ |
| **T6t** terminate_cooperation (extra) | `terminate_cooperation` | `useTerminateCooperation` | `/orders/[id]` CompletionSection | ✅ |

**Итого:** 13/15 transitions имеют UI CTA. T10/T12 (`open_dispute`) — осознанно скрыты, hook + RPC оставлены «на будущее для service_role». T14 (resolve dispute) — admin UI пока не нужен, потому что dispute-заказов не появляется.

---

## 8. Дополнительные находки

### 8.1. `useTopMasters` не фильтрует `is_hidden_from_search`

`src/features/master-view/use-top-masters.ts:38-54` — `.from("master_profiles")` без `.eq("is_hidden_from_search", false)`. На главной экранируется любой мастер с `status='active'`, даже скрытые. Соседний `useMastersByL2` фильтрует (`.ts:96`). **Privacy bug.** Effort: 1 строка.

### 8.2. Master-page не предлагает «написать в чат»

`useStartChatWithMaster` (`src/features/chat/use-start-chat.ts`, RPC `start_chat_with_master`) импортируется только в `/orders/[id].tsx:26`. На странице мастера `/master/[id]` есть только «Позвонить» + «WhatsApp» (если есть). **Sticky bottom CTA «Написать в чат», который упомянут в шапке файла на строке 12, отсутствует в реализации.** Возможно намеренно (чат привязан к order_id, нет смысла открывать без заказа). Решить: либо реализовать «общий» чат (нужен новый RPC `start_chat_without_order`), либо удалить упоминание из шапки.

### 8.3. Хук `useMarkFeedSeen` ни разу не вызывается

`useUnreadFeedCount` возвращает badge counter, но `useMarkFeedSeen` (которое сбрасывает `master_feed_seen_at`) ни в одном `useEffect`/onMount не дёргается. **Counter всегда показывает старое значение** (только реалтайм-апдейт двигает его вверх, никогда вниз). Effort: 1 `useEffect` на mount `/(tabs)/orders/index.tsx` для роли master.

---

## 🔴 Топ-приоритеты для подключения

1. **Реализовать UI паспорт-верификации мастера** → новая страница `/(tabs)/profile/verification.tsx` + бейдж «паспорт подтверждён» на `/master/[id]` (читать `master_profiles.verification_level >= 1`). Backend готов (миграция 0070). Effort: **L** (image-picker, upload в private bucket, status-poll, бейдж в 3 местах). Без этого RLS-схема + Storage bucket пустуют.

2. **Дропнуть phantom RPC `get_master_stats` либо реализовать**. Сейчас `MasterStatsBlock` мёртв (не рендерится из `MasterHomeContent`), но hook ждёт несуществующую функцию. Решить: (a) написать миграцию с `get_master_stats()` агрегатом + вернуть блок в `MasterHomeContent`, или (b) удалить `MasterStatsBlock.tsx` + `use-master-stats.ts` + тип в `database.ts`. Effort: **S** (для drop) / **M** (для реализации с UI).

3. **Зафиксить `useTopMasters` — добавить фильтр `is_hidden_from_search`**. Privacy. Effort: **S** (1 строка).

4. **Подключить `useMarkFeedSeen` в `/(tabs)/orders/index.tsx`** (если active_role=master). Без него badge counter не сбрасывается. Effort: **S** (5 строк `useEffect`).

5. **Решить судьбу `social-graph`** (vouches + common contacts): подключать на профили мастеров/клиентов или дропать миграцию `0032`. Сейчас 2 таблицы + 2 RPC + 5 hooks висят без UI. Effort: **M** (для подключения 3 бейджей + sheet «поручиться») или **S** (для дропа).

6. **Решить судьбу `teams`** (миграция 0031): команды на странице мастера или дропать. Effort: **M** (UI блок + редактор команды) или **S** (drop).

7. **Чистка legacy: `useCompleteOrder`** re-export, `use-master-feed.ts` + `feed-page.ts`, `MasterStatsBlock`, `MasterRecentEvents`, дублирующий импорт в `/orders/[id].tsx:42-43`. Effort: **S** (≤30 минут).

8. **Решить судьбу `open_dispute`** (T10/T12): оставить RPC + hook «на будущее для service_role» (зафиксировать решение в `STATUS.md`), либо дропать миграцию + hook. Сейчас «зависшая» функция в БД и неимпортируемый hook.

9. **Master page: «Написать в чат»** — либо реализовать (требует новый RPC `start_chat_without_order`), либо убрать упоминание из docstring `/master/[id].tsx:12`.

---

## Известные ранее, закрытые (для протокола)

- ✅ **2026-05-16:** `useSearchCategories` подключён к `/search.tsx` (раньше использовался только `useSearchableServices` client-side). См. шапку `connect-the-dots.md` § «Известные случаи».
- ✅ `useSearchCategories` также подключён в `/orders/category-select.tsx` и `/orders/search/category-select.tsx`.
