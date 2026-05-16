# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

---

## Текущее состояние (2026-05-16 ночь — комплексный аудит 4 параллельными агентами)

**Главное:** Полный аудит проекта в 4 параллельных deep-dive'а: внутренний код-инвентарь (Explore agent), RU-конкуренты 2024-2026 (general-purpose), Global-конкуренты 2024-2026 (general-purpose), AI/modern-tech 2024-2026 (general-purpose). Синтез в `AUDIT_2026-05-16.md`.

**Ключевые выводы:**
1. **Проект на ~75% MVP** — backend production-ready (80 миграций), frontend покрывает core flow (auth → onboarding → lifecycle 8 статусов → chats → reviews → mutual rating). Code clean (0 ts-ignore, 0 console.log).
2. **Индустрия ушла в AI-эру 2024-2026:** Thumbtack+Angi в ChatGPT, Booksy в Google AI Mode, Avito Avi+Avi Pro (12 млрд ₽), Алиса AI с агентом записи на 40K салонов, Avito Подработка ИИ-колл-центр (x2 конверсия). У xtrud — 0 AI-фич, без них к 2027 будет устаревшим.
3. **Юла угрожает USP:** 50 free откликов/день, безлимит 95 ₽/мес — у нас 5/день. Удержание через master-tools и AI — survival.
4. **Боль конкурентов = наша возможность:** Profi/Avito/YouDo массово теряют доверие исполнителей (фейковые заказы, удаление позитивных отзывов, блокировки 6-летних аккаунтов). Наш free-tier + прозрачность = острейший USP когда-либо.

**Артефакты аудита:**
- [`AUDIT_2026-05-16.md`](AUDIT_2026-05-16.md) — финальный синтез: что есть → чего нет → 35 фич с приоритезацией + Sprint 22-25 план
- [`research/INTERNAL_CODE_AUDIT_2026-05-16.md`](research/INTERNAL_CODE_AUDIT_2026-05-16.md) — что реально в коде vs документации
- [`research/RU_COMPETITORS_2026-05-16.md`](research/RU_COMPETITORS_2026-05-16.md) — Profi/Я.Услуги/Avito/YouDo/Юла/Workle с фокусом на 2024-2026 новости
- [`research/GLOBAL_COMPETITORS_2026-05-16.md`](research/GLOBAL_COMPETITORS_2026-05-16.md) — 14 западных платформ
- [`research/AI_MODERN_TECH_2026-05-16.md`](research/AI_MODERN_TECH_2026-05-16.md) — tech-stack рекомендации (Claude Haiku, Replicate, Sumsub, МТС Exolve, Telegram MA), цены, AI-bookings

**Phase 1 must-have (Sprint 22-25, ~8 недель):** master verification frontend, обязательный прайс-лист (drop «договорная» default), дашборд статистики мастеру, «Время первого ответа» бейдж + lead-decay, шаблоны быстрых ответов, Instant Match push, AI-генератор описания услуги (фото→текст+теги), AI-фильтр спам-откликов (embedding sim), OpenAI Moderation на UGC, public master pages с schema.org для SEO/Google AI, real OTP, AI-визард создания заявки (голос/текст→JSON), Telegram Mini App + @xtrudbot AI-агент. Бюджет AI-stack $50-150/мес.

---

## Прежнее состояние (2026-05-16 поздно — desktop UX: header consolidation + sticky + chips inline + back на auth)

**Главное:** 4 правки desktop UX по фидбэку user, ушедших одним блоком:

1. **WebShell header consolidation на desktop.** Раньше на desktop было 2 хедера один над другим: WebShell (logo + nav + theme + avatar) + внутренний `<TopBar>` главной (logo + «xtrud» + CitySelector + Войти). Дублировал визуально. Теперь CitySelector + auth-кнопка (Войти / аватар) живут **в WebShell**, а `<TopBar>` главной скрывается через `isDesktopWeb`-флаг. На mobile (где WebShell не активен) `<TopBar>` остаётся как раньше.
2. **Back-кнопка на `/auth/phone`.** Раньше анон-пользователь, нажавший «Войти» и передумавший вводить номер, оказывался в тупике (web — нет swipe-back, native — `headerShown:false`). Добавлен CaretLeft + `useSafeBack("/")` сверху экрана.
3. **Sticky category-header на desktop.** `/category/[id]` имел auto-hide шапки на скролле (Telegram/iOS-style — скрывается при скролле вниз, появляется при скролле вверх). На широком экране это раздражает: пользователь не хочет терять контекст «Сантехника + фильтры». Hide-on-scroll отключён при `isDesktopWeb`.
4. **Chips inline с заголовком на desktop.** В `/category/[id]` чипы Город / Услуга / Сортировка раньше рисовались строкой ниже title. На широком экране пустое место справа от заголовка не использовалось. Теперь на desktop chips рендерятся в той же строке, справа (по запросу user «чтобы на одном метре находились»). На mobile сохранён прежний layout (chips ниже title — узкий экран не вмещает 3 pill + back + title).

**Файлы:**
- [`src/components/WebShell.tsx`](src/components/WebShell.tsx) — добавлены CitySelector + auth-button (Войти/Avatar) в right actions, удалена отдельная аватар-кнопка с фейк-User-иконкой.
- [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx) — `isDesktopWeb`-флаг, `<TopBar>` скрыт на desktop.
- [`app/(auth)/phone.tsx`](app/(auth)/phone.tsx) — back-кнопка сверху + `useSafeBack`.
- [`app/(tabs)/category/[id].tsx`](app/(tabs)/category/[id].tsx) — `handleScroll` skip on desktop, chips inline в header-row, padding-top контента считается через флаг.

**Verify в preview:** ✅ tsc clean. Скриншоты: home/desktop (один header, аватар справа), category/desktop (Сантехника + chips на одной строке, после scroll 2000px оба headers всё ещё видны), home/mobile (TopBar остался как раньше), /phone (back-кнопка в left-top + клик возвращает на `/profile`).

**Аудит остальных tab-страниц.** Только `/category/[id]` использовал translateY auto-hide. Остальные (`/orders`, `/chats`, `/profile`, `/master/[id]`) рендерят `<ScreenHeader>` siblings к ScrollView (вне scroll-контейнера), поэтому хедер уже sticky относительно WebShell — отдельная правка не нужна.

**+ master nav fix:** В WebShell для роли `master` отсутствовала ссылка «Поиск заказов» — на mobile эта кнопка живёт центральной в TabBar, на desktop её забыли вынести. Теперь WebShell для master: **Главная / Поиск заказов / Чаты** (вместо просто Главная / Чаты). Файл — [`src/components/WebShell.tsx`](src/components/WebShell.tsx). Verify: открыл `/orders/search` через клик в WebShell — лента заявок (`Покрасить стену`, `Замена смесителя` и т.д.) отрисовалась, подсветка активна.

**+ lifecycle RPC fix (миграция 0081):** User кликнул «Прекратить сотрудничество» на `/orders/[id]` → `permission denied for function notify_user`. Root cause: все 6 lifecycle RPC (`withdraw_response`, `mark_order_done`, `confirm_completion`, `open_dispute`, `reopen_order`, `terminate_cooperation`) объявлены `SECURITY INVOKER`, а `notify_user` имеет `REVOKE EXECUTE ... FROM authenticated` (по соображениям безопасности — иначе клиент мог бы спамить push). Внутренний вызов `notify_user` из RPC валился. Миграция [0081](supabase/migrations/0081_lifecycle_rpcs_security_definer.sql) переводит все 6 RPC на `SECURITY DEFINER` — функция работает от роли owner (имеет EXECUTE на `notify_user`), а собственные auth.uid()-проверки внутри RPC по-прежнему авторизуют пользователя. Verify: эмулировал authenticated-вызов в SQL под picked_master_id — order перешёл `in_progress → cancelled`, лог записан, ошибок нет.

---

## Прежнее состояние (2026-05-16 поздно — desktop responsive: категории grid + hero мастера 16:9)

**Главное:** Адаптация двух экранов под широкие вьюпорты (desktop / tablet), по фидбэку user:

1. **«Все мастера» в 1-колоночном list-view → grid 2/3 столбца на desktop.** При ширине ≥ 768 (tablet) — 2 колонки, ≥ 1024 (laptop+) — 3. На mobile (< 768) сохраняется list-view с hairline-разделителями (Yelp/TaskRabbit-паттерн для длинных списков 30+ категорий на узком экране). Desktop grid: карточки с border-hairline + bg-canvas + rounded-lg, gap через padding половинок. Lazyweb-референсы: afterpay/people/zara — marketplace категории на широком экране всегда подаются grid'ом.

2. **Hero-галерея мастера: было 4:5 (1120×1400 на desktop = огромный экран до фолда) → стало landscape 16:9 с потолком 520px на desktop.** На mobile сохраняется 4:5 (Wildberries-style портретное превью лучше для узкого экрана). Lazyweb-референс: Airbnb/Booking listing detail — hero landscape ~2:1, никогда не растягивается до 1400px. Skeleton-плейсхолдер тоже адаптирован.

**Файлы:**
- [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx:608) — `AllCategories` теперь имеет `isGrid` ветку с `useWindowDimensions()`-based колонками. Inline `flexDirection/flexWrap` через `style={}` (на `Animated.View` NativeWind-классы `flex-row/flex-wrap` иногда не докатывают через RN-Web).
- [`app/(tabs)/master/[id].tsx`](app/(tabs)/master/[id].tsx:74) — `PortfolioPager` + skeleton-блок hero вычисляют высоту по `isDesktop` флагу (viewport ≥ 768): `Math.min(width × 9/16, 520)`.

**Verify в preview:** ✅ tsc clean. Скриншоты: desktop 1280px — категории 3 колонки, профиль мастера hero 1120×520 (вместо 1120×1400); tablet 768px — категории 2 колонки; mobile 375px — list-view как раньше.

**Anti-pattern зафиксирован:** `<Animated.View className="flex-row flex-wrap">` на RN-Web даёт `flex-direction: column` (классы Tailwind не доходят до computed style). Для row-wrap на Animated.View — всегда inline style.

---

## Прежнее состояние (2026-05-16 поздним вечером — services-suggest редизайн + новые pricing kinds)

**Главное:** Доработки экрана `/profile/services-suggest` под фидбэк user:
1. Убрал дефолтные ценники `≈ X ₽` из списка готовых услуг — список чистый.
2. При выборе услуги цена не предзаполняется (placeholder «Цена», value пустой) — мастер сам вводит.
3. Добавил 4 chip-варианта типа цены: **Точная / От / До / Договорная**. Раньше был только «от» (по сути `range`). Новые kinds потребовали миграции [`0080`](supabase/migrations/0080_service_pricing_kind_add_from_up_to.sql) — `ALTER TYPE service_pricing_kind ADD VALUE 'from', 'up_to'`.
4. Блок «Своя услуга» поднял наверх (был в конце длинного списка) и сжал — теперь collapse-by-default pill `+ Своя услуга`, тап → компактная inline-форма (title + chip-kind + цена + кнопка).

**Сопутствующие правки помимо services-suggest:**
- [`use-master-services.ts`](src/features/master-services/use-master-services.ts) — `PRICING_KIND_LABELS`/`HINT`/`OPTIONS` для новых kinds. Новый `PRICING_KIND_OPTIONS` (5 kinds, без legacy `range`). `formatServicePrice` исправлен: `fixed` теперь даёт `«1 500 ₽»` (раньше ошибочно `«от 1 500 ₽»`), `up_to` → `«до X ₽»`.
- [`MasterServicesList.tsx`](src/features/master-services/MasterServicesList.tsx) — read-only display на `/master/[id]` теперь корректно показывает все kinds (`fixed` без префикса, `up_to` с «до»).
- [`MasterServicesSection.tsx`](src/features/master-services/MasterServicesSection.tsx) — CRUD-форма прайса в edit-master. State переименован `priceMin`→`priceValue`, `priceMax`→`priceMaxLegacy`. На submit kind `up_to` пишет value в `price_max`, остальные — в `price_min`. Picker больше не показывает `range` (но editing legacy `range`-записей работает).

**Verify в preview:** ✅ tsc clean. Открыл `/profile/services-suggest?l2=plumbing` — список без ценников, «+ Своя услуга» вверху, тап на L3 раскрывает 4 chip-pill (Точная/От/До/Договорная) + пустое поле «Цена». Тап на «Своя услуга» → компактная форма раскрывается. Переключение на «Договорная» скрывает поле цены. 3 скриншота сохранены.

**Что НЕ сделано / отложено:**
- Backfill legacy `pricing_kind='range'` записей → `from`. Сейчас они читаемые, но «правильнее» мигрировать (отдельная миграция data-fix + потенциальный rebuild enum чтобы дропнуть значение — PG не даёт `DROP VALUE`).
- `/orders/[id]` форма отклика мастера — там другой enum (`order_price_kind` с теми же значениями `fixed/from/up_to/negotiable`), формат уже корректный, не трогал.

---

## Прежнее состояние (2026-05-16 поздно — UX-доработки lifecycle + лого + reviews CTA)

**Главное:** Доработки на основе фидбэка user после первого lifecycle-релиза:
1. **«Прекратить сотрудничество» вместо «Открыть спор»** — спор слишком тяжёлый для нашего рынка; вместо него простая bilateral-отмена. Миграция 0077 + новая RPC `terminate_cooperation` + новый UI-кнопка.
2. **«Вы откликнулись» badge** в `/orders/search` — мастер сразу видит, на какие заявки уже отправлял отклик.
3. **Логотип xtrud вместо House** в TabBar (mobile) и WebShell (desktop) — фирменный SVG-маркер для «Главной».
4. **«Как меня видят» CTA** в `/profile` — переход на свой публичный профиль с reviews (mutual reviews уже работают: оба написания + отображение, просто не было прямой ссылки).

**Что сделано:**

1. **Backend:**
   - [`0077_terminate_cooperation_rpc.sql`](supabase/migrations/0077_terminate_cooperation_rpc.sql) применена к prod. RPC `terminate_cooperation(order_id, reason?)` — обе стороны (client/picked_master) могут перевести `in_progress`/`awaiting_confirmation` → `cancelled` с `cancel_reason='cooperation_ended_by_<role>'`. Push другой стороне, audit log `T6t`. Policy `orders_picked_master_lifecycle` расширена на `cancelled` в WITH CHECK.
   - TS-типы регенерированы — есть `terminate_cooperation` в `Functions`.

2. **Frontend — Lifecycle UI:**
   - [`use-terminate-cooperation.ts`](src/features/orders/use-terminate-cooperation.ts) — новый хук (RPC + invalidations).
   - [`app/(tabs)/orders/[id].tsx`](app/(tabs)/orders/[id].tsx) — заменил «Открыть спор» на «Прекратить сотрудничество» (destructive style, простой `confirmAsync` без формы — спор был с reason-textarea). Удалил `DisputeBottomSheet` (~60 строк, git-recoverable). Импорт `useOpenDispute` тоже убран. Disputed-статус и `open_dispute` RPC остаются в БД для будущей админки.

3. **Frontend — «Я откликнулся» badge в поиске:**
   - [`app/(tabs)/orders/search/index.tsx`](app/(tabs)/orders/search/index.tsx) — подписан на `useMyResponses`, собираю Set<order_id> non-withdrawn responses, передаю `alreadyResponded` в `<OrderRow>`.
   - [`OrderRow.tsx`](src/components/OrderRow.tsx) — новый prop `alreadyResponded`. Если true: фон карточки `canvas-soft` вместо `canvas` (как «прочитанная» в Mail/Gmail) + accent-soft pill «Вы откликнулись» первым элементом в meta-row + accessibilityLabel дополнен.

4. **Frontend — Логотип:**
   - [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx) — `tabBarIcon` для «Главной»: `<XtrudLogo size={24} color={color} />` вместо `<House />`. Active state теперь не через fill (логотип сам по себе сплошной), только через TabBar pill-background.
   - [`WebShell.tsx`](src/components/WebShell.tsx) — desktop top-nav: для item `match='/'` рендерится `<XtrudLogo size={18} color={active ? ink : muted} />` через special-case, остальные пункты как обычно через `item.icon`.
   - Логотип — существующий [`<XtrudLogo>`](src/components/XtrudLogo.tsx), inline SVG из react-native-svg (cross-platform).

5. **Frontend — «Как меня видят»:**
   - [`app/(tabs)/profile/index.tsx`](app/(tabs)/profile/index.tsx) — добавлены 2 CTA-пресссбла (client → `/client/{my_id}`, master → `/master/{my_id}`). На обеих страницах уже есть `<ReviewsSection>` со всеми отзывами от другой стороны (mutual reviews infrastructure уже была реализована, добавил только entry point).

6. **Mutual reviews — проверка:** реализация уже есть end-to-end:
   - Master review form: [`MasterReviewSection`](app/(tabs)/orders/[id].tsx:1858) на `/orders/[id]` для `completed`-заказов где мастер picked.
   - Client review form: [`ClientReviewSection`](app/(tabs)/orders/[id].tsx:1725) аналогично для клиента-владельца.
   - Display: [`<ReviewsSection>`](src/features/master-view/ReviewsSection.tsx) на `/client/[id]` (`direction='master_to_client'`) и `/master/[id]` (`direction='client_to_master'`).
   - DB trigger `recalc_master_rating` (миграция 0016) обновляет рейтинги для обеих сторон.

**Verify в preview:** tsc clean. Скриншот показал:
- Логотип xtrud в TabBar (нижний левый, active с pill-подложкой).
- Логотип xtrud в desktop header (рядом с brand-text).
- Все остальные табы работают (поиск, чаты, профиль).

**Что НЕ сделано:**
- Удалить `useOpenDispute` хук и RPC `open_dispute` из БД — оставил для будущей админки. Если решим что не нужно — отдельной миграцией.
- E2E-тест нового flow «Прекратить сотрудничество» (нет настроенного Maestro/Playwright под этот сценарий).
- Notifications cascade под `cooperation_terminated` — push идёт, но без cascade-warning'ов.

---

## Прежнее состояние (2026-05-16 — расширенный lifecycle заказа v2)

**Главное:** Расширен state-machine заказа с 6 до 8 статусов + 15 переходов. Добавлены `awaiting_confirmation` (мастер пометил выполнено, клиент ждёт 72ч) и `disputed` (открытый спор, SLA саппорта 5 рабочих дней). Полностью реализован lifecycle: backend (6 миграций), frontend (5 хуков + 2 секции в /orders/[id]). Спецификация — [`docs/lifecycle.md`](docs/lifecycle.md).

**Что сделано:**

1. **Аналитика** — [`docs/lifecycle.md`](docs/lifecycle.md), 13 разделов: research по Profi.ru / YouDo / TaskRabbit / Thumbtack / Airbnb / Uber, full state diagram (8 статусов, 15 transitions T1–T15), edge cases, audit log, карма-предложения.
2. **Backend (6 миграций, все применены к prod):**
   - `0071_lifecycle_enum_additions.sql` — `ALTER TYPE order_status ADD VALUE awaiting_confirmation, disputed`. Вынесено отдельной миграцией (PG-ограничение).
   - `0072_lifecycle_columns_and_constraints.sql` — 12 новых колонок (picked_at, master_marked_done_at, awaiting_confirmation_until, completed_at, completion_kind, last_activity_at, cancelled_by/_reason, dispute_*, resolved_*, resolution_kind) + 3 consistency-CHECK + индексы. Исправлен баг `orders_picked_only_if_in_progress`. Default `expires_at` 30d→14d.
   - `0073_order_status_log.sql` — audit log таблица + AFTER UPDATE trigger + backfill.
   - `0074_lifecycle_rpcs.sql` — 5 RPCs: `withdraw_response` (T15), `mark_order_done` (T8), `confirm_completion` (T4/T5), `open_dispute` (T10/T12), `reopen_order` (T9). Все SECURITY INVOKER + push + audit log.
   - `0075_lifecycle_crons.sql` — 2 ночных pg_cron: `nightly_auto_confirm` (04:00 UTC, T11) и `nightly_cancel_stale` (05:00 UTC, T13 после 30d). Plus trigger `trg_bump_order_activity_on_message`.
   - `0076_lifecycle_rls.sql` — DROP `orders_picked_master_can_complete`, новая `orders_picked_master_lifecycle`, расширены owner/read policies.
3. **TS-типы регенерированы** ([`src/types/database.ts`](src/types/database.ts)) — новые enums, RPCs, columns, table.
4. **Frontend — 5 хуков** в [`src/features/orders/`](src/features/orders/): `use-withdraw-response`, `use-mark-order-done`, `use-confirm-completion`, `use-open-dispute`, `use-reopen-order` (plus pure-helper `canReopenOrder`). `use-complete-order` — deprecated-обёртка над `useConfirmCompletion` для backwards-compat.
5. **Frontend — UI:**
   - [`app/(tabs)/orders/[id].tsx`](app/(tabs)/orders/[id].tsx): `CompletionSection` полностью переписан (role × status × CTA matrix), новые `ReopenSection` и `DisputeBottomSheet`, кнопка «Отозвать отклик» в `MasterResponseSection`.
   - [`OrderStatusBadge.tsx`](src/components/OrderStatusBadge.tsx) + [`OrderRow.tsx`](src/components/OrderRow.tsx) — 2 новых статуса (awaiting_confirmation → accent-soft, disputed → error-soft).
   - [`MasterDashboardOrders.isActiveResponse`](src/features/master-view/MasterDashboardOrders.tsx) — исключает `expired`/`disputed`/`awaiting_confirmation` в дополнение к `completed`/`cancelled`.
6. **Verify в preview:** ✅ tsc clean. Открыл `/orders/{id}` для master + in_progress — рендерятся «Работа выполнена», caption «Клиент получит уведомление...», «Открыть спор», «Ваш отклик» card. Console clean. Скриншот сохранён.

**Bonus баг-фикс (предыдущий коммит этой сессии):** `MasterDashboardOrders.isActiveResponse` дублировал accepted-отклики в табах «Меня выбрали» и «Я откликнулся» — добавлен `respStatus === 'accepted' → return false`.

**Что НЕ сделано (deferred на v2):**
- Карма-система (§8 lifecycle.md): таблица `user_reputation` + soft-warn/hide-profile thresholds. Сначала собираем данные через `order_status_log`.
- Double-blind отзывы (§6).
- Notifications cascade warnings (§5.2): T-7d / T-1d expire / T+24h-48h awaiting / T+1/7/13 review reminders.
- `nightly_close_review_windows` cron.
- Admin UI для саппорта (T14).
- Client/master delete → SET NULL.

**Anti-patterns пойманные:**
- `ALTER TYPE ENUM ADD VALUE` нельзя в одной транзакции с использованием нового значения — split на 2 миграции.
- Старый constraint `orders_picked_only_if_in_progress` блокировал бы T6, заменён на `orders_picked_only_after_accept` (picked NOT NULL ⟹ status ∈ workflow-set).
- Без `last_activity_at` cron `cancel_stale_in_progress` ничего бы не отменял — добавили + bump-trigger на messages.

---

## Прежнее состояние (2026-05-15 ночь — массовая миграция Lucide → Phosphor)

**Главное:** Закончил перенос **всего UI** с Lucide React Native на Phosphor React Native — продолжение work'а после Phosphor в TabBar (коммит `5044f53`). 56 файлов, ~250 use-site'ов, скрипт [`scripts/migrate-lucide-to-phosphor.mjs`](scripts/migrate-lucide-to-phosphor.mjs) для механической части + точечные правки для Star fill / Image conflict / generic types. Категорийные иконки (Iconify CDN цветные + Lucide моно-fallback для не-mapped L2) — НЕ тронуты по правилу user'а «иконки категорий хорошие, не трогать».

**Что сделано:**

1. **Скрипт миграции** [`scripts/migrate-lucide-to-phosphor.mjs`](scripts/migrate-lucide-to-phosphor.mjs) с маппингом 60+ Lucide → Phosphor (Home→House, Search→MagnifyingGlass, ChevronLeft→CaretLeft, MessageCircle→ChatCircle, AlertCircle→WarningCircle, и т.д.). Заменяет imports + use-sites + `strokeWidth → weight`. SKIP-set для `category-icons.ts` и `CategoryTile.tsx` (категорийный Lucide-fallback оставлен).
2. **Generic тип `IconComponent`** ([`src/types/icon.ts`](src/types/icon.ts)) — supertype для Lucide+Phosphor (props: size/color/weight/className). Используется в `EmptyState`, `ScreenHeader`, `getCategoryIcon` return type — позволяет передавать обе библиотеки без конфликта типов.
3. **Type augmentation** ([`phosphor-react-native.d.ts`](phosphor-react-native.d.ts)) — добавляет `className?: string` в `IconProps`. NativeWind className на иконках работает runtime через cssInterop, type aug убирает 19 tsc ошибок.
4. **63 → 0 tsc ошибки.** После apply скрипта было 63 error TS. Починены: Star+Lightning constant-fill (sed), Star fill={ternary} (Python multi-line regex), Image-conflict (chats/[id], portfolio — Phosphor `Image` → `ImageSquare`), strokeWidth={2.5} leftover, LucideIcon type-ref (orders/new.tsx → IconComponent), FilterChip generic icon type.
5. **Документация:** [`docs/UI_ICONS.md`](docs/UI_ICONS.md) — обновлена секция «Где используется» (теперь весь app, не только TabBar) + объяснение `IconComponent` generic + type augmentation. Маппинг Lucide → Phosphor (расширенный до 60+ имён).

**Verify в preview:**
- ✅ `/` (главная клиента) — desktop nav: House active с pill, ClipboardText, ChatCircle, Sun, UserCircle. Search: MagnifyingGlass. Hero-плитки: Sparkle/Drop/Lightning. Console clean.
- ✅ `/profile` — Pencil (edit), Star (рейтинг filled), User/Briefcase chips (Client/Master), CaretRight chevrons. TabBar: House(active+pill) / ClipboardText / PlusCircle / ChatCircle / UserCircle.
- ✅ `/chats` — список с Phosphor badge'ами, ChatCircle active с pill. Аватары DiceBear shapes.
- ✅ `tsc --noEmit` clean (от 63 до 0).

**Anti-patterns пойманные в процессе:**
- `strokeWidth={2.5}` в чекмарках — не покрылся первым regex'ом (1.5/1.75/2/2.25). Добавлен.
- `ImagePlus → Image` mapping создал конфликт с RN `Image` (TS2300). Решение: переименовать в `ImageSquare` в файлах где RN Image тоже импортирован.
- `Star fill="currentColor"` / `fill={color}` — Lucide pattern. В Phosphor нужно `weight="fill"`. Постоянные случаи: regex `weight="bold" color={X} fill={X}` → `weight="fill" color={X}`. Тернарные: `fill={cond ? Y : "transparent"}` → `weight={cond ? "fill" : "bold"}`.
- `EmptyState`, `ScreenHeader`, `FilterChip`, `getCategoryIcon` имели тип `icon: LucideIcon` / `typeof Home`. Generic `IconComponent` — теперь supertype для обоих.

---

## Прежнее состояние (2026-05-15 ночь — мастер-верификация: backend готов)

**Главное:** Запущена опциональная фича верификации мастера. Мастер опционально загружает селфи + фото главной страницы паспорта → ждёт ручную проверку админа → после approval на профиле появляется badge «Паспорт подтверждён». В этой сессии готов **backend (часть 1)**, frontend — следующей сессией.

**Что сделано (часть 1, backend):**

1. **Миграция [`supabase/migrations/0070_master_verifications.sql`](supabase/migrations/0070_master_verifications.sql)** применена в prod:
   - ENUM `verification_status` (`pending / approved / rejected`).
   - TABLE `master_verifications` (1:1 с `auth.users`, поля selfie_path/passport_main_path/status/timestamps/reviewer/rejection_reason).
   - RLS: только owner, нельзя поставить себе approved (только service-role).
   - Trigger `sync_master_verification_level` — sync `master_profiles.verification_level ≥ 1` при approved, откат при revoke.
   - PRIVATE Storage bucket `master-verifications` + 4 RLS policies (owner-only по `{user_id}/...`).
2. **TS-типы регенерированы** ([`src/types/database.ts`](src/types/database.ts)).
3. **Спецификация фичи** в [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — схема БД, RLS, Storage, planned flow, security.

**Что НЕ сделано (часть 2, frontend) — следующая сессия:**

- Хуки `useMyVerification` / `useSubmitVerification`.
- Экран `/profile/verification` (full-screen flow: инструкция + 2 image-picker'а + кнопка отправить).
- Nudge-карточка на `/profile/index.tsx` (только мастер): «Подтвердите личность / На проверке / Паспорт подтверждён ✓».
- Badge «Паспорт подтверждён» на детальной странице мастера + карточках мастеров.

**Verify:** миграция применена (apply_migration success), TS clean. Backend-фича готова к использованию через service-role (для будущей админки) или через прямой Supabase-клиент (для будущих хуков).

---

## Прежнее состояние (2026-05-15 ночь — фильтры поиска заказов: defaults из профиля + quick-select chips)

**Главное:** На /orders/search для мастера теперь применяются **defaults из его профиля** — при первом заходе `l2Ids` подставляются из `master_categories`, мастер сразу видит релевантные заявки. На /orders/search/filters добавлен блок **«Из вашего профиля»** — горизонтальный ряд chip'ов с цветными иконками категорий, тап = toggle прямо в store (без захода в полный multi-select picker).

**Что сделано:**

1. **[`src/features/orders/orders-search-filters-store.ts`](src/features/orders/orders-search-filters-store.ts)** — добавлено поле `initializedForUserId: string | null` и action `initFromMasterCategories(userId, ids)`. Идемпотентность по `userId`: повторный вызов для того же мастера — no-op. Это значит, что после `clearAll` пустой scope (= показывать все категории) не перезаливается. Logout/login другого юзера → `initializedForUserId` не совпадёт → defaults подставятся заново.
2. **[`app/(tabs)/orders/search/index.tsx`](app/(tabs)/orders/search/index.tsx)** — подписан на `useMyMasterCategories(userId)`, `useEffect` вызывает `initFromMasterCategories` когда данные пришли.
3. **[`app/(tabs)/orders/search/filters.tsx`](app/(tabs)/orders/search/filters.tsx)** — тот же `useEffect` продублирован (поддержка deep-link / refresh на /filters). Добавлен компонент `ProfileCategoryChip` (h-10 pill, accent-soft когда selected + Check-индикатор, иначе canvas + цветная Iconify-иконка категории). Блок «Из вашего профиля» рендерится сразу под trigger «Выберите категории», скрыт если у мастера 0 категорий в профиле.

**Verify в preview:** ✅ Авто-defaults: trigger показывает «Выбрано 3 · Сантехника, Электрика», chip'ы Сантехника/Электрика подсвечены accent-soft, кнопка «Применить · 3», «Сбросить все фильтры» доступна. TS clean.

**Lazyweb:** не дёргал — паттерн (chip-row с selected состоянием + цветные иконки L2) уже зафиксирован в проекте (см. `/orders/search/category-select.tsx`, `MasterServicesSection.tsx`). Решение опирается на установленный визуальный язык, не на референс.

---

## Прежнее состояние (2026-05-15 ночь — Phosphor как UI icon set по умолчанию)

**Главное:** Заменил иконки в TabBar с Lucide на **Phosphor React Native**. Фидбэк user: «иконки внизу обычные, хочу ультрасовременные дизайнерские». Phosphor даёт 6 weights, **filled-vs-outline** active state (как Instagram/Threads/X/Linear), fluid corners. Pattern зафиксирован как стандарт для всего нового UI.

**Что сделано:**

1. **Установлен `phosphor-react-native@3.0.6`** — зависит от уже стоящего `react-native-svg`.
2. **TabBar мигрирован** ([`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx) + [`src/components/TabBar.tsx`](src/components/TabBar.tsx)):
   - `Home → House`, `ClipboardList → ClipboardText`, `MessageCircle → ChatCircle`, `User → UserCircle`, `Search → MagnifyingGlass`, `CirclePlus → PlusCircle`.
   - Active state: `weight="bold" → "fill"` (вместо `strokeWidth 1.5 → 2.25`).
   - **Pill-подложка** `bg-canvas-soft-2` (px-14 py-1 rounded-full) под активной иконкой — chip-style focus как в Material 3.
3. **Документация:**
   - Новый файл [`docs/UI_ICONS.md`](docs/UI_ICONS.md) — полная инструкция: когда/какой weight, размеры, **маппинг Lucide → Phosphor** (28+ типичных иконок), anti-patterns, история.
   - [`docs/ICONS.md`](docs/ICONS.md) — cross-link на UI_ICONS.md (разграничение: цветные L2 vs моно UI).
   - [`DESIGN.md`](DESIGN.md) — новый пункт «6. UI-иконки — Phosphor (моно)» в § UI patterns.
   - [`.claude/rules/design-quality.md`](.claude/rules/design-quality.md) — обновлено правило про иконки (Phosphor + размеры + weights).
   - [`CLAUDE.md`](CLAUDE.md) — секция «Никаких эмодзи в UI» обновлена: Phosphor дефолт, Lucide legacy.

**Verify в preview:** ✅ Light + dark, оба режима роли (клиент 5 табов / мастер 4 таба). House filled с pill-подложкой на active, остальные bold-outline. TS clean.

**Lucide в legacy-коде** (~80-120 мест в кнопках, ScreenHeader, OrderRow, формах) — мигрируем постепенно по мере правки экранов, не отдельным sweep'ом. Правило: трогаешь файл — заменяй imports на Phosphor по таблице из UI_ICONS.md.

---

## Прежнее состояние (2026-05-15 поздно вечер — удалена master-страница «Заявки»)

**Главное:** Раньше у мастера во вкладке `/orders` была страница «Заявки» с двумя tab-pill «Я откликнулся / Меня выбрали». 2026-05-15 её таб убрали из `TabBar` (содержимое переехало в `MasterDashboardOrders` на главной мастера), но сам файл `app/(tabs)/orders/index.tsx` продолжал содержать master-вьюху и был доступен по прямому URL (на десктопе — через ссылку «Заказы» в `WebShell`). Сейчас вырезано окончательно.

**Что сделано:**

1. **[`app/(tabs)/orders/index.tsx`](app/(tabs)/orders/index.tsx)** — выпилен `MasterOrdersView` + `RespondedTab` + `AssignedTab` + локальный `isActiveResponse` + sticky-tab logic + связанные импорты. Для `active_role === "master"` теперь `<Redirect href="/(tabs)" />`. Для клиента — без изменений (`ClientOrdersView` как было).
2. **Удалён** [`src/features/orders/master-orders-tab-store.ts`](src/features/orders/master-orders-tab-store.ts) — zustand-стор `stickyTab` использовался только удалённой master-вьюхой.
3. **[`src/components/WebShell.tsx`](src/components/WebShell.tsx)** — ссылка «Заказы» в top-nav теперь скрыта для мастера (как и в `TabBar`). Мастер на десктопе видит только «Главная / Чаты». «Поиск заказов» у мастера на десктопе пока живёт через `/orders/search` URL (отдельной кнопки в WebShell нет — TODO если понадобится).

**Verify в preview:** ✅ `/orders` под клиентом рендерит «Мои заказы» + empty state, табы корректные, консоль чистая. Master-redirect проверен через TS-типы и логику кода (live-логин под мастером не делал в этой сессии).

**Что НЕ трогали (намеренно):**
- `useMyResponses`, `useOrdersAssignedToMe`, `useUnreadResponsesCount`, `useRealtimeMyResponses` — продолжают использоваться `MasterDashboardOrders` (мастер home) и client `_layout.tsx` (orders-badge для клиента).
- `MasterDashboardOrders.tsx` — это новое место «заявок» мастера, не редактировалось.

---

## Прежнее состояние (2026-05-15 поздно вечер — drop диапазона цен из заказов)

**Главное:** Полная переделка модели цены заказов и откликов. Раньше было `price_mode ∈ {exact, range, negotiable}` + `price_min` + `price_max` (диапазон). По фидбэку user 2026-05-15 «убрать диапазоны из всех заказов, чтобы была только одна цена» — переход на `price_kind ∈ {fixed, from, up_to, negotiable}` + одно числовое `price_value`. Plus добавил ценник и превью описания на /orders/search (раньше отсутствовали).

**Что сделано:**

1. **Миграция [`0069_orders_remove_price_range.sql`](supabase/migrations/0069_orders_remove_price_range.sql)** (применена через MCP) — новый enum `order_price_kind`, добавлены `orders.budget_kind|budget_value` и `order_responses.price_kind|price_value`, backfill (`exact→fixed`, `range`+min→`from`, `range`+max-only→`up_to` с переносом max в value, `range`+both→`from` с берём min), DROP `budget_mode/budget_min/budget_max` + `price_mode/price_min/price_max`, DROP старый enum `order_budget_mode` CASCADE, новые CHECK-constraints (`negotiable` ↔ value IS NULL, иначе value >= 0). Также пересоздан RPC `start_chat_with_master` (0053) — welcome-message форматируется по новой схеме.
2. **`database.ts`** — regenerate (1650 строк). Старого enum `order_budget_mode` нет, новый `order_price_kind: "fixed" | "from" | "up_to" | "negotiable"`.
3. **`order-schema.ts`** — `orderPriceKindOptions`, `OrderPriceKind`, `priceKindLabel()`, общий `formatPrice(kind, value)` («1 500 ₽» / «от 1 500 ₽» / «до 5 000 ₽» / «Цена договорная»), zod: `budgetKind` + `budgetValue` (вместо `budgetMode/budgetMin/budgetMax`).
4. **Hooks** — `use-create-order.ts`, `use-update-order.ts`, `use-order-responses.ts`, `use-my-responses.ts` переписаны под новый contract (input → kind+value).
5. **UI формы** — `OrderFormBody.tsx` рендерит 4 chip (Точная/От/До/Договорная) + одно NumberField с динамическим лейблом. Слово «Диапазон» удалено. `new.tsx`, `edit/[id].tsx` обновлены под defaults `budgetKind/budgetValue`.
6. **OrderDetail (`orders/[id].tsx`)** — `formatBudget` и `formatResponsePrice` через `formatPrice`, форма отклика мастера тоже 4 chip + одно поле, removed price_max input.
7. **OrderRow + /orders/search** — новые опциональные props `budgetKind`, `budgetValue`, `description`. На /orders/search OrderRow теперь рендерит описание в 2 строки и ценник mono-ink ниже category-eyebrow (фидбэк user «ценники не отображаются — очень плохо», «описание заказа можно 1-2 строки отобразить»).

**Verify в preview:** ✅ /orders/search показывает «от 2 000 ₽», «Цена договорная» + 2-строчные описания (light + dark). ✅ /orders/new рендерит 4 chip-бюджет с динамическим NumberField лейблом «Сумма ₽ / От ₽ / До ₽», поле скрыто для «Договорная». ✅ tsc clean.

**Структурные решения:**
- Имя `*_mode` → `*_kind` для ясности (новая семантика «способ задания цены»). `*_min` → `*_value` так как для `up_to` это уже не «минимум».
- Унифицирован один enum `order_price_kind` на обе таблицы — раньше тоже был общий `order_budget_mode`.

**Полировка `/orders/search` (2026-05-15 поздняя ночь):** убрана status-точка «● Открыта» из карточек — лента уже фильтруется на `.eq("status","open")`, дублировать лейбл на каждой строке — шум. Meta-row теперь начинается с urgency. Этот экран зафиксирован в [`UI_PATTERNS.md §3.3`](UI_PATTERNS.md) как **canonical reference** для всех плоских inbox-листов (hairline-разделители, inline-иконка 16px, mono time/budget, 2-line description). Любой новый list-экран копирует именно его.

---

## Прежнее состояние (2026-05-15 поздно ночь — drop радиуса + drop 8 out-of-scope L1)

**Главное:** Полная чистка нерелевантных категорий и удаление радиуса выезда. Фидбек user 2026-05-15: «у нас сервис под ремонт+стройку+клининг, удали всё лишнее полностью; раньше радиус убирали с UI, но он остался в коде».

**Что сделано:**

1. **Миграция [`0067_drop_service_radius.sql`](supabase/migrations/0067_drop_service_radius.sql)** — DROP `service_radius_km` из `master_profiles`, DROP `category_radius_km` из `master_categories`, DROP индекс, REPLACE RPC `complete_master_onboarding` без `p_service_radius_km`. Применена.
2. **Чистка кода радиуса:** `database.ts`, `master-profile-schema.ts` (Zod), `use-submit-master-profile.ts`, `use-update-master-profile.ts`, `use-master-public.ts`, `master/[id].tsx` (убран блок «Радиус X км»), `MasterProfileFormBody.tsx`, `edit-master.tsx`, `master-profile.tsx` (онбординг).
3. **Миграция [`0068_drop_out_of_scope_categories.sql`](supabase/migrations/0068_drop_out_of_scope_categories.sql)** — DELETE 8 L1 (auto, transport, beauty-health, education, events, business, it-digital, personal-services) + всё связанное. Порядок DELETE учитывает FK ON DELETE RESTRICT (master_categories → orders с CASCADE → orphaned responses/reviews → l3 → l2 → l1).
   - **Удалено из БД:** 8 L1, 47 L2 (теперь 48 L2 = 41 construction + 7 home-services), 12 master_categories, 13 orders + CASCADE на chats/order_responses/reviews, 20 orphaned responses, 8 orphaned reviews.
4. **`src/lib/product-scope.ts`** — `IN_SCOPE_L1_IDS = ["construction", "home-services"]`. Комментарий обновлён: scope-фильтр теперь «второй защитный слой» поверх физического удаления.
5. **Доки:** `CATEGORIES_AND_PROFILES.md` (Product scope блок переписан под 2 L1 + миграцию 0068, TL;DR обновлён), `MASTER_ACCOUNT_SPEC.md` (5 мест где упоминался радиус — убраны или заменены на ServiceAreas).

**Verify в preview:** ✅ `/orders/search/filters` показывает только 2 раздела (раньше 10). ✅ Multi-select picker `/orders/search/category-select` — только construction L2 (нет шиномонтажа/ресниц/IT). ✅ TS clean.

**⚠️ Side note:** Dev rebuild упал на user-WIP-файлах вне моего scope (`MasterDashboardOrders.tsx` JSX mismatch, `app/(tabs)/orders/search/index.tsx` duplicate `OrderRowsSkeleton`). Эти файлы я не трогал. Из-за rebuild-failure не смог runtime-проверить `/master/[id]` без радиуса — но source чистый, TS clean.

---

## Прежнее состояние (2026-05-15 поздно ночь, правило «никаких чёрных chip-pill»)

**User-фидбек:** «черные кнопки не делай» (тычок в активный pill «Фильтры» который был `border-ink bg-ink` — выглядел тяжёлым, доминировал на экране).

**Решение:** глобальная замена паттерна selected chip с чёрного на голубой Vercel-link.
- `border-ink bg-ink` → `border-accent bg-accent-soft` (фон `#d3e5ff`, бордер `#0070f3`)
- `text-on-primary` (text/icon когда chip активен) → `text-accent` (`#0070f3`)
- `useThemeColor("on-primary")` (icon color когда активен) → `useThemeColor("accent")`
- Малый button «Добавить» в MasterServicesSection (`bg-ink`) → `bg-accent` (solid blue)
- Checkbox-индикатор в `category-select` (28px круг с галочкой) — `border-accent bg-accent` (solid, iOS-style) + белый Check внутри

**Затронутые файлы (12):**
1. `src/components/ui/ScreenHeader.tsx` — rightAction.active pill
2. `src/components/ui/LocationSheet.tsx` — основная карточка «Вся Ингушетия» + 2 chip-row
3. `src/components/ui/LocationFilterSheet.tsx` — 2 chip-row
4. `src/features/master-profile/ServiceAreasSection.tsx` — города + районы
5. `src/features/master-profile/MasterProfileFormBody.tsx` — ToggleCard
6. `src/features/orders/LocationPicker.tsx` — карточка «Вся Ингушетия» + 4 chip-row
7. `src/features/orders/OrderFormBody.tsx` — urgency + budget chips
8. `src/features/master-services/MasterServicesSection.tsx` — 3 chip + 1 button
9. `app/(tabs)/orders/search/filters.tsx` — SortChip
10. `app/(tabs)/orders/search/category-select.tsx` — checkbox-индикатор

**Verify:**
- `tsc --noEmit` clean
- 0 occurrences `border-ink bg-ink` остались в codebase
- DOM-проверка: chip активный имеет `border-accent bg-accent-soft`, computed bg = `rgb(211, 229, 255)`, text color = `rgb(0, 112, 243)`
- Скриншот /orders/search/filters: 2 selected chip («Новые сверху», «Бьюти и здоровье») — голубые soft-tint с blue текстом, не чёрные

**⚠️ Что НЕ трогал:**
- Большие primary-CTA (`bg-primary` на «Применить», «Сохранить», «Опубликовать», «Войти», TabBar кнопка «Создать заказ» внутри Button-компонента) — это стандартный Vercel primary-action pattern. Если user скажет «вообще все чёрные кнопки в blue» — это отдельный sweep на ~25-30 мест.
- `<Button variant="primary">` — primary вариант остаётся `bg-primary`/black по умолчанию.

---

## Прежнее состояние (2026-05-15 ночь, /orders/search redesign — full-screen filters + ScreenHeader standard)

**Главное:** Глубокий редизайн `/orders/search` под фидбек user 2026-05-15: «хедер мелкий, разный на разных экранах; кнопка Фильтры мелкая; фильтры должны открываться на отдельном экране большие и удобные; категории не перечислять сразу — кнопка-trigger которая открывает picker». Зафиксирован общий стандарт UI-паттернов на будущее.

**Что сделано:**

1. **Новый `<ScreenHeader>`** (`src/components/ui/ScreenHeader.tsx`) — единый хедер для всех full-screen detail-экранов. height 64px, back-кнопка h-12 w-12 + ChevronLeft 28px stroke 2.25, title display-md tracking-tight bold, опц. rightAction h-11 pill (label + Icon, active=true → border-ink bg-ink). Экспортируется через `@/components/ui`.
2. **Новый Zustand-стор фильтров** (`src/features/orders/orders-search-filters-store.ts`) — переживает переход search → filters → category-select. l2Ids, l1Id, sort + countActiveFilters helper.
3. **Новая страница `/orders/search/filters`** (`app/(tabs)/orders/search/filters.tsx`) — full-screen фильтры. Сортировка как pill chips, Категория как button-trigger «Выберите категории» с chevron-down (NE list inline!), Раздел L1 как chips, sticky footer «Применить · N», reset-link. TabBar скрыт.
4. **Новая страница `/orders/search/category-select`** (`app/(tabs)/orders/search/category-select.tsx`) — full-screen multi-select picker категорий. Search-input, цветные Iconify-иконки, ✓-индикатор справа, sticky «Применить · N», RightAction «Сбросить» в хедере при count > 0. Локальный Set синхронизируется со стором при apply. TabBar скрыт.
5. **Миграция `app/(tabs)/orders/search.tsx` → `app/(tabs)/orders/search/index.tsx`** — теперь использует ScreenHeader + читает фильтры из стора (вместо useState), inline-блок фильтров удалён. Это таб (без back-кнопки, TabBar visible). L1 фильтр без L2 → сужает на клиенте до всех L2 в этом L1.
6. **Документация в `DESIGN.md` → новая секция «UI patterns»** — 5 паттернов с anti-patterns: ScreenHeader (стандарт), button-trigger вместо chip-row, full-screen filter/picker экраны, таб vs detail (когда показывать back и скрывать TabBar), header-комментарий обязателен. Зафиксирован 2026-05-15 после фидбэка.

**Verify в preview:** ✅ Хедер большой (display-md), кнопка Фильтры пилюлей с иконкой, переход на /filters работает, переход на /category-select работает, multi-select работает (выбрал 2 → footer «Применить · 2»), apply пишет в стор, возврат на /filters показывает «Выбрано 2 / Сантехника, Ремонт и отделка», apply на /filters → /search с активным состоянием Фильтры-кнопки + сортировка применилась.

**TS clean.**

---

## Прежнее состояние (2026-05-15 поздно ночь, MASTER_REDESIGN_SPEC — старт визуального редизайна мастер-side)

**Новая большая работа:** перенос клиентского визуала на ВСЕ мастер-экраны. User-фидбек: «у клиента красиво — размеры шрифтов, хедеры, фильтры, кнопки, иллюстрации, свечение. Возьми всё это и применю по всем мастер-экранам».

**Что в этой сессии (часть 1 из N):**
- **`MASTER_REDESIGN_SPEC.md`** (новый файл в корне) — инвентарь **8 визуальных паттернов** клиента + план редизайна по **11 мастер-экранам** в порядке приоритета. Раздел 1 — каждый паттерн с эталонным кодом и file-ссылкой. Раздел 2 — пошаговый план по каждому экрану (что меняем, зачем). Раздел 3 — чек-лист закрытия задачи. Раздел 4 — история решений.
- Изучил клиентскую главную (`app/(tabs)/index.tsx`), `HelpCallout`, `MasterStatsBlock`, `OrderRow`, `MasterHomeContent`, `orders/search.tsx`. Зафиксировал визуальный gap.

**Часть 2 (мелкий стурктурный фикс перед редизайном /orders/search):**
- `/orders/search` — таб-страница, не detail. Фиксы: убран `setTabBarHidden(true)` (нижняя панель больше не пропадает) + убрана back-кнопка из `<ScreenHeader>` + средняя кнопка «Поиск заказов» в TabBar теперь подсвечивается `text-ink` + stroke 2.25 когда `pathname.startsWith('/orders/search')`.
- Файлы: `app/(tabs)/orders/search/index.tsx` (убраны 3 импорта, 1 useEffect-блок, 1 prop у ScreenHeader); `src/components/TabBar.tsx` (+ usePathname + isSearchActive ветка для color/stroke).
- Verify в preview: ✅ back-кнопка отсутствует, ✅ TabBar visible, ✅ значок лупы в TabBar = ink-цвет stroke 2.25.

**Часть 3..N:**
Косметический редизайн `/orders/search` (skeletons, hero empty-state, HelpCallout) и далее по 1 экрану на сессию. Порядок:

1. ⏭️ **`/orders/search`** (то от чего пришёл фидбек — экран с скриншотом)
2. Master Home (`MasterHomeContent`)
3. `/orders` master-режим (3 таба)
4. `/orders/[id]` master-вид + форма отклика
5. `/chats` list
6. `/chats/[id]` thread
7. `/profile` master-режим
8. `/profile/edit-master`
9. `/master-categories` edit-режим
10. `MasterServicesSection`
11. `PortfolioGrid` edit

После каждого экрана — отчёт + screenshot before/after + verification в preview.

---

## Прежнее состояние (2026-05-15 ночь, P0 master-account + умный поиск)

**Главное:** закрыто 9 из 9 P0-задач из [`research/MASTER_ACCOUNT_PLAN.md`](research/MASTER_ACCOUNT_PLAN.md). Master-аккаунт функционально доведён до уровня готовности «Sprint 1». Каждая задача отдельным коммитом.

**Закрытые P0 (порядок исполнения):**

1. **P0-1** [`ec4be72`] — Унификация цен на `master_services`, deprecate `master_categories.pricing_mode/pricing/attributes` (миграция 0055).
2. **P0-2** [`34c6c9b`] — Связь `master_services` с категорией: `l2_id` + `l3_id` (FK), backfill 7/36 точно по таксономии (миграция 0056).
3. **P0-10** [`c44471b`] — Режим «Договорная» в прайсе: enum `service_pricing_kind` (fixed/range/hourly/quote), 4 toggle с условной видимостью price-полей (миграция 0057).
4. **P0-3** [`24ab7a1`] — Иерархический picker категорий в онбординге: sticky search, группировка по L1 (10 разделов × 64 L2), flat-выдача в search-mode.
5. **P0-4** [`a935d67`] — Pre-defined L3 услуги с placeholder-ценами в форме «Новая услуга»: chip-row выбора L2 → готовый список L3 → автозаполнение title → hint «✨ В среднем берут X ₽ — применить» (миграции 0056 + seed 0058 на 41 услугу).
6. **P0-5** [`9e59358`] — Daily response limit 5/день (как Яндекс): trigger в БД, RPC `get_response_limit_today()`, бейдж «5 откликов сегодня» в шапке master-главной, disabled state кнопки «Отправить отклик» при 0 remaining (миграция 0059).
7. **P0-7** [`ba5d6ed`] — `users.is_demo bool` флаг + backfill 21 demo-master / 31 demo-client (миграция 0060). Queries не фильтруют — пока показываем всех, иначе каталог пустой.
8. **P0-6** [`eb22593`] — Фото-attachments в чате: миграция `messages.image_url`, Storage bucket `chat-images` + RLS, кнопка ImagePlus → expo-image-picker → preview → upload (миграция 0061).
9. **P0-NEW** [`38d0b5d`] — Умный поиск услуг (миграции 0062 + 0063):
   - Postgres FTS русским стеммером + pg_trgm + thesaurus-таблица `category_terms` (86 seed-терминов).
   - RPC `search_categories(query, limit)` — UNION 3 слоёв (synonym 1.0 / FTS 0.7 / trigram 0.5×similarity).
   - Раскладка-фикс на клиенте JS (`flipLayout`) — 2 параллельных запроса.
   - Интегрировано в `/orders/category-select`.
   - Кейсы verified: «камера» → Видеонаблюдение; «rfvthf» → баннер «Возможно, вы искали: камера»; «холодильник» → Бытовая техника (synonym); «сантехнк» (опечатка) → Сантехника (trigram); «электр» (префикс) → Электрика (FTS).
10. **P0-8** [`2f5cf0d`] — Главная мастера = лента 3 свежих заказов (вместо «Заявок пока нет»), skeletons вместо ActivityIndicator. Tab-bar badge на иконку «Заказы» уже работал.

**Что сейчас функционально готово в master-аккаунте:**
- Регистрация (на demo OTP), профиль с категориями (через bottom-sheet с поиском), прайс-лист с pre-defined услугами и placeholder-ценами, 4 типа цен включая «договорная», лимит откликов 5/день, главная = лента заказов, чат с фото.

**13 миграций применены на прод:** 0049–0063 (часть baseline-коммитом, P0-1..P0-NEW добавили 0055–0063).

**Что НЕ сделано в P0 (отложено):**
- 6 micro-улучшений UX из P0-8: swipe-actions на OrderRow, inline-edit прайса, 1-тап «Готово» с автозапросом отзыва.
- Полное наполнение `avg_check_rub` для всех 280 L3 услуг (заполнено 41 на 5 категорий — Сантехника / Электрика / Уборка / Покраска / Плитка).
- `is_demo` фильтр в queries — включим когда появятся реальные мастера.

**Известная регрессия:** demo-логин (`+79000000003` → код `000000`) падает в `/verify` с «Database error querying schema». Заведено в TASKS как BUGFIX. Не блокирует разработку (можно использовать другой demo-аккаунт или начать с регистрации).

---

## Прежнее состояние (2026-05-15 поздний вечер, JIT-signup + draft persistence + guest profile)

**Главное:**

- **JIT-signup для анона в /orders/new.** Анон заполняет всю форму заказа (название, описание, категория, локация, срочность, бюджет). Нажимает «Опубликовать» — открывается `<JitSignupSheet>` (BottomSheet с двумя шагами: имя+телефон → 6-значный SMS-код). После confirm: `signInAnonymously` создаёт сессию, `UPDATE users SET first_name, onboarding_completed_at=now()` (JIT-flow пропускает онбординг), затем родитель автоматически вызывает `publishWithUser(uid)` → success screen «Заявка опубликована». Sprint 1: SMS — заглушка (любые 6 цифр проходят).
- **Draft заказа выживает любую навигацию.** Расширил `order-draft-store.ts` — теперь хранит полный snapshot формы (title, description, l2Id, cityId, district, urgency, budgetMode, budgetMin, budgetMax). `/orders/new` подписывается на `watch()` и пишет в store при каждом изменении, читает store как defaultValues. Это решает баг user 2026-05-15 «нажал на категорию → форма сбросилась» — переход `/orders/new → /orders/category-select → back` теперь сохраняет всё что было введено (verified в preview).
- **Guest profile screen.** Анон тапает «Профиль» — раньше висел спиннер. Теперь показывается hero-card «Войдите в аккаунт · Создавайте заказы…» + CTA «Войти по телефону» + переключатель темы. Спиннер остаётся только для случая «есть session, грузим userRecord».
- **Back navigation v3 (in-app history stack).** Введён `<NavHistoryTracker />` + `useNavHistory` Zustand-стек pathname'ов. `useSafeBack` теперь делает `router.replace(prev)` на предпоследний path из стека — обходит проблему Expo Router с `history.replaceState` при cross-tab переходах. Раскатан на 8 detail-экранах.
- **Логаут на вебе работает.** `Alert.alert` → `confirmAsync` (web → `window.confirm`, native → `Alert.alert`).

**Новые файлы:**
- `src/lib/confirm.ts` — `confirmAsync()`.
- `src/lib/nav-history.ts` — Zustand-стек pathname + `<NavHistoryTracker />`.
- `src/features/auth/JitSignupSheet.tsx` — JIT-signup BottomSheet.
- `SESSION_SUMMARY_2026-05-15.md`.

**Изменённые файлы:**
- `src/lib/use-safe-back.ts` — переписан на nav-history.
- `src/lib/order-draft-store.ts` — расширен до полного draft.
- `app/_layout.tsx` — смонтирован NavHistoryTracker.
- `app/(tabs)/profile/index.tsx` — guest-state + логаут через confirmAsync + header back через useSafeBack.
- `app/(tabs)/orders/new.tsx` — useForm ↔ draft-store sync, JIT-signup integration.
- 7 detail-экранов с back-кнопками (orders/[id], chats/[id], client/[id], notifications, useful×2, admin).

**E2E-flow verified (Заказ от анона):**
1. Анон на `/orders/new` → пишет «Покрасить стену в детской» + описание ✅
2. Кликает «Выберите категорию» → `/orders/category-select` → пикает «Сантехника» → back ✅
3. **Title/description выжили после возврата** ✅
4. Выбирает локацию «Назрань · Магас» → Готово ✅
5. Нажимает «Опубликовать заказ» → открывается JIT sheet ✅
6. Вводит имя «Магомед» + телефон → «Получить код» → код-экран ✅
7. Вводит `000000` → «Подтвердить и опубликовать» → success screen «Заявка опубликована» ✅
8. «К моим заказам» → видит новый заказ в списке ✅

**Куда ещё применить confirmAsync / useSafeBack (НЕ сделано):**
- `Alert.alert` confirm'ы в orders/[id] (отмена, скрыть отклик, завершить), profile/edit-*.tsx, admin/index.tsx — на вебе всё ещё no-op.

---

## Прежнее состояние (2026-05-15 вечер, fix back-navigation + logout button на вебе)

**Главное:**

- **Кнопка «Выйти из аккаунта» теперь работает на вебе.** Был баг: `Alert.alert` в react-native-web — no-op, поэтому confirm-диалог никогда не показывался, `signOut()` не вызывался. Создан `src/lib/confirm.ts` с `confirmAsync()` — на вебе использует `window.confirm`, на native — `Alert.alert`. Логаут в `app/(tabs)/profile/index.tsx` (обе ветки: клиент + мастер) переведён на `confirmAsync`. Верифицировано в preview: confirm срабатывает, localStorage очищается, AuthGate переводит в анон-режим.
- **Кнопка «Назад» возвращает на предыдущий экран, а не «куда попало».** Был баг: на вебе detail-экраны (`master/[id]`, `client/[id]`, `category/[id]`, `chats/[id]`, `orders/[id]`, `notifications`, `useful`, `admin`) живут как top-level Tabs.Screen в `(tabs)`. Cross-tab `router.push` использует `history.replaceState`, не `pushState`. `router.back()` через canGoBack=true уходил на корень предыдущего таба; `window.history.back()` тоже не помогал — predecessor entry уже затёрт. Фикс: создан `src/lib/nav-history.ts` (Zustand-стек pathname'ов) + `<NavHistoryTracker />` смонтирован в корневом `app/_layout.tsx`. `useSafeBack` теперь читает предпоследний элемент стека и делает `router.replace(prev)`. Применён `useSafeBack` на 8 detail-экранах, где раньше был сырой `router.back()`. Верифицировано в preview: `/orders/[id] → /master/[id] → back` приводит обратно на `/orders/[id]`.

**Новые файлы:**
- `src/lib/confirm.ts` — `confirmAsync()` кросс-платформенный confirm.
- `src/lib/nav-history.ts` — Zustand-стек pathname + `<NavHistoryTracker />`.

**Изменённые файлы:**
- `src/lib/use-safe-back.ts` — переписан на nav-history стек (v3; до этого было 2 промежуточных подхода — history.back и web-first history, оба отброшены).
- `app/_layout.tsx` — смонтирован `<NavHistoryTracker />`.
- `app/(tabs)/profile/index.tsx` — логаут через `confirmAsync`, header back через `useSafeBack`.
- `app/(tabs)/orders/[id].tsx`, `chats/[id].tsx`, `client/[id].tsx`, `notifications/index.tsx`, `useful/index.tsx`, `useful/[slug].tsx`, `admin/index.tsx` — заменён сырой `router.back()` на `useSafeBack(<fallback>)`.

**Куда ещё применить тот же паттерн (НЕ сделано в этой сессии):**
- `Alert.alert` на confirm-диалогах внутри `orders/[id]` (отмена заказа, скрыть отклик, завершить заказ), `profile/edit-client.tsx`, `profile/edit-master.tsx` — на вебе они тоже no-op. Переход на `confirmAsync` — отдельная задача (видно в `TASKS.md` если завести).

---

## Прежнее состояние (2026-05-15, спека мастера + персональный demo-master)

**Главное в этой сессии:**

- **`MASTER_ACCOUNT_SPEC.md`** (новый файл в корне) — консолидированная спецификация аккаунта мастера. Раньше инфа была разлита по `PROJECT_MAP.md` §4.3/§5.1/§5.2 + `CATEGORIES_AND_PROFILES.md` §2 + миграциям. Теперь одна точка входа: 3 БД-сущности + 6 экранов UI + чек-листы MVP-1 / Phase-2 / Phase-3 + INSERT-шаблон для тестов. Линкована из `DEMO_ACCOUNTS.md`.
- **Персональный demo-master `+7 900 000-00-03`** (Руслан Хамхоев, Магас) — миграция `0054_personal_demo_master.sql`, применена на прод. ⭐⭐⭐ верификация (самозанятый с ИНН 060800123456), 12 лет опыта, рейтинг **4.7 ★** (3 отзыва), **29 закрытых сделок**, availability_status = `this_week`. **3 категории** (Сантехника + Электрика + Отделка), **8 услуг в прайсе**, **8 фото в портфолио**, **2 in_progress** заказа с активными чатами + **3 completed** (1 без отзыва от Алины — чтобы потестить «Оставить отзыв») + **2 sent отклика** на чужие open-заказы.
- **Логин (как у других демо):** email `79000000003@xtrud-demo.local` + password `xtrud`. На фронте — телефон `+7 900 000-00-03` + любой 6-значный код.
- Verification в preview: открыл `/master/f0000003-…0003` — карточка рендерится корректно (имя, рейтинг, бейджи, 8 услуг, 3 отзыва от Адама/Ахмеда/Зелимхана).

**Файлы сессии:**
- Новые: `MASTER_ACCOUNT_SPEC.md`, `supabase/migrations/0054_personal_demo_master.sql`
- Изменённые: `DEMO_ACCOUNTS.md` (добавлен личный мастер + детальный walkthrough), `STATUS.md`

---

## Старое состояние (2026-05-14 поздняя ночь, location-архитектура по образцу Ingush-Business)

**Главное в этой сессии (см. подробно `SESSION_SUMMARY_2026-05-14.md` → секция «Поздняя ночь 2026-05-14 — Location system rewrite»):**

- **Единый source-of-truth `src/lib/location-config.ts`** — содержит 8 поселений РИ (5 cities из БД + 3 крупных села-городка), 4 муниципальных района, 32 села, координаты для Haversine, helpers (`findDistrictByVillage`, `getNearestCity`, `getLocationLabel`), типы `LocationFilter` / `LocSet`. Подход скопирован из Ingush-Business `lib/config.ts`. Все потребители (CitySelector / LocationPicker / order-schema) импортируют отсюда.
- **`useUserCity()` hook** в `src/lib/use-user-city.ts` — Zustand store + persist (`xtrud-city` v3) + init-цикл: AsyncStorage → web geolocation (`navigator.geolocation`, 5s timeout) → `getNearestCity` (threshold 30км) → `DEFAULT_CITY_ID="nazran"` fallback. Native — TODO `expo-location`.
- **2 новых UI компонента:**
  - `<LocationSheet>` (`src/components/ui/LocationSheet.tsx`) — multi-select городов+районов через `LocationFilter` `{isAll, cities[], districts[]}`. Reset link + sticky CTA.
  - `<LocationFilterSheet>` (`src/components/ui/LocationFilterSheet.tsx`) — multi-select с сёлами напрямую через `Set<"c:cityId"|"v:village">`. Два режима UI (cities-grid / villages-list с поиском по 32 сёлам).
- **Миграция `0050_cities_add_large_villages.sql`** — добавила 3 cities в БД (`ordzhonikidzevskaya`, `sernovodskaya`, `nesterovskaya`). Применена на прод.
- **`order-schema.ts` теперь только Zod** — все локационные константы переехали в `location-config.ts`, оставлены re-export'ы (ALL_INGUSHETIA_CITY / districtOptions / villagesByDistrict / findDistrictByVillage / isDistrict) для обратной совместимости.
- **CitySelector переведён на useUserCity** — старый local Zustand store удалён, импорт через `@/lib/use-user-city`. Все 8 cities видны в PickerSheet.
- **docs/location-system.md обновлён** до полной архитектуры — 4 компонента + init-цикл + 5 follow-up задач.

**Файлы сессии (location-architect):**
- Новые: `src/lib/location-config.ts`, `src/lib/use-user-city.ts`, `src/components/ui/LocationSheet.tsx`, `src/components/ui/LocationFilterSheet.tsx`, `supabase/migrations/0050_cities_add_large_villages.sql`
- Изменённые: `src/components/CitySelector.tsx` (переведён на useUserCity), `src/components/ui/index.ts` (экспорт 2 sheet'ов), `src/features/orders/order-schema.ts` (re-export'ы из location-config), `app/(tabs)/orders/index.tsx` (graceful fallback null city_id в 3 OrderRow + nullable city_id в NewOrdersTabProps), `docs/location-system.md`, `STATUS.md`, `TASKS.md`, `SESSION_SUMMARY_2026-05-14.md`

**Верификация:** `tsc --noEmit` чисто, preview-eval подтверждает 8 cities в LocationPicker bottom-sheet'е (Магас / Назрань / Сунжа / Малгобек / Карабулак / Орджоникидзевская / Серноводская / Нестеровская). Dark mode корректно отрисован.

---

## Старое состояние (2026-05-14 ночь, perf-агент: skeletons + safe back-navigation)

**Главное в этой сессии (см. подробно `SESSION_SUMMARY_2026-05-14.md` → раздел «Поздний вечер 2026-05-14 — perf-агент»):**

- **Прогрессивная загрузка экранов с реальной структурой вместо пустых лоадеров.** Master detail больше не блокируется full-screen «Загружаем профиль…» — рендерится hero 4:5 skeleton + skeleton имени + 3 pill-skeletons, секции проявляются сверху вниз. Home/TopMasters рисует 4 mini-card skeleton'а вместо `null` (раньше секция «прыгала»). Orders index — все 4 `<ActivityIndicator />` заменены на `OrderRowsSkeleton` (chip + title + meta). Category page — row-skeletons формы реального `MasterRow`. MasterServicesList — 3 price-row skeleton'а.
- **Skeleton базовый компонент** — `src/components/ui/Skeleton.tsx`. Animated.View opacity-pulse, `bg-canvas-soft-2` (auto dark mode). Anti-pattern: `<ActivityIndicator />` на пустом экране запрещён.
- **Safe back-navigation** — `useSafeBack(fallback: Href)` хук (`src/lib/use-safe-back.ts`). Раньше при заходе по deeplink/refresh `router.back()` уходил в браузерную историю до приложения («не туда, откуда зашёл»). Теперь — `canGoBack()` check + `router.replace(fallback)` на логического родителя. Применено в 7 экранах: master/[id] → home, category/[id] → home, orders/new → /orders, orders/[id] → /orders, orders/edit/[id] → /orders/[id], orders/category-select → /orders/new, chats/[id] → /chats, search → home.
- **Верификация:** `tsc --noEmit` чистый, 18 matches `useSafeBack|canGoBack` в bundle, smoke-тесты deeplink → back для master/category/search/orders прошли.

**Файлы сессии (perf-agent):**
- Новые: `src/components/ui/Skeleton.tsx`, `src/lib/use-safe-back.ts`
- Изменённые: `src/components/ui/index.ts`, `app/(tabs)/index.tsx`, `app/(tabs)/master/[id].tsx`, `app/(tabs)/category/[id].tsx`, `app/(tabs)/orders/index.tsx`, `app/(tabs)/orders/[id].tsx`, `app/(tabs)/orders/new.tsx`, `app/(tabs)/orders/edit/[id].tsx`, `app/(tabs)/orders/category-select.tsx`, `app/(tabs)/chats/[id].tsx`, `app/(tabs)/search.tsx`, `src/features/master-services/MasterServicesList.tsx`

---

## Старое состояние (2026-05-14 поздно вечером, UX-полировка category + master)

**Главное в этой сессии (см. подробно `SESSION_SUMMARY_2026-05-14.md`):**

- **Шрифты:** имя мастера в карточке 16 → **18px** (`text-body-lg`), цены в листинге 12 → **14px** mono (новый токен `text-mono-body` в `tailwind.config.ts`).
- **DESIGN.md:** добавлена секция «Минимальные размеры шрифта» — шкала + 6 правил, anti-pattern `text-caption-xs` (10px) запрещён.
- **CLAUDE.md:** 2 новых критических правила —
  - 🚨 «ДОКУМЕНТАЦИЯ ПОСЛЕ КАЖДОЙ ОСМЫСЛЕННОЙ ЕДИНИЦЫ» (структура SESSION_SUMMARY, что обновлять);
  - 🚨 «УМЕНЬШАТЬ ИЗОБРАЖЕНИЯ ДО ≤1200px перед `Read`» (`sips`/`pdftoppm` команды).
- **`/category/[id]` редизайн:**
  - Header: `display-sm` заголовок (20px) + `h-11` тач-таргет back; chip-bar tighter (px:12, gap:6, h-9 chips).
  - FilterChip: outline-style (transparent + hairline border) когда inactive; bg-ink + on-primary text когда active. ChevronDown 14→12, opacity 50%.
  - Gap chips → первая карточка: 44 → 20px (mt-4→0 + py-7→5).
  - **VK-style 5 миниатюр портфолио в каждой карточке** между прайсом и кнопками. На 5-й «+N» если фото больше. Тап → переход на профиль.
  - Контактные кнопки: ghost pills (bg-canvas-soft, h-10, без иконок, equal weight). Primary action — сама карточка. Паттерн TaskRabbit/Booksy/Yelp.
- **`SESSION_SUMMARY_2026-05-14.md`** — полный отчёт сессии (38 закрытых пунктов, новые правила, новые компоненты, anti-patterns, открытые TODO).

**Lazyweb использован для:** редизайна кнопок (TaskRabbit, Booksy, Yelp) и header+chips (Farfetch, Backmarket, Wander, Airbnb).

**Файлы текущей сессии:**
- `app/(tabs)/category/[id].tsx` — header redesign, chip outline, 5-thumb row, ghost buttons, font sizes
- `tailwind.config.ts` — новый токен `mono-body: 14px / 20px lh`
- `DESIGN.md` — секция «Минимальные размеры шрифта»
- `CLAUDE.md` — 2 новых правила
- `SESSION_SUMMARY_2026-05-14.md` — новый файл

---

## Старое состояние (2026-05-14 днём, Sprint J — orders/new rewrite + LocationPicker + правила в CLAUDE.md)

**Главное на сегодня (вечер):**
- **Экран `orders/new` переписан под Vercel-эстетику.** Hero card «Опишите задачу — мастера отзовутся» с eyebrow «НОВЫЙ ЗАКАЗ» (mono) + 3-step value-prop (Получите отклики / Посмотрите цены от мастеров / Выберите подходящего) + privacy callout с Lock-кружком («Ваш номер скрыт от мастеров. Мастера присылают только цену и срок выполнения. Написать или позвонить вам они смогут лишь после того, как вы сами это разрешите.») — оба блока в **единой info-card** с hairline-divider посредине. Иконки 40dp согласованы.
- **`<LocationPicker>` компонент** (`src/features/orders/LocationPicker.tsx`) — иерархический picker locации в bottom-sheet'е. Подход скопирован из проекта Ingush-Business (их `LocationSheet`). Заменил две плоские chip-row секции (Город + Район) на одну trigger-pill «📍 Выберите локацию» → открывает sheet с:
  - Выделенная карточка «Вся Ингушетия» (toggle — заказ видят мастера всей республики, `city_id = null`)
  - 5 chips городов РИ
  - 4 chips муниципальных районов
  - **Sub-row сёл выбранного района** (Экажево, Орджоникидзевская, Джейрах… — 34 села по 4 районам)
  - Sticky bottom CTA «Готово» — commit changes
  Trigger показывает финальную локацию: `Магас · Экажево` / `Вся Ингушетия` / placeholder.
- **БД: `orders.city_id` → NULLABLE** (миграция `0049_orders_city_optional.sql`, применена на прод). Это позволяет хранить заказы «Вся Ингушетия» без привязки к городу. `useCreateOrder` конвертирует UI-значение `"all"` → `null` в payload. `useUpdateOrder` / edit-форма — конвертируют обратно `null` → `"all"` при reset.
- **`orders/index.tsx`**: `cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}` в 3 местах — graceful fallback для null city.
- **Label «Сроки» → «Готовность мастера взяться за работу»** — точнее отражает смысл (это про мастера, не про дедлайн задачи).
- **Все form-chips Vercel-pattern**: selected = чёрный pill (`border-ink bg-ink text-on-primary`) вместо голубого `accent-soft`. City / urgency / budget / district / village — единый visual.

**Новые правила в CLAUDE.md:**
- **🚨 «НИКАКИХ МИНИМАЛЬНЫХ ВАРИАНТОВ И СОКРАЩЕНИЙ»** — задача выполняется полноценно до production-ready, MVP/v1/«пока хватит» запрещены без явной просьбы. Если есть reference-реализация в Ingush-Business / Profi.ru / TaskRabbit — делать на их уровне или выше, не ниже.
- **🚨 «ДОКУМЕНТАЦИЯ ПОСЛЕ КАЖДОЙ ОСМЫСЛЕННОЙ ЕДИНИЦЫ РАБОТЫ»** (добавлено пользователем после моих stub-решений) — после новой фичи / редизайна / data-schema-изменения обновлять STATUS.md, TASKS.md, design-doc'и.

**Файлы:**
- `app/(tabs)/orders/new.tsx` — hero rewrite + единый submit + StepItem
- `src/features/orders/OrderFormBody.tsx` — labels через `body-sm-strong text-ink`, chips через `bg-ink`, секции «Город» + «Район» заменены на `<LocationPicker>`
- `src/features/orders/LocationPicker.tsx` — новый компонент (~270 строк)
- `src/features/orders/order-schema.ts` — константы `ALL_INGUSHETIA_CITY`, `districtOptions`, `villagesByDistrict` (34 села по 4 районам), helpers `findDistrictByVillage` / `isDistrict`
- `src/features/orders/use-create-order.ts` — `"all"` → `null` конвертер
- `app/(tabs)/orders/edit/[id].tsx` — `cityId: order.city_id ?? "all"` при reset
- `app/(tabs)/orders/index.tsx` — graceful fallback для null city
- `supabase/migrations/0049_orders_city_optional.sql` — applied
- `src/types/database.ts` — orders.city_id: string | null в Row/Insert/Update

---

## Старое состояние (2026-05-14 утром, Sprint J — auth-bypass для demo + client profile полноценный)

**Главное на сегодня:**
- **Демо-логин починен.** До этого фронт делал `signInAnonymously()` и просто записывал телефон в `users_private` → пользователь попадал в чистого анона и не видел ни своих заказов, ни чатов. Теперь для номеров `+79000…` фронт логинится через `signInWithPassword({ email, password: 'xtrud' })` где email = `<digits>@xtrud-demo.local`. Сессия попадает в существующего demo-юзера (Алина id `f0000001-…0001`) со всеми её 11 заказами / 4 чатами / 21 сообщением. Phone-provider в Supabase отключён — поэтому email-маршрут.
- **Профиль клиента стал полноценным.** Quick-stats карточки «Заказы N / X активных» и «Чаты N / Y непрочитанных» (clickable) + новая кнопка «Редактировать профиль» → экран `/profile/edit-client.tsx` с полями имя/фамилия/город (через PickerSheet) /район. Префилл из БД, dirty-check на back, кнопка disabled пока нет изменений.
- **Чаты: добавил свежее непрочитанное** от Магомеда Алине → 2 видимых unread-чата для UX-проверки. Префикс `demo: ` в title заказов убран — был артефактом частичной заливки.
- **Аватары: правило DiceBear `shapes` only.** Все 30 demo-юзеров мигрированы с avataaars → shapes (геометрия, Vercel-эстетика). Запрет на avataaars/personas/micah и пр. зафиксирован в CLAUDE.md и memory.

**Миграции применены на проде:** `0045_demo_users_password`, `0046_demo_users_email_login`, `0047_demo_users_fix_null_tokens`, `0048_demo_avatars_shapes_and_cleanup`.

**Что НЕ сделано (намеренно отложено):**
- Реальный OTP SMS-провайдер — Sprint 2.
- Phone-provider в Supabase включать пока не стали (нужно SMS-сообщение), email-маршрут работает.

## Старое состояние (2026-05-13, Sprint J — UI rewrite + web hydration fix)

**Главное:** проект **запускается локально на web** с реальными данными прод-Supabase. Главная клиента + master detail + category page переписаны с нуля под Vercel-based DESIGN.md. Hydration на dev сервере был сломан (Hermes-stable Metro transform → `import.meta` в classic script → SyntaxError), решено через production export + sed-патч на `<script type="module">`.

### Sprint J — что сделано

#### Инфра / дизайн (фундамент)
- **Vercel DESIGN.md активирован** через `npx getdesign@latest add vercel` (2026-05-13). 3 override'а под marketplace в шапке DESIGN.md: 12px card radius / mesh-gradient ограничен hero / mono-caption для метрик. Старые `DESIGN_CALCOM.md`, `DESIGN_SYSTEM.md`, `DESIGN_REFERENCE_CALCOM.md` → `legacy/`.
- **colors.ts переписан** под Vercel: 46 light + 46 dark токенов. Compat aliases (`surface-2`, `muted`, `accent`, `hairline-soft`, `muted-soft`, `accent-soft`, `surface-1`, `surface-3`) оставлены для не-переписанных экранов; удалить после полного rewrite.
- **scripts/generate-css-tokens.mjs** — генератор `global.css` из `colors.ts`. `npm run tokens` / `npm run tokens:check`. CSS-vars между маркерами `@generated:tokens-*`. Идемпотентно.
- **Geist + Geist Mono** через jsdelivr-CDN в `global.css` (variable webfonts). AppText переписан под Geist на web + Inter fallback на native + новый `weight="mono"` для метрик «★ 4.9», «12 км», «от 2 500 ₽».
- **Tailwind config** под новые токены: pill 100px / md 8px / lg 12px (xtrud override-дефолт карточек). Vercel typography scale (display-xl/lg/md/sm + body-lg/md/sm + caption + mono).

#### Hydration fix (КРИТИЧНО)
- **КОРНЕВАЯ ПРОБЛЕМА**: Expo SDK 54 emits web bundle с `import.meta` (Metro Hermes-stable transform profile). Browser выполняет classic `<script defer>` как NON-module и при первой встрече с `import.meta` → SyntaxError → весь bundle не выполняется → React не монтируется → 0 запросов к Supabase, ни одного клика.
- **РЕШЕНИЕ**: production export + sed-патч `<script ... defer>` → `<script ... type="module">`. ESM-синтаксис теперь валидный, bundle стартует.
- `npm run web:build` — `expo export --platform web` + автопатч.
- `npm run web:serve` — `npx serve dist -p 8082 -s` (SPA).
- `app.json`: `web.output: "static"` → `"single"` для локального preview.
- `app/_layout.tsx`: убран top-level `import * as Notifications` (нативный модуль ломал web bundle). Notifications handler перенесён в `use-register-push-token` (только native, dynamic require).
- `src/features/notifications/use-register-push-token.ts`: переписан на dynamic require('expo-notifications')/require('expo-device') внутри useEffect только на native. На web — полный no-op. `unregisterCurrentPushToken` сохранён (вызывается из signOut).
- `app/+html.tsx`: inline theme-guard читает правильный ключ `xtrud-theme` (Zustand persist JSON) — раньше читал несуществующий `theme`, что было root-cause SSR theme-flash.

#### UI atoms (новая папка `src/components/ui/`)
- **Button** — pill, 4 варианта (primary/secondary/ghost/destructive), 3 размера, loading state. Цвета через NativeWind className (CSS-var resolution через html.dark класс).
- **Input** — Vercel form-input (6px radius), label/hint/error/leftIcon/rightIcon.
- **Card** — 12px radius xtrud override, 3 варианта (default/soft/dark).
- **Chip** — pill badge, 6 вариантов (default/outline/dark/success/warning/error), поддержка mono.
- **SearchBar** — Input + lucide Search + clear-button, дефолт lg (48px).
- **Avatar** v2 — 3-стейт fallback: url → инициалы (пастель из `badge-*` токенов) → User-иконка (нейтральная).
- **BottomSheet** — Modal + slide + drag-handle + backdrop, max-width 480 на web.

Все атомы используют **CSS-var через Tailwind className** (не inline style — RNW не резолвит `rgb(var(--x))` в inline). На native — те же className через NativeWind.

#### Переписанные экраны
- **`app/(tabs)/index.tsx`** — главная клиента c нуля по TaskRabbit + Thumbtack hybrid:
  - Top-bar: лого xtrud + CitySelector + Войти/Avatar
  - Hero: H1 «Услуги в {город}» + SearchBar + primary CTA «Описать задачу» + соцпруф chips
  - Featured вертикали (loaded from `is_featured=true`): Клининг + Сантехника
  - Top-rated мастера (горизонтальная карусель, рендерится при ≥3 карточках) — с реальными данными из прод-Supabase
  - Все категории (сетка 2/3/4 col responsive)
- **`app/(tabs)/master/[id].tsx`** — master detail с нуля (Thumbtack pattern): 16:9 hero фото + back/flag в углах + рейтинг/город/опыт chips + bio + категории + услуги (через existing MasterServicesList) + портфолио + отзывы. Sticky bottom CTA «Написать в чат» (анону — «Войти и написать», открывает LoginWall).
- **`app/(tabs)/category/[id].tsx`** — category page с нуля: H1 + counter мастеров + card-row list (avatar + рейтинг + город + опыт + bio) + типичные услуги с avg-чеком в Card-grouping.
- **`src/components/TabBar.tsx`** v2 — активный/неактивный различаются ЦВЕТОМ (ink vs mute), не opacity.

#### AuthGate + анон
- `_layout.tsx`: AuthGate переписан — **анон может смотреть `(tabs)`**. Логин запрашивается just-in-time через `<LoginWall>` на действиях (создание заказа, отправка сообщения, оставление отзыва).
- **`src/components/LoginWall.tsx`** — bottom-sheet с CTA «Войти по телефону». Хук `useLoginWall(reason)` для удобного guard'а действий: `wall.guard(() => doAction())`.

#### Cities + featured
- **Cities таблица** уже существовала с Sprint 1 (5 городов: Магас/Назрань/Сунжа/Малгобек/Карабулак) — миграция НЕ нужна. Локальный CitySelector совпадает по id.
- **CitySelector** (`src/components/CitySelector.tsx`) — chip + BottomSheet с городами Ингушетии. Состояние в Zustand `xtrud-city` store.
- **0034_categories_is_featured.sql** применена на прод: `categories_l2.is_featured boolean` + индекс + помечены cleaning + plumbing.
- **`src/features/categories/use-featured-categories.ts`** — хук загружает is_featured=true категории. Главная использует его + палитру по id (cleaning → violet, plumbing → cyan).

#### Что НЕ переписывалось из старых экранов (осознанно)
- `orders/index`, `orders/new`, `orders/[id]`, `orders/edit/[id]` — работают через compat aliases (`surface-2`, `muted`, `accent` → Vercel токены)
- `chats/*` — работают
- `profile/*` — работают
- `(onboarding)/*` — работают
- `(auth)/phone`, `(auth)/verify` — работают

Они визуально стилизованы под старый Cal.com-стиль через compat aliases, но рендерятся корректно. После rewrite главных экранов их можно переписать постепенно (отдельные спринты).

### История ключевых решений (2026-05-13)

1. **Vercel DESIGN.md вместо Cal.com** — пользователь установил `npx getdesign@latest add vercel`. Cal.com отправлен в `legacy/`. Override'ы под consumer-marketplace в шапке нового DESIGN.md.
2. **CSS-var через className вместо JS hex** — на web inline style `rgb(var(--x))` не работает (RNW не пробрасывает var). Решение: атомы используют NativeWind className → Tailwind генерирует CSS-классы → CSS-var резолвится из html.dark класса.
3. **`web.output: single` вместо `static`** — для локалки. SPA-режим. Прод-деплой через `deploy/web.sh` НЕ затронут (он делает свой `expo export` без локального серва).
4. **`type="module"` patch для web bundle** — обход SDK 54 бага с `import.meta` в classic script. Скрипт `scripts/build-web-local.mjs` автоматизирует.
5. **AuthGate анон-friendly** — клиент может смотреть каталог + карточку мастера БЕЗ логина. Just-in-time через LoginWall на действиях.

### Как запустить локально

```bash
npm run web:build && npm run web:serve
# → http://localhost:8082
```

После каждой UI-правки повторить `web:build`.

### Дальше

- UI редизайн orders / chats / profile / onboarding (постепенно, при касании)
- Real OTP SMS-провайдер (РФ-локальный)
- Master verification UI
- Master services CRUD UI (DB готова)
- Welcome onboarding slides
- Vercel migration для prod web

---

## Старая история (до Sprint J)

**Sprint 31.5 закрыт — `master_services` миграция + CRUD UI (без radius map).**

Sprint 31.5:
- **Миграция 0024_master_services** — таблица `master_services (id, master_id FK → master_profiles, title, price_min, price_max, unit, position, created_at, updated_at)`. Enum `service_unit` (per_hour / per_task / per_m2 / per_day). RLS: SELECT public, INSERT/UPDATE/DELETE only own. Trigger: max 20 услуг на мастера. CHECK: title 2–100 chars, price_min ≥ 0, price_max ≥ price_min.
- **Хуки** `src/features/master-services/use-master-services.ts` — `useMasterServices(masterId)`, `useUpsertMasterService`, `useDeleteMasterService` + `formatPriceRange` helper + `SERVICE_UNIT_LABELS` (RU).
- **`<MasterServicesSection>`** для `edit-master.tsx` — список (≤20) + Add-кнопка → Modal-форма (title / priceMin / priceMax / unit radio) + edit-pencil + delete-confirm Alert. EmptyState с ListPlus иконкой.
- **`<MasterServicesList>`** read-only для `master/[id].tsx` — публичная карточка показывает прайс между Категориями и Портфолио. Использует тот же queryKey, обновляется автоматически при правке владельцем.
- TS-типы регенерированы (`src/types/database.ts`): добавлены `master_services` table + `service_unit` enum.

Карты вынесены из scope осознанно (radius map требует expo-maps или prebuild → отдельный спринт).

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (117 файлов), `vitest` 47/47 ✅.

**Не запускалось вживую — нужно проверить:**
- В edit-master.tsx: добавить услугу → она появилась в списке; редактировать → значения подтянулись в Modal через `key={initial?.id}`; удалить → Alert + строка пропала.
- На master/[id].tsx: прайс виден между Категориями и Портфолио, если у мастера ≥1 услуга. У мастера без услуг — секция полностью скрыта (null).
- RLS: чужой мастер не может писать / удалять чужие master_services (RLS гарантирует, но протестировать в реальной сессии).
- Trigger 20-limit: попытаться вставить 21-ю → ожидаем error `max_20_services_per_master`.

**Sprint 33.5 закрыт — полный Web Shell (top-nav + chats split-layout + hover).**

Sprint 33.5:
- **Новый `<WebShell>`** (`src/components/WebShell.tsx`) — desktop-web обёртка с top-nav: logo «xtrud» (Cal Sans), 3 nav-link'а (Главная/Заказы/Чаты) с активным состоянием и badges, theme-toggle (Sun/Moon, переключает напрямую без bottom-sheet), avatar-кнопка → profile. Внутри — max-width контейнер 1120px.
- **Адаптивный `(tabs)/_layout.tsx`** — на `Platform.OS === "web" && width >= 768` рендерит `<WebShell><Slot /></WebShell>` (без bottom-tab-bar). На mobile / narrow web — оригинальный `<Tabs>`.
- **Chats split-layout** — `chats/_layout.tsx` на desktop рендерит sidebar 360px (`<ChatsListContent variant="sidebar">`) + main pane (`<Slot />`). Sidebar подсвечивает текущий `selectedChatId` (parse из `usePathname`). `chats/index.tsx` на desktop показывает EmptyState «Выберите чат», на mobile — нормальный page list.
- **Reusable `<ChatsListContent>`** (`src/features/chat/ChatsListContent.tsx`) — переиспользуется в page + sidebar variants. Sidebar-variant: компактнее, без display-заголовка, подсветка выбранного.
- **Hover** добавлен в `WebShell` (все nav/theme/avatar), `ChatsListContent` (rows), `CategoryTile` (cover + icon), `OrderRow`, `MasterPreviewCard` (horizontal + row). NativeWind `hover:` префикс — на native игнорируется, на web работает нативно.

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (114 файлов), `vitest` 47/47 ✅.

**Не запускалось вживую — нужно проверить:**
- На desktop web `https://alanbani.ru/xtrud/` после деплоя: top-nav, переключение route'ов, split-chats при `/chats/{id}`, hover'ы на cards.
- На mobile (iOS/Android): убедиться что `<Tabs>` рендерится как раньше (изменения в layout условные, по `Platform.OS === "web"`).
- На narrow web (< 768px): должна работать mobile-логика (bottom-tab-bar, full-page chats).

**Sprint 33 закрыт — Theme switcher UI (часть Web Shell).** + **Sprint 31 (UI-only) закрыт.**

Sprint 33:
- **Новый `<ThemeSwitcher>`** (`src/components/ThemeSwitcher.tsx`) — segmented-radio «Системная / Светлая / Тёмная» с Lucide-иконками (Smartphone/Sun/Moon). Использует существующий `useColorScheme` хук + Zustand `setPreference`. Закрывает cross-cutting.md A3 (theme-toggle на web visible) на mobile-side; web-side с top-nav заголовком — Sprint 33.5.
- Подключён в `profile/index.tsx` — секция «Тема» между portfolio и Logout-кнопкой.
- Logout-иконка теперь `themeColors.body` через токен (не хардкод `#374151`).

Sprint 31 (UI-only):
- **Char-counter `{len} / 500`** в bio-поле (`MasterProfileFormBody`) — показывает `text-warning` при >450.
- **Dirty-check** в `edit-master.tsx` — back-кнопка показывает Alert «Есть несохранённые изменения, выйти?». Submit-кнопка disabled пока `!isDirty`.

**Отложено** (требует миграции БД или новой инфраструктуры):
- Sprint 31.6: radius map для service_radius_km (нужен `expo-maps` или prebuild + `react-native-maps`).
- Sprint 32: image pipeline с blurhash (миграция БД + edge function для генерации hash при upload).

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (123 файла), `vitest` 47/47 ✅.

**Sprint 30 закрыт — Profile showcase + portfolio upload UX (P3).**

Что вошло:
- **«Посмотреть как клиент»** — primary-кнопка `bg-ink` в `profile/index.tsx` для мастеров. Открывает `/master/{userId}` — там уже работает `isOwnProfile === true` (Sprint 24), который скрывает sticky CTA «Создать заказ». Получается живой preview публичной карточки.
- **Portfolio upload — crop с aspect `[4, 3]`** в `pickResizeUploadPortfolio` (`src/lib/image-upload.ts`). Thumbtack/Airbnb-стандарт горизонтальных work-фото. allowsEditing уже было в `pickImage`.
- **Минимальное разрешение 1200×900** — non-blocking Alert «Фото небольшое, продолжить?» если меньше. Экспортированы константы `PORTFOLIO_MIN_WIDTH/HEIGHT`.
- **Avatar pencil-кнопка** синий `bg-accent` → монохром `bg-primary` (вписывается в Cal.com-эстетику, нарушение монохрома устранено).

Допущения (отложено):
- Tile-skeleton при upload отдельной плитки портфолио — это требует доработки PortfolioGrid (Sprint 30.5/future). На месте: existing `ActivityIndicator` в кнопке Add.
- Portfolio EmptyState — существующий empty уже технический, можно полировать в Sprint 34+.

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (122 файла), `vitest` 47/47 ✅.

**Sprint 29 закрыт — Chat templates + EmptyState (P2).**

Что вошло:
- **Новый `<QuickReplyChips>`** (`src/features/chat/QuickReplyChips.tsx`) — горизонтальная FlatList с pill-шаблонами. Разные templates по роли: master (6 templates типа «Когда удобно подъехать?», «Подъеду через час») и client (5 templates типа «Когда сможете?», «Спасибо!»).
- **Подключение в `chats/[id].tsx`** — над input, под messages-list. При тапе шаблон добавляется в text-state (не отправляется автоматически), пользователь редактирует и шлёт сам.
- **Empty thread state** через `<EmptyState icon={MessageSquare} title="Начните диалог" hint="...">` — заменяет голую строку. Подсказка ссылается на quick-replies внизу.

Templates статичные, без user-defined. В будущем — `chat_templates jsonb` в master_profiles (отложено).

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (122 файла), `vitest` 47/47 ✅.

**Sprint 28 закрыт — Chat context + базовая гигиена мессенджера (P2).**

Что вошло:
- **Inbox (`chats/index.tsx`):** буква-инициал в шапке заменена на `<Avatar size="md">` (48px) с поддержкой `avatar_url` и seed-based placeholder. `<OrderStatusBadge>` показывается рядом с title заказа. EmptyState через единый компонент. CardListSkeleton при загрузке (вместо ActivityIndicator).
- **Тред (`chats/[id].tsx`):** аватары собеседника слева от чужих сообщений (нарушение принципа №2 «фото — главный нерв» исправлено — было только буквой).
- **DateSeparator** между группами сообщений по дням: «Сегодня / Вчера / 5 мая / 1 января 2025». `renderMessagesWithSeparators` helper-функция группирует.
- **Header чата уже имел `<OrderStatusBadge>`** (после Sprint 27) — оставлен.

Допущения (часть Sprint 28 пропущена осознанно):
- **Group-by-sender** (последовательные сообщения одного отправителя группируются без аватара) — отложено, требует более глубокого рефакторинга MessageBubble. На месте: каждое чужое сообщение имеет свой аватар.

Проверки: `tsc --noEmit` ✅, `biome check` ✅, `vitest` 47/47 ✅.

**Sprint 27 закрыт — Order status visibility + cancel (P2).**

Что вошло:
- **`<OrderStatusBadge>` подключён везде:** `OrderRow` (в шапке карточки рядом с категорией), `orders/[id].tsx` (size="md" в шапке детали заказа), `chats/[id].tsx` (header чата — контекст заказа).
- **Кнопка «Отменить заказ»** в `orders/[id].tsx` — MoreVertical (⋮) в шапке, Alert.alert confirm. Видна только владельцу заказа когда статус ∈ {open, in_progress}. Использует существующий `useCancelOrder` (RLS T2/T6).
- **Звёзды-рейтинг → Lucide `<Star fill>`** — 4 места в orders/[id].tsx (read-only myReview ×2 + interactive setRating ×2). Цвет через токен `tc.warning`, неактивные — `tc["muted-soft"]` с `fill="transparent"`.
- **OrderRow расширен `status` prop** — передаётся из всех мест использования. Master feed жёстко передаёт `"open"` (use-master-feed фильтрует по этому статусу).

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (121 файл), `vitest` 47/47 ✅.

**Sprint 26 закрыт — Order create wizard (P1).**

Что вошло:
- **3-шаговый wizard** в `app/(tabs)/orders/new.tsx`: Шаг 1 (категория) → Шаг 2 (название + описание) → Шаг 3 (бюджет + город + район + срочность + Trust-баннер).
- **`<OnboardingProgress step total={3}>`** переиспользован поверх wizard. Per-step валидация через `react-hook-form trigger()`: «Далее» disabled пока поля шага не валидны.
- **`OrderFormBody` расширен** опциональным `step?: 1 | 2 | 3` prop. В edit-режиме (`step=undefined`) рендерит все секции — backward-совместимо.
- **Trust-баннер «Обычно мастера отвечают за 15–60 минут»** на финальном шаге (TaskRabbit pattern) с иконкой Clock в success-цвете.
- **Success-экран** после публикации — CheckCircle2 + «Заявка опубликована» + 2 кнопки («К моим заказам» / «Закрыть»). Заменяет голый `router.back()`.
- **Pre-fill категории** через `?l2=<l2_id>` query-param — приходит с master-card CTA «Создать заказ» (Sprint 24).
- **Back** на шаге 1 = router.back(), на шагах 2-3 = вернуться на предыдущий шаг.

Проверки: `tsc --noEmit` ✅, `biome check` ✅, `vitest` 47/47 ✅.

**Sprint 25 закрыт — Feed & category list (P1).**

Что вошло:
- **Новый хук `useTopMasters(limit)`** (`src/features/master-view/use-top-masters.ts`) — глобальный топ мастеров по rating → closed_deals → experience, фильтр на `onboarding_completed_at NOT NULL` и `status='active'`.
- **`<MasterPreviewCard>`** (`src/components/MasterPreviewCard.tsx`) — два варианта: `horizontal` для главной (180px width, square фото 1:1), `row` для category-list (92×92 фото, TaskRabbit Select-a-Tasker pattern). Универсальный компонент, переиспользуется в обоих местах.
- **Главная (`tabs/index.tsx`):** добавлена секция «Лучшие мастера» с горизонтальным карусели поверх категорий. Skeleton при загрузке. Скрывается если нет данных — экран не показывает пустой блок.
- **`category/[id].tsx`**: старый `MasterCardRow` (48px-аватарка) заменён на `<MasterPreviewCard variant="row">` (92×92 фото). Skeleton-загрузка через `<CardListSkeleton>`.
- **Skeleton везде** где был `ActivityIndicator` — категории (TileSkeleton×6 в сетке), мастера (CardListSkeleton).

**Допущения (выполнены частично от ROADMAP § Sprint 25):**
- Search-bar пропущен — требует новой инфраструктуры (search API, full-screen search экран). Помечен как Sprint 25.5/future.
- City selector пропущен — требует city-state Zustand + UI смены. Также Sprint 25.5/future.
- Услуги-как-prices в category/[id].tsx сейчас остались над мастерами (а не chip-фильтры под). Это требует более глубокого UI-рефакторинга экрана — отложено.

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (121 файл), `vitest` 47/47 ✅.

**Sprint 24 закрыт — Master card (Thumbtack pattern, P1).** Главный conversion-экран продукта переделан.

Что вошло (`app/(tabs)/master/[id].tsx`):
- **Hero 16:9** вверху — большая cover-фотография мастера (`avatar_url`) с gradient-overlay снизу для читаемости имени и бейджей. Если `avatar_url` нет — fallback на placeholder Avatar.
- **Имя + бейджи поверх gradient** (white-on-dark) — Cal Sans display-шрифт для имени, glass-pill «Мастер»/«Активен» снизу.
- **Back-button** на hero — circle с `bg-black/40` (видна на любом фото).
- **Trust-row** компактной строкой сразу под hero: рейтинг (★ + число) + кол-во работ + город. Без вложенности.
- **Sticky bottom CTA** «Создать заказ» — primary-кнопка фикс. внизу + safe-area padding. Скрыта на собственном профиле (`currentUserId === masterId`). Pre-fill: `/orders/new?l2=<first-master-category>`.
- **Переупорядоченные блоки:** Hero → Trust → Bio → Stats chips → Категории → Портфолио → Отзывы.
- **Skeleton** при загрузке (`<HeroSkeleton>` + `<CardListSkeleton count=3>`) вместо `ActivityIndicator` — наконец используем design-system из Sprint 23.

Проверки: `tsc --noEmit` ✅, `biome check` ✅, `vitest` 47/47 ✅.

**Sprint 23 закрыт — Design-system foundation (P0).** Тёмная тема перестала быть «блокером DESIGN.md», `<Skeleton>` / `<EmptyState>` / `<OrderStatusBadge>` готовы к подключению.

Что вошло:
- **`useThemeColor` + `useThemeColors` хуки** (`src/lib/use-theme-color.ts`) — резолвят токен в hex текущей темы через NativeWind `useColorScheme` + `lightColors`/`darkColors`.
- **Рефакторинг 22+ файлов хардкод-цветов** на `useThemeColor`: tabBarBadge, ChevronLeft/MapPin/Star/Plus в Lucide-иконках, placeholderTextColor в TextInput. PortfolioLightbox остался с `#ffffff` (исключение — всегда тёмный backdrop).
- **`<Skeleton>` + composables** (`src/components/Skeleton.tsx`): pulse-анимация через `react-native-reanimated`, варианты `text|circle|rect`, готовые `CardRowSkeleton`/`CardListSkeleton`/`TileSkeleton`/`HeroSkeleton`. Подключение к экранам — отдельной итерацией (cross-cutting C1 не пройден полностью, только инфраструктура).
- **`<EmptyState>`** (`src/components/EmptyState.tsx`) — единый шаблон icon+title+hint+CTA.
- **`<OrderStatusBadge>`** (`src/components/OrderStatusBadge.tsx`) — pill-плашки для 6 статусов state-machine, готов к подключению в Sprint 27.
- **Cal Sans display-шрифт** — npm-пакет `cal-sans@1.0.1` установлен, TTF скопирован в `assets/fonts/CalSans-SemiBold.ttf`, зарегистрирован в `_layout.tsx` через `expo-font`. `AppText` теперь поддерживает `weight="display"` → Cal Sans SemiBold. Tailwind config расширен `font-display`. `assets.d.ts` — типизация TTF-импорта.

Проверки: `tsc --noEmit` ✅, `biome check` ✅ (119 файлов), `vitest` 47/47 ✅.

**Sprint 22 закрыт — Auth & Onboarding fix (P0).** Первое впечатление о продукте больше не сбивает доверие, master-онбординг — полноценный 4-шаговый wizard.

Что вошло:
- **Disclaimer «Sprint 1: код принимается любой» убран** из `app/(auth)/phone.tsx`. Заменён нейтральным «Продолжая, вы соглашаетесь с Условиями использования и Политикой конфиденциальности» (без onPress — страниц Terms/Privacy ещё нет, обернём в `Linking.openURL` когда появятся).
- **OTP — 6 раздельных боксов** (`src/components/OtpInput.tsx`). Скрытый capture-TextInput для iOS `oneTimeCode` autofill + Android `sms-otp`, 6 видимых боксов в Cal-эстетике (rounded-md, hairline-border → ink при фокусе). API совместим с `react-hook-form Controller`.
- **OnboardingProgress компонент** (`src/components/OnboardingProgress.tsx`) — минималистичная Cal-линия из N сегментов, accessibility-progressbar.
- **Новый шаг master-photo** (`app/(onboarding)/master-photo.tsx`) — переиспользует существующий `useUpdateMyAvatar` (bucket `avatars`, crop 1:1, resize до 512px). Фото опциональное, есть кнопка «Пропустить». Используем `expo-image` (cross-cutting C4 заранее).
- **Master onboarding теперь 4-шаговый wizard:** role → categories → photo → profile. `master-categories.tsx` стал dual-mode: `?mode=onboarding` query-param меняет save-поведение (push на photo вместо `router.back()`), скрывает back-кнопку и требует ≥1 категорию. В settings-режиме (3 места вызова из profile/orders/master-view) поведение не сломано — продолжает делать `router.back()`.
- `master-profile.tsx` — финальный шаг wizard'а (step 4/4), убрал back-кнопку (некуда возвращаться при `gestureEnabled: false`), переписал интро («Последний шаг. Расскажите о себе — это поможет клиентам выбрать вас» вместо устаревшего «Категории и фото настроите позже»).

Проверки: `tsc --noEmit` ✅, `biome check` ✅, `vitest` 47/47 ✅.

**Sprint 21 закрыт — UX/UI аудит с Lazyweb.** Сводный документ `AUDIT_2026-05-12.md` в корне репозитория + 6 deep-dive отчётов в `.claude/audit-2026-05-12/`.

**Результат:** 113 находок (33 🔴 / 47 🟡 / 33 🟢) по 23 экранам, 37 Lazyweb-поисков, 100+ просмотренных скриншотов. Все рекомендации привязаны к 4 главным функциональным референсам (Profi.ru / Яндекс.Услуги / TaskRabbit / Thumbtack) и проходят через 6 дизайн-принципов из `PRODUCT_CONTEXT.md`.

**Три системных корня, объясняющих половину находок:**
1. **Dark theme** — палитра `darkColors` в `src/lib/colors.ts` есть, но 40+ мест хардкодят hex прямо в `color={...}` Lucide и `placeholderTextColor`. Решается одним рефакторингом «подключить через `useThemeColor` хук» — см. `cross-cutting.md` B1-B3.
2. **Web = растянутое mobile** — ноль `Platform.OS === "web"` для структурного выбора layout. Theme-toggle на web невидим, max-width отсутствует, sidebar+main для чата нет. Это отдельная большая работа — Sprint 28 в рекомендациях.
3. **Принцип №4 «скорость» не реализован** — 0 skeleton-loaders, 46 `ActivityIndicator`. Принцип №2 «фото — главный визуальный нерв» тоже сломан: hero-фото нет, аватарки 40–96px вместо больших блоков, portfolio upload без crop/ratio.

**Хронология Sprint 21:**
- Подготовительная фаза: Lazyweb MCP подключён, `DESIGN.md` (Cal.com-inspired) поставлен через `npx getdesign@latest add cal`, `PRODUCT_CONTEXT.md` создан с 4 главными референсами + 6 принципами + scope guard, бриф `.claude/audit-2026-05-12/BRIEF.md` подготовлен.
- Запуск 5 параллельных аудит-агентов (Auth+Onboarding, Discovery, Orders, Chats, Profile) — все 5 вернулись с deep-dive отчётами + executive summary. Каждый сделал 6-8 Lazyweb-поисков.
- 6-й cross-cutting агент упал с `out of extra usage` (resets 18:30 МСК) — выполнен в main session: read 5 отчётов + DESIGN.md + colors.ts + grep по 26 файлам с хардкод-цветами + 3 Lazyweb-запроса. Это зафиксировано как дисклеймер в `AUDIT_2026-05-12.md`.
- Итог сведён в `AUDIT_2026-05-12.md` (master-документ) и `ROADMAP_2026-05-12.md` (план внедрения).

### 📋 План внедрения

Полный план в [`ROADMAP_2026-05-12.md`](ROADMAP_2026-05-12.md) — 13 спринтов (22-34+) упорядочены **по импакту, не по сложности**. 5 фаз: P0 (доверие+фундамент) → P1 (conversion-воронка) → P2 (core-loop) → P3 (мастер UX) → P4 (image+web) → P5 (polish).

Контрольные точки:
- **После Sprint 26** (~3 недели) — продукт пригоден к публичному запуску без визуального стыда.
- **После Sprint 31** (~6 недель) — конкурент Profi.ru/TaskRabbit по UX.
- **После Sprint 33** (~8 недель) — полноценное web-приложение, не растянутое mobile.

### 🚀 Следующий шаг — Sprint 31.5 или 33.5 (на выбор)

Sprint 31.5 — **`master_services` + radius**:
1. Миграция `0024_master_services.sql` — таблица `master_services (id, master_id FK, title, price_min, price_max, unit enum, created_at, updated_at)` + RLS (own CRUD).
2. CRUD-блок в `edit-master.tsx` (список + add-bottom-sheet + delete swipe).
3. `react-native-maps` подключение либо OSM/Yandex tile-картинка для radius preview.

Sprint 33.5 — **полный Web Shell**:
1. `<WebShell>` компонент с top-nav (logo + ссылки + theme-toggle + avatar) на `Platform.OS === "web" && width >= 768`.
2. Chats split-layout на desktop (sidebar+main).
3. Max-width контейнер 1120px.
4. Hover/focus-ring через NativeWind `web:` префикс.

### Решённые открытые вопросы

- ✅ **Услуги мастера = отдельная таблица `master_services`** (Sprint 31).
- ✅ **Cal Sans = npm-пакет `cal-sans`** — установлен в Sprint 23.

### Открытые вопросы (ждут ответа)

- `react-native-maps` подключен? (нужно для Sprint 31, радиус выезда мастера)

**Sprint 20 закрыт — Order state-machine design-doc.**

**Sprint I (I.1–I.9) закрыт — 9 продуктовых фич за один прогон.** Notification Center (in-app inbox + bell в шапке), phone masking в чате (маска через regex + 19 тестов), антифрод + жалобы (reports + ReportModal в карточке мастера/заказа/long-press на сообщении), модерация-админка (is_admin flag + reports queue), бригады/компании (account_type + teams + team_members), социальный граф (user_contacts + vouches + RPC «общие знакомые»), раздел Полезное (articles + 3 seed-статьи + MVP markdown). **6 новых миграций (0028–0033), 33 миграции всего.** Маскированные звонки (I.10) отложены — нужен платный телефон-провайдер.

**Sprint H закрыт — Demo dataset на проде.** 30 фейковых пользователей (10 клиентов + 20 мастеров) + 96 фото портфолио + 25 заказов в 5 статусах + 39 откликов + 12 чатов с 55 сообщениями + 11 отзывов (триггер `recalc_master_rating` пересчитал 6 мастеров). Главные тест-аккаунты: client `+7 900 000-00-01` (Алина Тестова) и master `+7 900 000-00-02` (Магомед Тестов) — c наполненной историей: оба связаны через chat и completed-заказ ожидающий отзыва. См. `DEMO_ACCOUNTS.md` в корне для UI-обхода. Аватары через DiceBear, портфолио через Lorem Picsum (внешние URL, без Storage). Source: `supabase/seed-test/demo-fixture.sql`.

**Sprint G закрыт — DRY OrderRow → pluralize lib.** В `OrderRow.tsx` была локальная `responsesLabel` (12 строк русского pluralize). Перенесена в `src/lib/pluralize.ts` как `pluralizeResponses(count)` рядом с `pluralizeReviews/Years/Services/...`. UX-нюанс «0 → 'Нет откликов'» сохранён. Добавлен 1 unit-кейс. **Vitest 63/63 зелёные**, typecheck + lint чистые. **Очередь A-G очищена.**

**Sprint F закрыт — useUnreadResponses/Feed unit-тесты.** Pure-логика вынесена в `src/features/orders/unread-feed-helpers.ts`: `unreadFeedKey` + `unreadResponsesKey` (стабильные TanStack queryKey, сортировка l2Ids) + `shouldInvalidateFeedOnInsert(row, userId, l2Ids)` (фильтр для Realtime payload). `use-unread-feed.ts` и `use-unread-responses.ts` отрефакторены на использование helpers — публичный API не сломан. **Vitest 62/62 зелёные** (+15 новых: 5 для `unreadFeedKey`, 3 для `unreadResponsesKey`, 7 для `shouldInvalidateFeedOnInsert`). Typecheck + biome lint чистые.

**Sprint E закрыт — Order edit Maestro smoke.** Fixture расширен open-заказом id=8888… с title «Edit smoke: проверить трубу». `flows/08-order-edit.yaml` + `order-edit-smoke.yaml`: tap по карточке → tap accessibilityLabel="Редактировать заказ" → eraseText + inputText в title TextInput → tap «Сохранить» → assert новый title на order detail. README обновлён.

**Sprint C закрыт — full-cycle Maestro smoke.** Новый runner `.maestro/full-cycle-smoke.yaml` запускает 01-auth → 06-chat → 07-review одной командой. Ловит навигационные регрессии между табами/экранами, которые отдельные smoke (client / master / chat / review) пропускают. README обновлён.

**Sprint D закрыт — chat-states design-doc.** Новый файл `docs/chat-states.md`: модель таблиц `chats`/`messages`, **5 производных состояний** (unread/read active, completed history, cancelled history, empty), полное отсутствие user-инициируемых state changes (всё деривативно), 6 триггеров изменения (INSERT message, mark_chat_read, accept_response создаёт, FK cascade'ы), матрица «что происходит с чатом при transition order», 6 известных пробелов с планами (write в cancelled чат, archive, per-message read, typing, realtime на chats list, rate-limit). Парный документ к `order-states.md`, ссылается на него.

**Sprint B закрыт — push при cancel/expire + bugfix notify_user.** Миграция 0026: trigger `trg_notify_order_cancelled_or_expired` (AFTER UPDATE OF status) — при transition в `cancelled`/`expired` push'ит picked_master + всех мастеров с `sent`/`viewed` откликами + переводит их в `withdrawn`. При smoke выявлен **серьёзный prod-bug**: `notify_user` использовал `extensions.http_post(...)`, а pg_net 0.20 требует `net.http_post(url, body, params, headers, timeout)`. Это значит **все push не работали с момента Sprint 8.6** (новый отклик, accept, message). Миграция 0027 чинит сигнатуру + добавляет `EXCEPTION WHEN OTHERS` чтобы любая push-инфра-проблема не валила бизнес-транзакцию. Smoke триггера 0026 в ROLLBACK-транзакции подтвердил withdraw-логику. Закрыты gaps T2/T6/T7 в state-machine doc. **База:** 27 миграций.

**Sprint A закрыт — Supabase advisors audit.** Прогнаны security + performance advisors на проде. Найдено: 22× `auth_allow_anonymous_sign_ins` (false positive — Anonymous Sign-ins выключены, auth.uid()=NULL блокирует анонима), 1× `auth_leaked_password_protection` (N/A для phone-OTP), 2× `unindexed_foreign_keys` (**реальная проблема**), 25× `unused_index` (premature, скип), 4× `multiple_permissive_policies` на orders UPDATE (trade-off, документировано). Миграция 0025 добавила 2 индекса (`messages.sender_id`, `order_responses.l2_id`). Re-run подтвердил: `unindexed_foreign_keys` теперь 0. Создан `docs/audit-2026-05-12-advisors.md` с контрактом для следующих прогонов. **База:** 25 миграций. **Sprint 23 (pg_cron expire)** ранее закрыт.

**База:** 23 миграции, 15 таблиц с RLS + 3 Storage bucket, 8 RPC, 12 trigger functions, 17 enums, 1 edge function.

**Backlog Sprint 14+:** Maestro E2E smoke; live-тест dev-build; admin-tool для category-covers; real OTP / Telegram Login.

**База:** 19 миграций, 15 таблиц с RLS + 3 Storage bucket, 5 RPC, 11 trigger functions, 17 enums, 1 edge function. Приоритетные кандидаты: live-тест на dev-build (push, image-picker, category covers); admin-tool для загрузки category-covers и portfolio-привязки; full master profile edit (bio/опыт/радиус/город после онбординга); real OTP / Telegram Login (snimaeт advisor anonymous warnings); outcome tracking modal; test runner (Vitest + Maestro).

---

## Инфра

| Ресурс | Значение |
|---|---|
| GitHub | https://github.com/killianche/xtrud (private, ssh, branch `main`) |
| CI | https://github.com/killianche/xtrud/actions — ✅ зелёный |
| Supabase project ref | `wgeimsajvjkzrrnfrnkb` |
| Supabase URL | https://wgeimsajvjkzrrnfrnkb.supabase.co |
| Supabase region | eu-central-1 (Frankfurt) |
| Supabase organization | Madinah_magazaurov |
| Supabase plan | Free (0 ₽/мес) |
| Bundle ID | `com.xtrud.app` (iOS + Android) |
| Env-ключи | `.env.local` (gitignored), шаблон `.env.example` |

---

## Стек (зафиксирован)

**Frontend:** Expo SDK 54 (universal) + Expo Router v6 + React 19 + RN 0.81 + new architecture.
**Стили:** NativeWind 4 + Tailwind 3.4 + CSS-vars для тем (light/dark).
**State:** Zustand (theme) + TanStack Query 5 (server).
**Формы:** React Hook Form 7 + Zod 3 + @hookform/resolvers.
**Backend:** Supabase Postgres + Auth + Storage. Клиент: @supabase/supabase-js 2.105.
**Шрифт:** Inter 400/500/600/700 через @expo-google-fonts/inter (load в _layout).
**Иконки:** lucide-react-native v1.14.
**Lint/format:** Biome 2.4.
**Деплой (план):** EAS Build/Submit (mobile) + Vercel/Cloudflare Pages (web).
**CI:** GitHub Actions (typecheck + biome ci на каждый PR и main).

---

## Структура проекта

```
xtrud/
├── app/                         # Expo Router
│   ├── (auth)/                  # auth-flow group
│   │   ├── _layout.tsx
│   │   ├── phone.tsx            # ввод телефона с маской
│   │   └── verify.tsx           # OTP (sprint 1 — любой код)
│   ├── (tabs)/                  # после-логина group
│   │   ├── _layout.tsx
│   │   └── index.tsx            # заглушка "Главная"
│   ├── _layout.tsx              # root: SplashScreen, fonts, AuthGate
│   └── +html.tsx                # web shell с viewport + theme guard
├── src/
│   ├── components/
│   │   └── AppText.tsx          # обёртка над Text с weight + maxFontSizeMultiplier
│   ├── features/auth/
│   │   ├── validation.ts        # Zod-схемы + phone маска/normalize
│   │   ├── use-auth-session.ts  # подписка на supabase.auth.onAuthStateChange
│   │   └── use-auth-mutations.ts # useSendOtp, useVerifyOtp
│   ├── hooks/
│   │   └── use-color-scheme.ts
│   ├── lib/
│   │   ├── auth.ts              # signInAnonymouslyWithPhone, signOut
│   │   ├── colors.ts            # палитра (WCAG-fixed)
│   │   ├── env.ts               # Zod-валидация EXPO_PUBLIC_*
│   │   ├── storage.ts           # SecureStore + localStorage адаптеры
│   │   ├── supabase.ts          # singleton client с pkce, autoRefresh
│   │   ├── theme.ts             # Zustand store
│   │   └── tokens.ts            # spacing, fontSize, radius, etc.
│   └── types/
│       └── database.ts          # auto-generated из Supabase
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql        # cities, users, master_profiles, categories
│   │   └── 0002_split_private_fields.sql # users_private + advisor fixes
│   └── seed/
│       └── categories.sql       # 10 L1 + 66 L2 + 262 L3
├── .github/workflows/ci.yml     # typecheck + biome
├── .claude/
│   ├── rules/working-rules.md
│   └── settings.json            # permissions allowlist
├── assets/images/               # icons, splash
└── [configs: app.json, tsconfig, babel, metro, tailwind, biome, etc.]
```

---

## Что готово (Sprint 1 — фундамент + auth)

### Подготовка (до sprint 1)
- [x] **2026-05-11** — CLAUDE.md (120 строк) + `.claude/rules/working-rules.md` (autoload)
- [x] **2026-05-11** — выбран стек Expo universal + Supabase
- [x] **2026-05-11** — Supabase-проект создан, env-keys получены
- [x] **2026-05-11** — git + GitHub repo + начальный коммит
- [x] **2026-05-11** — закоммичены документы параллельного агента (PROJECT_MAP, DESIGN_SYSTEM, CROSS_PLATFORM_RULES, CATEGORIES_AND_PROFILES, AUDIT, COMPETITOR_INSIGHTS, PRODUCT_BLINDSPOTS)

### Sprint 1
- [x] **2026-05-11** — **1.1** Expo scaffold (commit `538195f`): package.json под SDK 54, NativeWind v4, Biome 2.4, TS strict + noUncheckedIndexedAccess. 789 пакетов, expo install --check ok.
- [x] **2026-05-11** — **1.2** Design tokens (commit `5cddc26`): `src/lib/{tokens,colors,theme}.ts`, `src/hooks/use-color-scheme.ts`, `src/components/AppText.tsx`. CSS-vars в `global.css`. **WCAG-fix**: `muted-soft` `#9ca3af→#71717a` (4.61:1), `accent` light `#3b82f6→#2563eb` (5.6:1).
- [x] **2026-05-11** — **1.3** Supabase client (commit `5ade197`): `src/lib/{env,storage,supabase}.ts`. KV-адаптер с чанкингом ≤1800 байт для iOS Keychain. AppState listener для autoRefresh. QueryClientProvider с дефолтами под mobile-сети.
- [x] **2026-05-11** — **1.4** DB schema (commit `ac518f0`): миграции `0001_init.sql` + `0002_split_private_fields.sql`. 7 таблиц с RLS: cities, users, users_private, master_profiles, categories_l1/l2/l3. Триггер `handle_new_auth_user`. Advisor security = **0 lints** после split-table.
- [x] **2026-05-11** — **1.5** Categories seed (commit `9475661`): 49 KB SQL с **10 L1 + 66 L2 + 262 L3**. 26 L2 visible (по решению пользователя). 4 L3 с requires_license. 23 L3 с seasonality=wedding_season.
- [x] **2026-05-11** — **1.6** Auth flow (commit `642e72b`): phone+verify экраны с RHF+Zod, маска `+7 XXX XXX-XX-XX`, cooldown 60с, autofocus, AuthGate с redirect. Inter font (4 веса), SafeAreaProvider, SplashScreen guard. anon-sign-in за кулисами, phone сохраняется в users_private.
- [x] **2026-05-11** — **1.7** CI (commit `619083c`): GitHub Actions с typecheck + biome ci. Первый прогон ✅ 31 секунда. concurrency cancel-in-progress.
- [x] **2026-05-11** — `.claude/settings.json` с permissions allowlist для смягчения подтверждений.

### Sprint 2 (онбординг + каталог клиента)
- [x] **2026-05-11** — **2.1** Migration 0003 + AuthGate routing (commit `2c2f25f`): `users.onboarding_completed_at` + `users.active_role` enum + CHECK constraint (active_role='master' ⇒ is_master=true) + partial index. `useUserRecord` hook (TanStack Query, staleTime 5 мин). AuthGate переписан под 3 группы — `(auth)` / `(onboarding)` / `(tabs)`. Advisor security = 0 lints.
- [x] **2026-05-11** — **2.2** Role selection screen (commit `eb42338`): полноценный UI с 2 карточками (lucide Search/Briefcase), accessibilityState selected, accent-soft фон выбранной, CTA "Продолжить", error display. `useCompleteOnboarding` mutation обновляет `users.{is_master, active_role, onboarding_completed_at}` + invalidates query.
- [x] **2026-05-11** — **2.3** Main client screen (commit `5d394c8`): `useVisibleCategories` для 26 L2, `CategoryTile` компонент с iconMap (~50 lucide icons), grid 2/3/4-кол. адаптивный, ScrollView без виртуализации, loading/error/empty states, header с приветствием по first_name + role badge + signOut. **Без атмосферных фото — sprint 4+.**

### Sprint I — 9 продуктовых фич
- [x] **I.1+I.2** Notification Center: миграция 0028 (notifications table + RLS + расширенный `notify_user` пишет в inbox + push) + `mark_notifications_read` RPC. Hooks (useNotifications, useUnreadNotificationsCount, useRealtimeNotifications). Экран `app/(tabs)/notifications/index.tsx` с auto-mark-as-read + deep-link по data. Bell-иконка в шапке главной с badge.
- [x] **I.3** Phone masking: `src/features/chat/mask-contacts.ts` — pure `maskContactsInText` (phone regex + messenger links + Telegram @handles + email). 19 unit-тестов. Подключено в ChatMessageBubble — оригинал в БД, отображается маскированный.
- [x] **I.4** Антифрод/жалобы: миграция 0029 (reports table + 3 enums + RLS owner-only). ReportModal с радиокнопками причин (per target_type). Точки входа: Flag-кнопка на странице мастера (target=user), на странице заказа (target=order, не-владельцу), long-press на чужом сообщении (target=message).
- [x] **I.5** Админка: миграция 0030 (`users.is_admin` + `is_current_user_admin()` helper + admin RLS на reports/users/reviews). Главный test-master назначен админом. `app/(tabs)/admin/index.tsx` с фильтрами по статусу и Alert-меню действий (dismiss / suspend user / hide review). Точка входа «Модерация» в профиле (только для is_admin).
- [x] **I.6 + I.7** Бригады + компании: миграция 0031 (`master_account_type` enum + `legal_name` + `ogrn` + `teams` + `team_members` + trigger auto-add owner). Главный test-master теперь `account_type='company'`. Hooks `useTeamByOwner` / `useTeamMembers` / CRUD. UI отображения / редактирования команды отложено в backlog.
- [x] **I.8** Социальный граф: миграция 0032 (`user_contacts` + `vouches` + RPC `count_common_contacts_with` + `count_vouches_for`). Hooks `useCommonContactsCount` / `useVouchesCount` / `useToggleVouch` / `useImportContacts`. UI отображения отложен в backlog.
- [x] **I.9** Раздел «Полезное»: миграция 0033 (`articles` + `article_status` enum + seed 3 статьи). RLS: published — все, draft/archived/CRUD — только админ. `app/(tabs)/useful/index.tsx` (список) + `[slug].tsx` (читалка с MVP-markdown без external libs).
- **I.10 отложен** — маскированные звонки требуют платного телефон-провайдера (Twilio + покупка номеров, в РФ сложно из-за санкций). Ждём решения по провайдеру.
- Fix: TabBar.tsx + Skeleton.tsx — точечные правки регрессий типов от дизайн-агента. Typecheck чистый. Vitest 82/82.

### Sprint H — Demo dataset (prod-preview)
- [x] Главные тест-аккаунты (`+79000000001` Алина, `+79000000002` Магомед) с историей: master_profile + portfolio + связаны через 1 in_progress chat + 1 completed (без отзыва, чтобы юзер мог сам).
- [x] 19 мастеров через jsonb DO-loop: имена/города/категории распределены по 19 разным L2; bio + опыт + has_tools + has_transport + 3-5 фото каждому.
- [x] 9 клиентов через jsonb DO-loop, разные города.
- [x] 25 заказов в 5 статусах (10 open + 5 in_progress + 7 completed + 2 cancelled + 1 expired). Test-client имеет «свою» 7-ку всех статусов.
- [x] 39 откликов: цены случайные но `price_min <= price_max`, статусы соответствуют статусу заказа (open→sent/viewed, in_progress→accepted+rejected, cancelled→withdrawn).
- [x] 12 чатов с 55 сообщениями (3-7 на чат, чередуются client/master).
- [x] 11 отзывов (6 client→master + 5 master→client), trigger `recalc_master_rating` обновил 6 master_profiles.
- [x] `DEMO_ACCOUNTS.md` в корне — инструкция для UI-обхода.
- [x] `supabase/seed-test/demo-fixture.sql` — единый source-of-truth для перезалива.

### Sprint G — DRY OrderRow pluralize
- [x] `pluralizeResponses(count)` добавлена в `src/lib/pluralize.ts` (с UX-edge: 0 → «Нет откликов»).
- [x] Локальная `responsesLabel` в `OrderRow.tsx` удалена; компонент импортирует общий helper.
- [x] Unit-кейс на `pluralizeResponses` (0/1/3/5/11/22) добавлен в `pluralize.test.ts`.
- [x] Vitest 63/63, typecheck + lint чистые.

### Sprint F — unread-feed-helpers unit-тесты
- [x] `src/features/orders/unread-feed-helpers.ts` создан: `unreadFeedKey`, `unreadResponsesKey`, `shouldInvalidateFeedOnInsert`.
- [x] `use-unread-feed.ts` + `use-unread-responses.ts` импортируют helpers (re-export старых имён для backward compat).
- [x] 15 unit-тестов: queryKey стабильность + order-independence + immutability + realtime payload фильтр (open/owner/category/missing fields/empty l2Ids).
- [x] Vitest 62/62, typecheck + lint чистые.

### Sprint E — Order edit Maestro smoke
- [x] `supabase/seed-test/chat-fixture.sql`: + open order `8888…` для edit smoke.
- [x] `.maestro/flows/08-order-edit.yaml`: tap карточки → «Редактировать заказ» → eraseText + inputText → «Сохранить» → assert новый title.
- [x] `.maestro/order-edit-smoke.yaml` runner.
- [x] README + STATUS обновлены.

### Sprint C — full-cycle Maestro smoke
- [x] `.maestro/full-cycle-smoke.yaml` — runner 01-auth → 06-chat → 07-review.
- [x] README обновлён: секция Full-cycle + расширенный «Покрыто».

### Sprint D — chat-states design-doc
- [x] `docs/chat-states.md` создан: TL;DR + базовая модель таблиц + 5 производных состояний + матрица 6 триггеров изменения + 6 transitions order'а с поведением чата + 6 известных пробелов с планами + ссылки в коде + контракт для будущих изменений.

### Sprint B — push при cancel/expire + notify_user fix
- [x] Миграция `0026_notify_order_cancelled_expired.sql` применена на prod: trigger `trg_notify_order_cancelled_or_expired` AFTER UPDATE OF status → push picked_master + всех `sent`/`viewed` responders + withdraw их responses.
- [x] **Critical prod-bug найден**: `notify_user` использовал `extensions.http_post(url, body, headers)`, в pg_net 0.20 функция в схеме `net` с сигнатурой `(url, body, params, headers, timeout_milliseconds)`. Все push на проде с Sprint 8.6 падали.
- [x] Миграция `0027_fix_notify_user_pgnet_api.sql` применена: правильная схема + параметры, EXCEPTION WHEN OTHERS чтобы push-инфра-проблема не валила бизнес-транзакции.
- [x] Smoke триггера 0026 в ROLLBACK-транзакции: response → `withdrawn` после cancel ✓.
- [x] `docs/order-states.md`: gap T2/T6/T7 закрыт, side effects секция дополнена, ссылки на новые миграции.

### Sprint A — advisors audit (2026-05-12)
- [x] `mcp get_advisors security` → 23 предупреждения, 2 ложных (anonymous_sign_ins x22, leaked_password x1) → задокументированы.
- [x] `mcp get_advisors performance` → 32 находки, 2 реально критичных FK без индекса.
- [x] Миграция `0025_advisor_fk_indexes.sql` применена на prod: `messages.sender_id`, `order_responses.l2_id`. Re-run advisor подтвердил: `unindexed_foreign_keys` = 0.
- [x] `docs/audit-2026-05-12-advisors.md` — таблица решений + контракт для следующего прогона.

### Sprint 23 (pg_cron expire job)
- [x] **2026-05-12** — **23.1–23.5** Closure of T7 `open → expired` (commit pending):
  - Проверка через `list_extensions`: pg_cron 1.6.4 доступен, не установлен. Ни одного active cron job в проекте до этой миграции.
  - `supabase/migrations/0024_expire_orders_cron.sql` — `CREATE EXTENSION IF NOT EXISTS pg_cron`, функция `public.expire_old_orders()` (SECURITY DEFINER, REVOKE от anon/authenticated, возвращает число затронутых строк через `GET DIAGNOSTICS ROW_COUNT`), идемпотентный UNSCHEDULE прошлого job по имени + `cron.schedule('nightly_expire_orders', '0 3 * * *', ...)`.
  - **Применено на prod** через MCP `apply_migration`. Подтверждено: `cron.job` содержит запись `jobid=1, jobname=nightly_expire_orders, schedule=0 3 * * *, active=true`. Smoke-вызов `SELECT public.expire_old_orders()` вернул `affected=0` — на проде нет старых open-заказов, поведение корректное.
  - `docs/order-states.md` обновлён: статус «expired» из TBD → реализован, T7-строка обогащена RPC + side effects, известный пробел зачёркнут, ссылки в коде дополнены.

### Sprint 22 (Review E2E)
- [x] **2026-05-12** — **22.1–22.4** Review smoke (commit pending):
  - `supabase/seed-test/chat-fixture.sql` — добавлен блок 10: completed order `66666666-…` + accepted response `77777777-…` от того же client+master. Намеренно без `reviews` записи — клиент должен заполнить через UI.
  - `.maestro/flows/07-review.yaml` — таб «Заказы» → assert «Мои заказы» → tap по карточке «Установка ванны (smoke review)» → assert «Оцените мастера» → tap `"5 звёзд"` (accessibilityLabel) → ввод текста в TextInput «Расскажите о работе…» → tap «Оставить отзыв» → assert «Ваш отзыв» + текст.
  - `.maestro/review-smoke.yaml` runner с TEST_PHONE=+79991110001.
  - README обновлён: Review секция + расширенный backlog (полный E2E lifecycle в одном flow, master review клиента, realtime получение).

### Sprint 21 (Chat E2E + dev-fixture)
- [x] **2026-05-12** — **21.1–21.4** Chat smoke (commit pending):
  - `supabase/seed-test/chat-fixture.sql` — идемпотентный SQL: 2 auth.users (fixed UUIDs 1111/2222) + UPDATE public.users (онбординг) + master_profiles + master_categories + order in_progress + accepted response + chat + 1 message от мастера. CASCADE-cleanup при повторном запуске.
  - `supabase/seed-test/README.md` — таблица сущностей, запуск через psql, очистка, зависимости от `cities/categories_l2` seed'ов.
  - `.maestro/flows/06-chat.yaml` — открыть чат «Магомед Мастеров» → ассерт incoming сообщения → ввод текста в TextInput «Сообщение» → tap по `accessibilityLabel="Отправить"` → ассерт отправленного сообщения в ленте.
  - `.maestro/chat-smoke.yaml` runner с TEST_PHONE=+79991110001 (совпадает с fixture client).
  - `.maestro/README.md` — секция Chat happy-path с pre-condition, прод-warning, обновлённый backlog (отправка отклика мастером + realtime — следующие задачи).

### Sprint 20 (архитектурный design-doc)
- [x] **2026-05-12** — **20.1–20.3** Order state-machine design-doc (commit pending):
  - `docs/order-states.md` — TL;DR + таблица 6 статусов с владельцем перехода и видимостью + ASCII-диаграмма переходов + матрица 7 переходов (триггер / RLS / side effects) + матрица 6 RLS policy на orders + 5 известных пробелов с планами (expired cron / draft UI / re-open / отказ от мастера / push на cancel) + ссылки в коде на каждую часть + контракт для будущих изменений (сначала обновить doc, потом enum/RLS/RPC).
  - Это первый design-doc в `docs/` каталоге. Будет точкой опоры при работе над завершением заказа / отзывами / отменой / админ-инструментами.

### Sprint 19 (доп. unit-тесты)
- [x] **2026-05-12** — **19.1–19.4** image-resize + master-feed cursor тесты (commit pending):
  - `src/lib/image-resize.ts` — pure `calcResizedDimensions(source, bounds)`, выделен из `image-upload.ts`. Возвращает `{width, height}` либо null если largest ≤ maxDimension. `image-upload.ts` теперь импортирует и использует helper — без изменения публичного API.
  - `image-resize.test.ts` — 8 кейсов: null при small/exactly-max, portrait/landscape/square scale, 1px-over-max граница, AVATAR_PRESET vs PORTFOLIO_PRESET сценарии.
  - `src/features/orders/feed-page.ts` — pure `masterFeedKey` + `buildFeedPage(rows, pageSize)`. `use-master-feed.ts` рефакторен на использование helpers.
  - `feed-page.test.ts` — 11 кейсов: masterFeedKey стабильность (6) + buildFeedPage edge cases (5: empty/partial/full/overfilled/default-pageSize).
  - Vitest 47/47 зелёные. Typecheck + biome lint чистые.

### Sprint 18 (E2E страховка — master ветка)
- [x] **2026-05-12** — **18.1–18.5** Maestro master happy-path (commit pending):
  - `flows/04-onboarding-master.yaml` — role «Я мастер» → master-profile форма (имя/фамилия/город/о себе/опыт лет) → «Завершить» → попадание в (tabs). Раскопал, что master-categories — отдельный экран из профиля, НЕ часть онбординг-визарда (router.back() после save вместо router.push в следующий шаг).
  - `flows/05-master-feed.yaml` — таб «Заказы» → проверка заголовка «Заявки» + 3 таб-пилла (Новые / Я откликнулся / Меня выбрали) + переключение между ними.
  - `master-smoke.yaml` — runner для master-side: 01-auth → 04 → 05, с другим тестовым телефоном `+7 999 222-33-44` (чтобы не конфликтовать с client-smoke который использует `+7 999 111-22-33`).
  - README дополнен секцией о master smoke + список покрытого/непокрытого.

### Sprint 17 (production deploy — web)
- [x] **2026-05-12** — **17.1–17.6** Web prod deploy на VPS (commit pending): `app.json` получил `experiments.baseUrl: "/xtrud"` (нужно, чтобы `<script src=...>` ссылались на `/xtrud/_expo/...` вместо корня). `expo export --platform web` собирает 12 MB статики в `dist/`. На сервере 62.113.106.30 создан `/var/www/xtrud` (owner www-data), бандл распакован. `/etc/caddy/Caddyfile` отрефакторен: основной reverse_proxy на :3000 теперь в `handle { }`-блоке, а `handle_path /xtrud/*` отдаёт статику с `try_files {path} {path}.html {path}/index.html /index.html` (SPA-fallback для `[id]`-маршрутов). Бэкап старого конфига в `/etc/caddy/Caddyfile.bak.before-xtrud`. `caddy validate` + `systemctl reload caddy` без ошибок. Smoke-проверка: `/xtrud/` → 200 HTML, `/xtrud/_expo/...css` → 200 css, `/xtrud/phone` → 200 (SPA route), `alanbani.ru/` → 307 (без регрессии). Скрипт `./deploy/web.sh` автоматизирует build + scp + extract для повторных деплоев. Когда мигрируем на Vercel/CF Pages (план из CLAUDE.md) — этот скрипт удалить + handle_path из Caddyfile убрать.

### Sprint 16 (E2E страховка)
- [x] **2026-05-12** — **16.1–16.5** Maestro E2E smoke-test (commit pending): `.maestro/` каталог с тремя YAML-flow:
  - `flows/01-auth.yaml` — phone input → OTP (Sprint-1 simulation, любой 6-знач код) → попадание в (onboarding)/role
  - `flows/02-onboarding-client.yaml` — выбор «Я ищу мастера» → выход на (tabs) с каталогом категорий
  - `flows/03-create-order.yaml` — таб «Заказы» → FAB «Создать заказ» → заполнение формы (категория/название/описание/город, urgency+budget по дефолту) → проверка карточки в списке
  
  `smoke.yaml` объединяет всё в один прогон. `config.yaml` хранит env-defaults (TEST_PHONE, TEST_OTP, TEST_CATEGORY="Сантехника", TEST_CITY="Назрань"), переопределяемые через `maestro test --env`. README.md описывает install CLI, подготовку iOS/Android билдов, зависимости от заглушки OTP, нюанс с накапливанием тестовых users в БД, бэклог покрытия (master flow / chat / reviews / push). CI намеренно не подключён (нужен macOS runner ≈8× дороже linux) — гоняем локально перед релизами.

### Sprint 15 (quality + UX)
- [x] **2026-05-12** — **15.2** Sort откликов: picked → newest active → rejected (commit pending): новый `src/features/orders/sort-responses.ts` — pure generic `sortResponses<T extends {status; created_at}>(rows)`, STATUS_RANK таблица (accepted=0, sent/viewed=1, withdrawn/rejected=2), внутри одного ранга created_at DESC. Подключён в `useOrderResponses`. 5 unit-тестов покрывают edge cases + immutability контракт.
- [x] **2026-05-12** — **15.1** Outcome prompt unit-тесты (commit `8bcbcf2`): `shouldShowOutcomePrompt` + `useOutcomeStore` вынесены в `outcome-store.ts` (zero RN imports), `OutcomeTrackingModal.tsx` теперь только UI + re-export. Inject-points `now` и `isDismissed` для детерминированных тестов с frozen-clock. 9 тестов покрывают все 7 guards + store dismissFor/isDismissed.

### Sprint 14 (quality)
- [x] **2026-05-12** — **14.2** CI test integration + shared pluralize lib (commit `3447afb`): GitHub Actions workflow получил `npm test` шаг (Vitest). DRY-refactor: создан `src/lib/pluralize.ts` с базовой `pluralizeRu(count, forms)` + 5 готовых helpers (Reviews/Years/ClosedDeals/ClosedOrders/Services). Дублированные локальные функции удалены из master/[id], client/[id], category/[id]. `pluralize.test.ts` — 7 кейсов: edge cases с 11-14, 21, 101, exception periods. Total tests 14/14 зелёные.
- [x] **2026-05-12** — **14.1** Vitest setup + первые unit-тесты (commit `7f98d58`): `vitest 4.1.6` поставлен как devDependency. `vitest.config.ts` с `environment: "node"`, `@`-alias, include `src/**/*.test.ts*`. npm scripts `test` и `test:watch`. Архитектурная правка: pure functions `isChatUnread` + `unreadChatsCount` вынесены в `src/features/chat/unread-helpers.ts` (zero RN imports), `use-my-chats.ts` re-export'ит для backward compatibility. Первый тестовый файл `unread-helpers.test.ts` — 7 кейсов: null last_message, NULL last_read для каждой роли, корректная роль-маркер выбора, edge case 0 chats. CI потребует `npm test` шаг — следующий шаг.

### Sprint 13 (badges parity)
- [x] **2026-05-12** — **13.2** Swipe-between-photos в lightbox (commit `fea4189`): расширил Pan-жест в `PortfolioLightbox`. При scale=1× pan = horizontal swipe для переключения фото — `swipeX` shared value двигает картинку за пальцем (visual feedback). При `|translationX| > width × 0.18` и onEnd — completion-animation (`withTiming(±width, 180ms)` → callback меняет index через `runOnJS(onChangeIndex)` → swipeX сбрасывается в 0). Иначе spring-back в 0. При scale > 1× swipeX игнорируется, pan работает как раньше для рассматривания фото внутри. `animatedStyle` суммирует `translateX + (scale<=1 ? swipeX : 0)`. UseEffect на index сбрасывает все shared values для надёжности.
- [x] **2026-05-12** — **13.1** Master-side badge на Заказы (commit `4c88f1f`): migration 0023 — `users.last_seen_feed_at timestamptz` + RPC `mark_feed_seen()` (SECURITY INVOKER, UPDATE users SET last_seen_feed_at=now() WHERE id=auth.uid()). Hook `useUnreadFeedCount({userId, l2Ids, lastSeenAt})` — head:exact COUNT orders WHERE status='open' AND l2_id IN l2Ids AND client_id != me AND created_at > lastSeenAt. `useMarkFeedSeen` mutation вызывается в `MasterOrdersView` при mount. `useRealtimeFeed` подписывается на INSERT orders с фильтрацией по l2Ids — live-обновление badge. `(tabs)/_layout` рендерит ordersBadge с учётом active_role: для client = unreadResponses, для master = unreadFeed. Без вычитания уже-откликнутых orders — minor over-count приемлем, избегает сложного NOT IN запроса.

### Sprint 12 (UX polish продолжение)
- [x] **2026-05-12** — **12.5** Pinch + double-tap в lightbox (commit `c036df6`): добавлен `GestureHandlerRootView` в `app/_layout` для всего приложения. `PortfolioLightbox` оборачивает Image в `GestureDetector` с `Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap))`. Pinch 1×–4×, pan активен только при scale > 1×, double-tap toggle 1× ↔ 2.5×, single-tap закрывает только при scale=1× (чтобы не закрывать zoom-юзеру). При смене index zoom + pan плавно сбрасываются через `withTiming(200ms)`. Использованы Reanimated 4 `useSharedValue` + `useAnimatedStyle`.
- [x] **2026-05-12** — **12.4** Infinite scroll master feed (commit `b68e2cf`): `useMasterFeed` мигрирован на `useInfiniteQuery`, keyset pagination created_at DESC по 20 строк. NewOrdersTab получает hasNextPage / fetchNextPage и рендерит «Показать ещё» кнопку с spinner.
- [x] **2026-05-12** — **12.3** Unread badge на табе Заказы (commit `84f0923`): migration 0022 — SECURITY INVOKER RPC `mark_order_responses_viewed` (owner-check внутри + UPDATE 'sent'→'viewed'). Client hook `useUnreadResponsesCount` (head:exact COUNT 'sent' на моих open/in_progress orders), `useMarkResponsesViewed` mutation вызывается в order detail при isOwner mount, `useRealtimeMyResponses` подписан на INSERT/UPDATE order_responses. Badge только для `active_role='client'`. Общий `badgeLabel` helper (cap "99+").
- [x] **2026-05-12** — **12.2** Unread badges на табе Чаты (commit `6307f91`): migration 0021 — поля `chats.last_read_client_at` / `last_read_master_at` (timestamptz NULL), RLS UPDATE policy `chats_participant_update` (оба участника могут писать), RPC `mark_chat_read(p_chat_id)` SECURITY INVOKER, trigger `messages_mark_sender_read` (свой sender автоматически помечен прочитанным — свои сообщения не считаются unread). Client: `isChatUnread(chat, userId)` + `unreadChatsCount` хелперы; `useMarkChatRead` mutation вызывается в `(tabs)/chats/[id]` при mount и при каждом изменении `messages.length`; `useRealtimeMyChats(userId)` подписывается на UPDATE/INSERT `public.chats` и инвалидирует cache → tab badge обновляется live. `(tabs)/_layout` динамически отдаёт `tabBarBadge` (red bg) и stable cap «99+». `(tabs)/chats/index.tsx` подсвечивает unread row accent-soft фоном + жирным шрифтом + accent-dot после имени.

### Sprint 12 (UX polish продолжение)
- [x] **2026-05-12** — **12.1** Portfolio lightbox (commit `21db7b3`): новый `src/features/profile/PortfolioLightbox.tsx` — Modal `transparent + statusBarTranslucent`, чёрный фон, expo-image `contentFit="contain"`. Tap-out overlay закрывает; X-кнопка в правом верхнем углу с safe-area insets; счётчик «n / total» слева. Стрелки ChevronLeft / ChevronRight по бокам (wrap-around), скрываются при total=1. Caption снизу полупрозрачным черным фоном если есть. Подключён в `master/[id]` (публичный просмотр) и в `/profile/index.tsx` (мастер смотрит свои фото) — оба экрана держат `useState<number | null>(lightboxIndex)` и передают в PortfolioGrid.onOpen → setIndex. Pinch-to-zoom + swipe-жесты отложены — требуют gesture-handler worklet, sprint 13+.

### Sprint 11 (UX polish)
- [x] **2026-05-12** — **11.2** Infinite scroll reviews (commit `8885945`): `useReviewsForTarget` мигрирован с `useQuery(limit=50)` на `useInfiniteQuery` с keyset pagination — `ORDER BY created_at DESC, LIMIT 20`, курсор = `created_at` последней строки страницы, продолжение через `.lt('created_at', cursor)`. Извлечён общий компонент `src/features/master-view/ReviewsSection.tsx` — рендерит заголовок (с count + «+» если есть ещё страницы), loading/empty/list, кнопку «Показать ещё» (ActivityIndicator при fetching next page). Использован и в master/[id], и в client/[id] — удалена дубликат-разметка ReviewRow / formatDate в обоих файлах. Orders-feed pagination отложил в Sprint 12 — там пока нет лимита и low rate.
- [x] **2026-05-12** — **11.1** Pull-to-refresh (commit `9833ab5`): новый хук `src/hooks/use-pull-to-refresh.tsx` — возвращает `{ refreshing, onRefresh, control }`, где control — готовый `<RefreshControl tintColor="#2563eb" />`. Refetch'ит все активные queries через `qc.refetchQueries({ type: "active" })`. Подключён в Главную, orders client+master, chats list, category/[id], master/[id], client/[id]. Никакой бизнес-логики переписывать не пришлось — каждый экран сам решает что монтировать, refresh охватывает все queries автоматически.

### Sprint 10 (discovery + защита данных)
- [x] **2026-05-12** — **10.2** DB-level RLS guards на orders (commit `a29bf99`): migration 0020 заменяет общую `orders_update_own` на две узких policy. `orders_owner_edit_open` — UPDATE полей только при `status IN ('open','draft')`, WITH CHECK допускает переход в (open/draft/in_progress/cancelled) — это даёт работать accept_response RPC (open→in_progress) и cancelOrder из open. `orders_owner_change_status_in_progress` — UPDATE только при status='in_progress', WITH CHECK ограничивает финальный статус (cancelled/completed). Изменение других полей при in_progress теперь невозможно через прямой API. Не трогаем picked_master/picked_complete (sprint 7.3) и read-policy. Advisor: 0 новых lints.
- [x] **2026-05-12** — **10.1** Masters list в category-detail (commit `2327ca2`): новый `useMastersByL2(l2Id)` — 2-step query (master_categories+users+master_profiles, потом cities по уникальным city_ids). Сортировка rating_overall_avg DESC NULLS LAST → closed_deals DESC → experience_years DESC. Carrier-карточки на category screen: Avatar + name + Star рейтинг + опыт + город + bio превью; тап → `/master/[id]`. Empty/loading состояния.

### Sprint 9 (post-launch improvements)
- [x] **2026-05-12** — **9.3** Outcome tracking modal (commit `f4b03ad`): через 3 дня после `status='in_progress'` (proxy через `orders.updated_at`) клиенту показывается modal с тремя CTA: «Всё сделано» (→ useCompleteOrder, перейдёт на отзыв), «Не договорились» (→ useCancelOrder status='cancelled'), «Спросить позже» (snooze 3 дня). Dismiss-state в Zustand `useOutcomeStore` in-memory: после перезапуска показывается снова — приемлемо для MVP. `shouldShowOutcomePrompt(opts)` — guard-функция (только owner, in_progress + picked, ≥3 дня, не dismissed). Новый `useCancelOrder` hook (UPDATE orders.status='cancelled', RLS orders_update_own разрешает). Источник UX-паттерна: Яндекс Услуги / Profi.ru — снижает orphan rate (заказы зависшие в in_progress навсегда), даёт сигнал о потерях клиентов.
- [x] **2026-05-12** — **9.2** Client public view `/client/[id]` (commit `bcea668`): новый экран `app/(tabs)/client/[id].tsx` (скрыт href:null). `src/features/client-view/use-client-public.ts`: `useClientPublicProfile` (3 запроса users + cities + count orders status='completed') — отображает hero (avatar + role pill + completed-chip + Star рейтинг + city + дата регистрации) → reviews list (`useReviewsForTarget(clientId, 'master_to_client')` — переиспользован из 8.3). Линки: имя заказчика в OrderInfoBlock теперь Pressable accent-color → `/client/[client_id]`; chat header теперь умный — если userId=master → `/client/[partner.id]`, если userId=client → `/master/[partner.id]`. Кэш `client-public` инвалидируется в `useUpdateMasterProfile.onSuccess` (для случая когда мастер меняет своё имя — будут видны для парных видов).
- [x] **2026-05-12** — **9.1** Full master profile edit (commit `1469350`): новый экран `app/(tabs)/profile/edit-master.tsx` для редактирования полного профиля мастера после онбординга. Extract `src/features/master-profile/MasterProfileFormBody.tsx` — все поля (firstName, lastName, cityId pills, district, bio, experienceYears, serviceRadiusKm, hasTools, hasTransport) шарятся между onboarding (`master-profile.tsx`) и новым edit-screen. `useUpdateMasterProfile` — простая 2-step mutation (UPDATE users → UPDATE master_profiles), без RPC (онбординг-маркер `onboarding_completed_at` уже стоит). Инвалидирует userRecord + master-profile + master-public кэши. Раздельная `profile` папка (`profile/index.tsx`, `profile/_layout.tsx` Stack, `profile/edit-master.tsx`) — чистая URL-схема. Pre-fill через `reset()` в useEffect после загрузки данных. Guards: 401 если is_master=false; loading-state если master_profiles row нет (edge case после миграции).

### Sprint 8 (photo infra + master profile public view + dual reviews)
- [x] **2026-05-12** — **8.8** EAS Build dev profile (commit `f48f75f`): `eas.json` с 4 профилями. `base` (общий node 20.18.0 + EXPO_PUBLIC_SUPABASE_URL env) → расширяется через `extends` в остальных. `development` — internal distribution с developmentClient=true, iOS simulator=true, Android apk; `development-device` — тот же что development но для реального iOS-устройства (simulator=false); `preview` — internal release-build для тестировщиков; `production` — store-ready с auto-increment + Android app-bundle. Resource class `m-medium`/`medium` для разумной скорости/стоимости (Free Tier MVP).

**Запуск (после первого `eas login`):**
- `npx eas-cli@latest init` — создаст EAS project, впишет `extra.eas.projectId` в app.json, нужно для push-tokens.
- `eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <publishable_key>` — anon-key из .env.local.
- `eas build --profile development --platform ios` (или `--platform android`) — собирает первый dev-build.
- После установки на устройство: `npx expo start --dev-client` — открыть приложение через dev-build вместо Expo Go.

**Что закроет live-тест dev-build:**
- expo-image-picker (sprint 8.1/8.2) — Expo Go не выдаёт нативные camera/photo permissions полностью корректно.
- expo-notifications push token (sprint 8.6) — Expo Go в SDK 53+ блокирует remote push.
- category-covers рендер (sprint 8.7) — нужно сначала залить хотя бы одну обложку через Supabase Dashboard.

- [x] **2026-05-12** — **8.7** Атмосферные фото категорий (commit `c80f3ec`): migration 0019 — `categories_l2.cover_image_url text CHECK length ≤ 500` + Storage bucket `category-covers` (public read, ≤5MB, jpeg/png/webp, admin-only write через service_role). `expo-linear-gradient` поставлен. `CategoryTile` переписан в две ветки: при наличии `cover_image_url` рендерит expo-image `contentFit="cover"` + `LinearGradient` (`rgba(0,0,0,0)` → `rgba(0,0,0,0.65)`, locations [0.45, 1]) + label в text-on-dark снизу — DESIGN_SYSTEM §9.1 паттерн. При NULL — icon-режим как было. `useVisibleCategories.cover_image_url` теперь прокидывается из БД в плитку. Sprint 2.3 trade-off закрыт. Само naполнение бакета (фото-файлы) — admin задача через Dashboard, обновление `cover_image_url` через UPDATE.
- [x] **2026-05-12** — **8.6** Push-уведомления через Expo Push (commit `5cf1312`): migration 0017 — `pg_net` extension + `notification_tokens` table (user_id, expo_token UNIQUE, platform, device_name) с RLS owner-only. Migration 0018 — `vault.create_secret('notify_secret', ...)` (shared secret для DB↔Edge), helper function `public.notify_user(p_user_id, p_title, p_body, p_data)` SECURITY DEFINER вызывает edge function через pg_net.http_post с header `x-notify-secret`. 3 триггера: `messages_notify_recipient` (новое сообщение → партнёр), `order_responses_notify_owner` (новый отклик → клиент), `orders_notify_picked_master` (status=in_progress → выбранному мастеру). Все трое — AFTER INSERT/UPDATE, SECURITY DEFINER. Edge function `notify` (verify_jwt=false, v2): читает secret из vault.decrypted_secrets через service_role, проверяет `x-notify-secret`, грузит токены из notification_tokens, шлёт batch на `https://exp.host/--/api/v2/push/send`. Client: `expo-notifications 0.32.17` + `expo-device 8.0.10`, plugin в app.json (брендовый color #2563eb). `useRegisterPushToken(userId)` в AuthGate — запрашивает permission, получает Expo token через `getExpoPushTokenAsync()`, upsert по `expo_token` (UNIQUE) в БД. На signOut → `unregisterCurrentPushToken()` чистит row перед auth.signOut (порядок важен — после signOut RLS не пустит). `Notifications.setNotificationHandler` показывает push даже в foreground.
- [x] **2026-05-12** — **8.5** Order edit для client'а (commit `4397d13`): новый экран `app/(tabs)/orders/edit/[id].tsx`. Доступен только владельцу заказа при `status='open'`; иначе показывает explanation-screen («после принятия отклика нельзя редактировать»). Pencil-иконка в шапке `orders/[id].tsx` — отображается условно (isOwner && status='open'). Extract: общий компонент `src/features/orders/OrderFormBody.tsx` с полями category/title/description/city/district/urgency/budget — теперь шарится между `new.tsx` и `edit/[id].tsx`. Hook `useUpdateOrder` — RLS `orders_update_own` уже разрешает (sprint 5.1 закладывал). Поле `lockCategory` в OrderFormBody подготовлено для будущего (если решим фризить категорию у редактирования — пока не активно). Никакой миграции, всё на существующих RLS.
- [x] **2026-05-12** — **8.4** Двунаправленный рейтинг master↔client (commit `b5b1bb5`): migration 0016 — `recalc_master_rating` trigger function переписана с IF v_direction = 'client_to_master' / 'master_to_client'. Теперь обе стороны автоматически пересчитываются (master_profiles или users.rating_as_client_*). UI: новая `MasterReviewSection` — клон ClientReviewSection с direction='master_to_client' и текстами «Оцените клиента» / «Каким был клиент? Корректно ли описал задачу, оплатил вовремя?». Отображается под CompletionSection при `!isOwner && isMasterRole && status='completed' && picked_master_id===userId`. `OrderDetail` тип расширен — `client` JOIN теперь включает `avatar_url`, `rating_as_client_avg`, `rating_as_client_count`. В OrderInfoBlock пере-сделан блок «Заказчик» — теперь Avatar (sm) + имя + Star-рейтинг (если есть отзывы). Мастер до отклика видит репутацию клиента, как у Profi.
- [x] **2026-05-12** — **8.3** Master public view `/master/[id]` (commit `0916da1`): новый экран `app/(tabs)/master/[id].tsx` (скрыт из таб-бара через `href:null`). Структура Profi/Thumbtack-style: hero (Avatar xl + имя + Role pill + Активен-badge + рейтинг с count + город) → stats chips (опыт, радиус, инструмент, транспорт) → bio → categories chips → portfolio grid (reuse `PortfolioGrid` без onDelete) → reviews list (Avatar sm автора, ★★★★★ строка + l2 категория, дата, текст). `src/features/master-view/use-master-public.ts`: `useMasterPublicProfile` (3 запроса users+master_profiles+cities), `useMasterCategoriesPublic` (JOIN на L2), `useReviewsForTarget(targetId, direction)` (JOIN author + l2, status='visible', desc 50). Корректные ru-склонения для отзывов/заказов/лет. Интеграция тапов: имя мастера в `ClientResponseRow` → push `/master/{master_id}`, шапка чата (если собеседник-мастер) → `/master/{chat.master_id}`. Линки accent-цветом для discoverability.
- [x] **2026-05-12** — **8.2** Avatar + portfolio_items + /profile экран (commit `a757cf7`): migration 0015 — `portfolio_items` (id, master_id, url, storage_path, width, height, caption, sort_order, created_at, updated_at) с RLS (read public, owner-only writes) + trigger `check_portfolio_items_limit` (≤12) + индекс `(master_id, sort_order, created_at)`. Также length-CHECK на `users.avatar_url` (≤500, поле было в 0001). `src/features/profile/`: `use-my-portfolio` (read/add/delete + storage cleanup), `use-update-my-avatar` (full pipeline pick→upload→UPDATE→invalidate userRecord), `PortfolioGrid` (3-col grid с onDelete/onOpen, expo-image transition 150ms). Новый экран `app/(tabs)/profile.tsx` (скрыт из таб-бара через `href:null`): hero c аватаром (xl, edit-overlay, «убрать фото»), имя + role-pill + рейтинг (Star если есть отзывы) + город; master-only — ссылка на категории + portfolio-section с counter `n/12` и Add CTA с loading-state; «Выйти» внизу с confirm-Alert. Шапка Главной: avatar-кнопка (md) вместо LogOut → переход на /profile. TS типы регенерированы (portfolio_items появилась). Advisor: 0 новых lints.
- [x] **2026-05-12** — **8.1** Photo infrastructure (commit `4e80f27`): migrations 0013 + 0014 — Storage buckets `avatars` (public, ≤2MB) и `portfolio` (public, ≤5MB) с RLS на `storage.objects`. Folder structure `{user_id}/...`. SELECT-policy узкий — листинг только своей папки (advisor lint 0025 `public_bucket_allows_listing` устранён). Чтение public-объектов идёт через прямой URL `/storage/v1/object/public/{bucket}/{path}`, RLS не вмешивается. `expo-image-picker` 17.0.11 поставлен, permissions в app.json (фото + камера, ru-копирайт). `src/lib/image-upload.ts`: AVATAR_PRESET 512px q0.82 jpeg / PORTFOLIO_PRESET 1600px q0.85 jpeg, `pickImage(aspect, title)` единая точка с Alert-actionsheet «Камера / Галерея / Отмена», `resizeImage` через ImageManipulator, `uploadImage` через ArrayBuffer (fetch().arrayBuffer()) — RN-safe против FormData bugs. Public URL отдаётся с `?v=<timestamp>` cache-bust. `useUploadAvatar(userId)` / `useUploadPortfolioImage(userId)` mutations — pick+resize+upload, БЕЗ обновления доменных таблиц (это уйдёт в 8.2). `Avatar` компонент: 5 размеров xs/sm/md/lg/xl, expo-image с transition 150ms, инициалы-fallback с детерминированной 8-цветовой пастельной палитрой (slate-800 текст, AA-контраст).

### Sprint 7 (chat + reviews + completion = E2E lifecycle)
- [x] **2026-05-12** — **7.1** Migration 0011 chats + messages (commit `ebc4989`): tables `chats` (UNIQUE order_id, client_id + master_id) и `messages` (chat_id FK, sender_id, text 1-4000). 4 indexes. RLS: только участники. Trigger update_chat_last_message при INSERT message. **Расширен accept_response RPC** — теперь INSERT в chats ON CONFLICT DO NOTHING. ALTER PUBLICATION supabase_realtime — подписка на messages и chats для live-обновлений.
- [x] **2026-05-12** — **7.2** Chat UI + Realtime (commit `5450e31`): hooks `useMyChats` (JOIN orders + users партнёр), `useChatMessages` + `useRealtimeChatMessages` (Supabase Realtime channel `chat:{id}` с postgres_changes INSERT, setQueryData с dedup), `useSendMessage`. Screens: `chats/index.tsx` (список с аватаром-инициалом + последняя активность), `chats/[id].tsx` (thread с MessageBubble, автоскролл, KeyboardAvoidingView, Send button с conditional disable). Bottom-tab «Чаты» добавлен.
- [x] **2026-05-12** — **7.3** Reviews + order completion (commit `3c431e1`): migration 0012 — reviews table (UNIQUE order+author, rating 1-5 CHECK, status enum), trigger `recalc_master_rating` авто-обновляет `master_profiles.rating_overall_avg/count` после INSERT/UPDATE/DELETE отзыва. Новая policy `orders_picked_master_can_complete` (picked_master может сменить `in_progress`→`completed`). UI: CompletionSection (success-button «Работа выполнена» обеим сторонам), ClientReviewSection (5 интерактивных звёзд + multiline text, после submit — read-only display).

### Sprint 6 (accept-loop + master 3-tab orders)
- [x] **2026-05-12** — **6.1+6.2** accept_response RPC + UI (commit `3b639f2`): migration 0010 — RPC `accept_response(p_response_id)` SECURITY INVOKER. Атомарно UPDATE'ит выбранный response=accepted, остальные sent/viewed=rejected, order=in_progress+picked_master_id. Проверки: auth.uid()=order.client_id, status='open'. Advisor 0 lints. UI: `useAcceptResponse` mutation + `ClientResponsesSection` с условной кнопкой «Принять отклик» (если order.status=open и response.status=sent), success-border для picked мастера, info-banner если другой выбран. MasterResponseSection теперь знает picked_master_id и orderStatus: показывает «Клиент выбрал вас 🎉» (success вариант) или «Клиент уже выбрал мастера» (read-only).
- [x] **2026-05-12** — **6.3** Master 3-tab orders (commit `326a0c2`): pill-табы (как RoleSwitcher pattern) с count-бейджами. Tabs «Новые», «Я откликнулся», «Меня выбрали». Новые hooks: `useMyResponses` (JOIN orders+L2+city за один запрос), `useOrdersAssignedToMe` (orders WHERE picked_master_id=me). Фильтрация «Новые»=feed-кроме-orderIds-где-я-откликнулся (client-side через Set). Каждый таб: NewOrdersTab/RespondedTab/AssignedTab с EmptyCard переиспользуемым компонентом. SafetyBanner отображается над контентом всех табов.

### Sprint 5 (orders + responses, E2E маркетплейса)
- [x] **2026-05-12** — **5.1** Migration 0009 orders + order_responses (commit `3859a6c`): 2 таблицы + 6 enums (urgency, budget_mode, executor_type, contact_mode, order_status, response_status). orders: title (5-120) + description (10-2000) с length CHECK, budget_min/max + budget_mode, picked_master_id paired with status constraint, responses_count cached + auto-increment trigger, expires_at +30 days. order_responses: UNIQUE(order_id, master_id), price_mode, message (10-1000), status enum. Trigger check_response_not_self (мастер не откликается на свой заказ) и update_order_responses_count. RLS: orders SELECT={open|in_progress|completed|own|picked}, owner-only INSERT/UPDATE/DELETE; responses SELECT=participants (master или client). Advisor 0 lints.
- [x] **2026-05-12** — **5.2** Client orders tab + create-order (commit `5ebc19c`): новая вкладка `ClipboardList`. Hooks: `useMyOrders` (JOIN на L2 и cities), `useCreateOrder` (insert). `OrderRow` компонент (tag-chip → title → meta с timeAgo и responsesLabel склонениями). `new.tsx` screen: категория pills, title, description multiline, city pills, district, urgency 4 pills, budget с 3 pills (exact/range/negotiable) и conditional min/max. FAB-style «Создать заказ» с safe-area.
- [x] **2026-05-12** — **5.3** Master orders feed (commit `6ca76ed`): `useMasterFeed({userId, l2Ids})` — WHERE status='open' AND l2_id IN master's categories AND client_id != userId. Master view в `/(tabs)/orders/index.tsx`: SafetyBanner + список или CTA «Сначала добавьте категории» если 0 L2 / empty state «Пока нет заявок».
- [x] **2026-05-12** — **5.4** Order detail + response flow (commit `ff0b969`): динамический роут `[id].tsx`. Hooks: `useOrderDetail` (JOIN L2+city+client), `useOrderResponses` (для owner), `useMyResponseForOrder` (для master), `useSubmitResponse`. Branching: OrderInfoBlock для всех + ClientResponsesSection для owner + MasterResponseSection для master (форма или статус существующего отклика). Intl.NumberFormat ru-RU для цен.

### Sprint 4 (master categories + master view)
- [x] **2026-05-11** — **4.1** Migration 0007 master_categories (commit `526bad4`): many-to-many master↔L2 таблица с pricing_mode enum, l3_ids text[], JSONB pricing/attributes, UNIQUE(master_id, l2_id). Triggers: updated_at + check_master_categories_limit (max 5 на мастера, RAISE EXCEPTION при превышении). RLS: read public, write owner-only. 4 индекса (master_id, l2_id, composite l2_id+rating DESC, GIN attributes). Advisor 0 lints.
- [x] **2026-05-11** — **4.2** Master categories selection (commit `8bb8d08`): migration 0008 — RPC `set_master_categories(text[])` SECURITY INVOKER для атомарной DELETE-not-in + INSERT-new синхронизации. Экран `/(onboarding)/master-categories.tsx` с многосекционным списком 26 visible L2, локальный Set<string> selected, disable остальных при достижении 5, sticky bottom CTA "Сохранить", router.back() после save. `useMyMasterCategories` (с JOIN на L2 в одном запросе) + `useSetMasterCategories` mutation.
- [x] **2026-05-11** — **4.3** Master home view + SafetyBanner (commit `37840c9`): branching контента главной по `active_role`. `MasterHomeContent` секции: SafetyBanner («Без аванса и эскроу») → «Ваши категории» (CTA-карточка если 0 / pill-чипы + edit-link если есть) → empty state «Заявок пока нет» с Inbox иконкой. `ClientHomeContent` извлечён как inner component, рендерит каталог как было. SafetyBanner — переиспользуемый компонент (ShieldAlert в warning-soft кружке).

### Sprint 3 (master path + category detail + role switcher)
- [x] **2026-05-11** — **3.1** Category detail screen (commit `544838a`): динамический роут `app/(tabs)/category/[id].tsx` с `href:null` в Tabs (скрыт из таб-бара). `useCategoryDetail` загружает L2 + L3. Список услуг через `ServiceRow` с lucide Shield для requires_license, формат "от X ₽" через Intl.NumberFormat ru-RU, urgency на русском (Срочно/На неделе/В течение месяца), правильное склонение «услуга/услуги/услуг» с учётом 11-19. Tap по плитке теперь реально навигирует.
- [x] **2026-05-11** — **3.2** Migration 0004 — extended master_profile fields (commit `b4af8e1`): добавлены 11 полей в master_profiles (experience_years, has_tools, has_transport, service_radius_km, work_schedule jsonb, languages text[], tax_status, inn, team_size, home_clients_policy), 2 enums (tax_status, home_clients_policy), CHECK на bio.length≤500 и ИНН.length∈{10,12}, partial index по (status, service_radius_km).
- [x] **2026-05-11** — **3.3** Master onboarding wizard (commits `3680ec9`):
  - Migration 0005 + 0006 — RPC `complete_master_onboarding(...)`. Изначально SECURITY DEFINER, advisor предупредил → 0006 переключает на SECURITY INVOKER (RLS уже даёт нужные права, plpgsql функция сама по себе транзакция). Advisor security = 0 lints.
  - `useCities` hook (staleTime 1ч), `useSubmitMasterProfile` mutation через `supabase.rpc`.
  - `app/(onboarding)/master-profile.tsx` — single-screen form: имя/фамилия (validation regex Unicode letters), город (pills из cities), район (опц.), bio (multiline 500 max), experience_years + service_radius_km (number inputs side-by-side), has_tools/has_transport (RN Switch с accent track).
  - role.tsx обновлён: master → push на master-profile, client → completeOnboarding сразу.
  - Zod схема без `.optional().default()` (иначе IN vs OUT тип конфликтует с Control<T>).
- [x] **2026-05-11** — **3.4** Role switcher pill (commit `ac5626a`): `RoleSwitcher` компонент с двумя pill-кнопками («Клиент» / «Мастер»), показывается только если is_master=true. `useSetActiveRole` mutation UPDATE users.active_role + invalidate userRecord. Контент главной по active_role пока не меняется (sprint 4).

---

## Что дальше (Sprint 9 — кандидаты)

1. **Live-тест на dev-build** — push, image-picker, category covers (см. инструкции выше).
2. **Admin-tool для category-covers** — Node-скрипт со service_role: читает `assets/category-covers/<l2_id>.jpg`, грузит в bucket, UPDATE'ит `categories_l2.cover_image_url`.
3. **Full master profile edit** — bio, опыт, радиус, город меняются только в onboarding. Sprint 9 — отдельный экран `/profile/edit-master`.
4. **Real OTP / Telegram Login** — снимет 12 advisor warnings про anonymous policies.
5. **Outcome tracking modal** — «Беру / Не договорились» через 7/14/30 дней (Яндекс паттерн).
6. **Test runner** — Vitest для unit + Maestro для E2E.
7. **Master→client review в публичной странице клиента** — отложено в 8.4, требует `/client/[id]`.
3. **8.4 Master→client review** — расширить UI на `direction='master_to_client'`. Добавить `users.rating_avg numeric(2,1)` + trigger пересчёта. На странице клиента (отдельная задача) показывать его рейтинг.
4. **8.5 Order edit для client'а** — UI редактирования заказа со `status='open'`. Reuse new.tsx логику.
5. **8.6 Push-уведомления** — Expo Push для «новый отклик», «вас выбрали», «новое сообщение». DB trigger создаёт notifications row → edge function рассылает push.
6. **8.7 Атмосферные фото категорий** — `categories_l1.cover_image_url` (уже Sprint 8.1 загружаем фото в Storage, добавим в seed admin bucket).
7. **8.8 EAS Build setup** — eas.json для dev-build на iOS/Android.

## Backlog (Sprint 9+)

- **Real phone OTP / Telegram Login** — заблокировано выбором SMS-провайдера (Twilio/MessageBird/Smsc.ru) либо Telegram Login Widget (бесплатно). Уберёт advisor warnings про anonymous policies.
- **Outcome tracking modal** — «Беру заказ / Не договорились» через 7/14/30 дней (Яндекс паттерн).
- **Test runner** — Vitest unit + Maestro E2E.
- **Дашборд клиента** — публичная карточка клиента с рейтингом и историей отзывов (зависит от 8.4).

---

## Блокеры

- ⏳ **Anonymous Sign-Ins disabled в Supabase Dashboard** — критично для тестирования sprint 1.6 auth-flow. Включается одним тогглом, MCP не предоставляет (только UI).
- ⏳ **Реальный SMS-провайдер для OTP** — sprint 2, потребует регистрации и оплаты у Twilio/MessageBird/Smsc.ru. Альтернативы: Telegram Login Widget (бесплатно).

---

## История ключевых решений

### 2026-05-12 — Sprint 8.6: pg_net + edge function (а не Database Webhooks)
**Выбрано:** DB triggers → `extensions.http_post` (pg_net) → edge function `notify` → Expo Push API.

**Альтернатива (отброшена):** Supabase Database Webhooks (UI-driven). Это самый чистый паттерн, но конфигурация лежит вне миграций — невозможна через MCP, ломает версионирование инфраструктуры в git.

**Trade-off:** pg_net.http_post fire-and-forget, без retry. Если edge function недоступна — push потерян. Приемлемо для уведомлений (не сообщений). Sprint 9+ — можно добавить outbox-таблицу + cron для гарантированной доставки.

### 2026-05-12 — Sprint 8.6: shared secret в Vault, secret-value хардкод в миграции
**Выбрано:** `vault.create_secret('xtrud-notify-...', 'notify_secret', ...)` через миграцию 0018. Edge function читает через `vault.decrypted_secrets` service_role-запросом. Trigger function читает аналогично, передаёт в header `x-notify-secret`.

**Trade-off:** plain secret value сидит в файле миграции в git. Репозиторий private — допустимо для MVP. Перед публичным релизом — UPDATE vault.secrets WHERE name='notify_secret' через UI Dashboard.

**Альтернатива (отброшена):** Edge Functions secrets (env var). UI-only. Не управляется через MCP. Та же проблема версионирования.

### 2026-05-12 — Sprint 8.6: cancel push при signOut — best-effort
**Выбрано:** `signOut()` сначала вызывает `unregisterCurrentPushToken()` (DELETE token row), потом `auth.signOut()`. Если первая операция упала — продолжаем, не блокируем выход.

**Обоснование:** оставшийся token-row не критичен — при следующем login другого user'а UNIQUE-конфликт на `expo_token` обновит `user_id` через upsert. Просто гипотетический промежуток времени, когда чужие push идут на это устройство — минимизируется через сам процесс delete на signOut.

### 2026-05-12 — Sprint 8.4: один trigger function для обеих направлений рейтинга
**Выбрано:** одна функция `recalc_master_rating` с условием `IF v_direction = 'client_to_master' THEN UPDATE master_profiles ELSIF 'master_to_client' THEN UPDATE users`.

**Альтернатива (отброшена):** отдельный trigger function `recalc_client_rating` для другого направления. Тогда `reviews_recalc` стал бы парой триггеров с условиями. Это размывает ответственность — пересчёт идёт по одной таблице `reviews`, branch по direction логически живёт в одном месте.

**Trade-off:** имя `recalc_master_rating` теперь technically inaccurate (тоже clients), но переименование сломало бы immutable migration history. Comment обновили.

### 2026-05-12 — Sprint 8.4: рейтинг клиента в шапке заказа (не отдельный экран)
**Выбрано:** показывать `rating_as_client_avg/count` маленьким Star-чипом рядом с именем клиента в OrderInfoBlock.

**Альтернатива (отброшена):** отдельная публичная страница `/client/[id]`. Профиль клиента — это не «выставка работ», как у мастера. Клиенту нет смысла иметь портфолио / категории / bio. Полезный сигнал — рейтинг + число завершённых заказов. Это укладывается в один inline-чип.

**Trade-off:** мастер не может тапнуть имя клиента и посмотреть его историю заказов. Если соберём фидбэк что нужно — добавим в Sprint 9.

### 2026-05-12 — Sprint 8.2: единый `users.avatar_url` (а не `master_profiles.avatar_url`)
**Выбрано:** аватар хранится в `public.users.avatar_url` — общее поле для клиентов и мастеров.

**Альтернатива (отброшена):** разделить — клиент в `users_private.avatar_url`, мастер в `master_profiles.avatar_url`. Это даёт два пути загрузки, две зоны RLS, дублирование Avatar-логики во всех местах где показывается участник (OrderRow, chat, response, master public view).

**Бонус:** колонка уже существовала в 0001 (создана изначально как nullable для future-use), просто не использовалась — теперь добавили length-CHECK и подключили в UI.

### 2026-05-12 — Sprint 8.2: portfolio лимит 12 через DB trigger
**Выбрано:** trigger `check_portfolio_items_limit` BEFORE INSERT RAISE при COUNT≥12.

**Альтернатива (отброшена):** только клиентская проверка перед mutate. Это легко обходится прямым PostgREST-запросом или race-condition с двумя устройствами.

**Trade-off:** trigger делает дополнительный SELECT на каждый INSERT. На 12-row scope это микросекунды, для лимита целостности приемлемо.

### 2026-05-12 — Sprint 8.2: /profile экран один для клиента и мастера
**Выбрано:** единый `app/(tabs)/profile.tsx` (скрытый из таб-бара через `href:null`) с условным рендером portfolio-секции по `user.is_master`.

**Альтернатива (отброшена):** два отдельных экрана `/client-profile` и `/master-profile`. Дублирование top-bar, avatar-секции, sign-out — без выигрыша. Условные секции дёшево и легко читать.

**Trade-off:** при смене active_role через RoleSwitcher экран не реагирует — мастер всегда видит portfolio-секцию (показывается по `is_master=true`, а не по active_role). Это правильно: portfolio — это атрибут мастер-стороны, который существует пока is_master.

### 2026-05-12 — Sprint 8.2: storage cleanup при удалении portfolio_item — best-effort
**Выбрано:** `useDeletePortfolioItem` делает DELETE из БД, потом `try/catch` storage.remove. Storage-ошибка не пропагируется наружу.

**Обоснование:** UI важнее всего показать «удалено». Если файл осиротеет в bucket — это проблема стоимости хранения, а не данных. Periodic cleanup job (sprint 9+) подберёт осиротевшие файлы по diff `storage.list` vs `portfolio_items.storage_path`.

### 2026-05-12 — Sprint 8.1: public-buckets без broad SELECT policy
**Выбрано:** для `avatars` и `portfolio` SELECT policy узкая — только своя папка. Чтение объектов клиентами идёт через прямой public URL `/storage/v1/object/public/{bucket}/{path}`, который обслуживается storage-сервисом БЕЗ обращения к RLS (так устроены public buckets в Supabase).

**Альтернатива (отброшена):** broad `USING (bucket_id = '...')` SELECT. Advisor lint 0025 `public_bucket_allows_listing` — даёт анонимам право листать всю папку bucket и читать любой объект по пути, что раскрывает user_id всех мастеров. Public bucket уже даёт чтение по URL без RLS — broad SELECT избыточен и опасен.

**Trade-off:** `supabase.storage.list()` для bucket-листинга работает только в собственной папке пользователя. Для admin-сценариев в будущем понадобится service_role.

### 2026-05-12 — Sprint 8.1: upload через ArrayBuffer, не FormData/Blob
**Выбрано:** `fetch(localUri).then(r => r.arrayBuffer())` → передача ArrayBuffer в `supabase.storage.upload`.

**Альтернатива (отброшена):** FormData с `{ uri, type, name }` либо `fetch().blob()`. В React Native эти подходы исторически глючат — blob иногда возвращает 0 байт, FormData кривит multipart boundary. Supabase-docs прямо рекомендуют ArrayBuffer для RN.

### 2026-05-12 — Sprint 8.1: client-side resize обязателен, не отложен на edge function
**Выбрано:** resize на клиенте через expo-image-manipulator до upload (avatar 512px q0.82 / portfolio 1600px q0.85 jpeg).

**Альтернатива (отброшена):** грузить оригинал → Supabase Image Transformations (pro feature) или edge function ресайз. Это (1) платная фича, (2) каждый просмотр триггерит transformation = доп стоимость, (3) клиентский upload оригинала 5MB+ съедает мобильный трафик на ~10× больше.

**Trade-off:** теряем доступ к оригиналу для будущих ремастеров. Считаю это приемлемым — портфолио-фото не печатают в типографии.

### 2026-05-12 — Sprint 7.1: чат автоматически создаётся в accept_response RPC
**Выбрано:** при принятии отклика мастера RPC сразу создаёт chats row (INSERT ON CONFLICT DO NOTHING). Не нужен отдельный шаг «начать чат».

**Обоснование:** двусторонний акт принятия = старт коммуникации. UX-логично сразу показать чат обоим. Альтернатива (создавать чат лениво при первом сообщении) добавляла бы пустые состояния и race conditions.

### 2026-05-12 — Sprint 7.2: Realtime подписка только на INSERT, не SELECT
**Выбрано:** подписка через `postgres_changes` event=INSERT с фильтром `chat_id=eq.X`, новые сообщения добавляются в TanStack Query cache через setQueryData с dedup по id.

**Альтернатива (отброшена):** перезагружать messages через `invalidateQueries` при каждом Realtime событии. Это вызывает full refetch — лишний трафик.

**Trade-off:** UPDATE/DELETE сообщений не покрываются. Для sprint 7 это OK (нет редактирования). Sprint 8+ добавим UPDATE подписку если понадобится edit/delete.

### 2026-05-12 — Sprint 7.3: master rating через DB trigger вместо edge function
**Выбрано:** `recalc_master_rating` trigger в plpgsql AFTER INSERT/UPDATE/DELETE на reviews. Пересчёт AVG/COUNT, UPDATE master_profiles.

**Альтернатива (отброшена):** Edge Function с подпиской на изменения reviews. Дороже (network roundtrip), не атомарно, требует логики retry.

**Bonus:** trigger корректно обрабатывает DELETE/UPDATE отзывов — рейтинг автоматически пересчитывается.

### 2026-05-12 — Sprint 7.3: master→client review отложен в sprint 8
**Выбрано:** В sprint 7 только direction='client_to_master'. Master-to-client поле есть в enum, но UI и flow не реализованы.

**Обоснование:** двунаправленный рейтинг (мастер тоже оценивает клиента) — отдельная UX-проблема: где master её оставляет, как клиент видит свою репутацию, нужно ли скрывать от других мастеров и т.д. Лучше сделать качественно в sprint 8 чем поспешно сейчас.

### 2026-05-12 — Sprint 6.1: accept_response — атомарное reject остальных откликов
**Выбрано:** при accept одного отклика, остальные открытые (status IN sent/viewed) автоматически становятся rejected внутри одного RPC.

**Альтернатива (отброшена):** оставить остальные в status='sent', никого не отклонять явно. Master тогда не понимает что произошло — заказ просто пропал из ленты «Новые», но статус его отклика остался «sent» (ввдящее в заблуждение).

**Обоснование:** explicit rejection даёт masterу понятную ux-обратную связь — он видит status «rejected» с надписью «Клиент выбрал другого мастера». Это вежливо и понятно. Аналогичный паттерн используют Profi.ru, Thumbtack.

### 2026-05-12 — Sprint 6.3: master 3-tab вместо top-tabs navigator
**Выбрано:** простые pill-табы внутри single screen с conditional rendering. State хранится в useState.

**Альтернатива (отброшена):** установка `@react-navigation/material-top-tabs` библиотеки. Это даёт swipe gestures и nicer transitions, но добавляет дополнительную зависимость, layout shim, отдельный navigator.

**Trade-off:** pill-табы не дают swipe — меньше нативно для mobile. Но для 3 коротких списков заказов swipe не критичен; пользователь жмёт pills. Если в sprint 7+ окажется, что swipe заметно влияет на UX — перейдём на material-top-tabs.

### 2026-05-12 — Sprint 5: orders без PostGIS/address_exact/attributes JSONB на старте
**Выбрано:** минимальные orders + order_responses таблицы без geo_point, address_exact, gender_filter, requires_tags, is_anonymous, attributes JSONB.

**Обоснование:** PostGIS требует extension setup + конвертация address→coords (Geocoding API, платный). attributes JSONB требует metadata table category_fields с UI рендерингом форм. Эти усложнения добавим в sprint 6+ когда базовый E2E цикл orders подтвердит свою ценность.

**Sprint 6+ план:** добавить эти поля как ALTER TABLE, без миграций существующих строк (новые поля nullable).

### 2026-05-12 — Sprint 5.3: master feed без city/radius фильтрации в первой итерации
**Выбрано:** match только по l2_id (категории), не по city + service_radius.

**Обоснование:** В Ингушетии 5 городов на радиусе ~50 км — большинство мастеров логично работают по всему региону. City-фильтр на 5 городах добавит UI complexity без значимой пользы. Когда расширимся в другие регионы — добавим.

### 2026-05-11 — Sprint 4: применены 3 UX-паттерна из Яндекс Исполнители
**Что взято:**
1. **SafetyBanner** — «Без аванса и эскроу. Не переходите в сторонние мессенджеры». Защита от типового фрода. AUDIT.md риск №1.
2. **Profile completion CTA** — карточка «Добавьте категории» с правой accent-кнопкой Plus, если master_categories пуста.
3. **3-таб структура orders** — Новые / Я откликнулся / Меня пригласили. Заложено в backlog sprint 5, реализуется когда будет orders table.

**Что НЕ взято:**
- Промо-карточки с яркими градиентами (Cal.com стиль монохром).
- Платный «безлимит откликов» 199₽/неделя — наш проект «бесплатно для всех» (memory/project_xtrud.md).
- «Подключить продвижение» CTA — у Яндекса платная подписка за топ выдачи, у нас другая модель.

**В backlog sprint 5+:**
- Outcome tracking modal после контакта (обязательная разметка беру/не_договорились).
- Daily response limits (как опция монетизации, если реклама не пойдёт — AUDIT.md риск №2).

### 2026-05-11 — Sprint 4.2: master_categories optional после wizard, а не обязательный шаг онбординга
**Выбрано:** master_profiles создаётся в wizard (sprint 3.3, RPC complete_master_onboarding), `onboarding_completed_at` ставится сразу. master_categories — пустые в первый момент, master сам добавляет через CTA «Добавьте категории» в master view.

**Альтернатива (отброшена):** включить категории в wizard как обязательный шаг 2/2. Усложняет flow, не позволяет master'у быстро попасть в приложение и посмотреть UI «как клиент».

**Trade-off:** мастер может оказаться в приложении без категорий → не получать заявки. Решено через явный CTA-баннер в master view, который объясняет необходимость категорий.

### 2026-05-11 — Sprint 4.2: RPC set_master_categories для diff-sync
**Выбрано:** атомарный RPC `set_master_categories(p_l2_ids text[])` — `DELETE WHERE l2_id != ALL(p_l2_ids)` + `INSERT ON CONFLICT DO NOTHING`.

**Обоснование:** UI-операция «сохранить выбор» концептуально — установка состояния (список категорий), не множество разрозненных insert/delete. Atomic transaction в плpgsql функции гарантирует консистентность даже при race condition. SECURITY INVOKER + проверка auth.uid() внутри — без нужды в DEFINER (RLS уже даёт права).

**Альтернатива (отброшена):** клиент делает DELETE all + INSERT new подряд. Не атомарно — если INSERT упадёт, у мастера 0 категорий и нужно восстанавливать вручную.

### 2026-05-11 — Sprint 3.3: RPC complete_master_onboarding с SECURITY INVOKER
**Выбрано:** функция SECURITY INVOKER (не DEFINER), хотя оба варианта работают функционально.

**Обоснование:** Supabase advisor flag'ает SECURITY DEFINER функции callable authenticated через RPC как WARN (lint 0029). Поскольку RLS на public.users (auth.uid()=id) и public.master_profiles (auth.uid()=user_id) уже разрешает нужные операции, bypass через DEFINER не нужен. PL/pgSQL функция атомарна сама по себе — UPDATE + UPSERT в одной транзакции. Advisor = 0 lints.

**Migration history:** 0005 (изначально DEFINER) + 0006 (CREATE OR REPLACE на INVOKER) — оставлены оба чтобы сохранить immutable migration history.

### 2026-05-11 — Sprint 3.3: Master wizard на одном экране, не многошаговый
**Выбрано:** все поля master profile (имя, фамилия, город, район, bio, опыт, инструмент, транспорт, радиус) на одном экране через ScrollView + KeyboardAvoidingView.

**Альтернатива (отброшена):** 7-шаговый wizard из CATEGORIES_AND_PROFILES §2.1. Многошаговый flow добавляет step navigation, draft persistence, indicator UI — серьёзный overhead для sprint 3 scope. На одном экране пользователь видит всё, может скроллить и поправить — UX простой.

**Условие пересмотра:** sprint 4+ если масштаб полей вырастет (категории, портфолио, график) — разбить на 3-4 шага.

### 2026-05-11 — Sprint 2.3: bento-grid без фото в первой итерации
**Выбрано:** упрощённая сетка плиток с lucide-иконкой + surface-2 фоном вместо сигнатурного DESIGN_SYSTEM §9.1 паттерна (тёмное атмосферное фото + overlay-gradient + лейбл).

**Обоснование:** атмосферные фото для 26 категорий — это (а) 30-50 МБ assets, (б) подбор/curation/правовая чистка, (в) загрузка в Supabase Storage / R2 + клиентский resize через expo-image-manipulator. Это полноценная задача sprint 3+ с фото-инфрой. Сейчас лучше показать MVP-сетку, чем застрять.

**Условие пересмотра:** sprint 3 когда настроим R2 + источник фото.

### 2026-05-11 — Sprint 2.1: split-table подход к "приватный/публичный" профиль расширен на onboarding state
**Выбрано:** `users.onboarding_completed_at: timestamptz NULL` как маркер "выбрал ли пользователь роль" — публичная инфа.

**Альтернатива (отброшена):** хранить в `users_private` чтобы не было видно другим — overkill, статус онбординга семантически такой же публичный как `is_master`.

### 2026-05-11 — Sprint 1: anonymous-сессия как первичный auth механизм
**Выбрано:** anonymous sign-in под капотом + phone сохраняется в `users_private` без OTP-верификации.

**Обоснование:** реальный phone-OTP требует подключения SMS-провайдера через Supabase Dashboard (Twilio / MessageBird / Vonage / Smsc.ru). На старте sprint 1 это блокирует разработку и требует оплаты. Anonymous даёт реальную сессию + RLS работает + триггер создаёт `users` запись. UX phone-flow выглядит как настоящий OTP — пользователь вводит номер, "получает код" (симуляция 800ms), "вводит код" (любой 6-значный). В sprint 2 — 2-3 строки замены: `signInAnonymously` → `signInWithOtp`/`verifyOtp`.

**Условие пересмотра:** в sprint 2 — реальный OTP.

### 2026-05-11 — Sprint 1.4: split-table для приватных полей users
**Выбрано:** разделить `public.users` на 2 таблицы — `users` (публичный профиль) и `users_private` (phone, birth_year, gender, last_active_at) с RLS `auth.uid() = user_id`.

**Обоснование:** изначально пытался сделать SECURITY DEFINER view `users_public` для отдачи только публичных полей. Supabase advisor вернул ERROR `security_definer_view` (Lint 0010). Split-table — стандартный паттерн Supabase: чистый advisor, простой `SELECT *` для публичных читателей, RLS защищает приватные поля без хаков с views.

**Альтернатива (отброшена):** column-level GRANTs — невозможно совместить с row-level access "владелец видит всё, остальные — только публичные".

### 2026-05-11 — Sprint 1.5: 26 L2 visible (вместо 13 из PROJECT_MAP)
**Выбрано:** 13 главных категорий из PROJECT_MAP §5.12 + все 5 L2 в L1 Авто + все 7 L2 в L1 Бьюти + школа/языки/религиозное в Education = ~26 visible L2.

**Обоснование:** PROJECT_MAP §5.12 называет "Авто" и "Бьюти" как монолитные категории, но в фактической таксономии CATEGORIES_AND_PROFILES §1.3 эти L1 имеют 5 и 7 L2-подкатегорий. Логичнее показать «маникюр + парикмахер + массаж» как visible, чем выбрать один. Пользователь подтвердил это решение.

### 2026-05-11 — Стек: Expo universal (web + iOS + Android в одной кодовой базе)
**Выбрано:** Expo SDK 54+ с Expo Router v6, NativeWind 4, Zustand, TanStack Query, RHF + Zod, Supabase JS, Reanimated 4.

**Деплой:** EAS Build/Submit для mobile, Vercel или Cloudflare Pages для web.

**Альтернативы:** Monorepo Next.js + Expo раздельно (отброшено — слишком много дублирования), Flutter (другая экосистема), PWA-only (не дотягивает до нативных приложений).

### 2026-05-11 — Sprint 1.2: WCAG-фикс контраста palette
**Выбрано:** `muted-soft` light `#9ca3af → #71717a` (zinc-500, 4.61:1 на #fff ✅ AA), `accent` light `#3b82f6 → #2563eb` (blue-600, 5.6:1 на #fff ✅ AA body).

**Обоснование:** оригинальные значения из DESIGN_SYSTEM.md не проходят WCAG AA для body-текста (2.95:1 и 3.7:1). Подъём на 1-2 тона делает их accessible без потери визуального duxa Cal.com-стиля.

### 2026-05-11 — GitHub-репо: приватный
**Выбрано:** `killianche/xtrud` private. Переключение private→public — одна команда, обратный путь сложнее.

### 2026-05-11 — Supabase: регион eu-central-1, Free tier
**Выбрано:** Frankfurt, $0/мес. Регион нельзя сменить после создания.

### 2026-05-11 — Документация: разбита на короткий CLAUDE.md + детальные `.claude/rules/*.md`
**Выбрано:** CLAUDE.md ~120 строк + `.claude/rules/working-rules.md` с `paths: ["**/*"]` для автозагрузки. Рекомендация best-practice репо: «under 200 lines for reliable adherence».
