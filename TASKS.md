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

_пусто_

---

## 🟡 Открытые (бэклог текущей сессии Sprint J)

_Все открытые задачи которые подняли но не закрыли — здесь. Они забираются в работу первыми._

- [ ] Перенести «Примеры» («Починить кондиционер», «Нужен плиточник…») как placeholder поля description в `app/(tabs)/orders/new.tsx`
- [ ] LoginWall: подключить к действиям — отправка сообщения в чате (`chats/[id].tsx`), оставление отзыва, создание заказа (`orders/new.tsx` финальный submit)
- [ ] Hot-reload в браузере (WebSocket auto-reload injection) — сейчас F5 руками
- [ ] Прод-деплой на `alanbani.ru/xtrud/` через `deploy/web.sh` — проверить что не сломался после изменений в `_layout.tsx` + `app.json` (`web.output: single` vs `static`)

---

## 📋 Бэклог продукта (из STATUS.md + AUDIT_2026-05-12.md)

### 🔴 Критично для launch
- [ ] **Real OTP** — выбрать SMS-провайдер (Exolve / smsc.ru / SMS Aero) + подключение через Supabase Auth
- [ ] **Master verification UI** — пошаговый экран с паспортом + опытом + бейджи. Поле `verification_level` в БД есть.
- [ ] **Master services CRUD UI** — таблица `master_services` есть, UI add/edit/delete нет
- [ ] **Welcome onboarding slides** — 3-5 страниц до phone-экрана
- [ ] **Vercel migration для web** — заменить deploy/web.sh + alanbani.ru на vercel-домен (пользователь сказал «пока не мигрируем»)

### 🟡 Важно (UI редизайн под Vercel)
- [ ] Orders list (`(tabs)/orders/index.tsx`) — сейчас работает через compat aliases, нужен Vercel-rewrite
- [ ] Orders new (`(tabs)/orders/new.tsx`) — wizard выглядит ОК но не Vercel-styled, плюс нужен LoginWall на финальный submit
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
