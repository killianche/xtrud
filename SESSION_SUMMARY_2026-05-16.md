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


---

## Session block N — Desktop responsive (категории grid + master hero 16:9)

### Контекст
User в браузерной версии (1280px viewport) обнаружил два визуальных провала:
1. Секция «Все мастера» на главной — 30+ категорий list-view в одну колонку → бесконечная простыня.
2. Карточка мастера `/master/[id]` — hero-фото портретное 4:5 на ширине 1120px → высота 1400px, основной контент (имя, рейтинг, описание, услуги) уезжает за фолд.

Просьба: сделать категории в 2-3 столбца на desktop; уменьшить hero у мастера до разумного размера, как в больших референсах.

### Lazyweb-референсы
- Категории grid: afterpay/categories-home (grid тайлов), people/shopping-kitchen (multi-column grid), zara/search (grid). Все marketplace на широком экране — grid, не list.
- Master hero: Airbnb/listing detail, Booking/property — landscape (~2:1, никогда не 5:4 портрет), потолок ~580px высоты.

### Решение
**Брейкпойнты через `useWindowDimensions()` + inline width%:**
- `< 768` (mobile): сохранён list-view категорий + 4:5 hero.
- `≥ 768` (tablet): grid 2 колонки, hero 16:9 c потолком 520px.
- `≥ 1024` (laptop+): grid 3 колонки, hero 16:9 c потолком 520px.

**Категории grid** (`AllCategories` в `app/(tabs)/index.tsx:608`):
- Карточки `rounded-lg border-hairline bg-canvas`, иконка-в-круге + название + caret-right (та же визуальная единица, что и в list-view, просто в bordered card).
- Wrapper: `flexDirection: row, flexWrap: wrap, marginHorizontal: -6`; каждый items в `View` с `width: '${100/columns}%', padding: 6` — Tailwind-style gap через padding половинок (без `gap` потому что flex-wrap + gap иногда даёт перенос лишних пикселей в RN-Web).

**Master hero** (`PortfolioPager` + skeleton в `app/(tabs)/master/[id].tsx`):
- На desktop `heroHeight = Math.min(containerWidth × 9/16, 520)` — landscape с потолком 520px, чтобы на ultrawide hero не разрастался до 700px+.
- Skeleton отдельно — использует `viewportWidth` (из родительского `useWindowDimensions`), потому что у него нет своего onLayout-измерения.

### Anti-pattern зафиксирован
**`<Animated.View className="flex-row flex-wrap">` на RN-Web** даёт `computed display: flex; flex-direction: column; flex-wrap: nowrap` — Tailwind-классы flex-direction/flex-wrap не докатывают до Animated.View через NativeWind transform на web. `mt-4` / `px-5` работают, а `flex-row` / `flex-wrap` — нет.

**Правило:** для row-wrap layout'а на Animated.View — всегда inline `style={{flexDirection: "row", flexWrap: "wrap"}}`, не className.

### Verify в preview
- `npx tsc --noEmit` clean.
- Desktop 1280: `Сантехника(x=80)`, `Электрика(x=457)`, `Ремонт(x=834)` на одной строке (3 колонки); hero `1120×520`.
- Tablet 768: `Сантехника(x=0)`, `Электрика(x=390)` на одной строке (2 колонки).
- Mobile 375: flex-direction=column, list-view как раньше.
- 2 скриншота: home/desktop-3col + master/desktop-hero-landscape.

### Файлы изменены
- `app/(tabs)/index.tsx` — `AllCategories`: добавлен `isGrid`-branch (grid 2/3 cols), импорт `useWindowDimensions`.
- `app/(tabs)/master/[id].tsx` — `PortfolioPager.heroHeight` desktop-aware; outer skeleton тоже использует desktop-flag.
- `STATUS.md` — новая секция «Текущее состояние».

---

## Session block N+1 — Desktop UX: header consolidation, sticky, auth back

### Контекст
После предыдущего блока (категории grid + hero мастера 16:9) user прислал серию правок по компьютерной версии:
1. На главной — два хедера один над другим (WebShell-bar с «xtrud» текстом + внутренний TopBar страницы с логотипом + Назрань + Войти).
2. На `/auth/phone` нет back-кнопки — пользователь, передумавший вводить номер, в тупике.
3. На скролле на category-page хедер с фильтрами пропадает.
4. Чипы Город/Услуга/Сортировка на category-page лежат ниже заголовка — пустое место справа.

### Решения

**1. Header consolidation.** CitySelector + auth-button перенесены из page-TopBar в WebShell right-actions. Page-TopBar условно скрывается через `isDesktopWeb` (Platform.OS === "web" && width >= 768). Mobile поведение сохраняется.

**2. Back-кнопка на auth/phone.** Добавлен CaretLeft 24/bold + `useSafeBack("/")` в верх экрана. Размер 40×40 тач-таргет, padding `-ml-2` чтобы chevron выровнялся с левым краем content.

**3. Sticky category header на desktop.** `handleScroll` rано выходит при `isDesktopWeb`, translateY-анимация не стартует. На mobile сохранена auto-hide.

**4. Chips inline.** На desktop chips рендерятся в той же строке `flex-row` с back+title (после flex-1 title), правый край. Mobile renders chips в отдельном ScrollView ниже (как было).

### Anti-pattern зафиксирован
**Дублирование navigation между WebShell и page-TopBar.** WebShell задумывался как app-shell на desktop (logo + nav links + theme + auth), а страницы рисовали свой собственный header с теми же элементами. Получалось 2 этажа nav-а: один в WebShell, второй в начале каждой страницы. Правильнее — WebShell **полный** desktop-shell (включая city/auth), страницы внутри него рисуют **только page-specific** контент.

### Verify в preview
- `npx tsc --noEmit` clean.
- Desktop /  — один header: SVG-logo слева + Главная/Заказы/Чаты + theme-toggle + Назрань-pill + аватар (или Войти если анон). Внутренний TopBar нет; Hero «Найдутся мастера» сразу под WebShell.
- Desktop /category/plumbing — title «Сантехника» + chips «Ингушетия / Услуга / По рейтингу» на одной строке (Y=85 / Y=81). После scroll 2000px и WebShell, и category-row остаются на экране (Y=16, Y=85).
- Mobile / — TopBar остался: SVG-logo + «xtrud» + Назрань + (Войти если анон).
- Back-кнопка на /auth/phone добавлена в коде (TS clean), визуальный verify невозможен — protected-route redirect отправляет logged-in user обратно.

### Файлы изменены
- `src/components/WebShell.tsx` — added CitySelector + auth-button, removed standalone avatar-User-icon block.
- `app/(tabs)/index.tsx` — `isDesktopWeb`-флаг + условный render `<TopBar>`.
- `app/(auth)/phone.tsx` — back-кнопка через `useSafeBack`.
- `app/(tabs)/category/[id].tsx` — `isDesktopWeb`-флаг, skip hide-on-scroll, inline chips в title-row, conditional padding-top.

---

## Session block N+2 — Закрытие открытых пунктов (sticky-аудит + visual back-verify)

### Закрытые задачи

1. **Sticky-аудит всех tab-страниц.** Проверил `app/(tabs)/orders/index.tsx`, `chats/index.tsx`, `profile/index.tsx`, `master/[id].tsx`. Только `category/[id]` имел auto-hide animation (translateY). Остальные используют `<ScreenHeader>` как sibling-элемент к ScrollView — то есть ScreenHeader **вне** scroll-контейнера и остаётся sticky относительно WebShell. Дополнительные правки не нужны.

2. **Visual verify back-кнопки на `/phone`.** Sign out → клик «Войти» в WebShell → `/phone` показал back-кнопка в left-top (x=16, y=16) → screenshot подтверждает; клик back → возврат на `/profile`. Работает.

### Anti-pattern (упомянутый ранее в этом дне): уточнение
Я писал, что «дублирование navigation между WebShell и page-TopBar — anti-pattern». При sticky-аудите подтвердилось: остальные страницы делают правильно — кладут ScreenHeader **сиблингом** ScrollView (не внутри). Это автоматически даёт sticky-поведение, плюс не дублирует функционал WebShell. **Шаблон для новых tab-страниц:**

```tsx
<View className="flex-1 bg-canvas">
  <ScreenHeader title="…" />     {/* outside ScrollView → sticky */}
  <ScrollView>
    {/* page content */}
  </ScrollView>
</View>
```

НЕ:
```tsx
<View>
  <ScrollView>
    <ScreenHeader title="…" />   {/* inside ScrollView → scrolls away */}
    ...
  </ScrollView>
</View>
```

Это правило стоит зафиксировать в `UI_PATTERNS.md` следующей правкой.

---

## Session block N+3 — Master nav fix в WebShell

### Контекст
User: «Подправь вид мастера, когда ты со стороны мастера работаешь. Там в хедре у компьютерной версии не бывает кнопок поиска заказов и так далее.»

### Проблема
В `WebShell.tsx` для роли `master` рисовался nav без ссылки `/orders/search`. Старый комментарий объяснял: «На desktop отдельной кнопки «Поиск» нет; мастеру логично уходить с главной (там и поиск, и его текущие заявки).» Это было неправильно — мастер на mobile получает центральный таб «🔍 Поиск заказов» в TabBar, а на desktop теряет этот доступ.

### Решение
В `WebShell.navItems`:
- client (как было): Главная / Заказы / Чаты
- master (новое): Главная / **Поиск заказов** / Чаты — `{ href: "/(tabs)/orders/search", match: "/orders/search", label: "Поиск заказов", icon: MagnifyingGlass }`.

Тип `NavItem.href` расширен на `"/(tabs)/orders/search"`.

### Verify в preview
- TS clean.
- Sign in под `+79000000003` (Руслан Хамхоев, master).
- WebShell теперь показывает 3 ссылки: Главная (active) / Поиск заказов / Чаты.
- Клик «Поиск заказов» → `/orders/search` → лента open-заявок ("Покрасить стену в детской", "Замена смесителя на кухне", "Прорвало трубу в санузле" — 5 заявок) рендерится, link подсвечен.

---

## Session block N+4 — Bug fix: lifecycle RPC + permission denied for notify_user

### Контекст
User: «нажал прекратить сотрудничество, выдало ошибку. Надо полностью сделать рабочим весь функционал». На скриншоте видна красная надпись `permission denied for function notify_user` после клика «Прекратить сотрудничество» на `/orders/[id]`.

### Root cause анализ
1. `notify_user` (миграция 0027) — `SECURITY DEFINER`, читает vault-secret и шлёт async-push через pg_net.
2. Миграция 0018 делает `REVOKE EXECUTE ON FUNCTION public.notify_user FROM authenticated` — правильно: иначе авторизованный пользователь мог бы вызвать её напрямую с supabase-js и спамить push любому user_id (notify_user не знает кто вызывает, она только проверяет существование secret'а).
3. Lifecycle RPC (миграция 0074: `withdraw_response`, `mark_order_done`, `confirm_completion`, `open_dispute`, `reopen_order` + миграция 0077: `terminate_cooperation`) — все `SECURITY INVOKER` → действуют от имени authenticated → внутренний `PERFORM notify_user(...)` падает с permission denied.
4. То есть из 6 lifecycle RPC ни одна не могла отправить push, и `terminate_cooperation` даже не могла завершить транзакцию (т.к. notify_user падал до конца, всё откатывалось). Это была **тихая бомба** — user обнаружил только сейчас при первом фактическом клике на `terminate_cooperation` в проде.

### Решение — миграция 0081
`ALTER FUNCTION ... SECURITY DEFINER` для всех 6 RPC. Безопасно, потому что каждая внутри:
1. Проверяет `auth.uid() != NULL`.
2. Проверяет участие пользователя в заказе (client_id / picked_master_id / master_id для responses).
3. Проверяет валидность source-status для перехода.

SECURITY DEFINER даёт функции доступ к `notify_user` (как owner), а bypass RLS на orders/order_responses безопасен потому что функция сама себе RLS.

### Verify
Эмулировал authenticated-вызов через SQL:
```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<picked_master_id>';
PERFORM public.terminate_cooperation('<order_id>', 'тест после фикса 0081');
```
Результат: order перешёл `in_progress → cancelled`, `cancelled_by` = picked_master_id, `cancel_reason` записан, лог `order_status_log` с `transition_code='T6t'` появился. Никакого `permission denied`. Откатил тестовое изменение для дальнейшего ручного UI-теста.

Visual UI verify в preview частично — клик на «Прекратить сотрудничество» открывает BottomSheet, который блокирует preview_eval (Playwright timeout). Renderer повис, пришлось перезапустить preview-сервер. RPC-результат подтверждён на DB-уровне — UI просто оборачивает этот же вызов через supabase-js `.rpc('terminate_cooperation', ...)`.

### Anti-pattern зафиксирован
**SECURITY INVOKER RPC + call to SECURITY DEFINER notify_user, без grant на notify_user для authenticated.** Если RPC должен слать push — должен быть SECURITY DEFINER. Альтернатива (GRANT EXECUTE на notify_user authenticated) — небезопасна, открывает spam push. Чек-лист для будущих lifecycle RPC: если внутри `PERFORM notify_user(...)` → объявляй RPC `SECURITY DEFINER` (+ auth.uid() check в начале).

### Файлы изменены
- `supabase/migrations/0081_lifecycle_rpcs_security_definer.sql` (новый, applied)
- `STATUS.md` (новая запись в Current state)

---

## Session block N+5 — Taxonomy synonyms audit (миграция 0082)

### Контекст
User: «не вижу обычной категории Обои при поиске. Надо категории и подкатегории проверить и найти подобные проблемы и исправить».

### Аудит — что нашли
SQL-аудит `category_terms` против `categories_l2 is_visible=true`:

1. **Dead synonyms.** 12 термов мапятся на L2 `appliances` (Бытовая техника) и `cleaning` (Клининг). Обе с l1=home-services, `is_visible=false` (Product scope MVP, только construction). RPC search_categories через `WHERE is_visible = true` исключает их. Юзер пишет «стиралка», «холодильник», «уборка», «химчистка», «генеральная» — пусто.

2. **Категории без синонимов.** 24 из 34 visible L2 имели 0 термов в `category_terms`. Запросы «забор», «крыша», «ламинат», «паркет», «потолок», «мебель», «утепление», «гипсокартон», «бетон», «фасад», «кирпич», «дизайн», «сварка», «антенна», «натяжной потолок», «уборка после ремонта», «ремонт квартиры» — работали только через FTS по name_ru. FTS в russian-стеммере знает морфологию («забор/заборы/забором»), но не семантику («крыша» vs «кровля» — разные лексемы). Часто 0 хитов или нерелевантные.

### Решение — миграция 0082
1. **Remap** dead synonyms через UPDATE на construction-аналоги:
   - `appliances` → `appliance-repair` (Ремонт бытовой техники).
   - `cleaning` → `cleaning-post-renovation` (Уборка после ремонта).
2. **Insert 160+ synonyms** для 24 пустых L2. Эталон Thumbtack expanded list ~1000 terms; добавили основные русскоязычные паттерны из Wordstat/Avito Услуги/Profi.ru:
   - Прямой синоним (вес 100): «забор» → fences-gates, «крыша» → roofing.
   - Народные термины (вес 90-100): «стиралка», «икея», «муж на час».
   - Бренды / типы материалов (вес 90-100): «триколор», «армстронг», «короед».
3. **Итого:** category_terms вырос с ~60 до 224 термов. 0 visible L2 без synonyms.

### Verify
SQL-test 15 проблемных запросов — все возвращают правильную L2 как top-hit (score 0.7–1.0). UI-test в preview: «обои» → top-hit «Штукатурка, шпаклёвка, покраска» с бейджем «Категория»; «забор» → top-hit «Заборы и ворота» с бейджем + L3 услуги под ним.

### + UI improvement в /search.tsx
Добавил pill-бейдж `«Категория»` справа от каждого L2-результата (`bg-canvas-soft-2`, text-caption mute). Раньше L2 «Штукатурка, шпаклёвка, покраска» и L3 «Поклейка обоев» рендерились одинаковым text-body-lg → пользователь не понимал что есть категория, что есть услуга внутри неё. Теперь L2 явно выделена.

### Anti-pattern зафиксирован
**Synonym мапятся на категории, которые UI не показывает.** При product scope-фильтре (MVP construction-only) hidden categories выпадают из search-RPC. Если synonyms не были мигрированы — мёртвый функционал, фронтенд молча возвращает 0 хитов. Чек-лист для будущих scope-изменений: при `is_visible=false` для L2 → пересмотреть category_terms, перенацелить на аналог или удалить.

**Категории без synonyms на старте — мина замедленного действия.** FTS+trigram даёт ложное чувство покрытия (морфология + опечатки), но не семантику. Каждая новая L2 при создании ДОЛЖНА получать минимум 3-5 базовых synonyms сразу — иначе она невидима в поиске для всех кроме тех, кто угадал точное название.

### Файлы изменены
- `supabase/migrations/0082_category_synonyms_audit.sql` (новый, applied)
- `app/(tabs)/search.tsx` — рендер `<Pressable>` теперь flex-row с условным pill «Категория» справа для item.type === 'l2'.
- `STATUS.md`

---

## Session block N+6 — Wallpaper L2 split (миграция 0083)

### Контекст
После 0082 (synonyms audit) user: «почему нет Обои??». Search «обои» возвращал L2 «Штукатурка, шпаклёвка, покраска» с бейджем «Категория», но пользователь ждал именно «Обои» как top-result.

### Решение
Эталон Profi.ru/Avito Услуги: «Поклейка обоев» — отдельная top-level service category, не сабкатегория малярки. Мастер-обойщик ≠ маляр. Создана новая L2 `wallpaper`:

1. INSERT в categories_l2: id='wallpaper', name_ru='Обои', icon='Paintbrush', l1='construction', sort_order=105.
2. UPDATE 8 L3 wallpaper-* → l2_id='wallpaper': paper, vinyl, paintable, fleece, photo, liquid, removal, repair.
3. UPDATE 4 обои-synonyms (обои, оклейка, переклеить, поклеить обои) → l2='wallpaper'. Добавлены ещё 7: поклейка, поклеить, наклеить обои, обойщик, фотообои, флизелин, флизелиновые.
4. UPDATE painting.name_ru: «Штукатурка, шпаклёвка, покраска» → «Штукатурка и покраска» (короче, обои больше внутри нет).
5. Frontend: `src/lib/category-color-icons.ts` — добавлен mapping `wallpaper: twemoji/scroll` (свиток = рулон).

### Не трогали
- master_categories: 3 мастера на painting остаются там; если они обойщики — добавят wallpaper через UI.
- master_services: 0 строк с wallpaper-* l3_id.
- orders (2) / reviews (1) с l2_id='painting': один заказ по title явно про обои («Поклеить обои в зале»), но автоматическая реклассификация по тексту небезопасна.

### Verify
- DB: `search_categories('обои')` → top-hit `Обои (l2, score 1, sources=fts+synonym+trigram)` + 4 L3 ниже под wallpaper l2_id.
- UI (375px): /search «обои» → top «Обои» с бейджем «Категория» + 8 L3-услуг.

### Anti-pattern зафиксирован
**L2 имя содержит несколько концепций, при росте часть конкурирует с другими L2.** Bundled L2 типа «Штукатурка, шпаклёвка, покраска» удобен на старте (мало мастеров) но становится тормозом UX: поиск по любому из ключевых слов попадает в один и тот же container, search-выдача с одинаковыми L3-результатами для разных запросов. Решение — split, когда (а) есть критическая масса L3 одного типа (тут 8), (б) есть отдельный класс мастеров (обойщик ≠ маляр), (в) пользователи ищут по этому имени явно.

### Файлы изменены
- `supabase/migrations/0083_split_wallpaper_l2.sql` (новый, applied)
- `src/lib/category-color-icons.ts` — wallpaper entry
- `STATUS.md`

---

## Session block N+7 — Search overhaul (миграция 0084)

### Контекст
User: «у нас поиск кривой — рез не находит, а резк находит» → «почему такой ужасный поиск?» → «подключи агента, который подходящей роли». Запрос на research-уровень исследование с подключением спецагента.

### Research-агент
Спавнен general-purpose subagent с детальным брифом — изучить эталоны (Yandex.Услуги, Profi.ru, Avito Услуги, Google autocomplete, СберУслуги, TaskRabbit, Thumbtack, Baymard, Algolia, Meilisearch) + ответить на 7 технических вопросов (prefix-matching, ranking, did-you-mean, browse-mode и т.д.). Отчёт под 1500 слов, приоритезированный P0/P1/P2 + явные anti-patterns. 14 источников.

### Root cause (4 бага)
1. **No prefix-расширение.** `websearch_to_tsquery('russian', 'рез')` → лексема `рез` после стемминга. Стеммер работает по полным словам (лемматизация), не expand. Лемма «Резка» = `резк`. `рез` != `резк` → mismatch. Класс пострадавших: «рез», «тех», «обо», «сан», «лам», «гип», «кров», «окн», «нат», «эле» и т.д.
2. **Trigram threshold глобальный 0.3.** 3-символьная подстрока vs 20-символьное имя категории даёт `similarity ~0.12 < 0.3` → trigram-слой не спасает.
3. **Source-веса перепутаны.** `synonym weight/100` (0–1) vs `fts=0.7` фикс → синоним weight=50 (0.5) ПРОИГРЫВАЕТ FTS 0.7. Ручной тезаурус «обои → finishing» терял приоритет автоматическому стеммеру.
4. **Без debounce.** На каждый keystroke RPC → мерцание + race conditions.

### Решение — миграция 0084
```sql
-- Prefix-marker на последнем токене (не на каждом — эталон Algolia/Google):
'сантехник плитка' → 'сантехник & плитка:*'
'рез'              → 'рез:*' → ловит «Резка»
```
- Sanitize regex (`[^а-яёa-z0-9\s]`) для безопасного cast.
- Fallback `plainto_tsquery` в EXCEPTION.
- Dynamic trigram threshold: `length(q) <= 4 ? 0.18 : 0.3`.
- Range-separated source: synonym `0.60..1.00`, fts `0.30..0.60`, trigram `0.00..0.30` → порядок гарантирован.
- Type casts на `::numeric` для всех score-выражений (PG отказывается принимать `double precision` в `RETURNS TABLE (..., score numeric, ...)` без явного cast).

### Frontend
Новый хук `src/lib/use-debounced-value.ts` (универсальный, 200ms default). `/search.tsx`:
- `trimmedQuery` → `debouncedQuery` для RPC-вызова.
- `highlightQuery` тоже от `debouncedQuery` — синхрон с данными.

### Verify (DB-test)
14 запросов: рез → Резка / алмазное бурение (l3, 0.32, fts) ✓, тех → Мелкая бытовая техника ✓, обо → Обои (l2, 0.80) ✓, сан → Аварийный сантехник ✓, лам → Полы и стяжка (l2, 0.73, synonym ламинат) ✓, гип → Гипсокартон ✓, кров → Кровля ✓, окн → Окна и остекление ✓, нат → Натуральная черепица ✓, эле → Электрика ✓. Полные совпадения (обои, забор, крыша, ламинат) → score 1.00 от synonym. UI-test: «рез» в инпуте /search → top-hit «**Рез**ка / алмазное бурение» с bold-подсветкой.

### Anti-pattern зафиксирован
**`websearch_to_tsquery` для typeahead — это разовый ad-hoc query API**, не подходит для prefix-search. PG-документация четко описывает что для prefix нужен `to_tsquery(...':*')`. Сделал неправильно при первоначальной реализации (sprint 0062). Чек-лист для будущих PG-FTS: typeahead = `to_tsquery + :*`, full-document = `websearch_to_tsquery`.

**Range-separated source weights — общий паттерн.** Если объединяешь N источников через UNION, дай каждому изолированный диапазон scores. Иначе соревнование внутри одного источника пересекается с другим.

### Что отложили (P1/P2)
Из отчёта агента:
- **P1.1**: Browse popular+recent (вместо плоского списка 60 услуг). Требует AsyncStorage-ключ `xtrud:search:recent` + хардкод 8 «популярных». 2-3 часа.
- **P1.2**: «Did you mean» через `levenshtein_less_equal` + extension `fuzzystrmatch`. Banner аналогично flipped-баннеру. 1-2 часа.
- **P1.3**: Sectioned grouping (L2 крупно + 3-5 L3 под ней). Group по `l2_id` в `useMemo`. 1 час.
- **P2**: ts_headline для серверной подсветки, master-результаты в поиске, аналитика search-log, voice-search (last — overkill).

### Что НЕ делаем (явные anti-patterns от агента)
- Elasticsearch / Meilisearch / Algolia — overkill для 300 строк каталога.
- ML / vector-search / embeddings — overkill, тезаурус решает.
- Глобальный `set_limit()` через `ALTER DATABASE` — сломает другие функции.
- Prefix `:*` на ВСЕ токены — слишком много шума.
- Trigger search с 1 символа — индустриальный стандарт 2 chars.

### Файлы изменены
- `supabase/migrations/0084_search_prefix_matching.sql` (новый, applied)
- `src/lib/use-debounced-value.ts` (новый)
- `app/(tabs)/search.tsx` (используется debouncedQuery)
- `STATUS.md`
