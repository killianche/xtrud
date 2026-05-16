# Session summary — 2026-05-16

## TL;DR

Расширил state-machine заказа с 6 до 8 статусов + 15 переходов. Полный lifecycle: backend (6 миграций + audit log + 2 cron'а) + frontend (5 RPC-хуков + 2 секции в /orders/[id]). Спецификация — [`docs/lifecycle.md`](docs/lifecycle.md) (13 разделов, research по Profi.ru/YouDo/TaskRabbit/Thumbtack/Airbnb/Uber).

**Поздно вечером — 4 UX-доработки на фидбэк user:**
- «Прекратить сотрудничество» вместо «Открыть спор» (миграция 0077 + новая RPC + UI).
- «Вы откликнулись» badge в `/orders/search` (Set из useMyResponses → OrderRow prop).
- Логотип xtrud вместо House в TabBar и WebShell.
- «Как меня видят» CTA на `/profile` для обеих ролей.

Bonus баг-фикс утром: `MasterDashboardOrders` дублировал accepted-отклики в обоих табах.

## Закрытые задачи (вечером — UX-доработки)

A. **«Прекратить сотрудничество» вместо «Открыть спор»** (фидбэк user: «у нас редко dispute, просто прекратили — и всё»):
   - Миграция 0077 — RPC `terminate_cooperation(order_id, reason?)`. Обе стороны → cancelled с reason='cooperation_ended_by_<role>'. Push другой стороне, audit log T6t. Policy `orders_picked_master_lifecycle` расширена на cancelled.
   - Frontend: новый хук [`use-terminate-cooperation.ts`](src/features/orders/use-terminate-cooperation.ts), UI в [`/orders/[id]`](app/(tabs)/orders/[id].tsx) заменил Flag/«Открыть спор» на X/«Прекратить сотрудничество» (error-styled outline). Удалил `DisputeBottomSheet` (~60 строк). `useOpenDispute` import убран. Статус `disputed` + RPC `open_dispute` остались в БД для будущей админки.

B. **«Вы откликнулись» badge в `/orders/search`** (фидбэк user: «надо различать, на какие заявки уже откликался»):
   - [`app/(tabs)/orders/search/index.tsx`](app/(tabs)/orders/search/index.tsx) — подписан на `useMyResponses(userId)`, собираю Set<order_id> non-withdrawn responses, передаю `alreadyResponded` в OrderRow.
   - [`OrderRow.tsx`](src/components/OrderRow.tsx) — новый prop `alreadyResponded`. Эффекты: фон карточки `canvas-soft` (как «прочитанная» в Gmail/Mail), accent-soft pill «Вы откликнулись» первым элементом в meta-row, accessibilityLabel дополнен.

C. **Логотип xtrud вместо House в навигации** (фидбэк user: «давай тестовое вместо домика поставим наш логотип»):
   - [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx) — `tabBarIcon` для «Главной» использует `<XtrudLogo size={24} color={color} />` (cross-role, и для клиента, и для мастера).
   - [`WebShell.tsx`](src/components/WebShell.tsx) — desktop top-nav: special-case `match='/'` рендерит `<XtrudLogo size={18} />`.

D. **«Как меня видят» CTA на `/profile`** (фидбэк user: «хорошо бы клиент мог смотреть на профиль мастера, где его отзывы»):
   - [`app/(tabs)/profile/index.tsx`](app/(tabs)/profile/index.tsx) — добавлены 2 list-row CTA после «Редактировать профиль»:
     - Клиент → `/(tabs)/client/{my_id}` («Как меня видят мастера, публичный профиль + отзывы»).
     - Мастер → `/(tabs)/master/{my_id}` («Как меня видят клиенты, публичный профиль + отзывы»).
   - Mutual reviews infrastructure уже была: `MasterReviewSection` и `ClientReviewSection` в `/orders/[id]` для completed orders + `<ReviewsSection>` с правильным `direction` filter на /client/[id] и /master/[id]. CTA закрывает gap «как туда попасть из своего профиля».

## Закрытые задачи (утро — основной lifecycle)

1. **Bug-fix дубликат «Я откликнулся» / «Меня выбрали»** — [`src/features/master-view/MasterDashboardOrders.tsx`](src/features/master-view/MasterDashboardOrders.tsx) `isActiveResponse` добавил `respStatus === 'accepted' → return false`. Аналитика на основе текущей `accept_response` RPC показала: после accept все остальные responses → rejected, а chosen → accepted. Старый фильтр исключал rejected/withdrawn, но не accepted — отсюда дубликат.

2. **Аналитика lifecycle + research** — [`docs/lifecycle.md`](docs/lifecycle.md). 13 разделов: цели, 8 статусов order + 5 откликов, граф из 15 переходов (T1–T15), матрица с защитой и side effects, time-based триггеры, notifications cascade, reviews window, audit log, карма, edge cases, RLS/RPC контракт, открытые вопросы, план реализации. Research-agent собрал данные по 6 платформам.

3. **6 миграций применены к production-БД** через Supabase MCP (`apply_migration`):
   - `0071_lifecycle_enum_additions.sql` — `ALTER TYPE order_status ADD VALUE awaiting_confirmation, disputed`. Отдельная миграция из-за ограничения PG (новое ENUM-значение нельзя использовать в той же транзакции).
   - `0072_lifecycle_columns_and_constraints.sql` — 12 колонок + 3 consistency-CHECK + индексы + backfill + fix constraint (`orders_picked_only_after_accept`) + default expires_at 30d→14d.
   - `0073_order_status_log.sql` — audit log таблица + RLS + AFTER UPDATE trigger + backfill ('system' rows).
   - `0074_lifecycle_rpcs.sql` — 5 RPCs (SECURITY INVOKER, auth.uid checks, push + audit_log writes).
   - `0075_lifecycle_crons.sql` — 2 cron'а + `trg_bump_order_activity_on_message`.
   - `0076_lifecycle_rls.sql` — DROP picked_master_can_complete + новая `orders_picked_master_lifecycle` + расширения owner/read policies.

4. **TS-типы регенерированы** ([`src/types/database.ts`](src/types/database.ts)) — `awaiting_confirmation`/`disputed` в enum, 5 новых RPC, 12 новых колонок orders, новая таблица order_status_log.

5. **Frontend — 5 хуков** в [`src/features/orders/`](src/features/orders/):
   - `use-withdraw-response.ts` (T15)
   - `use-mark-order-done.ts` (T8)
   - `use-confirm-completion.ts` (T4/T5)
   - `use-open-dispute.ts` (T10/T12 + client-side validation 10-1000 chars)
   - `use-reopen-order.ts` (T9 + pure-helper `canReopenOrder`)
   - `use-complete-order.ts` — deprecated-обёртка над `useConfirmCompletion` (re-export для backwards-compat в других местах).

6. **Frontend — компоненты:**
   - [`OrderStatusBadge.tsx`](src/components/OrderStatusBadge.tsx) — 2 новых статуса (accent-soft, error-soft).
   - [`OrderRow.tsx`](src/components/OrderRow.tsx) — `STATUS_META` обновлён для awaiting_confirmation/disputed.
   - [`MasterDashboardOrders.tsx`](src/features/master-view/MasterDashboardOrders.tsx) — `isActiveResponse` теперь исключает `expired`/`disputed`/`awaiting_confirmation` (плюс accepted из bug-fix).

7. **Frontend — UI /orders/[id]:**
   - `CompletionSection` полностью переписан под role × status × CTA matrix. master (in_progress) → «Работа выполнена» (T8); master (awaiting) → read-only countdown + «Открыть спор»; client (in_progress/awaiting) → «Подтвердить выполнение» (T4/T5) + «Открыть спор» (T10/T12); disputed → read-only блок саппорта.
   - `DisputeBottomSheet` (новый локальный компонент) — форма открытия спора с textarea + counter 10/1000 + validation.
   - `ReopenSection` (новый) — кнопка «Возобновить заказ» для клиента + cancelled/expired в 7-дневном окне (T9).
   - `MasterResponseSection` — добавлена кнопка «Отозвать отклик» для status `sent`/`viewed` пока order `open`.

8. **Verify в preview:** tsc clean. Открыл `/orders/{id}` master-роль + in_progress → рендерятся «Работа выполнена», caption «Клиент получит уведомление и подтвердит за 72 часа — либо заказ закроется автоматически», «Открыть спор», «Ваш отклик» card. Console clean. Скриншот сохранён.

## Новые правила и решения

- **Lifecycle = единый источник истины.** [`docs/lifecycle.md`](docs/lifecycle.md) объединяет state-machine `orders` + `order_responses` + связанные. `docs/order-states.md` — legacy, остаётся для исторической справки T1–T7.
- **State transition через RPC.** Master никогда не пишет `status='completed'` напрямую — только RPC `mark_order_done` → `awaiting_confirmation`. Это гарантирует audit log с правильным transition_code + push клиенту. RLS-policy `orders_picked_master_can_complete` удалена.
- **Audit log обязателен** для всех transition'ов. AFTER UPDATE trigger пишет автоматом с `transition_code=NULL`. RPC при необходимости явно записывает `transition_code` (T8, T11 и т.д.) через INSERT.
- **TTL согласованы с user:** open=14d, awaiting_confirmation=72h, stale in_progress=30d, reopen window=7d, dispute SLA=5 рабочих дней, reviews window=14d.
- **Mark-done flow dual-confirmation как YouDo СБР (lite-версия без денег)** — мастер пометил «выполнено», клиент 72ч на подтвердить/оспорить, иначе auto-confirm.
- **Reopen возвращает все historical responses в withdrawn** и push'ает их мастеров — даём шанс откликнуться заново. История не теряется, но сделка стартует заново.

## Новые компоненты / паттерны

- `<DisputeBottomSheet>` (локальный в `orders/[id].tsx`) — форма ввода reason для open_dispute. Reuseable паттерн «BottomSheet с textarea + counter + validate». Когда-то можно вынести как `<TextareaBottomSheet>` если понадобится в других сценариях.
- `<ReopenSection>` (локальный) — паттерн «countdown окна возможности» (X дней осталось). Когда нужен в других сценариях (например, окно изменить отзыв) — можно вынести.
- `canReopenOrder(status, updatedAt)` (helper в `use-reopen-order.ts`) — pure-функция для проверки доступности reopen. UI-агностик, можно использовать для conditional рендера или disable.
- `order_status_log` таблица — основа для саппорт-UI (история заказа) и аналитики (avg time-to-complete, dispute rate и т.п.). Заполняется автоматически через trigger.

## Anti-patterns обнаруженные в сессии

- **`ALTER TYPE ENUM ADD VALUE` в одной транзакции с использованием значения** падает с ошибкой. Разделяю на 2 миграции: 1 — только ENUM (commit), 2 — DDL/DML с новым значением.
- **Старый constraint `orders_picked_only_if_in_progress`** запрещал T6 (in_progress→cancelled с picked NOT NULL) — баг был зафиксирован в docs/order-states.md как «известный», но прод-cancel сценарии его не триггерили (большинство cancel'ов были из open). Sprint 0072 заменил на `orders_picked_only_after_accept`. Урок: constraints должны строго соответствовать матрице переходов, иначе RLS/RPC могут «всё разрешать», а CHECK незаметно падать на пограничном кейсе.
- **`last_activity_at` без триггера на messages** — cron auto-cancel оставался бы пустым. Решение: триггер `trg_bump_order_activity_on_message` обновляет `last_activity_at` на каждое сообщение в чате (только для in_progress/awaiting_confirmation/disputed — терминальные не трогаем).
- **Master direct UPDATE status='completed' через RLS policy** — раньше работало, но проходило мимо audit log и push'а клиенту. Заменено RPC mark_order_done с T8 транзишеном. Прежний UPDATE-flow окажется заблокирован DROPed policy `orders_picked_master_can_complete` — но это намеренно, теперь только через RPC.
- **OrderStatusBadge не покрывал новые статусы** — TypeScript бы поймал, если бы я просто добавил без обновления `STYLES` (поле `Record<OrderStatusValue, BadgeStyle>` требует все ключи). Сделал обновление в один Edit для согласованности.

## Открытые вопросы / TODO

- **Карма-система** (§8 lifecycle.md). Таблица `user_reputation` или поля в `users`/`master_profiles`. Сначала собираем данные через `order_status_log` (sprint 0073) — после месяца можно делать первый pass thresholds.
- **Double-blind отзывы** (§6). RLS-policy на `reviews_read` — `visible_to_other_side = (other_side_submitted OR review_window_closed)`. Защита от ответок (важно в маленьком регионе).
- **Notifications cascade warnings** (§5.2):
  - T-7d, T-1d до expire (push клиенту);
  - T+24h, T+48h в awaiting_confirmation (push клиенту);
  - in_progress no activity 14d (push обеим сторонам);
  - completed T+1d / T+7d / T+13d review reminders.
  
  Нужна функция `send_lifecycle_reminders` + cron 10:00 МСК + dedup (если несколько push'ей за час — один объединённый).
- **`nightly_close_review_windows`** cron. После `completed_at < now() - 14d` — отметка `reviews_closed_at`. UI-маркер «окно отзыва закрыто».
- **Admin UI для саппорта** (T14: dispute → completed/cancelled). Service-role mutation, audit-log запись с `triggered_kind='support'`. Может быть отдельный admin-route `/admin/dispute/[id]` либо просто SQL-командой пока.
- **Client/master delete: CASCADE → SET NULL.** Сейчас удаление клиента уносит всю историю — мастер теряет данные о работе. Требует:
  1. Сделать `orders.client_id` NULLABLE;
  2. ALTER FK на SET NULL;
  3. Обновить RLS policies (везде где `(SELECT auth.uid()) = client_id` — проверять `client_id IS NOT NULL AND ...`);
  4. UI fallback «[удалённый клиент]».
- **Деприкация `docs/order-states.md`** — добавить header «DEPRECATED, see [`docs/lifecycle.md`](./lifecycle.md)» либо удалить, оставив одну строку-stub.

## Ссылки

- Спецификация: [`docs/lifecycle.md`](docs/lifecycle.md)
- Текущий state: [`STATUS.md`](STATUS.md)
- Старая спека: [`docs/order-states.md`](docs/order-states.md) (legacy)
- Связанная: [`docs/chat-states.md`](docs/chat-states.md)
- Хуки: [`src/features/orders/use-*.ts`](src/features/orders/)
- UI: [`app/(tabs)/orders/[id].tsx`](app/(tabs)/orders/[id].tsx)

---

## Поздним вечером — services-suggest редизайн + новые pricing kinds

### TL;DR
Экран `/profile/services-suggest` переделан под фидбэк: убраны дефолтные ценники (≈ X ₽) под названиями услуг, при выборе цена не предзаполняется, добавлены 4 chip-варианта типа цены (Точная / От / До / Договорная — раньше был только «от»), блок «Своя услуга» поднят наверх и сжат до collapse-by-default pill-кнопки.

### Закрытые задачи

**A. Миграция `0080_service_pricing_kind_add_from_up_to.sql`** — добавила `'from'` и `'up_to'` в enum `service_pricing_kind`. Раньше было `fixed/range/hourly/quote`; режим «До» полностью отсутствовал, режим «От» эмулировался через `range` без price_max. PG-ограничение: `ADD VALUE` отдельной миграцией от любых INSERT/UPDATE с новым значением — выделил миграцию строго под ALTER TYPE.

**B. Helper-обновление [`src/features/master-services/use-master-services.ts`](src/features/master-services/use-master-services.ts):**
- `PRICING_KIND_LABELS` для `from`/`up_to` (= «От» / «До»). `fixed` переименован «Фикс. цена» → «Точная» (короче, понятнее).
- Новый export `PRICING_KIND_OPTIONS` — список kind'ов для picker'а (5 штук, без legacy `range`).
- `formatServicePrice` полностью переписан: `fixed` теперь даёт `«1 500 ₽»` (раньше ошибочно показывал `«от 1 500 ₽»`), `from` — `«от 1 500 ₽»`, `up_to` — `«до 2 000 ₽»` (читает из `price_max`), `quote` — `«Договорная»`, `hourly` — `«от X ₽ / час»`, `range` (legacy) — `«от X ₽»`.

**C. [`MasterServicesList.tsx`](src/features/master-services/MasterServicesList.tsx)** — display-логика для read-only прайса на master/[id]. Раньше всегда использовал `formatPriceRange` (всегда «от X ₽»). Теперь:
- `fixed` → точная цена без префикса
- `up_to` → «до X ₽» (читает `price_max ?? price_min`)
- остальные → как раньше через `formatPriceRange`

**D. [`MasterServicesSection.tsx`](src/features/master-services/MasterServicesSection.tsx)** — CRUD форма прайса (edit-master). Переименовал internal state `priceMin`/`priceMax` → `priceValue`/`priceMaxLegacy` (semantically «цена которую мастер ввёл» + поле только для legacy `range`-записей). При submit:
- `up_to` → `price_min=null, price_max=value` (новое распределение)
- `fixed`/`from`/`hourly` → `price_min=value, price_max=null`
- `range` (legacy edit) → `price_min=value, price_max=maxOut`
- `quote` → `price_min=null, price_max=null`

`KIND_OPTIONS` теперь = `PRICING_KIND_OPTIONS` (5 kinds без `range`). Label поля цены динамически меняется: «Цена, ₽» / «Цена от, ₽» / «Цена до, ₽» / «₽ / час».

**E. [`/profile/services-suggest`](app/(tabs)/profile/services-suggest.tsx) — главный редизайн под фидбэк user:**
- Убран helper `suggestedPrice` и caption `≈ X ₽` под названиями L3 — список теперь чистый.
- `SelectionState` расширен: `{ priceKind: ServicePricingKind, priceValue: number | null }` (раньше — только `priceMin`).
- При тапе на L3 — раскрывается inline-форма: 4 chip-pill (Точная/От/До/Договорная) + одно поле цены с placeholder «Цена» (без числовой подсказки). По умолчанию kind = «Точная», value = null.
- При переключении на «Договорная» поле цены скрывается.
- Блок «Своя услуга» перенесён **наверх** (после L2 chips, до списка L3). Раньше был в конце длинного списка и пользователю приходилось скроллить.
- «Своя услуга» теперь collapse-by-default: одна pill-кнопка `+ Своя услуга`. Тап → раскрывается компактная форма (`p-3`, title input + 4 chip kind + price input + кнопка). После save — сворачивается + success-caption «Добавлено: X».
- Новый компонент `<CustomServicePanel>` внутри файла — самодостаточный (props через интерфейс), может быть вынесен если ещё где-то нужен (пока — нет).
- Pure-функция `preparePayload(kind, value)` — разводит kind+value по `{price_min, price_max, pricing_kind}`. Включает safe-fallback: если kind=fixed/from/up_to но value=null → сохраняем как `quote` (предотвращает «Договорная» display при kind='fixed').

### Verify в preview
- `tsc --noEmit` clean.
- `/profile/services-suggest?l2=plumbing` рендерит: L2 chips (Сантехника active), `+ Своя услуга` pill, чистый список L3 без ≈ X ₽ ценников, sticky `Выберите услуги`.
- Click на «Замена смесителя» → раскрывается форма: 4 chip-pill, активна «Точная» (accent-soft blue), пустое поле «Цена».
- Click на «Своя услуга» → раскрывается компактная card с title input, chip-row, price input. Активна «Точная».
- Click на «Договорная» в «Своей услуге» → поле цены скрывается, кнопка disabled пока название не введено.
- Скриншоты сохранены (3 шт: начальный экран / раскрытый L3 / «Своя услуга» в режиме «Договорная»).

### Anti-patterns пойманные

- **`formatServicePrice` сваливал все kind'ы в `«от X ₽»`** через `formatPriceRange`. Это давало неконсистентный UX: kind picker предлагал «Фикс. цена», но display рисовал «от 1500 ₽» как у range. Исправлено — каждый kind форматируется по-своему.
- **`SelectionState` хранил только `{priceMin}`** — не было места для kind/price_max. Расширение на `{priceKind, priceValue}` позволяет хранить любой kind однозначно.
- **Default priceValue из `suggestedPrice(l3)`** — заполнял поле «правильной» ценой. Пользователю это мешало: он каждый раз стирал и набирал свою. Решение — пустое поле + ненавязчивый placeholder «Цена».
- **`master_services.up_to` отсутствовал в enum.** Если бы добавил chip-режим «До» без миграции — TS ругался бы, save падал бы на CHECK-constraint Postgres. Сделал миграцию ПЕРЕД UI-изменением.

### Открытые вопросы / TODO

- **Деприкация `pricing_kind='range'`.** Сейчас legacy-записи остаются читаемыми. Если в БД 0 записей с `range` — можно сделать миграцию data backfill (`UPDATE master_services SET pricing_kind='from' WHERE pricing_kind='range'`) и потом дропнуть значение из enum через rebuild (PG `ALTER TYPE` не поддерживает `DROP VALUE` — нужно создавать новый enum и пересоздавать column). Пока оставил как есть.
- **На /orders/[id] formatPrice для откликов мастера.** Там отдельный formatter из `order-schema.ts` (`order_price_kind` enum, не `service_pricing_kind`). Не трогал — структурно другая сущность.

### Файлы изменены
- `supabase/migrations/0080_service_pricing_kind_add_from_up_to.sql` (новый)
- `src/types/database.ts` (точечно — 2 строки enum)
- `src/features/master-services/use-master-services.ts`
- `src/features/master-services/MasterServicesList.tsx`
- `src/features/master-services/MasterServicesSection.tsx`
- `app/(tabs)/profile/services-suggest.tsx` (полная переписка)
