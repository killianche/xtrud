# TASKS — трекер всех задач

**Назначение:** единый список всех задач из текущей и прошлых сессий с агентом. Цель — ничего не терять между сессиями.

Правила:
- Каждая задача — отдельная строка с чекбоксом `[ ]` (открыта) / `[x]` (закрыта)
- Задача в работе помечается `🚧` в начале строки
- При закрытии указывается **дата + коммит** (хэш короткий, 7 символов)
- Если задача отложена — `⏸` + причина
- Новые задачи дописываются в **«🟡 Открытые»**, сразу как пользователь их прислал
- При закрытии задача переезжает в **«✅ Сделано»** (с датой/коммитом)
- При повторении того же класса задач — новые подзадачи нумеруются (`x.1`, `x.2`)

**Точка входа для агента:** `CLAUDE.md` → `STATUS.md` (где мы сейчас) → `TASKS.md` (детальный список).

---

## 🚧 В работе сейчас

- 🚧 **Мастер-верификация (часть 2 — frontend)** — после части 1 (backend, миграция 0070, RLS, Storage, типы — done). Часть 2: хуки `useMyVerification`/`useSubmitVerification`, экран `/profile/verification`, nudge-карточка на `/profile`, badge «Паспорт подтверждён» у других юзеров. Спецификация — [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

---

## ✅ Sprint K master-search + verification backend (2026-05-15 поздняя ночь)

- [x] **Defaults фильтров поиска заказов из master_categories** — `/orders/search` при первом заходе мастера подставляет его профильные категории. Идемпотентно по userId. См. [`src/features/orders/orders-search-filters-store.ts`](src/features/orders/orders-search-filters-store.ts).
- [x] **Quick-select chips «Из вашего профиля»** на /filters — toggle прямо из chip без захода в полный picker. См. [`app/(tabs)/orders/search/filters.tsx`](app/(tabs)/orders/search/filters.tsx).
- [x] **Master verification backend** — миграция `0070_master_verifications` (enum + table + RLS + trigger + private storage bucket). Спецификация в [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

---

## ✅ Sprint P0 master-account (закрыт 2026-05-15)

Все 9 P0-задач из [`research/MASTER_ACCOUNT_PLAN.md`](research/MASTER_ACCOUNT_PLAN.md) закрыты в одну сессию:

- [x] **P0-1** [`ec4be72`] — Унификация архитектуры цен на `master_services`
- [x] **P0-2** [`34c6c9b`] — Связь `master_services` с категориями (l2_id + l3_id)
- [x] **P0-10** [`c44471b`] — Режим «Договорная» в прайсе + 4 toggle типов цены
- [x] **P0-3** [`24ab7a1`] — Иерархический picker категорий с поиском в онбординге
- [x] **P0-4** [`a935d67`] — Pre-defined L3 услуги с placeholder-ценами в форме
- [x] **P0-5** [`9e59358`] — Daily response limit 5/день + бейдж в шапке
- [x] **P0-7** [`ba5d6ed`] — `users.is_demo` флаг + backfill 21 demo-master
- [x] **P0-6** [`eb22593`] — Фото-attachments в чате (Storage + RLS + UI)
- [x] **P0-NEW** [`38d0b5d`] — Умный поиск услуг (FTS + pg_trgm + thesaurus + раскладка-фикс)
- [x] **P0-8** [`2f5cf0d`] — Главная мастера = лента 3 свежих заказов

Полный summary в STATUS.md секции «2026-05-15 ночь».

---

## 🐛 Открытые баги (приоритет высокий)

- [ ] **Demo-логин падает в /verify** — «Database error querying schema» при попытке войти как `+79000000003 / 000000` (Руслан Хамхоев, миграция 0054). Воспроизводилось 2026-05-15. Не блокирует разработку (можно создать новый аккаунт через /orders/new + JIT-signup), но блокирует e2e-тестирование master-flow с реальным аккаунтом. Возможные причины: регрессия после миграций 0055-0063, или RLS-policy на users_private. Проверить supabase logs.

---

## 📋 Следующая фаза — P1 + N1-N4 (упрощённый scope)

По решению пользователя 2026-05-15 после P0 берём только **избранные** P1 + новые N-задачи. **Голосовые в чате (P1-5) и юр-моменты (P1-7) — НЕ делаем.**

### P1 (полнота функционала, выборочно)
- [ ] **P1-3 (упрощ.)** — Service area: только города + районы (Малгобекский, Назрановский, Сунженский, Джейрахский), без сёл и radius. UI multi-select в edit-master.
- [ ] **P1-4** — Портфолио: проверить/доработать upload (PortfolioLightbox уже есть на 267 строк, проверить полный flow).
- [ ] **P1-8** — Dual-role переключатель UX-ревизия: найти текущий switch client↔master, проверить что заметен и понятен.

### N-задачи (доработки master-главной из фидбека 2026-05-15)
- [ ] **N1** — Убрать блок «Ваши категории» с master-главной (оставить только в профиле). См. [research/NEW_TASKS_MASTER_HOME.md](research/NEW_TASKS_MASTER_HOME.md).
- [ ] **N2** — Убрать кнопку «+ Создать заказ» из master-режима (мастер не создаёт заказы).
- [~] **N3** — «Поиск заказов» для мастера. **Сделано:** лента + multi-select L2 категорий + сортировка (новые/срочные) + defaults из master_categories + quick-select chips из профиля (2026-05-15). **Осталось:** фильтры по городу/району/бюджету/срочности.
- [ ] **N4** — Спроектировать систему push-уведомлений (приложение + web): 7 событий мастера, native (FCM/APNs) + Web Push, quiet hours, preferences. Полный план в [research/NEW_TASKS_MASTER_HOME.md](research/NEW_TASKS_MASTER_HOME.md) §N4.

### Ещё одна задача наполнения данных
- [ ] **avg_check_rub** для остальных 239 L3 — сейчас заполнено 41 (Сантехника / Электрика / Уборка / Покраска / Плитка). Без этого hint «В среднем берут X ₽» не показывается для других категорий.

---

## 🟡 Открытые (бэклог текущей сессии Sprint J)

_Все открытые задачи которые подняли но не закрыли — здесь. Они забираются в работу первыми._

- [ ] **БД-таблица `locations`** (миграция 0051+) — заменит hardcoded `DISTRICTS` const в `src/lib/location-config.ts` на запросы из БД. Структура: `locations(id, name, type enum('city'|'district'|'village'), parent_id, lat, lng, sort_order)`. Admin UI добавления / правок. Применить только после стабилизации текущего hardcoded подхода (есть LocationPicker / LocationSheet / LocationFilterSheet работающие через const — БД-таблица улучшит admin workflow без UX-регрессии).
- [ ] **Native geolocation через `expo-location`** — установить пакет (`npm install expo-location`) и заменить заглушку `getDeviceCoordinates` в `src/lib/use-user-city.ts`. См. inline TODO. Сейчас на native fallback на `DEFAULT_CITY_ID`.
- [ ] **`<LocationFilterSheet>` интеграция в master profile edit** — для master service zone (где мастер работает). Компонент готов в `src/components/ui/LocationFilterSheet.tsx`, нужна БД-таблица `master_service_zones(master_id, location_key)` где `location_key` хранит `c:cityId` / `v:village` строку из `Set<LocSetItem>`.
- [ ] **`<LocationSheet>` для master feed фильтра** — мастер фильтрует входящие заказы по нескольким городам/районам. Компонент готов; нужна интеграция в master feed screen + обновление `useMasterFeed` хука для приёма `LocationFilter`.
- [ ] **LocationPicker в master profile (single mode)** — расширить onboarding мастера от city до района/села. `master_profiles.district` + `master_profiles.village` колонки.
- [ ] Перенести «Примеры» («Починить кондиционер», «Нужен плиточник…») как placeholder поля description в `app/(tabs)/orders/new.tsx`
- [ ] LoginWall: подключить к действиям — отправка сообщения в чате (`chats/[id].tsx`), оставление отзыва, создание заказа (`orders/new.tsx` финальный submit)
- [ ] Hot-reload в браузере (WebSocket auto-reload injection) — сейчас F5 руками
- [ ] Прод-деплой на `alanbani.ru/xtrud/` через `deploy/web.sh` — проверить что не сломался после изменений в `_layout.tsx` + `app.json` (`web.output: single` vs `static`)
- [ ] **Часть 2 Open Doodles** — распространить иллюстрации на `orders/index` (empty), `chats/index` (empty), `category/[id]` (нет мастеров), `LoginWall` bottom-sheet. (Часть 1 — `849634e`, инфра + meditating doodle на `/search`.)

### 📱 Паттерны из Яндекс.Услуги (референс из скринов 2026-05-13)

Эти задачи — не «срочно», но фиксируем чтобы потом сделать как у эталона. См. чат за 2026-05-13 (скрины Яндекс.Услуг).

- [ ] **Typeahead service search (bottom-sheet)** — `/search` должен быть НЕ плоский экран с инпутом, а bottom-sheet с typeahead'ом по L2+L3+alias словам. Пример: пользователь набирает «Д» → мгновенно показываются «Двери / Дизайн интерьера / Демонтаж гипсокартона / …», совпавшая буква **жирная**. Заголовок секции «Подходящие услуги или специалисты». Список из всех видимых l2.name_ru + l3.name_ru + ручной alias-словарь («сантехник» → plumbing, «плиточник» → tiling-floor + tiling-wall и т.п.). Реализация: bottom-sheet через @gorhom/bottom-sheet (уже стоит) + FlatList с `bg-bold-letter` через `<Text>` фрагменты + Supabase RPC `search_services(q)` или клиент-сайд (видимых l2+l3 ≈ 60 строк, поиск в JS моментальный).
- [ ] **Wizard «Что нужно сделать?»** — переделать `app/(tabs)/orders/new.tsx` под паттерн Яндекс/Профи:
  - H1 «Что нужно сделать?»
  - Поле «Короткое название задачи» (single-line input)
  - Поле «Расскажите подробнее о задаче» (textarea, 4-6 строк)
  - Блок «Пожалуйста, уточните категорию вашей услуги» + большая outline-кнопка «Выбрать» → открывает typeahead bottom-sheet (см. предыдущую задачу)
  - Chip-row attribute chips: «У меня» (тип жилья — dropdown: квартира/дом/офис/участок), «Место» (открывает выбор адреса/района), «Бюджет» (от-до или «по договорённости»), «Сроки» (срочно / в течение недели / гибко), «Фото и файлы» (upload до 5 фото)
  - Toggle «Исполнители не видят ваш номер телефона» + надпись с номером (взят из `users.phone`)
  - Safety-блок «Внимание!» с предупреждением «Мы не сторона сделки, не переходите по подозрительным ссылкам, не переносите общение в сторонние мессенджеры»
  - Sticky CTA внизу «Опубликовать заказ» (high-emphasis)
- [ ] **`/search` redesign** — пока заглушка с doodle. После typeahead-bottom-sheet задачи: search-экран либо становится списком результатов (по введённому запросу), либо открывает bottom-sheet сразу из тапа на SearchBar главной. Решить паттерн.

---

## 📋 Бэклог продукта (из STATUS.md + AUDIT_2026-05-12.md)

### 🔴 Критично для launch
- [ ] **Real OTP** — выбрать SMS-провайдер (Exolve / smsc.ru / SMS Aero) + подключение через Supabase Auth
- [~] **Master verification UI** — backend готов 2026-05-15 (миграция 0070, RLS, private Storage bucket — см. [`docs/VERIFICATION.md`](docs/VERIFICATION.md)). Frontend часть 2 (хуки + экран /profile/verification + nudge + badge) — в работе.
- [ ] **Master services CRUD UI** — таблица `master_services` есть, UI add/edit/delete нет
- [ ] **Welcome onboarding slides** — 3-5 страниц до phone-экрана
- [ ] **Vercel migration для web** — заменить deploy/web.sh + alanbani.ru на vercel-домен (пользователь сказал «пока не мигрируем»)

### 🟡 Важно (UI редизайн под Vercel)
- [ ] Orders list (`(tabs)/orders/index.tsx`) — сейчас работает через compat aliases, нужен Vercel-rewrite
- [x] **Orders new (`(tabs)/orders/new.tsx`)** — переписан 2026-05-14: Vercel hero (eyebrow + H1 + 3-step value-prop + privacy callout) + единая info-card + `<LocationPicker>` bottom-sheet с иерархией Город/Район/Село. Подключение LoginWall к финальному submit — отдельная задача ниже.
- [ ] Order detail (`(tabs)/orders/[id].tsx`) — большой экран, нужен Vercel + StatusBadge компонент
- [ ] Order edit (`(tabs)/orders/edit/[id].tsx`)
- [ ] Chats list (`(tabs)/chats/index.tsx`)
- [ ] Chat thread (`(tabs)/chats/[id].tsx`) — с phone masking (I.3) и шаблонами
- [ ] Profile (`(tabs)/profile/index.tsx`)
- [ ] Edit master (`(tabs)/profile/edit-master.tsx`)
- [ ] Onboarding role / phone / verify / master setup
- [ ] Notifications (`(tabs)/notifications/index.tsx`) — Bell icon в header главной + page
- [ ] Useful articles (`(tabs)/useful/index.tsx` + `[slug].tsx`)
- [ ] Admin queue (`(tabs)/admin/index.tsx`)

### 🟡 Важно (функциональность)
- [ ] UI команды/бригады (I.6 finish) — DB готова, нужен экран add/remove members
- [ ] UI поручительств / общих знакомых (I.8) — бейдж на карточке мастера, кнопка «Поручиться», импорт контактов через `expo-contacts`
- [ ] Admin CRUD для articles — markdown-редактор
- [ ] Поиск + фильтры в каталоге (на 100+ мастеров)
- [ ] Управление графиком работы мастера (`work_schedule jsonb` есть)
- [ ] Master ответ на отзыв
- [ ] Сравнение откликов side-by-side
- [ ] Withdraw отклика мастером (UI)
- [ ] FAQ / chat поддержки
- [ ] `rating_as_client_*` триггер для обратных отзывов

### 🟢 Опционально / далеко
- [ ] Маскированные звонки (I.10)
- [ ] Карта мастеров (PostGIS)
- [ ] Категорийные обложки (admin upload)
- [ ] Telegram/VK ID alt-логины
- [ ] Personal mini-site `xtrud.ru/m/{name}`
- [ ] Видео в портфолио
- [ ] Реклама / спонсоры / CPA

---

## ✅ Сделано (Sprint J — 2026-05-14, продолжение)

- [x] **Демо-логин починен.** `src/lib/auth.ts` распознаёт `+79000…` и логинит через `signInWithPassword` (email-маршрут, phone-provider в Supabase отключён). Миграции 0045–0047 устанавливают пароль `'xtrud'` и email `<digits>@xtrud-demo.local` каждому demo-юзеру. Алина теперь видит свои 11 заказов / 4 чата / 21 сообщение.
- [x] **Профиль клиента: stats + edit.** В `app/(tabs)/profile/index.tsx` добавлены 2 карточки (заказы / чаты) со счётчиками и кнопка «Редактировать профиль». Новый экран `app/(tabs)/profile/edit-client.tsx` (имя / фамилия / город через `PickerSheet` / район) с префиллом, dirty-check, save через `useUpdateMyProfile`.
- [x] **Аватары DiceBear `shapes` only.** Миграция 0048 перевела все 30 demo-аватаров с avataaars → shapes. Зафиксировано как правило в `CLAUDE.md` (раздел «АВАТАРЫ — ТОЛЬКО DiceBear shapes»). Запрет на avataaars/personas/micah/pixel-art и сторонние cartoon-генераторы.
- [x] **Чаты hygiene.** Префикс `demo: ` в title 4 заказов Алины убран. Добавлено свежее (15 минут назад) сообщение от Магомеда → у Алины теперь 2 видимых непрочитанных чата.

## ✅ Сделано (Sprint J — 2026-05-14 поздний вечер, location-архитектура)

- [x] **Единый `src/lib/location-config.ts`** — 8 cities + 4 districts + 32 villages + CITY_COORDINATES + DEFAULT_CITY_ID + getNearestCity Haversine + getLocationLabel + helpers + LocationFilter type + LocSet utilities. Подход скопирован из Ingush-Business.
- [x] **Миграция `0050_cities_add_large_villages.sql`** — 3 новых cities в БД (Орджоникидзевская, Серноводская, Нестеровская). Применена на прод.
- [x] **`src/lib/use-user-city.ts`** — Zustand store + init-цикл AsyncStorage → web geolocation → `getNearestCity` → DEFAULT_CITY_ID. Хук `useUserCity()`.
- [x] **`<LocationSheet>` multi-select** (`src/components/ui/LocationSheet.tsx`) — `LocationFilter` `{isAll, cities[], districts[]}` + reset link + sticky CTA.
- [x] **`<LocationFilterSheet>` Set-API** (`src/components/ui/LocationFilterSheet.tsx`) — `Set<"c:"|"v:">` + 2 режима (cities / villages-search), 32 села с поиском.
- [x] **CitySelector переведён на useUserCity** — старый local Zustand store удалён, импорт через `@/lib/use-user-city`. Все 8 cities видны в PickerSheet.
- [x] **`order-schema.ts` остался только Zod** — все локационные константы переехали в `location-config.ts`, оставлены re-export'ы для обратной совместимости.
- [x] **docs/location-system.md обновлён** до полной архитектуры (4 компонента + init-цикл + follow-up).

---

## ✅ Сделано (Sprint J — 2026-05-14 вечер, часть 1)

- [x] **`orders/new` rewrite под Vercel** — hero (eyebrow «НОВЫЙ ЗАКАЗ» + H1 «Опишите задачу — мастера отзовутся» + 3-step value-prop «Получите отклики / Посмотрите цены / Выберите подходящего» + privacy callout с Lock в единой info-card с hairline-divider), все form-labels `body-sm-strong text-ink`, selected chips чёрные Vercel-pills, единый primary CTA «Опубликовать заказ».
- [x] **`<LocationPicker>` компонент** — bottom-sheet с иерархией Вся-Ингушетия / 5 городов / 4 муниципальных района / 34 села. Trigger-pill в форме (`📍 Магас · Экажево`). Скопирован паттерн из Ingush-Business `LocationSheet`. См. `src/features/orders/LocationPicker.tsx`.
- [x] **БД миграция `0049_orders_city_optional.sql`** — `orders.city_id → NULLABLE` для заказов «Вся Ингушетия». Применена на прод. Регенерация types.
- [x] **Labels «Сроки» → «Готовность мастера взяться за работу»** — точнее по смыслу.
- [x] **`villagesByDistrict` const + helpers `findDistrictByVillage` / `isDistrict`** в `order-schema.ts` — для UI-восстановления родительского района по селу.
- [x] **CLAUDE.md новые правила:** «🚨 Никаких минимальных вариантов» + «🚨 Документация после каждой осмысленной единицы работы».

---

## ✅ Сделано (Sprint J — 2026-05-13)

Список запушенных коммитов в порядке создания. Каждый — закрытая единица работы.

- [x] `9fe0911` — quick wins: видимые скелетоны на web (NativeWind на `Animated.View` теряется), активный таб TabBar отличается цветом не opacity, нейтральный аватар User-иконка
- [x] `06c1e58` — token generator (`scripts/generate-css-tokens.mjs`) + root-cause фикс inline theme-guard в `+html.tsx` (читал неверный localStorage ключ)
- [x] `6d755fb` — Vercel DESIGN.md активирован, Geist+Geist Mono webfonts через jsdelivr, colors.ts переписан под Vercel (46 light + 46 dark токенов), tailwind.config переписан, AppText унифицирован
- [x] `bd12a29` — 7 atom-компонентов в `src/components/ui/`: Button, Input, Card, Chip, SearchBar, Avatar, BottomSheet + barrel index
- [x] `69cfefe` — главная клиента переписана: top-bar + hero + featured + top-masters + categories. AuthGate с анон-доступом в (tabs). Dark mode fix через NativeWind className (вместо JS hex)
- [x] `9b2c68e` — убран debug-код, Skeleton/Avatar переведены на className
- [x] `d779c5f` — **РАБОЧИЙ ЛОКАЛЬНЫЙ PREVIEW**: production build через `npm run web:build` + sed-патч `<script type="module">` (обход SDK 54 Hermes-transform `import.meta` bug). `web:output: "single"` для локалки. expo-notifications вынесен из top-level imports.
- [x] `1c9dc43` — master detail с нуля (Thumbtack hero+sticky CTA) + category page с нуля + LoginWall компонент + useLoginWall hook + миграция `0034_categories_is_featured` применена на прод (помечены cleaning + plumbing) + useFeaturedCategories hook + wire в главной + STATUS.md Sprint J секция
- [x] `0233e28` — hero: Pencil вместо Search-лупы, понятный value-текст, draft пробрасывается в `orders/new`
- [x] `b1f802c` — подсветить «Они не увидят ваш номер» bold + скрыть input + примеры под CTA
- [x] `df0e152` — H1: «Услуги в Ингушетии» → «Мастера для ремонта в Ингушетии»
- [x] `36a4004` — CTA: «Описать задачу» → «Написать свою задачу»
- [x] `66b9295` — упрощение hero (Lazyweb pattern): один tagline, без bold, без чипов-плашек, без примеров. Trust в одну muted-строку
- [x] `cad568e` — удалить «Бесплатно · Ответы за 30 минут» под CTA
- [x] `dba902a` — `npm run web:dev` watch+rebuild без stop/start preview (`scripts/dev-web-local.mjs`)
- [x] `b48016a` — TASKS.md как трекер задач между сессиями + CLAUDE.md обновлён указателем
- [x] **Категории фокус на ремонт**: миграция `0035_focus_repair_categories` применена на прод (11 ремонтных категорий, остальные скрыты). UI плиток получил Lucide-иконку из `categories_l2.icon` поля. Заголовок «Все категории» → «Категории ремонта» + подзаголовок.
- [x] `0a071df` — визуальный split главной (passive: hero+CTA / active: SearchBar+фильтры) + filter chips (Категория/Город/★4+/Опыт/С инструментом) + `/search` route stub. Сделано по Lazyweb-паттерну OpenTable (SearchBar + горизонтальные filter chips).
- [x] **Мульти-категории + бригада в master detail**: trust-row на карточке мастера получил бейдж `account_type` (Бригада X чел. с Users-иконкой / Компания с Building2-иконкой). Секция «Категории» chip-row → рич-Cards с category_bio + pricing_mode chip + radius. Хук `useMasterPublicProfile` расширен полями `account_type`, `team_size`. На проде главный test-мастер помечен `brigade` + team_size=4.
- [x] **Hero перестроен под TaskRabbit search-first**: H1 «Найдутся мастера», SearchBar primary («Сантехник, электрик, плитка…», тап → /search), secondary CTA «Или опишите задачу — мастера найдут вас» (variant=outline). Старый разделитель «или» + дублирующий BrowseSearchAndFilters удалены.
- [x] **Test-data заполнены на проде** (миграция `0036_seed_diverse_master_data`): 6 brigade (Иса Барахоев, Хамзат Цечоев, Бекхан Куштов, Тимур Озиев, Ислам Точиев, Магомед Тестов) + 3 company (ИП Картоев Д.Б., ООО «СтройКом» = Магомед Евлоев, ИП Балкоева Л.А.) + 10 мастеров получили 2-ю категорию (мульти-кат). Все has_tools=true, has_transport заполнен по правилу (всегда у brigade/company, у solo — по чётности id), languages = ['ru'] или ['ru','ing'] для разнообразия.
- [x] `8b820b0` — placeholder «Специалист или услуга…» + красивая outline-кнопка «Опишите задачу» с Pencil-иконкой (вместо ghost text-link) + `.claude/rules/design-quality.md` — промпт для агента (Lazyweb-first, DESIGN.md, hierarchy, spacing ≥mt-10, empty/loading/error states, no stubs, dark theme, screenshot verification, pre-commit checklist, anti-patterns).
- [x] `a25e795` — плитки категорий высота x2 меньше (aspect 1:1 → 2:1) + горизонтальный layout (icon-left/text-right) + tight типографика (icon 20, gap-2, text-body-sm) для длинных названий.

---

## ⏸ Отложено

- ⏸ **Полная переписка orders / chats / profile / onboarding под Vercel** — оставлены через compat aliases (`surface-2`, `muted`, `accent` → Vercel токены). Работают функционально, визуально не на Vercel-уровне. Переписать постепенно отдельными спринтами.
- ⏸ **Native Geist через @expo-google-fonts** — нет в каталоге. Web использует jsdelivr CDN, native использует Inter fallback. Когда сделаем EAS Build — нужно `npm install geist` + native font register.
- ⏸ **`newArchEnabled: true` совместимость с web dev-сервером** — оставлено как было (true). Локальный preview через production build обходит проблему.
- ⏸ **Hot-reload в браузере** — потребует WebSocket reload injection. Сейчас F5 руками после `web:dev` rebuild.

---

## История ключевых решений (краткая, для контекста между сессиями)

| Дата | Решение | Причина |
|---|---|---|
| 2026-05-13 | Vercel DESIGN.md вместо Cal.com | Установлено через `npx getdesign@latest add vercel`. 3 override'а под consumer-marketplace в шапке DESIGN.md. |
| 2026-05-13 | CSS-var через className (NativeWind) вместо JS hex | RN-web не резолвит `rgb(var(--x))` в inline style. Решение: атомы используют Tailwind classes → CSS-var резолвится из html.dark класса через CSS. |
| 2026-05-13 | `web.output: single` вместо `static` для локалки | SPA-режим для локального preview. Прод-деплой через `deploy/web.sh` НЕ затронут. |
| 2026-05-13 | `type="module"` patch для web bundle | Обход SDK 54 Hermes-transform `import.meta` в classic script (SyntaxError). Скрипт `scripts/build-web-local.mjs`. |
| 2026-05-13 | AuthGate анон-friendly | Клиент может смотреть каталог + карточку мастера БЕЗ логина. Just-in-time через LoginWall на действиях. |
