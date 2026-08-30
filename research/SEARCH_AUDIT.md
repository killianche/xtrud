# Аудит поиска услуг — конкуренты + рекомендации для xtrud

**Дата:** 2026-05-15
**Скоуп:** ресёрч поиска по каталогу услуг для маркетплейса в Республике Ингушетия (10 L1 / 64 L2 / 290 L3 категорий). Главный пользовательский кейс: «клиент пишет *камера* — система ведёт его на L3 *Установка камер видеонаблюдения*».

---

## TL;DR (10 пунктов)

1. **Postgres FTS + pg_trgm** хватит на 290 услуг с большим запасом. Дедикейтед-движок (Meilisearch / Typesense / Algolia) — оверкилл и лишний инфраструктурный долг при нашем масштабе. Решение Supabase-команды: «*Postgres held its own*» даже на 32 МБ датасете фильмов ([Supabase blog](https://supabase.com/blog/postgres-full-text-search-vs-the-rest)).
2. **Главный приём «умного» поиска у больших ребят — словарь синонимов**. Thumbtack явно об этом пишет: вместо сотен категорий они держат «*thousands of relevant terms*», которые маппятся на 1–20 категорий каждый ([Thumbtack Engineering](https://medium.com/thumbtack-engineering/building-multi-category-search-results-616bee77a564)). Это не ML, а ручная/полу-ручная разметка.
3. **Для нашего кейса «камера → видеонаблюдение» нужен thesaurus, а не stemming.** Морфология (лемматизация русского через `russian_stem` в Postgres) решает только формы одного слова (камеры/камер/камеру), но не семантические синонимы. Поэтому слой синонимов — обязательный.
4. **Раскладка-фикс делается тривиально на клиенте** одной char-map таблицей (`a→ф`, `b→и`, …). NPM-пакет `convert-layout` архивирован, но идея — 30 строк кода ([convert-layout](https://github.com/ai/convert-layout)). Применять стратегию **«fallback on zero hits»**: если по исходной строке 0 результатов — параллельно ищем по перевернутой раскладке, иначе скрытно мерджим.
5. **Опечатки** покрываются через `pg_trgm` similarity-индекс (GIN + `gin_trgm_ops`). Порог `similarity > 0.3` ловит «камира → камера», «сантехник → сантехник» без ложных срабатываний при правильном тюнинге.
6. **Морфология русского** в Postgres работает «из коробки» через конфигурацию `russian` в `to_tsvector`. На Supabase надо проверить, что extension установлен (по умолчанию в большинстве регионов есть). PGroonga — для CJK языков, нам не нужен.
7. **UX-приоритет — категории, не свободный поиск.** Sharetribe прямо пишет: «*36% реализаций autocomplete делают хуже, а не лучше*» при малом каталоге ([Sharetribe](https://www.sharetribe.com/academy/how-to-help-your-customers-find-the-right-product-or-service/)). Поиск нужен как **дополнение** к читаемому category-grid, а не замена.
8. **Показываем смешанные результаты в дропдауне:** категории L2/L3 (с иконкой), потом мастера. Категории всегда выше — это ускоряет happy path «выбрал → попал в фид мастеров категории» и снимает нагрузку с full-text по карточкам мастеров.
9. **Словарь синонимов наполняется ChatGPT-промптом + ручная докрутка.** На 290 услуг × ~8 синонимов = ~2 300 записей. Один промпт на категорию, проверка дублей, точечные правки. Сохраняется в БД-таблицу `service_synonyms (service_id, synonym text)`. Обновляется когда продактом замечен «no-result query».
10. **Anti-pattern, которого избегаем — full-text по всем профилям мастеров.** Биография в свободной форме = шум. Ищем по структурированным полям: `title`, `service_l3_id`, `service_synonyms`, потом **через join** показываем мастеров. Так и быстрее, и релевантнее.

---

## Платформы — детальный разбор

### 1. Яндекс.Услуги (yandex.ru/uslugi)

**Что взято на вооружение:**
- Использует общий поиск Яндекса с морфологией русского «из коробки»: «По умолчанию поиск работает с учетом морфологии: все формы ключевых слов запроса (падеж, род, число, склонение)» ([Ашманов](https://www.ashmanov.com/education/articles/yazyk-zaprosov-yandeks/)).
- Восклицательный знак `!слово` — оператор «найти точно эту форму», обходящий стемминг. Полезный паттерн для продвинутых пользователей.
- **Поисковые подсказки** строятся из реальных запросов пользователей (популярных + тренды) — это не статический список, а динамический ([Convert Monster](https://convertmonster.ru/blog/serm-blog/poiskovye-podskazki-yandeks-v-chem-ih-polza-i-kak-v-nih-popast/)).
- **Sticky search** на главной: после ввода названия услуги выпадают категории, услуги, мастера в одном списке (mixed results).

**Что НЕ берём:**
- Полная инфраструктура Яндекса с ML-ранкером — оверкилл.
- Выкатывание подсказок из реальных запросов пользователей — у нас холодный старт, пользовательских запросов нет. На MVP — статический thesaurus, потом дополним аналитикой.

---

### 2. Профи.ру (profi.ru)

**Что подсмотрено:**
- 900+ специализаций. При вводе в поисковую строку («сантехник», «репетитор по математике») система **типизирует ввод** и предлагает уже категорию + сразу список мастеров под ней.
- При создании задания — поиск по специализациям с автокомплитом (категории идут вперёд, мастера — после).
- Используется **категоризация задачи через ML** при создании (по описанию задания угадывается специализация). Подобное у Авито: BERT-экстрактор + 250 моделей ([avito.tech](https://avito.tech/content/x2sbj97ao1-kak-mi-v-avito-predskazivaem-kategorii-o)) — у нас на старте это не нужно.

**Что НЕ берём:**
- ML-классификатор задач — для 290 услуг достаточно правил «слово в свободном тексте → подсветить категорию» через тот же thesaurus.
- Глубокая иерархия 4 уровней (Профи иногда уходит в L4 «репетитор → математика → ОГЭ → 9 класс») — наша структура L1/L2/L3 проще.

---

### 3. YouDo (youdo.com)

**Что взято:**
- 16 категорий верхнего уровня — намного меньше, чем у нас (10 L1). Поиск разделён на **поиск задач** (для исполнителей) и **создание задачи** (для клиентов). Это два разных UX.
- Показывают популярные категории как отправную точку, дальше «уточни, что именно тебе нужно».

**Что НЕ берём:**
- Полную модель «исполнитель ищет задание из ленты» — у нас другой acquisition-flow (клиент ищет мастера). Если в будущем добавим ленту заявок для мастеров — у YouDo подсмотрим там же.

---

### 4. Авито Услуги

**Что взято:**
- **Подсказки в строке поиска** строятся из топа реальных запросов пользователей ([Callibri](https://callibri.ru/blog/kak-analizirovat-statistiku-zaprosov-na-avito)). Это «*источник новых ключевых слов, отслеживание трендов*».
- При создании объявления — **подсказка категории по названию товара** («введи „молоток“ → подскажет категорию»). У них ML, у нас можно простым trigram-матчем по словарю.
- Search field всегда sticky — даже на странице категории.

**Что НЕ берём:**
- Многоуровневые фильтры по характеристикам (цвет, бренд, материал) — не наш кейс для услуг.
- Подмешивание промо-карточек в результаты — anti-pattern для маркетплейса услуг, ломает доверие.

---

### 5. TaskRabbit (taskrabbit.com)

**Что взято:**
- **Маленький каталог, ~7 крупных категорий** (Cleaning, Handyman, Moving, Errands, Furniture Assembly, etc.). Вместо поиска — большие тайлы категорий на главной.
- При выборе категории — сразу набор «task templates» (типичные задачи: «assemble IKEA dresser», «mount TV») без необходимости описывать задачу свободно. Это резко снижает trauma пустого поля.
- **Никакого autocomplete** в традиционном виде. Поиск играет вспомогательную роль ([TaskRabbit Support](https://support.taskrabbit.com/hc/en-us/articles/360049547952-How-Do-I-Choose-a-Category-for-My-Task)).

**Что взять для xtrud:**
- На MVP — **категории-первые**, поиск как опция, не главный entry-point.
- Шаблоны типичных задач для каждой L3 — снимает barrier «не знаю, как описать».

---

### 6. Thumbtack (thumbtack.com)

**Что взято — самое важное для нас:**

Это единственный из разобранных, кто публично описал архитектуру multi-category search ([Thumbtack Engineering](https://medium.com/thumbtack-engineering/building-multi-category-search-results-616bee77a564)):

- **Проблема**: 500+ категорий, но клиенты пишут шире. «Electrician» ≠ «Electrical and Wiring Repair».
- **Решение**: **expanded list — тысячи терминов**, каждый маппится на 1–20 категорий. Это и есть наш словарь синонимов в чистом виде.
- Ранжирование внутри категории — модификация TF-IDF на корпусе отзывов клиентов.
- UX: один профессионал может появиться в нескольких категориях, при контакте клиент уточняет конкретный сервис.

**Прямой take для xtrud:**
- Структура таблицы `category_terms (term text, category_id uuid, weight numeric)` — точно такой же подход.
- Один синоним может вести на несколько категорий («камера» → видеонаблюдение, ремонт смартфонов с камерой, фотограф) — поддержать через many-to-many.

---

### 7. Google Maps / Yandex Maps

**Что взято:**
- Гео-приоритет: «найди слесаря» — сначала ближайшие.
- **Категории + объекты** в одном дропдауне: при вводе «кофейня» показывает и категорию «Кофейни» (синий значок), и конкретные кофейни рядом (красные пины).
- Voice search — рабочий, но мы не закладываем на MVP.

**Take для xtrud:**
- В дропдауне — категория с иконкой сверху, мастера ниже.
- Гео-фильтр в метаданных категории (если у мастера есть город Магас и пользователь в Магасе — приоритет).

---

## Технологический фундамент: что выбираем

### Сравнение: dedicated search engine vs Postgres-native

| | Postgres FTS + pg_trgm | Meilisearch / Typesense | Algolia |
|---|---|---|---|
| Стоимость инфры | $0 (уже в Supabase) | $0 self-host или ~$30/мес managed | $$ от $50/мес |
| Опечатки | pg_trgm similarity | автомат, прекрасно | автомат, прекрасно |
| Префиксный поиск | ILIKE / trigram | автомат | автомат |
| Морфология RU | russian_stem встроено | отдельная конфигурация | через language config |
| Синонимы | dict_xsyn / своя таблица | встроенно | встроенно |
| Раскладка-фикс | руками на клиенте | руками на клиенте | руками на клиенте |
| Sync с БД | не нужен (одна БД) | отдельный процесс (Realtime → index) | отдельный процесс |
| Сложность | средняя | низкая (UI) + высокая (sync) | низкая (UI) + средняя (cost) |

**Вывод для xtrud:** Postgres FTS + pg_trgm + thesaurus в БД. Причины:
1. Каталог 290 услуг — крошечный (Meilisearch жалуется, что Postgres плох на «хоть сколько серьёзных» датасетах — у нас не тот случай).
2. Бюджет нулевой.
3. Нет дев-команды на поддержку отдельного движка.
4. Все данные уже в Supabase — нет проблемы синка.

Запасной план: если через 2 года будет 50k мастеров и full-text по их био станет узким местом — выкатим Meilisearch как вторичный read-replica. Архитектурно к этому подготовимся через изоляцию search-логики в `src/lib/search/`.

---

## Best practices — что взять для xtrud

### 1. Postgres FTS с русской конфигурацией

```sql
-- Generated column для FTS-поиска по услуге
alter table service_l3
  add column fts_doc tsvector
  generated always as (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'C')
  ) stored;

create index service_l3_fts_idx on service_l3 using gin (fts_doc);
```

`setweight A/B/C/D` нужен для ранкинга: совпадение в имени категории должно весить больше, чем в описании.

### 2. pg_trgm для опечаток и префиксного поиска

```sql
create extension if not exists pg_trgm;

-- Триграммный индекс на нормализованное имя
create index service_l3_trgm_idx on service_l3
  using gin (lower(name) gin_trgm_ops);

-- Поиск с опечатками
select id, name, similarity(lower(name), lower($query)) as sim
from service_l3
where lower(name) % lower($query)  -- оператор `%` — similarity > set_limit
order by sim desc
limit 10;
```

`set_limit(0.3)` — порог похожести. Тюнить по данным: 0.3 ловит «камира → камера», 0.5 — слишком строго.

Источники: [Postgres docs pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html), [Habr — Ищем имена с опечатками](https://habr.com/ru/post/341142/).

### 3. Словарь синонимов в БД-таблице (НЕ через `dict_xsyn`)

`dict_xsyn` неудобен: требует .rules файл на диске сервера, что в managed Supabase сложно. Наш путь — **обычная таблица + join**:

```sql
create table service_synonyms (
  id uuid primary key default gen_random_uuid(),
  service_l3_id uuid references service_l3(id) on delete cascade,
  synonym text not null,
  weight smallint default 100,  -- основной термин 100, фуззи-синоним 50
  created_at timestamptz default now()
);

create index service_synonyms_synonym_trgm on service_synonyms
  using gin (lower(synonym) gin_trgm_ops);

create index service_synonyms_service_idx on service_synonyms (service_l3_id);
```

Поиск:
```sql
-- Топ-5 категорий по запросу через синонимы (с похожестью)
select s.service_l3_id, sl3.name as l3_name,
       max(similarity(lower(s.synonym), lower($query)) * s.weight / 100.0) as score
from service_synonyms s
join service_l3 sl3 on sl3.id = s.service_l3_id
where lower(s.synonym) % lower($query)
group by s.service_l3_id, sl3.name
order by score desc
limit 5;
```

**Размер словаря:** 290 L3 × 5–10 синонимов = 1 500–3 000 строк. Тривиально по объёму.

### 4. Раскладка-фикс на клиенте JS

```ts
// src/lib/search/keyboard-layout.ts
const EN_TO_RU: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш',
  o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л',
  l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
  ',': 'б', '.': 'ю',
  // плюс верхний регистр и символы
};

const RU_TO_EN = Object.fromEntries(
  Object.entries(EN_TO_RU).map(([k, v]) => [v, k])
);

export function flipLayout(input: string): string {
  // Если в строке есть кириллица — конвертируем в EN, иначе в RU
  const isCyrillic = /[а-яА-ЯёЁ]/.test(input);
  const map = isCyrillic ? RU_TO_EN : EN_TO_RU;
  return input
    .split('')
    .map((ch) => map[ch.toLowerCase()] ?? ch)
    .join('');
}
```

**Стратегия применения:** «параллельная свеча». На клиенте делаем **два запроса одновременно**: исходный + flipLayout(). Если в исходном >0 результатов — показываем их, layout-результаты отбрасываем. Если 0 — показываем layout-результаты с подсказкой «Возможно, вы имели в виду: *камера*» (как в Гугле).

Альтернатива «сначала ищем, при нуле перепроверяем» хуже UX-wise: добавляет задержку 100–200 мс на zero-result случаях. С двумя параллельными запросами latency = max(а,б), а не a+б.

### 5. Морфология русского — встроена

`to_tsvector('russian', text)` использует Snowball-стеммер, который сводит «камеры/камер/камеру/камерой» к одной лексеме `камер`. Этого достаточно для морфологии. Никаких pymorphy2/Natasha не нужно.

Проверка на Supabase:
```sql
select to_tsvector('russian', 'установка камер видеонаблюдения');
-- Ожидаем: 'видеонаблюден':3 'камер':2 'установк':1
```

Если выдаёт пустой результат или ошибку — на проекте отсутствует russian-конфигурация (редкий случай). Тогда либо включить через support Supabase, либо использовать `simple` + ручной thesaurus как fallback.

### 6. Объединение трёх слоёв в одном запросе

```sql
-- Поиск категории по запросу: тезаурус + FTS + триграммы
with query_norm as (
  select lower(trim($query)) as q
),
matches as (
  -- Слой 1: точное совпадение синонима (вес 1.0)
  select sl3.id, sl3.name, 1.0 as score, 'synonym' as source
  from service_synonyms s
  join service_l3 sl3 on sl3.id = s.service_l3_id, query_norm
  where lower(s.synonym) = q

  union all

  -- Слой 2: морфологический FTS (вес 0.7)
  select sl3.id, sl3.name, 0.7 as score, 'fts' as source
  from service_l3 sl3, query_norm
  where sl3.fts_doc @@ websearch_to_tsquery('russian', q)

  union all

  -- Слой 3: триграммный fuzzy (вес 0.5 × similarity)
  select sl3.id, sl3.name,
         0.5 * similarity(lower(sl3.name), q) as score,
         'trigram' as source
  from service_l3 sl3, query_norm
  where lower(sl3.name) % q
)
select id, name, max(score) as final_score, array_agg(distinct source) as sources
from matches
group by id, name
order by final_score desc
limit 10;
```

Возвращает топ-10 L3-категорий с источником матчинга (для дебага). Время выполнения на 290 строках — единицы миллисекунд.

---

## Конкретный план реализации для xtrud

### Шаг 1 — миграция БД (~1 час)

```sql
-- 20260516_search_infrastructure.sql

create extension if not exists pg_trgm;

-- Synonyms table (тезаурус)
create table service_synonyms (
  id uuid primary key default gen_random_uuid(),
  service_l3_id uuid not null references service_l3(id) on delete cascade,
  synonym text not null,
  weight smallint default 100 check (weight between 0 and 100),
  created_at timestamptz default now()
);

create unique index service_synonyms_unique
  on service_synonyms (service_l3_id, lower(synonym));

create index service_synonyms_synonym_trgm
  on service_synonyms using gin (lower(synonym) gin_trgm_ops);

-- FTS на L3
alter table service_l3
  add column fts_doc tsvector
  generated always as (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'C')
  ) stored;

create index service_l3_fts_idx on service_l3 using gin (fts_doc);

-- Триграммный индекс на L3.name
create index service_l3_name_trgm
  on service_l3 using gin (lower(name) gin_trgm_ops);

-- Аналогично для L2
alter table service_l2
  add column fts_doc tsvector
  generated always as (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A')
  ) stored;

create index service_l2_fts_idx on service_l2 using gin (fts_doc);
create index service_l2_name_trgm on service_l2 using gin (lower(name) gin_trgm_ops);

-- RLS — synonyms читают все, пишут только админы
alter table service_synonyms enable row level security;

create policy service_synonyms_read on service_synonyms
  for select using (true);

create policy service_synonyms_admin_write on service_synonyms
  for all using (is_admin());  -- existing helper
```

### Шаг 2 — RPC-функция поиска (~30 минут)

```sql
create or replace function search_services(query_text text, max_results int default 10)
returns table (
  l3_id uuid,
  l3_name text,
  l2_id uuid,
  l2_name text,
  l1_id uuid,
  score numeric,
  match_source text
)
language sql stable
as $$
with q as (select lower(trim(query_text)) as norm),
matches as (
  select sl3.id as l3_id, 1.0::numeric as score, 'synonym'::text as src
  from service_synonyms s
  join service_l3 sl3 on sl3.id = s.service_l3_id, q
  where lower(s.synonym) = q.norm

  union all

  select sl3.id, 0.85, 'synonym_fuzzy'
  from service_synonyms s
  join service_l3 sl3 on sl3.id = s.service_l3_id, q
  where lower(s.synonym) % q.norm
    and lower(s.synonym) <> q.norm

  union all

  select sl3.id, 0.7, 'fts'
  from service_l3 sl3, q
  where sl3.fts_doc @@ websearch_to_tsquery('russian', q.norm)

  union all

  select sl3.id, 0.5 * similarity(lower(sl3.name), q.norm), 'trigram'
  from service_l3 sl3, q
  where lower(sl3.name) % q.norm
)
select sl3.id, sl3.name, sl2.id, sl2.name, sl2.l1_id,
       max(m.score), (array_agg(m.src order by m.score desc))[1]
from matches m
join service_l3 sl3 on sl3.id = m.l3_id
join service_l2 sl2 on sl2.id = sl3.l2_id
group by sl3.id, sl3.name, sl2.id, sl2.name, sl2.l1_id
order by max(m.score) desc
limit max_results;
$$;
```

### Шаг 3 — наполнение тезауруса (~3–4 часа разовая работа)

ChatGPT-промпт (использовать на каждые 50 категорий пакетом):

```
Я делаю маркетплейс услуг в России. Для каждой категории ниже сгенерируй
от 5 до 12 синонимов и альтернативных названий, которые мог бы написать клиент
в поиске. Учти:
- разговорные названия и сокращения (CCTV, ГВС, ПВХ)
- проблему-триггер ("протекает кран" для сантехника)
- родственные термины
- английские названия если уместно
- НЕ включай саму категорию

Формат строго JSON:
{ "Установка камер видеонаблюдения": ["камера", "видеокамера", "cctv",
   "видеонаблюдение", "ip-камера", "камеры безопасности", ...] }

Категории:
1. Установка камер видеонаблюдения
2. Ремонт холодильников
3. ...
```

Импорт скриптом:
```ts
// scripts/seed-synonyms.ts
import { createClient } from '@supabase/supabase-js';
import synonymsJson from './synonyms-from-chatgpt.json';

const sb = createClient(URL, SERVICE_KEY);
const { data: l3s } = await sb.from('service_l3').select('id, name');
const byName = new Map(l3s.map(l => [l.name, l.id]));

const rows = [];
for (const [name, syns] of Object.entries(synonymsJson)) {
  const id = byName.get(name);
  if (!id) { console.warn('Skip:', name); continue; }
  for (const syn of syns) rows.push({ service_l3_id: id, synonym: syn });
}
await sb.from('service_synonyms').insert(rows);
```

После генерации — **обязательная ручная вычитка** на одну сессию: ChatGPT любит давать «английские» термины там, где они никто не пишет (cctv для российского частного клиента — экзотика, но оставить как edge-case полезно).

### Шаг 4 — клиентский слой (~2 часа)

```ts
// src/lib/search/use-service-search.ts
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { flipLayout } from './keyboard-layout';
import { supabase } from '@/lib/supabase';

export function useServiceSearch(rawQuery: string) {
  const q = useDebouncedValue(rawQuery.trim(), 200);

  return useQuery({
    queryKey: ['service-search', q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const flipped = flipLayout(q);

      const [primary, secondary] = await Promise.all([
        supabase.rpc('search_services', { query_text: q, max_results: 10 }),
        flipped !== q
          ? supabase.rpc('search_services', { query_text: flipped, max_results: 5 })
          : Promise.resolve({ data: [] }),
      ]);

      const primaryHits = primary.data ?? [];
      if (primaryHits.length > 0) return { hits: primaryHits, didYouMean: null };

      const layoutHits = secondary.data ?? [];
      return {
        hits: layoutHits,
        didYouMean: layoutHits.length > 0 ? flipped : null,
      };
    },
    staleTime: 30_000,
  });
}
```

### Шаг 5 — UX в `app/(tabs)/index.tsx`

**Расположение:** sticky search в шапке главной (как у Авито/Профи). На фокусе разворачивается полноэкранный лист с:
- топ-10 совпадений (категории L3 с иконкой L2 категории + parent breadcrumb «Электрика → Установка розеток»)
- divider «Мастера», ниже — топ-3 мастера с лучшим рейтингом по найденной категории
- если 0 hits и есть `didYouMean` — баннер «Возможно, вы искали: *камера*»
- если 0 hits полностью — empty state «Не нашли — напишите задание свободно, мы подберём» + кнопка «Создать заявку»

**Empty state до ввода:** популярные категории (топ-8 из L2 по числу мастеров) + история последних 3 поисков пользователя (LocalStorage).

### Шаг 6 — мониторинг (опционально, через 2 недели)

Завести таблицу `search_misses (query, count, last_seen)` на serverless-функции — записывать запросы, давшие 0 hits. Раз в неделю смотреть топ — это сразу даёт список «синонимов, которые мы пропустили».

---

## Anti-patterns (чего НЕ делаем)

1. **Full-text по всем полям профиля мастера.** Свободное «о себе» — шум. Один мастер может написать «опытный электрик и сантехник, могу что угодно» — он попадёт во все запросы. Ищем по структурированным `master_services (master_id, service_l3_id)`, не по био.
2. **Дедикейтед поисковый движок (Algolia / Meilisearch) на старте.** Лишний инфра-долг, оплата, синхронизация. Postgres FTS закрывает 100% потребностей до 100k мастеров.
3. **Подсказки из «реальных запросов пользователей» на холодном старте.** На MVP их просто нет. Делаем статический thesaurus, а через 2–3 месяца обогащаем.
4. **Глубокая морфология через pymorphy2 / Natasha на клиенте.** Тяжело, медленно, дублирует встроенный `russian_stem` Postgres. Не нужно.
5. **«Умный ML-классификатор» категорий на 290 услугах.** BERT-подход Авито имеет смысл при миллионах товаров и десятках K категорий. У нас правила (thesaurus) дешевле, точнее, дебажабельнее.
6. **Voice search.** На MVP — не приоритет. Web Speech API на iOS Safari работает плохо, нативный модуль усложнит app review.
7. **5+ фильтров до поиска.** Sharetribe прямо: «начните с базовых, добавляйте по запросу». Город + категория + рейтинг — достаточно.
8. **Промо в результатах поиска.** Серьёзно ломает доверие к ранжированию. Если делаем — отдельным блоком «Реклама», не подмешиваем.
9. **Loading spinner вместо skeleton при поиске.** Search-as-you-type должен ощущаться мгновенно. Дебаунс 200 мс + skeleton-стрипа из 3 строк.
10. **Очистка строки поиска при навигации в результат.** Пользователь возвращается назад → строка пустая → надо вводить заново. Сохраняем последний query в стейте.

---

## Открытые вопросы для команды xtrud

1. **Чьим стеммером пользоваться, если на нашем Supabase-инстансе нет `russian` конфигурации?** Проверить SQL-запросом из Шага 1. Если нет — fallback на `simple` + полностью переходим на thesaurus + trigram.
2. **Гео-приоритет в результатах** — версия 1 без него (везде Ингушетия, расстояния маленькие) или сразу с весом по дистанции? Рекомендация — без, добавим если будут жалобы.
3. **Поиск по мастерам по их именам** (например, «Мухаммед сантехник») — отдельный flow или тот же endpoint? Рекомендация — отдельный, чтобы не мешать категориальному поиску. По именам — простой `ILIKE` + триграммы на `masters.full_name`.

---

## Источники

### Исследовательские статьи и документация

1. [Postgres Full Text Search vs the rest — Supabase Blog](https://supabase.com/blog/postgres-full-text-search-vs-the-rest)
2. [PostgreSQL Documentation: pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
3. [PostgreSQL Documentation: Dictionaries (synonyms, thesaurus)](https://www.postgresql.org/docs/current/textsearch-dictionaries.html)
4. [PostgreSQL Documentation: dict_xsyn extension](https://www.postgresql.org/docs/current/dict-xsyn.html)
5. [PostgreSQL Documentation: unaccent extension](https://www.postgresql.org/docs/current/unaccent.html)
6. [Supabase Docs — Full Text Search](https://supabase.com/docs/guides/database/full-text-search)
7. [Postgres Text Search: Full Text vs Trigram Search — Aapeli Vuorinen](https://www.aapelivuorinen.com/blog/2021/02/24/postgres-text-search/)
8. [Ищем имена с опечатками в PostgreSQL — Habr](https://habr.com/ru/post/341142/)
9. [Индексирование полнотекстовых данных в PostgreSQL с pg_trgm — Habr/Otus](https://habr.com/ru/companies/otus/articles/770674/)
10. [Postgres full-text search is Good Enough! — Rach Belaid](https://rachbelaid.com/postgres-full-text-search-is-good-enough/)
11. [Using trigrams against typos — The Art of PostgreSQL](https://tapoueh.org/blog/2013/09/using-trigrams-against-typos/)

### Конкурентные платформы

12. [Building multi-category search results — Thumbtack Engineering](https://medium.com/thumbtack-engineering/building-multi-category-search-results-616bee77a564)
13. [Как мы в Авито предсказываем категории объявлений по описанию — avito.tech](https://avito.tech/content/x2sbj97ao1-kak-mi-v-avito-predskazivaem-kategorii-o)
14. [Профи.ру](https://profi.ru/) и [Профи.ру About](https://profi.ru/about/)
15. [Поисковые подсказки в Яндекс — Ашманов](https://www.ashmanov.com/education/articles/poiskovye-podskazki-yandeks/)
16. [Язык поисковых запросов Яндекс — Ашманов](https://www.ashmanov.com/education/articles/yazyk-zaprosov-yandeks/)
17. [Парсинг подсказок Avito — Пиксель Тулс](https://tools.pixelplus.ru/news/podskazki-avito)
18. [TaskRabbit — How Do I Choose a Category for My Task?](https://support.taskrabbit.com/hc/en-us/articles/360049547952-How-Do-I-Choose-a-Category-for-My-Task)

### UX best practices

19. [How to build your marketplace search — Sharetribe](https://www.sharetribe.com/academy/how-to-help-your-customers-find-the-right-product-or-service/)
20. [9 UX Best Practices for Autocomplete — Baymard](https://baymard.com/blog/autocomplete-design)
21. [Five Simple Steps For Better Autocomplete UX — Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/autocomplete-ux/)
22. [Site Search Suggestions — Nielsen Norman Group](https://www.nngroup.com/articles/site-search-suggestions/)
23. [3 best practices for search autocomplete on mobile — Algolia](https://www.algolia.com/blog/ecommerce/search-autocomplete-on-mobile)

### Инструменты

24. [convert-layout NPM library (deprecated, но идея актуальна)](https://github.com/ai/convert-layout)
25. [react-native-autocomplete-dropdown](https://www.npmjs.com/package/react-native-autocomplete-dropdown)
26. [Meilisearch typo tolerance settings](https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings)
27. [Fuzzy search comprehensive guide — Meilisearch](https://www.meilisearch.com/blog/fuzzy-search)
28. [When does Postgres stop being good enough — Meilisearch](https://www.meilisearch.com/blog/postgres-full-text-search-limitations)

### Дополнительная литература

29. [PostgreSQL Russian docs (postgrespro)](https://postgrespro.ru/docs/postgresql/current/pgtrgm)
30. [Сравнение индексов в PostgreSQL для поиска по тексту — oxilor](https://oxilor.ru/blog/sravnenie-indeksov-v-postgresql-dlya-poiska-po-tekstu-2)
