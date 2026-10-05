# Модель места: район → город | село (2026-10)

> Роль: xtrud-backend. Статус: **черновик для ревью** (`xtrud-security` →
> `xtrud-reviewer`). Ничего не применено. UX выбора места — отдельный документ
> дизайнера `docs/LOCATION_PICKER_REDESIGN_2026-10.md`; здесь только данные,
> совпадения, миграция и совместимость.

## 0. Задача владельца (DECISION, 2026-10-03)

«Район должен включать свой город (Назрановский → Назрань, Сунженский → Сунжа),
а не вычёркивать. Орджоникидзевская, Серноводская, Нестеровская — убрать из
городов, это сёла района. Тап по району — список сёл: конкретное село или весь
район».

## 1. Живое состояние (FACT, read-only, 2026-10-03)

Источник: `ssh root@217.114.8.196 "docker exec -i supabase-db psql -U postgres"`,
только определения и агрегаты; номера, имена, тексты и адреса не читались
(`address` — только `count`). PostgreSQL 17.6.

### 1.1. Таблицы и колонки места

| Объект | Определение |
|---|---|
| `public.cities` | `id text PK, name text, region text default 'Ingushetia', is_active bool default true, sort_order int, created_at`. RLS вкл., политика `cities_read_active` (SELECT, `is_active = true`). Гранты: anon SELECT; authenticated SELECT/INSERT/UPDATE/DELETE на уровне таблицы (запись закрыта только отсутствием политик — см. §8, вопрос к security) |
| строки `cities` | `nazran-magas` (0), `magas` (1), `nazran` (2), `sunzha` (3), `malgobek` (4), `karabulak` (5), `ordzhonikidzevskaya` (6), `sernovodskaya` (7), `nesterovskaya` (8); все `is_active = true` |
| `public.district_cities` (0192) | `district_id text, district_name text, city_id text FK→cities ON DELETE CASCADE`, PK `(district_id, city_id)`. RLS вкл., чтение всем. Строки: nazranovsky → nazran-magas, nazran, magas; malgobeksky → malgobek; sunzhensky → sunzha, ordzhonikidzevskaya, sernovodskaya, nesterovskaya. **Джейрахского района в таблице нет** (у него нет городов) |
| `public.orders` | `city_id text NULL FK→cities ON DELETE RESTRICT`, `district text NULL CHECK length ≤ 60`, `address text NULL CHECK length ≤ 120`. Индексы `orders_city_id_idx`, `orders_open_city_created_id_idx`, `orders_open_district_created_id_idx` (оба partial `status='open'`). Гранты: anon — SELECT на таблицу; authenticated — SELECT/DELETE на таблицу, INSERT/UPDATE **поколоночно** (есть для city_id, district, address) |
| `public.users` | `city_id text NULL FK→cities` (без ON DELETE), `district text NULL`. Индекс `users_city_id_idx` partial |
| `public.master_service_areas` | `id uuid, master_id uuid FK→master_profiles CASCADE, kind master_area_kind, location_id text CHECK 1..50, created_at`. UNIQUE `(master_id, kind, location_id)`. Политики: read_all, insert_own, delete_own |
| enum `master_area_kind` | `city, district` (других значений нет) |

**Где сейчас хранится село: нигде.** Колонки `village` нет ни в одной таблице.
Клиент (`validateOrderPublishLocation`) допускает имя села в `orders.district`
(`isVillageName`), но живых таких записей 0 (см. 1.2). Город и район в задании
взаимоисключающие: город → `city_id`, район → `district` русским именем,
«Вся Ингушетия» → оба NULL.

### 1.2. Агрегаты

Задания (`orders`, всего 19):

| city_id | district | статус | шт. |
|---|---|---|---|
| NULL | NULL | open 2, completed 4, expired 2 | 8 |
| NULL | Назрановский район | open | 2 |
| NULL | Сунженский район | open 1, cancelled 1 | 2 |
| karabulak | NULL | open | 1 |
| malgobek | NULL | open 1, expired 1 | 2 |
| nazran-magas | NULL | open 1, completed 1 | 2 |
| **sernovodskaya** | NULL | **completed** | **1** |
| ordzhonikidzevskaya / nesterovskaya | — | — | **0** |

- Заданий, у которых в `district` записано имя села, — 0; с прочим текстом — 0.
  Заданий с городом и районом одновременно — 0.
- Пользователи (`users`, 14): у **всех** `city_id IS NULL` и `district IS NULL`.
- Зоны специалистов (`master_service_areas`): 4 строки у 2 из 12 специалистов,
  все `kind='city'`: karabulak, malgobek, nazran-magas, **ordzhonikidzevskaya
  (1)**. Зон `district` — 0.
- `order_broadcast_queue` — 0 строк; cron `order_broadcasts` каждую минуту
  вызывает `process_order_broadcast_queue(20)`.

### 1.3. Код в базе, который читает место

`pg_proc.prosrc ILIKE` по `city_id|district|master_service_areas|cities`
в схемах public, xtrud_api, xtrud_private и прочих несистемных:

| Функция | Что делает с местом |
|---|---|
| `area_covers_place(kind, location_id, city_id, district)` | совпадение зоны специалиста с местом задания через `district_cities`. Гранты: PUBLIC, authenticated EXECUTE |
| `process_order_broadcast_queue(int)` SECURITY DEFINER | рассылка «Новая заявка»: зон нет → вся Ингушетия, иначе `area_covers_place(msa.kind, msa.location_id, order.city_id, order.district)`; живое тело включает `extra_l2_ids` (0195) |
| `search_masters(p_query, p_l2_id, p_city_id, p_hide_demo, p_limit, p_offset, p_l1_id, p_sort)` SECURITY DEFINER | фильтр: `u.city_id = p_city_id` ИЛИ зон нет ИЛИ `area_covers_place(..., p_city_id, NULL)`; возвращает `city_id, city_name, district`. Гранты: PUBLIC, anon, authenticated |
| `set_master_service_areas(p_cities text[], p_districts text[])` SECURITY DEFINER | удаляет все зоны мастера и вставляет заново, **значения не проверяет** |
| `complete_master_onboarding(..., p_city_id, p_district, ...)` | пишет `users.city_id` (пусто — не трогает) и `users.district` |
| `confirm_work_done(...)` SECURITY DEFINER | создаёт задание `ad_hoc_completion`: `city_id = users.city_id`, иначе первый активный город по `sort_order` (`nazran-magas`) |
| `admin_user_card(uuid)` | отдаёт `u.city_id`, `u.district` |
| `delete_my_account()` | обнуляет `users.city_id/district`, удаляет зоны |
| триггер `orders_author_active_guard` | `guard_content_author_active('title','description','photo_urls','contact_name','l2_id','city_id','district')` — ограниченный пользователь не может менять эти колонки |

Представлений и материализованных представлений, читающих место, нет.
Триггеров на `cities`, `district_cities`, `master_service_areas` нет.

### 1.4. Код в клиенте (FACT, репозиторий)

- `src/lib/location-config.ts`: `MAJOR_CITIES`/`PICKER_CITIES` содержат три
  «села» как города; `CITY_IDS_BY_DISTRICT_ID.sunzhensky = [sunzha,
  ordzhonikidzevskaya, sernovodskaya, nesterovskaya]`; `DISTRICTS[].villages`
  — сёла по русским именам (в Сунженском нет Серноводской и Нестеровской).
- Лента `src/features/orders/use-all-open-orders.ts`: город C →
  `or(city_id.eq.C, district.eq."район(C)")`; район D →
  `or(district.eq."D", city_id.in.(города D))`. Задания «Вся Ингушетия» (оба
  NULL) в отфильтрованную ленту **не попадают**; пара `nazran-magas` не
  раскрывается в legacy `nazran`/`magas`.
- Фасеты `open-order-facets.ts` — то же правило в памяти.
- Публикация: `where.tsx` берёт `PICKER_CITIES` (вшито в сборку) и `DISTRICTS`;
  `validateOrderPublishLocation` перед вставкой проверяет город запросом
  `cities ... eq('is_active', true)`.
- Зоны специалиста: `ServiceAreasSection.tsx` берёт `PICKER_CITIES` + `DISTRICTS`,
  читает только `kind === 'city' | 'district'` и при сохранении шлёт полный
  список через `set_master_service_areas` (неизвестные зоны **будут стёрты**).
- Карточка задания `OrderRow.tsx`: подпись `[cityName, district].join(' · ')`.
- `useCities` — активные города из БД минус `HIDDEN_PICKER_CITY_IDS`.

### 1.5. Внешние факты о географии (FACT из открытых источников, не первичных)

- **Сунжа — это бывшая Орджоникидзевская.** ПГТ Орджоникидзевская переименован
  в Сунжу 3.02.2016, 25.11.2016 стал городом и городским округом
  ([Википедия: Сунжа (город)](https://ru.wikipedia.org/wiki/%D0%A1%D1%83%D0%BD%D0%B6%D0%B0_(%D0%B3%D0%BE%D1%80%D0%BE%D0%B4)),
  [bankgorodov.ru](https://bankgorodov.ru/place/ordjonikidzevskaya)).
  Значит `ordzhonikidzevskaya` — не село, а **старое имя `sunzha`**.
- **Серноводское (бывш. станица Серноводская) — в Чеченской Республике**
  (Серноводский, до 2019 — Сунженский район ЧР), а не в Ингушетии
  ([Википедия: Серноводский район](https://ru.wikipedia.org/wiki/%D0%A1%D0%B5%D1%80%D0%BD%D0%BE%D0%B2%D0%BE%D0%B4%D1%81%D0%BA%D0%B8%D0%B9_%D1%80%D0%B0%D0%B9%D0%BE%D0%BD)).
- Нестеровская — станица Сунженского района Ингушетии.
- Юридически Назрань, Магас, Карабулак, Малгобек и Сунжа — городские округа вне
  районов; это общеизвестно, но первичным источником (ОКТМО) здесь **не
  проверено**. Продуктовое правило задаёт владелец (DECISION 2026-09-12 и
  2026-10-03: город входит в свой район; Карабулак — отдельно).

**Вопросы владельцу, без которых данные трёх записей мигрировать нельзя:**

1. Орджоникидзевская: слить в город Сунжа (рекомендую, это один населённый
   пункт) или завести селом? Если селом — получим дубль Сунжи.
2. Серноводская: селом Сунженского района Ингушетии (как просит владелец) или
   убрать вовсе, раз это населённый пункт Чечни? У неё 1 завершённое задание.
   Рекомендую: селом Сунженского района (не теряем историческое задание и
   выбор людей), но решение — владельца.

## 2. Целевая модель

### 2.1. Уровни

```
Вся Ингушетия
├── Назрановский район  ── город Назрань · Магас (+ legacy nazran, magas) ── сёла
├── Сунженский район    ── город Сунжа (+ legacy ordzhonikidzevskaya*)     ── сёла (+ Нестеровская, Серноводская*)
├── Малгобекский район  ── город Малгобек                                   ── сёла
├── Джейрахский район   ── (городов нет)                                    ── сёла
└── Карабулак           ── городской округ вне районов (выбирается как город)
```
`*` — по ответу владельца на вопросы §1.5.

Выбор места задания — ровно одно из:

| Выбор | `city_id` | `district` | `village` (новая) |
|---|---|---|---|
| Вся Ингушетия | NULL | NULL | NULL |
| Город (вкл. Карабулак) | id города | NULL | NULL |
| Весь район | NULL | имя района | NULL |
| Село | NULL | имя района | имя села |

`district` остаётся **русским именем района** — так его читают и фильтруют все
выпущенные сборки. Город и район остаются взаимоисключающими, как сейчас:
район города выводится из `district_cities`, а не дублируется в строке (иначе
старые сборки покажут «Сунжа · Сунженский район»).

### 2.2. Правило совпадения — «области пересекаются»

Фильтр (лента, фасеты, поиск специалистов) или зона специалиста F совпадает с
местом задания O, если их области пересекаются. Перед сравнением id городов
канонизируются: `nazran`, `magas` → `nazran-magas`; legacy-«сёла» → своё место
по таблице `legacy_city_places`.

| F \ O | Вся РИ | Город C' | Весь район D' | Село (D', V') |
|---|---|---|---|---|
| **Вся РИ** (или зон нет) | да | да | да | да |
| **Город C** | **см. Q3** | C' = C | D' = район(C) | нет |
| **Район D** | **см. Q3** | район(C') = D | D' = D | D' = D |
| **Село (D, V)** | **см. Q3** | нет | D' = D | D' = D и V' = V |

- «Район включает свои города и сёла»: строка «Район D».
- «Село совпадает с районом и с самим селом»: строка «Село» и столбец «Село».
- «Специалист "Вся Ингушетия" видит всё»: зон нет → да (как сейчас).
- Город и село одного района **не** совпадают: задание в Алхасты не уходит
  специалисту «только Сунжа», и наоборот.

**Q3 (решение владельца).** Сейчас задание «Вся Ингушетия» **не** попадает ни в
ленту с фильтром по месту, ни в рассылку специалистам с зонами. По правилу
пересечения оно должно совпадать со всем. Рекомендую «да» (иначе специалист с
зоной не узнаёт о заданиях на всю республику), но это меняет текущее поведение
рассылки — нужен ответ. В черновике SQL это одна строка с пометкой `Q3`.

### 2.3. Варианты хранения (≥ 2, с ценой)

**Вариант A — рекомендую.** `orders.village text` + справочники `districts`,
`district_villages`, `legacy_city_places`; нормализующий триггер на `orders`;
одна функция совпадения `place_matches(...)`.

- Цена: одна колонка, три маленькие таблицы, один триггер, правка двух функций
  (рассылка, поиск). Клиент — правки в ~20 файлах (§4).
- Совместимость: старые сборки продолжают писать/читать `city_id` и `district`
  без изменений; новое — только добавлено.
- Минус: справочник сёл дублирован (клиентский `DISTRICTS` + таблица); новое
  село требует миграции и сборки (сейчас — только сборки). FK
  `(district, village) → district_villages` защищает от мусора.

**Вариант B.** Единая таблица `places(id, kind 'district'|'city'|'village',
parent_id, name, sort_order, is_active)` + `orders.place_id FK`, а `city_id` и
`district` становятся производными legacy-колонками, синхронизируемыми
двусторонним триггером (старый клиент пишет `city_id/district` → вычисляем
`place_id`; новый пишет `place_id` → заполняем `city_id/district` для старых
читателей).

- Цена: двусторонняя синхронизация с неоднозначностями (старый клиент меняет
  `district`, а `place_id` указывает на село — что главнее?), больше тестов,
  клиент переводится на загрузку справочника из БД, белый список
  `server/src/rest/routes.ts`, правка `users`, `master_service_areas`
  (`location_id` → `place_id`).
- Плюс: админ сможет добавлять места без сборки; одна FK вместо трёх полей.
- Вывод: преждевременно при 19 заданиях и 4 районах. Вариант A не закрывает B:
  `districts` + `district_villages` + `cities` и есть `places`, разложенный
  по уровням; переход на B позже — отдельная задача.

**Вариант C — отвергнут.** Писать село в `orders.district` (`district =
'Алхасты'`) без изменений схемы. Старые сборки фильтруют район как
`district.eq."Сунженский район"` и такие задания **потеряют**; смысл колонки
станет двойным. Ломает обратную совместимость — неприемлемо.

### 2.4. Пользователи и зоны специалистов

- `users.city_id/district`: живых значений нет (0 из 14), онбординг больше не
  спрашивает город. `users.village` **не добавляю** (лишняя функция, §1.1
  design-quality). Legacy-id в `users.city_id` канонизируются при чтении в
  `place_matches` и в клиенте по `LEGACY_CITY_PLACES`.
- Зоны специалиста (`master_service_areas`): этап 1 — города и районы, как
  сейчас; район покрывает свои города и сёла (это и есть просьба владельца).
  Legacy-зону `city:sernovodskaya|nesterovskaya`, присланную старой сборкой,
  **не переписываем**, а канонизируем при сравнении (старая сборка продолжит
  видеть свой выбранный чип). Нужны ли **сёла как зоны** («работаю только в
  Экажево») — UNKNOWN / решение владельца и дизайнера; если да — этап 2:
  `ALTER TYPE master_area_kind ADD VALUE 'village'` отдельной транзакцией
  (новое значение нельзя использовать в той же транзакции) + `p_villages` в
  `set_master_service_areas`. Риск этапа 2: старая сборка при сохранении зон
  сотрёт village-зоны (она шлёт только city/district) — принять или включать
  после ухода старых сборок.

### 2.5. Обратная совместимость со сборками в App Store / TestFlight

| Поток старой сборки | Что будет после этапа 1 | Итог |
|---|---|---|
| Лента без фильтра | новые задания видны; у задания в селе подпись «Сунженский район» без села | работает, подпись беднее |
| Лента, фильтр «район» | `district.eq` находит и «весь район», и сёла района | совпадает с новым правилом |
| Лента, фильтр «город» | `or(city_id.eq.C, district.eq.район(C))` захватит и задания в сёлах района | лишнее показывается, ничего не теряется |
| Лента, фильтр по одному из 3 legacy-«городов» | `city_id.eq.sernovodskaya` больше не находит (id переписан), но `district.eq.Сунженский район` находит | работает через район |
| Публикация с выбором legacy-«города» | `cities.is_active` остаётся `true` → проверка проходит; триггер переписывает в Сунжа / село | работает |
| Публикация «район» | без изменений | работает |
| Правка задания в селе старой сборкой | форма видит район; при смене места триггер очищает `village` (§3, шаг 4) | целостно |
| Зоны специалиста | шлёт city/district как раньше; legacy-id канонизируются при сравнении | работает |
| `search_masters` с прежними аргументами | новые параметры с DEFAULT, вызов по именам не меняется | работает |
| Чтение `select=*` | `orders`: anon/authenticated имеют SELECT на таблицу — новая колонка видна, ошибки нет | работает |

**Чего не делать на этапе 1:** `is_active = false` у трёх legacy-строк `cities`
(старые сборки перестанут публиковать с этим выбором: lookup вернёт null) и
`DELETE FROM cities` (FK `orders` RESTRICT, а `district_cities` удалится
каскадом). Это этап 4, после ухода старых сборок.

## 3. План миграции (черновик, НЕ применять)

Файл будущей миграции: `supabase/migration-drafts/0212_location_villages.sql`
(последний черновик сейчас — 0211). Перед применением — шаги skill
`xtrud-db-migration`: живые тела функций заново (`pg_get_functiondef`),
`pg_dump -n public -n xtrud_api -Fc > /opt/xtrud/backups/pre-0212-<ts>.dump`,
прогон внутри `BEGIN … ROLLBACK` под ролями authenticated/anon, ревью
`xtrud-security`. Имена сёл в INSERT ниже — копия `DISTRICTS` из
`location-config.ts`; списки сёл сами по себе в первичном источнике не сверялись
(UNKNOWN, вне задачи).

```sql
-- 0212 — село как уровень места; три «города»-села перестают быть городами.
-- DECISION владельца 2026-10-03 (см. docs/LOCATION_MODEL_2026-10.md).
-- Было: место задания = город (city_id) | район (district) | вся РИ.
-- Стало: + село (district = район, village = село); legacy city_id
--        ordzhonikidzevskaya → sunzha, sernovodskaya/nesterovskaya → село.
BEGIN;

-- 1. Районы — единый справочник (в district_cities нет Джейрахского,
--    поэтому зона «Джейрахский район» сейчас не совпадает ни с чем).
CREATE TABLE public.districts (
  id         text PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  sort_order int  NOT NULL DEFAULT 0
);
INSERT INTO public.districts (id, name, sort_order) VALUES
  ('nazranovsky',  'Назрановский район', 1),
  ('sunzhensky',   'Сунженский район',   2),
  ('malgobeksky',  'Малгобекский район', 3),
  ('dzheirakhsky', 'Джейрахский район',  4);

-- 2. Сёла.
CREATE TABLE public.district_villages (
  district_id   text NOT NULL REFERENCES public.districts(id),
  district_name text NOT NULL,
  village_name  text NOT NULL CHECK (length(village_name) BETWEEN 1 AND 60),
  sort_order    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (district_id, village_name),
  UNIQUE (district_name, village_name),
  UNIQUE (village_name),
  FOREIGN KEY (district_name) REFERENCES public.districts(name) ON UPDATE CASCADE
);
INSERT INTO public.district_villages (district_id, district_name, village_name) VALUES
  ('nazranovsky','Назрановский район','Экажево'), ('nazranovsky','Назрановский район','Яндаре'),
  ('nazranovsky','Назрановский район','Плиево'), ('nazranovsky','Назрановский район','Сурхахи'),
  ('nazranovsky','Назрановский район','Кантышево'), ('nazranovsky','Назрановский район','Долаково'),
  ('nazranovsky','Назрановский район','Барсуки'), ('nazranovsky','Назрановский район','Альтиево'),
  ('nazranovsky','Назрановский район','Гамурзиево'), ('nazranovsky','Назрановский район','Али-Юрт'),
  ('sunzhensky','Сунженский район','Алхасты'), ('sunzhensky','Сунженский район','Аршты'),
  ('sunzhensky','Сунженский район','Берд-Юрт'), ('sunzhensky','Сунженский район','Галашки'),
  ('sunzhensky','Сунженский район','Даттых'), ('sunzhensky','Сунженский район','Чемульга'),
  ('sunzhensky','Сунженский район','Нестеровская'),
  ('sunzhensky','Сунженский район','Серноводская'),          -- Q2 владельца
  ('malgobeksky','Малгобекский район','Зязиков-Юрт'), ('malgobeksky','Малгобекский район','Инарки'),
  ('malgobeksky','Малгобекский район','Сагопши'), ('malgobeksky','Малгобекский район','Пседах'),
  ('malgobeksky','Малгобекский район','Верхние Ачалуки'), ('malgobeksky','Малгобекский район','Средние Ачалуки'),
  ('malgobeksky','Малгобекский район','Нижние Ачалуки'), ('malgobeksky','Малгобекский район','Аки-Юрт'),
  ('dzheirakhsky','Джейрахский район','Джейрах'), ('dzheirakhsky','Джейрахский район','Ляжги'),
  ('dzheirakhsky','Джейрахский район','Армхи'), ('dzheirakhsky','Джейрахский район','Ольгети'),
  ('dzheirakhsky','Джейрахский район','Гули'), ('dzheirakhsky','Джейрахский район','Бейни'),
  ('dzheirakhsky','Джейрахский район','Эгикал'), ('dzheirakhsky','Джейрахский район','Тарш');

-- 3. Что значат устаревшие id городов. Строки cities НЕ удаляются и НЕ
--    выключаются: их выбирают и проверяют выпущенные сборки.
CREATE TABLE public.legacy_city_places (
  city_id        text PRIMARY KEY REFERENCES public.cities(id) ON DELETE RESTRICT,
  target_city_id text REFERENCES public.cities(id),
  district_name  text,
  village_name   text,
  CHECK ((target_city_id IS NOT NULL) <> (village_name IS NOT NULL)),
  FOREIGN KEY (district_name, village_name)
    REFERENCES public.district_villages(district_name, village_name)
);
INSERT INTO public.legacy_city_places VALUES
  ('ordzhonikidzevskaya', 'sunzha', NULL, NULL),                          -- Q1 владельца
  ('sernovodskaya',  NULL, 'Сунженский район', 'Серноводская'),           -- Q2 владельца
  ('nesterovskaya',  NULL, 'Сунженский район', 'Нестеровская');

-- Район включает только свой город; legacy-«сёла» уходят из district_cities.
DELETE FROM public.district_cities
 WHERE city_id IN ('ordzhonikidzevskaya','sernovodskaya','nesterovskaya');

-- Справочники: читать всем, писать никому из API.
ALTER TABLE public.districts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_villages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_city_places ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.districts, public.district_villages, public.legacy_city_places
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.districts, public.district_villages, public.legacy_city_places
  TO anon, authenticated;
CREATE POLICY districts_read_all          ON public.districts          FOR SELECT USING (true);
CREATE POLICY district_villages_read_all  ON public.district_villages  FOR SELECT USING (true);
CREATE POLICY legacy_city_places_read_all ON public.legacy_city_places FOR SELECT USING (true);

-- 4. Колонка села у задания + целостность.
ALTER TABLE public.orders
  ADD COLUMN village text CHECK (village IS NULL OR length(village) <= 60);
ALTER TABLE public.orders
  ADD CONSTRAINT orders_village_needs_district
  CHECK (village IS NULL OR (district IS NOT NULL AND city_id IS NULL));
ALTER TABLE public.orders
  ADD CONSTRAINT orders_village_in_district
  FOREIGN KEY (district, village)
  REFERENCES public.district_villages(district_name, village_name);
  -- MATCH SIMPLE: при village IS NULL не проверяется — старые строки валидны.
GRANT INSERT (village), UPDATE (village) ON public.orders TO authenticated;

-- 5. Нормализация места на любой записи (старая сборка ничего не знает
--    о селе — сервер приводит её запись к новой модели).
CREATE OR REPLACE FUNCTION public.orders_normalize_place()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_legacy public.legacy_city_places%ROWTYPE;
  v_district text;
BEGIN
  -- a) устаревший id города от старой сборки
  IF NEW.city_id IS NOT NULL THEN
    SELECT * INTO v_legacy FROM public.legacy_city_places WHERE city_id = NEW.city_id;
    IF FOUND THEN
      IF v_legacy.target_city_id IS NOT NULL THEN
        NEW.city_id := v_legacy.target_city_id;
      ELSE
        NEW.city_id  := NULL;
        NEW.district := v_legacy.district_name;
        NEW.village  := v_legacy.village_name;
      END IF;
    END IF;
  END IF;

  -- b) имя села в колонке района (старый клиент это допускал)
  IF NEW.village IS NULL AND NEW.district IS NOT NULL THEN
    SELECT dv.district_name INTO v_district
      FROM public.district_villages dv WHERE dv.village_name = NEW.district;
    IF FOUND THEN
      NEW.village  := NEW.district;
      NEW.district := v_district;
    END IF;
  END IF;

  -- c) старая сборка сменила место, не зная о селе: село больше не верно
  IF TG_OP = 'UPDATE'
     AND NEW.village IS NOT DISTINCT FROM OLD.village
     AND (NEW.district IS DISTINCT FROM OLD.district
          OR NEW.city_id IS DISTINCT FROM OLD.city_id) THEN
    NEW.village := NULL;
  END IF;

  -- d) город или «вся РИ» — села нет
  IF NEW.city_id IS NOT NULL OR NEW.district IS NULL THEN
    NEW.village := NULL;
  END IF;

  -- Неверная пара район/село от нового клиента — отказ FK (fail-closed).
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_normalize_place
  BEFORE INSERT OR UPDATE OF city_id, district, village ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_normalize_place();

-- Ограниченный автор не меняет и село (до сих пор — city_id, district).
DROP TRIGGER orders_author_active_guard ON public.orders;
CREATE TRIGGER orders_author_active_guard
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_author_active(
    'title','description','photo_urls','contact_name','l2_id','city_id','district','village');

-- 6. Одна функция совпадения: «области пересекаются» (§2.2).
CREATE OR REPLACE FUNCTION public.canon_city_id(p_city_id text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE
    WHEN p_city_id IS NULL THEN NULL
    WHEN p_city_id IN ('nazran', 'magas') THEN 'nazran-magas'
    ELSE coalesce((SELECT l.target_city_id FROM public.legacy_city_places l
                    WHERE l.city_id = p_city_id AND l.target_city_id IS NOT NULL),
                  p_city_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.place_matches(
  f_city text, f_district text, f_village text,   -- фильтр / зона
  o_city text, o_district text, o_village text    -- задание
) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  l public.legacy_city_places%ROWTYPE;
  f_city_district text;
  o_city_district text;
BEGIN
  -- legacy-«сёла» в любой стороне → (район, село)
  IF f_city IS NOT NULL THEN
    SELECT * INTO l FROM public.legacy_city_places WHERE city_id = f_city AND village_name IS NOT NULL;
    IF FOUND THEN f_city := NULL; f_district := l.district_name; f_village := l.village_name; END IF;
  END IF;
  IF o_city IS NOT NULL THEN
    SELECT * INTO l FROM public.legacy_city_places WHERE city_id = o_city AND village_name IS NOT NULL;
    IF FOUND THEN o_city := NULL; o_district := l.district_name; o_village := l.village_name; END IF;
  END IF;
  f_city := public.canon_city_id(f_city);
  o_city := public.canon_city_id(o_city);

  -- фильтр «вся РИ»
  IF f_city IS NULL AND f_district IS NULL THEN RETURN true; END IF;
  -- задание «вся РИ»: Q3 владельца. Сейчас — false (текущее поведение).
  IF o_city IS NULL AND o_district IS NULL THEN RETURN false; END IF;

  SELECT dc.district_name INTO f_city_district FROM public.district_cities dc WHERE dc.city_id = f_city LIMIT 1;
  SELECT dc.district_name INTO o_city_district FROM public.district_cities dc WHERE dc.city_id = o_city LIMIT 1;

  IF f_city IS NOT NULL THEN                       -- фильтр «город»
    IF o_city IS NOT NULL THEN RETURN o_city = f_city; END IF;
    RETURN o_village IS NULL AND o_district = f_city_district;
  END IF;

  IF f_village IS NULL THEN                         -- фильтр «район»
    IF o_city IS NOT NULL THEN RETURN o_city_district = f_district; END IF;
    RETURN o_district = f_district;
  END IF;

  -- фильтр «село»
  IF o_city IS NOT NULL THEN RETURN false; END IF;
  RETURN o_district = f_district AND (o_village IS NULL OR o_village = f_village);
END;
$$;

-- Зона специалиста → (город | район) для place_matches.
CREATE OR REPLACE FUNCTION public.area_matches_order(
  p_area_kind text, p_area_location_id text,
  o_city text, o_district text, o_village text
) RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE p_area_kind
    WHEN 'city' THEN public.place_matches(p_area_location_id, NULL, NULL, o_city, o_district, o_village)
    WHEN 'district' THEN coalesce(public.place_matches(
           NULL, (SELECT d.name FROM public.districts d WHERE d.id = p_area_location_id), NULL,
           o_city, o_district, o_village), false)
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.canon_city_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_matches(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.area_matches_order(text,text,text,text,text) FROM PUBLIC;
-- Вызываются только из SECURITY DEFINER-функций (владелец postgres);
-- в белый список RPC xtrud-api не добавляются.

-- area_covers_place оставляем как есть (могут вызывать старые черновики);
-- удаление — этап 4 после проверки, что вызовов нет.

-- 7. Рассылка: ВЗЯТЬ ЖИВОЕ ТЕЛО process_order_broadcast_queue
--    (pg_get_functiondef) и заменить только строку условия места:
--      AND public.area_covers_place(msa.kind::text, msa.location_id,
--                                   v_order.city_id, v_order.district)
--    на
--      AND public.area_matches_order(msa.kind::text, msa.location_id,
--                                    v_order.city_id, v_order.district, v_order.village)
--    и в v_data добавить 'district', v_order.district, 'village', v_order.village
--    (клиент push не обязан их читать; полезно для подписи).

-- 8. Поиск специалистов: новые параметры места. Сигнатура меняется, поэтому
--    DROP + CREATE в одной транзакции (CREATE OR REPLACE не меняет аргументы;
--    перегрузка рядом со старой сделает вызов PostgREST неоднозначным).
--    Старые сборки вызывают по именам без p_district/p_village — DEFAULT NULL.
DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text);
-- CREATE FUNCTION public.search_masters(
--   p_query text DEFAULT NULL, p_l2_id text DEFAULT NULL, p_city_id text DEFAULT NULL,
--   p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0,
--   p_l1_id text DEFAULT NULL, p_sort text DEFAULT 'rating',
--   p_district text DEFAULT NULL, p_village text DEFAULT NULL)
-- … ЖИВОЕ ТЕЛО без изменений, кроме условия места:
--      AND (
--        (p_city_id IS NULL AND p_district IS NULL)
--        OR NOT EXISTS (SELECT 1 FROM public.master_service_areas msa
--                        WHERE msa.master_id = mp.user_id)
--        OR (p_city_id IS NOT NULL
--            AND public.canon_city_id(u.city_id) = public.canon_city_id(p_city_id))
--        OR EXISTS (
--          SELECT 1 FROM public.master_service_areas msa
--           WHERE msa.master_id = mp.user_id
--             AND public.area_matches_order(msa.kind::text, msa.location_id,
--                                           p_city_id, p_district, p_village))
--      )
--   Обрати внимание: здесь «заданием» выступает выбранное место поиска, а
--   зона специалиста — фильтром; правило пересечения симметрично для всех
--   пар, кроме «вся РИ» (Q3).
-- Гранты как у живой функции (сейчас PUBLIC, anon, authenticated):
-- GRANT EXECUTE ON FUNCTION public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)
--   TO anon, authenticated;

-- 9. Данные трёх «сёл».
--    Резерв для отката (id и прежние значения, без персональных данных).
CREATE TABLE xtrud_private.backup_0212_places AS
  SELECT 'orders'::text AS tbl, id::text AS row_id, city_id, district, NULL::text AS kind
    FROM public.orders WHERE city_id IN ('ordzhonikidzevskaya','sernovodskaya','nesterovskaya')
  UNION ALL
  SELECT 'master_service_areas', id::text, location_id, NULL, kind::text
    FROM public.master_service_areas
   WHERE kind = 'city' AND location_id IN ('ordzhonikidzevskaya','sernovodskaya','nesterovskaya');
REVOKE ALL ON xtrud_private.backup_0212_places FROM PUBLIC, anon, authenticated;

--    Задания: триггер сам переложит (ожидается 1 строка: sernovodskaya,
--    completed → district 'Сунженский район', village 'Серноводская').
--    Под postgres auth.uid() = NULL → guard автора пропускает; guard статуса
--    пропускает не-authenticated. updated_at у строки обновится (set_updated_at).
UPDATE public.orders SET city_id = city_id
 WHERE city_id IN ('ordzhonikidzevskaya','sernovodskaya','nesterovskaya');

--    Зоны: Орджоникидзевская = Сунжа (ожидается 1 строка). Дубль удалить.
DELETE FROM public.master_service_areas a
 WHERE a.kind = 'city' AND a.location_id = 'ordzhonikidzevskaya'
   AND EXISTS (SELECT 1 FROM public.master_service_areas b
                WHERE b.master_id = a.master_id AND b.kind = 'city' AND b.location_id = 'sunzha');
UPDATE public.master_service_areas SET location_id = 'sunzha'
 WHERE kind = 'city' AND location_id = 'ordzhonikidzevskaya';
--    sernovodskaya/nesterovskaya-зоны (сейчас 0) не трогаем — канонизируются
--    при сравнении.

-- Пользователи: 0 строк с местом — не трогаем.

NOTIFY pgrst, 'reload schema';
COMMIT;
```

Проверки после применения (SELECT):

```sql
SELECT count(*) FROM public.orders WHERE city_id IN ('ordzhonikidzevskaya','sernovodskaya','nesterovskaya'); -- 0
SELECT count(*) FROM public.orders WHERE village IS NOT NULL;                                                -- 1
SELECT city_id FROM public.district_cities WHERE district_id = 'sunzhensky';                                 -- sunzha
SELECT count(*) FROM public.master_service_areas WHERE location_id = 'ordzhonikidzevskaya';                  -- 0
SELECT pg_get_function_arguments('public.search_masters'::regproc);                                          -- +p_district, p_village
```

## 4. Что менять в клиенте

Порядок: сначала миграция (additive), затем сборка с этим клиентом.

| Файл | Изменение |
|---|---|
| `src/lib/location-config.ts` | убрать 3 id из видимых (`hiddenInPicker: true`, не удалять — нужны для имён); `CITY_IDS_BY_DISTRICT_ID.sunzhensky = ['sunzha']`; `LEGACY_CITY_PLACES` (зеркало таблицы); в `DISTRICTS.sunzhensky.villages` — Нестеровская, Серноводская (Q2); убрать 3 точки из `CITY_COORDINATES` (иначе `getNearestCity` вернёт скрытый id); `placeMatches()` — зеркало SQL §3.6; `normalizeCityId` — канонизация legacy |
| `app/(details)/orders/new/where.tsx` | UX дизайнера: район → «Весь район» / город района / сёла |
| `src/features/task-composer/steps.ts`, `composer-store.ts`, `use-publish-task.ts` | поле `village`, валидность шага |
| `src/features/orders/validate-order-publish-category.ts` (+ test) | `village` ∈ `villagesByDistrict[district]`; имя села в `district` больше не принимать |
| `src/features/orders/use-create-order.ts`, `use-update-order.ts`, `order-schema.ts`, `app/(details)/orders/edit/[id].tsx` | писать/читать `village` |
| `src/features/orders/use-all-open-orders.ts` | фильтры по §2.2 (PostgREST `or`/`and`, см. ниже), выбирать `village` |
| `src/features/orders/find/open-order-facets.ts` (+ test), `use-open-order-facets.ts` | `village` в строке и в `PlaceFilter`, правило через `placeMatches` |
| `src/features/orders/orders-search-filters-store.ts`, `app/(details)/find/location-select.tsx`, `use-orders-filter-labels.ts`, `src/features/orders/find/FindResults.tsx` | состояние `village`, подписи |
| `src/components/OrderRow.tsx`, `src/features/orders/find/FindOrderRow.tsx`, `app/(details)/orders/[id].tsx`, `src/features/home/ActiveOrdersShowcase.tsx` | подпись «Алхасты · Сунженский р-н» |
| `src/features/master-profile/ServiceAreasSection.tsx`, `use-service-areas.ts` | без 3 legacy-чипов; legacy-зону показывать по `LEGACY_CITY_PLACES` и **не терять** при сохранении |
| `src/features/master-view/use-search-masters.ts`, `SpecialistsListScreen.tsx`, `src/components/CitySelector.tsx` | при выборе района/села — `p_district`/`p_village` |
| `src/features/cities/use-cities.ts`, `bundled-cities.ts` (+ test) | следуют `HIDDEN_PICKER_CITY_IDS`/`PICKER_CITIES` |
| `src/types/database.ts` | `orders.village`, таблицы `districts`, `district_villages`, `legacy_city_places`, аргументы `search_masters` |
| `admin/src/pages/UserCard.tsx` | при желании — имя legacy-места (не обязательно) |

Фильтры ленты в PostgREST (новый клиент; `A` = алиасы города, для
`nazran-magas` — `nazran-magas,nazran,magas`):

- город C: `or=(city_id.in.(A),and(district.eq."район(C)",village.is.null))`
- район D: `or=(district.eq."D",city_id.in.(города D с алиасами))`
- село (D, V): `district=eq."D"&or=(village.eq."V",village.is.null)`
- Q3 «да» — к каждому `or` добавить `and(city_id.is.null,district.is.null)`.

Сервер xtrud-api: код не меняется. Имена RPC те же (`search_masters`,
`set_master_service_areas`), новые функции наружу не выставляются; новые
таблицы в `server/src/rest/routes.ts` добавлять, только если клиент начнёт
читать справочники из БД (в этапе 1 — нет, справочник вшит в сборку).
UNKNOWN: проходит ли вложенный `and(...)` внутри `or=(...)` через прокси
`/v2/rest` без искажений — проверить запросом на этапе 3.

## 5. Раскатка

> Статус 2026-10-05: 0212 применена (копия `pre-0212-20261005-032936.dump`),
> ревью xtrud-security — можно; клиент этапа 1 (выбор села в задании, подписи,
> лента) — сборка 129. Фильтр ленты и поиск специалистов по селу, сёла как
> зоны специалиста — следующий этап.

1. **Решения владельца:** Q1 (Орджоникидзевская → Сунжа), Q2 (Серноводская),
   Q3 (задание «вся РИ» в фильтрах и рассылке), нужны ли сёла как зоны.
2. **Перед миграцией:** `pg_dump` (skill, шаг 3); снять заново живые
   `pg_get_functiondef` рассылки и поиска, гранты (`routine_privileges`),
   агрегаты §1.2 — если цифры изменились, обновить ожидания §3.9. Ledger: в
   базе **нет** `supabase_migrations.schema_migrations` (FACT, запрос упал:
   relation does not exist) — сверка идёт по черновикам `migration-drafts/` и
   STATUS, как в предыдущих выкладках; формального ledger нет.
3. **Пробный прогон** (`BEGIN … ROLLBACK`) — тесты §6.
4. **Миграция 0212** (additive) основным агентом по команде владельца.
5. Проверки §3 + через API `https://api.xtrud.pro/v2/rest/orders?select=id,city_id,district,village&limit=1`.
6. **Клиент** (сборка iOS + Android) с §4.
7. **Наблюдение** (≥ 2 недели или пока старые сборки не уйдут). Сейчас сервер
   не знает версию клиента (FACT: в `server/src` и `src/lib/xtrud-client` нет
   заголовка версии) — долю старых сборок измерить нельзя (UNKNOWN). Косвенный
   признак: новые записи с legacy `city_id` до нормализации — можно считать в
   триггере, если владелец захочет (не входит в черновик).
8. **Этап 4 (отдельная миграция, позже):** `cities.is_active = false` для трёх
   legacy-строк; удалить `area_covers_place`, если не вызывается
   (`prosrc ILIKE '%area_covers_place%'`). Строки `cities` не удалять (FK).

## 6. Тесты

SQL, внутри `BEGIN; … ROLLBACK;` после тела миграции, под
`set_config('request.jwt.claims', …, true); SET LOCAL ROLE authenticated;`
(тестового автора и специалиста создать в той же транзакции):

1. Старый клиент: `INSERT orders (city_id='nesterovskaya')` → строка
   `city_id NULL, district 'Сунженский район', village 'Нестеровская'`.
2. `INSERT (city_id='ordzhonikidzevskaya')` → `city_id='sunzha'`.
3. `INSERT (district='Алхасты')` → `district 'Сунженский район', village 'Алхасты'`.
4. Новый клиент: `INSERT (district='Сунженский район', village='Экажево')` →
   отказ FK 23503 (`SAVEPOINT`/`ROLLBACK TO`).
5. `INSERT (city_id='karabulak', village='Алхасты')` → `village` обнулён.
6. Старый клиент `UPDATE` задания в селе: `district='Назрановский район'` →
   `village NULL`; `UPDATE` без смены места (`title`) → `village` сохранён.
7. Пользователь со статусом `suspended`: `UPDATE village` → отказ
   `account_not_active`.
8. anon: `SELECT village FROM orders` — читается; `INSERT` — отказ.
9. `place_matches` — таблица истинности §2.2 (по одной строке на клетку,
   включая `nazran`/`magas` ↔ `nazran-magas` и legacy-зону `sernovodskaya`).
10. Рассылка: задание в селе Алхасты → получает специалист с зоной «Сунженский
    район» и без зон; не получает специалист «только Сунжа» и «Карабулак».
    Задание «весь Сунженский район» → получает «только Сунжа». Зона
    «Джейрахский район» + задание в Джейрахе → получает (сейчас — нет).
    Проверка: `SELECT public.process_order_broadcast_queue(20)` и строки
    `notifications` по тестовым id (только count).
11. `search_masters` со старым набором аргументов → тот же результат, что до
    миграции на живых данных; с `p_district='Сунженский район'` → специалисты с
    зоной Сунжа и без зон.

Клиент: `location-config.test.ts` (`placeMatches` — та же таблица истинности,
что SQL), `open-order-facets.test.ts`, `validate-order-publish-category.test.ts`,
`steps.test.ts`, `bundled-cities.test.ts`; затем `npm run quality:check`.

## 7. Откат (подготовлен, НЕ прогонялся)

Предпосылка: `pre-0212-<ts>.dump` и таблица `xtrud_private.backup_0212_places`.

**До выхода нового клиента** (никто не пишет `village`) — миграция 0213:

```sql
BEGIN;
-- рассылка и поиск: восстановить тела из pre-0212 (pg_get_functiondef,
-- сохранённые до миграции); search_masters — DROP новой сигнатуры,
-- CREATE старой, GRANT EXECUTE TO anon, authenticated.
DROP TRIGGER orders_normalize_place ON public.orders;
DROP TRIGGER orders_author_active_guard ON public.orders;
CREATE TRIGGER orders_author_active_guard BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_author_active(
    'title','description','photo_urls','contact_name','l2_id','city_id','district');
UPDATE public.orders o SET city_id = b.city_id, district = b.district, village = NULL
  FROM xtrud_private.backup_0212_places b
 WHERE b.tbl = 'orders' AND o.id::text = b.row_id;
UPDATE public.master_service_areas a SET location_id = b.city_id
  FROM xtrud_private.backup_0212_places b
 WHERE b.tbl = 'master_service_areas' AND a.id::text = b.row_id;
INSERT INTO public.district_cities VALUES
  ('sunzhensky','Сунженский район','ordzhonikidzevskaya'),
  ('sunzhensky','Сунженский район','sernovodskaya'),
  ('sunzhensky','Сунженский район','nesterovskaya')
ON CONFLICT DO NOTHING;
ALTER TABLE public.orders DROP CONSTRAINT orders_village_in_district;
ALTER TABLE public.orders DROP CONSTRAINT orders_village_needs_district;
ALTER TABLE public.orders DROP COLUMN village;
DROP FUNCTION public.area_matches_order(text,text,text,text,text);
DROP FUNCTION public.place_matches(text,text,text,text,text,text);
DROP FUNCTION public.canon_city_id(text);
DROP TABLE public.legacy_city_places, public.district_villages, public.districts;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

Ограничение: удалённый на шаге 9 дубль зоны (если он был) возвращается только
из dump. Сейчас дубля нет (у специалиста с Орджоникидзевской нет Сунжи — FACT
агрегатом: одна зона ordzhonikidzevskaya, ни одной sunzha).

**После выхода нового клиента:** колонку `village` и справочники **не
удалять** (новая сборка перестанет публиковать). Откатываются только функции
и триггер; задания в сёлах остаются валидными для старых сборок (район).

Проверка отката: прогнать 0212 и 0213 подряд внутри одного `BEGIN … ROLLBACK`
и сравнить `pg_get_functiondef` рассылки/поиска и агрегаты §1.2 с исходными.
**Этот прогон не выполнялся** (вне read-only зоны) — выполняет основной агент
перед применением.

## 8. Передать xtrud-security

- Новый триггер нормализации — SECURITY DEFINER (ролям API не дан EXECUTE на
  place_normalize; ревью 2026-10-05 подтвердило); справочники только на
  чтение; FK `(district, village)` — fail-closed на мусор.
- `guard_content_author_active` расширен на `village` — проверить.
- Новые функции без `EXECUTE` для PUBLIC; `search_masters` пересоздаётся с
  прежними грантами (сейчас включая PUBLIC — сохранить или сузить?).
- Найдено по ходу, вне задачи (не исправлено): у `cities` таблица
  разрешает authenticated INSERT/UPDATE/DELETE — запись закрыта только
  отсутствием политик под RLS; `set_master_service_areas` не проверяет
  `location_id` (любая строка до 50 символов). Риск низкий, решение — за
  security.

## 9. Сводка FACT / DECISION / UNKNOWN

- FACT: схема, гранты, функции и агрегаты §1 (live read-only 2026-10-03);
  село нигде не хранится; затронуто 1 задание и 1 зона; у пользователей места нет;
  ledger `supabase_migrations.schema_migrations` в базе отсутствует.
- FACT (внешние источники): Орджоникидзевская = Сунжа; Серноводское — в Чечне.
- DECISION: владелец 2026-10-03 (§0); 2026-09-12 — город входит в свой район,
  Карабулак отдельно; Назрань · Магас — одна плашка.
- UNKNOWN: Q1–Q3 и сёла-зоны (решения владельца); доля старых сборок (нет
  заголовка версии); вложенный `and` в `or` через прокси `/v2/rest`; полнота и
  написание списков сёл; юридический статус городов по ОКТМО.
