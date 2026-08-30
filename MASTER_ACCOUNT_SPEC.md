# MASTER_ACCOUNT_SPEC.md — Аккаунт мастера на xtrud

> Консолидированная спецификация: что входит в аккаунт мастера, какие поля обязательны, что необязательно, что в какой таблице БД лежит и какие экраны мастер видит.
>
> До этого инфа была разлита по 3 документам: `PROJECT_MAP.md` §4.3 / §5.1 / §5.2 (UI и шаги онбординга), `CATEGORIES_AND_PROFILES.md` §2 (поля профиля + dual-role), миграциям (`0001`–`0024`, `0040`+, `0043`). Этот файл — точка входа: «что вообще такое аккаунт мастера».
>
> Если правишь схему — обнови этот файл в том же коммите.
>
> **Last update 2026-05-15:** добавлены P0-1..P0-NEW (миграции 0055–0063). Главные сдвиги: единый источник цен `master_services` (с FK на l2_id/l3_id и pricing_kind), pre-defined услуги с placeholder-ценами, daily response limit 5/день, фото в чате, умный поиск (FTS+pg_trgm+thesaurus). Подробнее в [`archive/research/MASTER_ACCOUNT_PLAN.md`](archive/research/MASTER_ACCOUNT_PLAN.md) и в STATUS.md секция «2026-05-15 ночь».

---

## Архитектура цен (после P0-1, P0-2, P0-10)

**Единственный источник цен — `master_services`** (плоский прайс-лист). Поля `master_categories.pricing_mode/pricing/attributes` помечены DEPRECATED в миграции 0055 и не используются новым кодом.

**Схема `master_services`:**
- `id`, `master_id` (FK users)
- `l2_id` (FK categories_l2, NULL только для legacy до 0056)
- `l3_id` (FK categories_l3, NULL = свободная формулировка title)
- `title` (text 2-100, prepopulated из L3.name_ru при выборе из готового списка)
- `pricing_kind` enum (`fixed | range | hourly | quote`)
- `price_min` (int, NULL только для quote)
- `price_max` (int, NULL для всего кроме range)
- `unit` enum (`per_hour | per_task | per_m2 | per_day`)
- `position`, `created_at`, `updated_at`

**Format helper:** `formatServicePrice()` в [src/features/master-services/use-master-services.ts](src/features/master-services/use-master-services.ts) — единственный источник истины для отображения. По фидбеку пользователя 2026-05-15: формат «от X ₽» без диапазона; для unit=per_task suffix не отображается.

**Pricing helper в форме:** при выборе L3 показывается «✨ В среднем берут X ₽ — применить» из `categories_l3.avg_check_rub`. Заполнено для 41 популярной L3 (миграция 0058), остальные 239 — задача наполнения.

---

## Daily response limit (P0-5)

**5 откликов/день** в free-tier. Эталон Яндекс Услуги (7/день).

- Trigger `check_daily_response_limit` (миграция 0059) — блокирует INSERT в `order_responses` с error `daily_response_limit_reached` если за сутки (МСК) уже 5.
- RPC `get_response_limit_today()` → `{used, max, remaining}`.
- UI хук `useResponseLimit()` (cached 30s).
- Бейдж `<ResponseLimitBadge />` в шапке master-главной.
- В форме отклика — disabled state кнопки + сообщение «Лимит исчерпан, завтра в 00:00 (МСК)…».

В будущем — платная разблокировка (как Яндекс 199 ₽/нед безлимит). Архитектура готова — лимит 5 хардкоден в trigger и RPC, легко вынести на user_id-tier.

---

## Умный поиск услуг (P0-NEW, миграции 0062 + 0063)

Главный API: RPC `search_categories(p_query, p_limit)` — UNION 3 слоёв:

1. **Synonym** (вес 1.0) — точное/похожее с синонимом из `category_terms` (86 seed-терминов).
2. **FTS** (вес 0.7) — `categories_l2.fts_doc` / `categories_l3.fts_doc` через `to_tsvector('russian')` + `websearch_to_tsquery`. Морфология «камеры → камер» из коробки.
3. **pg_trgm fuzzy** (вес 0.5×similarity) — опечатки.

Раскладка-фикс «rfvthf → камера» — на клиенте JS через `flipLayout()` ([src/lib/keyboard-layout.ts](src/lib/keyboard-layout.ts)). Два параллельных запроса через `useSearchCategories()`. Если original=0 hits и flipped>0 → баннер «Возможно, вы искали: ...».

UI: [app/(tabs)/orders/category-select.tsx](app/(tabs)/orders/category-select.tsx) — browse-mode (пустой query) показывает все L2, search-mode (query≥2) использует RPC.

**Расширение thesaurus:** новые синонимы — прямо INSERT в `category_terms`. Структура: `(term, l2_id | l3_id, weight)`. См. миграцию 0063.

---

## TL;DR

Аккаунт мастера = **3 сущности в БД** + **6 экранов в UI**.

**В БД:**

1. **`auth.users`** — телефон/email + пароль (Supabase Auth).
2. **`public.users`** + **`public.users_private`** — общая часть с клиентом: имя, фамилия, аватар, город, район, флаги ролей (`is_master`, `is_client`, `active_role`).
3. **`public.master_profiles`** + связанные таблицы:
   - `master_categories` — до 5 L2-категорий, с прайсингом
   - `master_services` — плоский прайс-лист (до 20 услуг)
   - `portfolio_items` — фото работ
   - `reviews` — отзывы клиентов (заполняются через trigger `recalc_master_rating`)
   - `notification_tokens` — push-токены для FCM/APNs

**В UI (роль `active_role='master'`):**

1. **Главная** (`(tabs)/index.tsx` ⟶ `MasterHomeContent`) — availability switcher + ваши категории + лента подходящих заявок (по моим L2 + городу).
2. **Заказы** (`(tabs)/orders/index.tsx`) — 3 таба: «Новые» / «Я откликнулся» / «Меня выбрали».
3. **Чаты** (`(tabs)/chats/*`) — диалоги с клиентами по конкретным заказам (один чат на пару order×master).
4. **Свой публичный профиль глазами клиента** (`(tabs)/master/[id].tsx`) — то, что видит клиент.
5. **Редактирование профиля** (`(tabs)/profile/edit-master.tsx`) — bio, опыт, инструмент/транспорт, where-я-работаю (ServiceAreas — multi-select городов/районов), прайс-лист услуг.
6. **Управление категориями** (`(onboarding)/master-categories.tsx` — переиспользуется в режиме edit) — добавить/убрать L2 (max 5), для каждой выбрать pricing_mode + L3 услуги.

---

## 1. Минимальный мастер (MVP-1, 🔴)

Без этих полей мастер просто не существует — клиент не сможет его найти и понять.

### 1.1. Auth (`auth.users`)

| Поле | Где | Зачем |
|------|------|-------|
| `phone` | `auth.users.phone` | Уникальный идентификатор. Логин по нему через OTP (Sprint 2) или email-bypass (текущая заглушка для демо). |
| `email` *(только демо)* | `auth.users.email` | Бипас OTP пока phone-provider в Supabase отключён. Для прода — не нужно. |
| `encrypted_password` *(только демо)* | bcrypt от `'xtrud'` | То же. Для прода — нет. |

### 1.2. Общий профиль (`public.users`)

| Поле | Тип | Зачем |
|------|-----|-------|
| `first_name`, `last_name` | text | Видны в карточке мастера и в чате. |
| `avatar_url` | text | DiceBear `shapes` placeholder ИЛИ загруженное фото (Storage bucket `avatars/`). |
| `city_id` | text FK `cities` | Один из 8: `magas`, `nazran`, `sunzha`, `malgobek`, `karabulak`, `ordzhonikidzevskaya`, `sernovodskaya`, `nesterovskaya`. |
| `district` | text | Свободная строка (район внутри города или поселение). |
| `is_master` | bool | **Должен быть `true`**. |
| `is_client` | bool | Может быть `true` параллельно (dual-role). |
| `active_role` | enum (`'master'`/`'client'`) | Текущий режим UI. Переключается свитчером. |
| `onboarding_completed_at` | timestamptz | Маркер «прошёл визард». NULL = редирект в онбординг при логине. |

### 1.3. Профиль мастера (`public.master_profiles`)

| Поле | Тип | Default | Зачем |
|------|-----|---------|-------|
| `user_id` (PK) | uuid FK `users` | — | Связь 1-к-1 с `users`. |
| `bio` | text ≤500 chars | NULL | Свободный текст «о себе». Видим в карточке. |
| `status` | enum (`active`, `paused`, `banned`, …) | `active` | Прод-ready только если `active`. |
| `verification_level` | smallint 0–5 | 0 | См. §4 ниже. |
| `experience_years` | int 0–70 | NULL | Видим как chip «12 лет опыта» в карточке. |
| `team_size` | int 1–100 | 1 | 1 = одиночка, 2-10 = бригада, 10+ = компания. |
| `languages` | text[] | `['ru']` | Коды: `ru`, `in` (ингушский), `ce`, `en`, `ar`. |

### 1.4. Категории (`public.master_categories`)

Хотя бы **одна** L2-категория обязательна — иначе клиент не увидит мастера в каталоге.

| Поле | Тип | Зачем |
|------|-----|-------|
| `master_id` | uuid FK `master_profiles` | — |
| `l2_id` | text FK `categories_l2` | Один из 64 L2 (см. `CATEGORIES_AND_PROFILES.md` §1.3). |
| `pricing_mode` | enum (`per_hour`, `per_unit`, `negotiable`, `on_quote`) | Влияет на форму отклика и отображение в карточке. |
| `category_bio` | text ≤200 chars | Опц. короткое описание именно этой категории (приоритет над общим `bio`). |

**Лимит:** 5 L2-категорий на мастера (trigger `check_master_categories_limit`).

---

## 2. Полноценный мастер (Phase-2, 🟡)

Делает аккаунт «обжитым» и заметным в выдаче.

### 2.1. Профиль (`master_profiles`)

| Поле | Зачем |
|------|-------|
| `has_tools` (bool) | Бейдж «Со своим инструментом» в карточке. |
| `has_transport` (bool) | Бейдж «На машине». |
| `work_schedule` (jsonb) | `{mon:[9,18], tue:[9,18], …, sun:null}`. Влияет на бейдж «Доступен сегодня». |
| `tax_status` (enum) | `individual` / `self_employed` / `individual_entrepreneur` / `legal_entity`. Бейдж «Самозанятый». |
| `inn` (text 10/12 chars) | Для verification_level ⭐⭐⭐. |
| `home_clients_policy` (enum) | `anytime` / `with_male_present` / `women_only`. Только для деликатных категорий (бьюти, массаж, медуслуги). |

### 2.2. Услуги-прайс (`master_services`)

Плоский список **до 20 услуг** в формате «название — диапазон цены — единица». Видим в карточке как сворачиваемый блок «Услуги и цены».

| Поле | Тип | Пример |
|------|-----|--------|
| `title` | text 2-100 | «Замена смесителя» |
| `price_min` | int | `1500` |
| `price_max` | int (nullable) | `3000` (NULL = «от X») |
| `unit` | enum | `per_task` (default) / `per_hour` / `per_m2` / `per_day` |
| `position` | int | Для будущей drag-сортировки. |

### 2.3. Портфолио (`portfolio_items`)

Минимум 3 фото = карточка ощущается «обжитой». До 30 фото без жёсткого лимита (Storage квоту контролируем отдельно).

| Поле | Зачем |
|------|-------|
| `url` | Публичный URL (Supabase Storage `portfolio/`, либо внешний placeholder `picsum.photos`). |
| `caption` | text (до 200) — описание работы. |
| `sort_order` | int — позиция в галерее. |

### 2.4. Активность

| Источник | Что даёт |
|----------|----------|
| `master_categories.closed_deals` | Счётчик «X закрытых заказов». Инкрементируется trigger'ом при `orders.status='completed'`. |
| `master_profiles.rating_overall_avg/count` | Авто-рассчитывается trigger'ом `recalc_master_rating` по `reviews.direction='client_to_master'`. |
| `availability_status` (enum, миграция 0043) | `online` / `busy` / `offline` — мастер сам управляет через AvailabilitySwitcher на главной. |

---

## 3. Premium / будущее (Phase-3, 🟢)

| Поле / фича | Зачем |
|-------------|-------|
| Видео-визитка ≤60 сек | Доверие, особенно для бьюти/медуслуг. |
| Социальные ссылки (TG/IG/VK) | Импорт портфолио. |
| Поручительства от других пользователей | См. `PROJECT_MAP.md` §5.8 — социальный граф. |
| Шаблоны ответов (templated replies) | Ускоряет отклики на типовые заявки. |
| Личный мини-сайт `xtrud.ru/m/<slug>` | Для шеринга в WhatsApp/Instagram. |
| CRM-лайт (заметки по клиентам) | Учёт повторных клиентов. |
| Калькулятор по категории | Например для электрики или плитки. |

---

## 4. Уровни верификации (`verification_level`)

| Уровень | Иконка | Что нужно | Trigger в БД |
|---------|--------|-----------|--------------|
| 0 | — | Только зарегистрировался | default |
| 1 ⭐ | Базовая | Подтверждённый телефон | OTP пройден |
| 2 ⭐⭐ | Личность | Паспорт + selfie + ручная модерация | manual update от admin |
| 3 ⭐⭐⭐ | Статус | ИНН самозанятого / ИП (в идеале — проверка через ФНС API) | manual update / ФНС-провайдер (TBD) |
| 4 ⭐⭐⭐⭐ | Квалификация | Диплом / сертификат / лицензия (для электрики, газа, медицины) | manual update от admin |
| 5 ⭐⭐⭐⭐⭐ | Топ-мастер | ≥10 закрытых сделок + рейтинг ≥4.7 + 0 жалоб за 6 мес | автоматически (TBD: cron-job) |

**Текущее состояние:** уровни 1–3 ставятся вручную (нет UI для админа); уровни 4–5 пока не реализованы.

---

## 5. Шаги онбординга мастера

См. `PROJECT_MAP.md` §5.1 для полного списка из 19 шагов. **Минимально для запуска:**

1. Телефон + OTP
2. Имя + фамилия
3. Аватар (или skip)
4. Город + район
5. Выбор L2-категорий (1-5)
6. Внутри каждой L2 — выбор L3 + `pricing_mode`
7. (Опц.) Bio, опыт, has_tools, has_transport

После шагов 1-5 мастер уже виден в каталоге. Остальное — «прокачка профиля».

**Реальный код в репо:**
- `app/(auth)/phone.tsx`, `app/(auth)/verify.tsx` — авторизация
- `app/(onboarding)/welcome.tsx`, `name.tsx`, `city.tsx`, `role.tsx` — общие шаги
- `app/(onboarding)/master-photo.tsx`, `master-profile.tsx`, `master-categories.tsx` — мастер-специфичные
- RPC `complete_master_onboarding` (миграция 0006) — атомарно завершает онбординг и заполняет flag'и

---

## 6. Что мастер видит в UI

### 6.1. Главная (`MasterHomeContent`)

- **AvailabilitySwitcher** — переключатель «Принимаю заказы / Занят / Недоступен»
- **SafetyBanner** — напоминание не делиться личными данными
- **Ваши категории** — chip-list, кнопка «Редактировать (N/5)»
- **Лента заявок** — заявки в статусе `open` по моим L2 + моему городу (для now: empty-state, лента появляется во вкладке «Заказы → Новые»)

### 6.2. Заказы (3 таба)

| Таб | Что внутри |
|-----|------------|
| **Новые** | `orders` где `status='open'` AND `l2_id IN (мои)` AND `city_id = мой` (или null = «Вся Ингушетия»). Тап → детали → форма отклика (цена + срок + сообщение). |
| **Я откликнулся** | `order_responses` где `master_id = я`. Видны статусы: `sent`, `viewed`, `rejected`, `withdrawn`. |
| **Меня выбрали** | `orders` где `picked_master_id = я` AND `status IN ('in_progress','completed')`. Тут же CTA «Работа выполнена» (RPC `confirm_work_done`, миграция 0041). |

### 6.3. Чаты (`(tabs)/chats/*`)

- Список диалогов (отсортирован по `last_message_at`).
- В чате: bubbles с аватарами, дата-сепараторы, поле ввода, кнопка «Я выполнил работу».
- Один чат на пару (order × master). Multi-chat per order — только для клиента (миграция 0051).

### 6.4. Свой публичный профиль глазами клиента (`(tabs)/master/[id].tsx`)

Стандартный master-detail. См. `app/(tabs)/master/[id].tsx`. На своём профиле sticky-CTA «Написать в чат» не показывается, вместо неё — переход в `edit-master`.

### 6.5. Редактирование (`profile/edit-master.tsx`)

Поля формы: имя, фамилия, город, район, bio, experience_years, has_tools, has_transport. Прайс-лист услуг — отдельная секция `MasterServicesSection` (CRUD inline). «Где работает» — `ServiceAreasSection` (multi-select городов/районов из `master_service_areas`, заменила радиус выезда 2026-05-15).

---

## 7. Как создать мастера руками (для тестов / демо)

См. реальный пример в `supabase/seed-test/demo-fixture.sql` (главный мастер Магомед Тестов, ID `f0000002-…0002`) и `supabase/migrations/0054_personal_demo_master.sql` (полнее: с прайс-листом, отзывами, активными заказами).

Минимальный `INSERT`-шаблон:

```sql
-- 1. auth (см. демо-фикстуру для деталей про token-поля)
INSERT INTO auth.users (id, phone, email, encrypted_password, ...) VALUES (...);
INSERT INTO auth.identities (...) VALUES (...);

-- 2. profile flags
UPDATE public.users SET
  first_name = '...', last_name = '...', avatar_url = '...',
  city_id = '...', district = '...',
  is_master = true, is_client = true, active_role = 'master',
  onboarding_completed_at = now()
WHERE id = '...';

-- 3. master_profiles (минимум: bio, status, verification_level)
INSERT INTO public.master_profiles (user_id, bio, status, verification_level, experience_years, ...)
VALUES (...);

-- 4. master_categories (минимум 1, максимум 5)
INSERT INTO public.master_categories (master_id, l2_id, pricing_mode, category_bio) VALUES (...);

-- 5. (опц.) master_services — прайс-лист
INSERT INTO public.master_services (master_id, title, price_min, price_max, unit) VALUES (...);

-- 6. (опц.) portfolio_items — фото
INSERT INTO public.portfolio_items (master_id, url, caption, sort_order) VALUES (...);
```

**Демо-логин для аккаунта `+79000…`:** `<digits>@xtrud-demo.local` + пароль `xtrud`.

---

## 8. Связанные документы

| Документ | Что покрывает |
|----------|---------------|
| `PROJECT_MAP.md` §4.3 | Список экранов мастера |
| `PROJECT_MAP.md` §5.1 | Полные 19 шагов онбординга |
| `PROJECT_MAP.md` §5.2 | Бейджи и иерархия верификации |
| `CATEGORIES_AND_PROFILES.md` §1 | Дерево категорий L1/L2/L3 |
| `CATEGORIES_AND_PROFILES.md` §2 | Поля профиля и dual-role архитектура |
| `DEMO_ACCOUNTS.md` | Готовые тестовые аккаунты для preview |
| `supabase/migrations/0001_init.sql` | `users`, `users_private` |
| `supabase/migrations/0004_master_profile_fields.sql` | `master_profiles` поля |
| `supabase/migrations/0007_master_categories.sql` | `master_categories` |
| `supabase/migrations/0024_master_services.sql` | `master_services` (прайс) |
| `supabase/migrations/0040_get_master_phone_rpc.sql` | RPC для контактов |
| `supabase/migrations/0041_confirm_work_done.sql` | Завершение работы мастером |
| `supabase/migrations/0043_availability_status.sql` | Online/busy/offline |
