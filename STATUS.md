# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

---

## Текущее состояние

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

**Sprint 21 закрыт — Chat seed-fixture + Maestro chat smoke.** Новый каталог `supabase/seed-test/` с `chat-fixture.sql` инсертит фейковых client + master напрямую в `auth.users` (trigger автоматом создаёт `public.users`), плюс полный сценарий: master_profiles + master_categories + order(in_progress) + accepted response + chat + 1 incoming message. `flows/06-chat.yaml` + `chat-smoke.yaml` логинятся под client и проверяют отправку сообщения. README в обоих каталогах + warning «никогда не на проде». **Sprint 20 (order state-machine doc)** ранее закрыт. **Sprint 19 (доп. тесты, 47/47)** закрыт.

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
