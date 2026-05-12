# Аудит: Discovery (главный фид, категория, карточка мастера, карточка клиента)

## TL;DR

Карточка мастера (`master/[id].tsx`) — это центральный conversion-экран продукта, но сейчас она **визуально слабая** и **без CTA**: hero — стандартная круглая аватарка 96px (по `Avatar` `xl`), нет sticky-bar «Написать / Заказать», нет цены/прайса, портфолио вынесено вниз без hero-фотографии. Это противоречит главному дизайн-принципу проекта («классные фото — главный визуальный нерв») и нарушает паттерн **Thumbtack pro detail** (большое фото + рейтинг + FAQ + photo gallery + sticky CTA). Главная (`index.tsx`) для клиента — голая сетка из категорий без поиска, top-recommended мастеров, гео-выбора и приветственного hero. Лента в категории (`category/[id].tsx`) показывает услуги как список-цены, но **карточки мастеров маленькие и без фото работ** — у **TaskRabbit Select-a-Tasker** мастер всегда показан с реальным фото + почасовой ставкой + счётчиком выполненных задач + sort/filter chips. Эти три экрана требуют переосмысления визуальной плотности и hero-областей в первую очередь; карточка клиента (`client/[id].tsx`) — пока ок как минимальный профиль.

## Экраны в скоупе

- `app/(tabs)/index.tsx` — Главная / лента / фид (категории + branching master|client)
- `app/(tabs)/category/[id].tsx` — Услуги + список мастеров в категории
- `app/(tabs)/master/[id].tsx` — Публичная карточка мастера (главный conversion-экран)
- `app/(tabs)/client/[id].tsx` — Публичная карточка клиента (что видит мастер)
- `src/components/CategoryTile.tsx`, `src/features/master-view/MasterHomeContent.tsx` — связанные

## Референсы, на которые опирались (Lazyweb + 4 главных)

| # | Ref | Что взяли | URL (Lazyweb) |
|---|-----|-----------|---------------|
| R1 | **TaskRabbit Select a Tasker** — главный референс по сетке мастеров | фото-аватар, hourly rate, ★ rating + count, completed tasks, bio-snippet, filter chips, sort, trust-note про background checks | screenshotId 9021, 9027 (`lifestyle119_taskrabbit`) |
| R2 | **TaskRabbit list-variant** | scroll-feed с одинаковыми крупными карточками — нет горизонтального шума | screenshotId 9027 |
| R3 | **Airbnb listing detail** | паттерн «full-width hero photo + back/share/save chips + sticky-bottom price+CTA» — на котором ровняется Thumbtack pro detail | screenshotId 88237 (`travel5_airbnb`) |
| R4 | **Airbnb Explore** | top search bar + category tabs + горизонтальные curated carousels — модель «не просто сетка категорий, а живой фид» | screenshotId 13833 |
| R5 | **Whatnot categories grid** | компактная категорийная сетка с поиском вверху, без баннеров | screenshotId 19065 |
| R6 | **DoorDash browse** | плотная категорийная сетка + bottom-tabs + hero search bar — образец «всё на одном экране без скролла» | screenshotId 5581 |
| R7 | **Yelp local discovery** | search-first + горизонтальные shortcut-chips категорий (restaurants/auto repair/plumbers) + фид с рейтингами и фото поверх — близкий аналог локальных услуг | screenshotId 6566 |
| R8 | **Rover service selection** | service cards — каждая категория полноценная плитка с фото и описанием, не просто иконка | screenshotId 87599 |
| R9 | **Alibaba supplier profile** | response-rate / on-time delivery metrics в виде KPI-блоков, contact CTAs «Call / Chat / Inquiry» внизу — аналог «sticky CTA» для B2B | screenshotId 21046 |
| R10 | **Craigslist listing detail** | sticky-bottom bar: primary Reply + save/report — классическая мобильная модель «contact-from-detail» | screenshotId 17315 |
| R11 | **Facebook Marketplace** | feed-of-listings с большими фото + ценой + локацией — паттерн «фото-first» для local marketplace | screenshotId 11976 |
| R12 | **The Information subscriber profile** | «Open To: services offered» + skill tags + primary «Send a Message» CTA — для карточки клиента/мастера, у которой надо подчеркнуть готовность к контакту | screenshotId 9300 |

**Поддерживающие (вторичные, по 4-главным):**
- **Profi.ru каталог** — глубокая таксономия (категория → подкатегория → услуга с прайс-индикатором), отзывы привязаны к работе. У нас сейчас прайс в `category/[id]` показан, но без референса «средняя цена по городу» — это слабее, чем у Яндекс.Услуг.
- **Яндекс.Услуги** — гео-карточка мастера с радиусом выезда на мини-карте. У нас радиус есть chip-ом, но **карты нет**.
- **Thumbtack Pro detail** — большое hero-фото мастера + рейтинг + FAQ + photo gallery + trust-signals + sticky CTA. У нас почти ничего из этого.

---

## Находки

### 🔴 Критично (ломает UX или конверсию)

#### 1. **`master/[id].tsx`** — нет hero-фотографии и нет sticky-CTA для контакта
- **Что не так:** hero — круглая аватарка через `<Avatar size="xl">` (~96px). Имя, ★, город под ней. **Главного фото мастера (или коллажа из портфолио) нет вверху.** Внизу экрана нет никакого sticky-bar «Написать в чат / Заказать». Пользователь долистал до отзывов — и **больше ничего не может сделать**, кроме как скроллить наверх. Это нарушает 2-й дизайн-принцип («классные фото — главный визуальный нерв») и conversion-логику Thumbtack/Airbnb.
- **Референсы:** R3 (Airbnb listing detail — full-width hero + sticky Reserve), R10 (Craigslist listing — sticky Reply bar), Thumbtack pro detail (по бриф-доке — `PRODUCT_CONTEXT.md` явно называет его главным референсом для карточки мастера).
- **Что сделать:**
  - **Hero**: если у мастера есть портфолио — первый элемент `portfolio.data[0].image_url` в виде full-bleed 16:9 baner-фото вверху (под top-bar), `rounded-xl` (16px) bottom-corners по `DESIGN.md`. Если портфолио пусто и есть `avatar_url` — большой 4:5 портретный блок. Если нет ни того, ни другого — geometric placeholder с инициалами на `surface-card`.
  - **Аватар + имя** опускаются ниже hero как «overlay»: круглый аватар 72px перекрывает hero на ~50% (классика Airbnb host card).
  - **Sticky bottom bar** (`absolute bottom-0` с safe-area padding): слева — текстовая подсказка («Бесплатно написать»), справа — `button-primary` (#111111, height 48, `rounded-md`) «Написать в чат». На мобайле — `position: absolute` поверх ScrollView; на вебе — обычный sticky внутри правой колонки.
  - **Web**: на ≥1024px hero становится правой 5/12 колонкой (фото + sticky CTA рядом), слева — bio + категории + reviews. Так делает Airbnb.
  - **Dark mode**: hero gradient overlay меняется на `rgba(0,0,0,0)→rgba(0,0,0,0.7)`, текст всё ещё `text-on-dark`. Sticky bar — `bg-surface-dark-elevated` (#1a1a1a) с белым primary CTA `bg-on-dark`? — нет, оставляем чёрный primary на любой теме (по `DESIGN.md`, primary всегда #111111). В dark — `bg-canvas-dark` (когда добавим в design-tokens).
- **Сложность:** L (новый компонент `MasterHeroCard`, sticky-bar, гридка под web, responsive логика).
- **Mobile / Web / Both:** Both (но web-вариант существенно отличается — 2-колоночный лейаут).

#### 2. **`master/[id].tsx`** — портфолио маленькое и спрятано глубоко
- **Что не так:** `<PortfolioGrid>` появляется только если `portfolio.data.length > 0`, **без заголовка-якоря и без секции «Все фото»**. Нет lightbox-кнопки «Показать все 24 фото» поверх grid (как у Airbnb). На Thumbtack photo gallery — это второй по важности блок после рейтинга. У нас — пятый блок снизу.
- **Референсы:** R3 (Airbnb gallery — кнопка «Show all photos» поверх grid), Thumbtack photo gallery (по бриф-доке).
- **Что сделать:**
  - **Hero-портфолио мозаика**: первые 4–5 фото показываются в hero-grid сразу под hero-баннером (1 большое слева + 4 маленьких справа, 2×2 — стандартный Airbnb-паттерн).
  - **Кнопка «Все фото (N)»** в правом нижнем углу мозаики — открывает `PortfolioLightbox` с первого индекса.
  - Если фото < 5 — fallback к текущему `PortfolioGrid`.
  - **Каждое фото в lightbox**: подпись (заголовок работы), счётчик «3/24», swipe-навигация (уже есть).
- **Сложность:** M (новый `PortfolioHeroMosaic` компонент, lightbox уже есть).
- **Mobile / Web / Both:** Both. Web: full-width при ≥1024px, всегда 2×3 grid.

#### 3. **`index.tsx` (client view)** — нет поиска, нет горизонтальных «recommended мастеров»
- **Что не так:** клиент видит **только** сетку категорий 2×N. Нет search bar («сантехник в Назрани»), нет «Top-rated мастера», нет «Недавно у вас были», нет городского переключателя. Это плоский каталог, не «лента» — противоречит цели «discovery feed» в названии группы и **bri-моделям Яндекс.Услуги / TaskRabbit homepage** (там вверху search, под ним curated-carousels).
- **Референсы:** R4 (Airbnb Explore — top search + tab + carousels), R7 (Yelp — top search + категорийные shortcut-chips + scroll-feed с рейтингами), R6 (DoorDash — search + dense category grid).
- **Что сделать:**
  - **Search bar** под greeting (height 48, `rounded-md`, иконка lupa lucide `Search` слева, placeholder «Сантехник, парикмахер, репетитор…»). На тап — открывает full-screen search (Sprint 4+). Сейчас можно сделать noop-stub с placeholder-overlay «Поиск скоро будет».
  - **Hero-карусель «Лучшие мастера рядом»** (горизонтальный scroll, FlashList horizontal) — карточки 240×320 с большим фото + именем + ★ + категорией + расстоянием. Берётся из `top_rated_masters_view` (если нет — задача backend, отметить).
  - **Сетка категорий** остаётся, но переименовать «Категории» → «Что вам нужно?» (как у TaskRabbit «What can we help you with?»).
  - **Городской селектор** в hover у greeting (`Привет, Руслан · Назрань ▾`) — на тап bottom-sheet со списком городов. Сейчас гео не пробрасывается в feed — это блокер для «мастера рядом», отметить.
  - **Web**: search bar центрируется в hero-band (Cal.com 64px display headline сверху + search ниже). Категории — 4-up grid. Карусель «лучшие мастера» — обычный grid 3-up без horizontal scroll (у Cal.com нет горизонтальных скроллов на web).
- **Сложность:** L (search-экран, новые компоненты `MasterHeroCarousel`, `CitySelector`, новый view в БД).
- **Mobile / Web / Both:** Both. Различается layout (см. выше).

#### 4. **`category/[id].tsx`** — карточки мастеров слабые: маленький аватар, нет фото работ, нет цены
- **Что не так:** `<MasterCardRow>` — это flex-row с 56px avatar (md) + имя + ★ + bio в 2 строки. **Нет фото работ. Нет hourly-rate / прайса. Нет «выполнено N задач».** У TaskRabbit (R1, R2) каждая карточка содержит: photo (~64px круг) + name + **hourly rate ($)** + ★ + review count + **task count** + bio + «See profile». Мы показываем 3 из 7 элементов.
- **Референсы:** R1 (TaskRabbit Select a Tasker), R8 (Rover service selection — фото-first карточки), Profi.ru каталог (прайс-индикатор + рейтинг).
- **Что сделать:**
  - **Карточка увеличивается до вертикальной**: square thumbnail 96×96 (либо лучшее фото портфолио, либо аватар) слева, справа — 3 строки: имя + ★(N), «опыт 5 лет · 23 выполнено», прайс «от 2 500 ₽» (если есть `min_price` в profile).
  - **Bio** опускаем до 1 строки (numberOfLines=1).
  - **Прайс-индикатор**: если `master_categories.min_price_rub` есть — показываем «от X ₽». Если нет — пропускаем (никаких «договорной»).
  - **Сортировка**: добавить sort-pill вверху списка («По рейтингу ▾» / «По цене ↑» / «Ближе») — паттерн TaskRabbit filter chips.
  - **Фильтр-chip-row** в горизонтальном scroll: «Выезжает ко мне», «Свой инструмент», «Сегодня доступен» (последний — задел на будущее, пока stub).
- **Сложность:** M (новый layout карточки, sort/filter компоненты — без backend-работ можно сделать клиентскую сортировку).
- **Mobile / Web / Both:** Both. Web: 2-up grid, карточка та же.

#### 5. **`category/[id].tsx`** — услуги-как-цены показаны до мастеров; нарушен ментальный flow
- **Что не так:** сейчас порядок: title → **список услуг с прайсом** → потом «Мастера». Услуги без мастера — это **прайс-лист без исполнителя**, что не работает: «Ремонт смесителя · 1 500 ₽» — это **информация**, но клиент не может на неё кликнуть и нанять. У Profi.ru каталог: сначала **мастера**, потом «таксономия услуг» как фильтр-чипы наверху. У TaskRabbit таксономия — это онбординг (выбрал услугу → попал в browse taskers), а в самом browse уже **только** мастера.
- **Референсы:** R1 (TaskRabbit — на browse-экране нет «прайс-листа услуг», только мастера), Profi.ru каталог категории.
- **Что сделать:**
  - **Услуги превратить в фильтр-chip-row** наверху (горизонтальный scroll-chips «Ремонт смесителя · от 1 500₽ / Установка унитаза · от 3 000₽»). Тап на chip = фильтр мастеров, оказывающих эту услугу.
  - **Список мастеров** становится главным элементом ниже chip-row.
  - Прайс остаётся, но не как отдельная секция — как **средняя цена за услугу** внутри chip.
- **Сложность:** M (новый chip-row компонент, фильтр-логика по сервисам у мастера — есть в `master_categories.services[]`).
- **Mobile / Web / Both:** Both.

---

### 🟡 Важно (заметно ухудшает опыт)

#### 6. **`master/[id].tsx`** — нет блока FAQ от мастера (Thumbtack-сигнатурный паттерн)
- **Что не так:** у Thumbtack pro detail (главный референс по PRODUCT_CONTEXT) есть блок «FAQ» — 3–5 заранее заданных вопросов от платформы, которые мастер заполняет («Сколько вы берёте за выезд?», «Работаете ли по выходным?», «Какой у вас опыт?»). У нас этого нет. Bio — это общий текст, FAQ — структурированные ответы, удобные для скана.
- **Референс:** Thumbtack pro detail (явно назван в `PRODUCT_CONTEXT.md` как «FAQ от мастера»).
- **Что сделать:** добавить таблицу `master_faq (master_id, question_template_id, answer text)` с 5 преднабором (выезд / стоимость выезда / гарантия / опыт / выходные) + UI-блок «Часто спрашивают» на карточке (collapsible accordions, `rounded-md`, hairline-divider, body-md ответ). Если ни одно поле не заполнено — секцию скрываем.
- **Сложность:** M (миграция БД + UI + редактирование в /profile).
- **Mobile / Web / Both:** Both.

#### 7. **`master/[id].tsx`** — категории показаны как «accent-soft pills» — не вписывается в Cal.com-эстетику
- **Что не так:** в `master/[id].tsx` строки 222-229 — `rounded-pill bg-accent-soft` + `text-accent`. По `DESIGN.md` accent (`#3b82f6`) используется «sparely on inline links and on a small badge». На карточке мастера это **главные сигналы специализации**, и они окрашены в синий — выбивается из ч/б минимализма (1-й принцип «минимализм»). Аналогично в `MasterHomeContent.tsx` строки 60-67.
- **Референс:** `DESIGN.md` (Cal.com — почти ч/б, accent — редко). Thumbtack/TaskRabbit — тоже используют ч/б chips, не цветные.
- **Что сделать:** заменить на `badge-pill` из `DESIGN.md` (`bg-surface-card` #f5f5f5 + `text-ink`). Цветовая нагрузка освобождается для CTA и важных warning-сигналов.
- **Сложность:** S (Tailwind-классы).
- **Mobile / Web / Both:** Both.

#### 8. **`master/[id].tsx`** — рейтинг занимает мало места, нет breakdown
- **Что не так:** `★ 4.8 (12 отзывов) · 5 закрытых сделок` — одна строка body-md. У Airbnb (R3) и Thumbtack рейтинг — это **большой блок** с разбивкой по категориям (качество / коммуникация / цена). У нас нет ни breakdown, ни Trust-signals (verified phone, verified passport — Profi.ru-сигналы).
- **Референс:** Thumbtack pro detail (по бриф-доке — «trust-signals блоками»), Profi.ru верификация мастеров.
- **Что сделать:**
  - **Rating-block** под hero: 4.8 ★ display-md + «12 отзывов» caption + 3 breakdown-бара (если в `reviews` есть `quality_rating`, `communication_rating`, `price_rating` — иначе блок пропустить).
  - **Trust-row chips**: «Телефон подтверждён», «Паспорт проверен» (когда будет верификация). Не выдумываем сейчас — отмечаем как Sprint+2 задел.
- **Сложность:** M (UI блок + breakdown-логика, нужны поля в reviews).
- **Mobile / Web / Both:** Both.

#### 9. **`index.tsx`** — greeting «display-md tracking-tight text-ink» — слишком крупный для мобайла
- **Что не так:** `text-display-md` = 36px Cal Sans. На iPhone 13/14 (390pt) это занимает **2 строки** при имени «Александра» («Привет, Александра» = ~18 символов, не помещается). Cal.com на mobile сжимает hero до 32px (`{breakpoint: mobile}` → display-xl 64→32). У нас 36px остаётся.
- **Референс:** `DESIGN.md` responsive secton: «hero h1 64→32px» на mobile.
- **Что сделать:** на mobile использовать `text-display-sm` (28px Cal Sans), на web — `display-md`. Через NativeWind media queries или платформенный split.
- **Сложность:** S.
- **Mobile / Web / Both:** Mobile (на web остаётся 36px).

#### 10. **`category/[id].tsx`** — top-bar только с back-кнопкой, нет названия и share/save
- **Что не так:** строки 53-64. Top-bar пустой — только chevron-left. По нем падает контекст («где я?» — на странице «Парикмахеры», но top-bar не показывает). Airbnb (R3) в top-bar держит share + save справа.
- **Референс:** R3 Airbnb listing top-bar (back + share + save), R5/R6/R7 — у всех в top-bar минимум есть title или back+search.
- **Что сделать:** top-bar становится sticky на scroll: при scroll вверх показывается title категории (truncated). Иконки справа: `Share2` (поделиться категорией — `expo-sharing`) + `Search` (открыть поиск внутри категории). Sticky behavior — `Animated.View` с opacity-by-scroll.
- **Сложность:** M (sticky logic + Share API).
- **Mobile / Web / Both:** Mobile (sticky-behavior); Web — top-nav уже есть в Cal.com-структуре, не нужен sticky-title.

#### 11. **`master/[id].tsx`** & **`client/[id].tsx`** — `bg-accent-soft` & `bg-success-soft` & `bg-surface-2` — токенов нет в `DESIGN.md`
- **Что не так:** в коде используются `bg-accent-soft`, `bg-success-soft`, `bg-surface-2`, `bg-surface-3`, `text-accent` — этих токенов нет в `DESIGN.md` (там `surface-soft`, `surface-card`, `surface-strong`). Это значит — либо они объявлены в `tailwind.config` и параллельно живут (тогда их нужно вытащить в `DESIGN.md`), либо они валидны по NativeWind через CSS-vars, но **расходятся с design-system**.
- **Референс:** `DESIGN.md` (источник истины).
- **Что сделать:** провести аудит токенов в `tailwind.config.js` (но это вне scope текущего аудита, отметить как cross-screen action). Либо переименовать в коде в `bg-surface-soft` / `bg-success-50` (полу-прозрачный 10% от success). Решение — design-system task.
- **Сложность:** S (если только переименование) / M (если нужны новые токены в DESIGN.md).
- **Mobile / Web / Both:** Both.

#### 12. **`master/[id].tsx`** — нет skeleton-loader, есть только `ActivityIndicator`
- **Что не так:** строка 87-90. При загрузке профиля — крутилка по центру. По 4-му принципу «скорость + skeleton-loaders, не белые экраны» — это не соответствует. У Airbnb (R3) при загрузке listing-detail сразу видны skeleton-блоки hero, аватара, текста.
- **Референс:** `PRODUCT_CONTEXT.md` принцип 4 («skeleton-loaders, не белые экраны»).
- **Что сделать:** добавить `MasterPublicSkeleton` — 16:9 серый блок (hero), круг 72px (аватар), 2 строки text-skeleton (имя/рейтинг), 4 chip-skeleton (stats), 3 строки text (bio). Анимация — стандартный pulse (Animated.Value + opacity 0.5→1).
- **Сложность:** M.
- **Mobile / Web / Both:** Both.

#### 13. **`client/[id].tsx`** — слишком пустой, нет «Sent requests / Active orders» как контекста
- **Что не так:** Карточка клиента — это что **видит мастер** перед тем как откликнуться. Сейчас она показывает: ★, completedOrdersCount, город, дата регистрации, отзывы. Чего нет: «активных заказов сейчас 2», «сколько раз клиент закрывал сделки в этой категории», «среднее время ответа клиента в чате». Без этих сигналов мастер не понимает, серьёзный ли клиент или таб-обходчик.
- **Референс:** R12 (The Information subscriber profile — «Open To: services offered», «Response time»), Airbnb host profile (response rate).
- **Что сделать:** добавить metric-row «Активных заказов · 2 / Закрыл сделок · 7 / В среднем отвечает · за 30 минут». На основе агрегатов с `orders` и `messages` (есть в БД).
- **Сложность:** M (агрегаты в БД + UI).
- **Mobile / Web / Both:** Both.

#### 14. **`category/[id].tsx`** — на пустом списке мастеров нет CTA «Опубликовать заказ»
- **Что не так:** строка 137-141 — если мастеров нет, текст «Пока никто не работает в этой категории». **Кнопки «Опубликовать заказ, мастер найдёт вас сам» нет.** Это паттерн **Profi.ru «специалисты напишут сами»** — главный inbound для маркетплейса (без него клиент уходит).
- **Референс:** Profi.ru «специалисты напишут сами» (явный референс в `PRODUCT_CONTEXT.md`).
- **Что сделать:** на empty state добавить `button-primary` «Описать задачу — мастер найдёт вас сам» → ведёт в визард создания заказа с пред-выбранной L2-категорией.
- **Сложность:** S (если визард уже есть — только linking; иначе M).
- **Mobile / Web / Both:** Both.

---

### 🟢 Nice to have (полировка)

#### 15. **`index.tsx`** — RoleSwitcher занимает место в hero
- **Что не так:** `RoleSwitcher` (mt-3 после greeting) занимает строку под именем у master-users. На клиент-only это не показывается. У master/client профили живут в разных табах, переключение ролей — редкая операция (раз в день максимум). Логично спрятать в profile-таб.
- **Референс:** Cal.com nav-pill-group — используется для редко меняемых модов («Personal/Teams/Enterprise»), но **в settings**, не на главной.
- **Что сделать:** переместить `RoleSwitcher` в `profile` экран (header). На главной — оставить только индикатор активной роли (badge-pill «Я мастер»).
- **Сложность:** S.
- **Mobile / Web / Both:** Both.

#### 16. **`master/[id].tsx`** — нет share-кнопки
- **Что не так:** карточка мастера — это URL, которым клиент захочет поделиться («посмотри, я нашёл сантехника»). Кнопки share в top-bar нет.
- **Референс:** R3 Airbnb (share в top-bar).
- **Что сделать:** добавить `Share2` справа в top-bar → `expo-sharing.shareAsync(url)`. На web — `navigator.share` или fallback на copy-to-clipboard.
- **Сложность:** S.
- **Mobile / Web / Both:** Both.

#### 17. **`CategoryTile.tsx`** — fallback-режим без обложки выглядит беднее обложки
- **Что не так:** plate-icon 40×40 на `surface-2` фоне + лейбл — выглядит как «заглушка», а с обложкой — как production. Контраст между категориями с обложкой и без — визуально режет (1-й принцип «минимализм + консистентность»).
- **Референс:** R5 Whatnot, R8 Rover — все категории имеют фото-плитку.
- **Что сделать:** короткосрочно — задать sensible-defaults на категории (placeholder с tinted background по hash от `name_ru` + крупная иконка 48px по центру + текст внизу). Долгосрочно — задача backend/контента — обязать обложку для всех L1/L2.
- **Сложность:** S (fallback дизайн) / L (контент).
- **Mobile / Web / Both:** Both.

#### 18. **`master/[id].tsx`** — пустые отзывы — нет CTA «Будь первым, кто оставит отзыв»
- **Что не так:** `<ReviewsSection emptyText="У мастера ещё нет отзывов.">` — текст и всё. Реально это упущенная возможность: «оставить отзыв первым» — мощный pull (Airbnb, Yelp используют).
- **Референс:** Yelp, Airbnb empty states.
- **Что сделать:** если пользователь сам закрывал сделку с этим мастером — кнопка «Оставить отзыв». Иначе текст «У мастера ещё нет отзывов. Закройте с ним сделку — оставьте отзыв первым.»
- **Сложность:** S.
- **Mobile / Web / Both:** Both.

#### 19. **Dark-mode пробелы по всей группе**
- **Что не так:** `DESIGN.md` не описывает dark-токены для `surface-card`, `bg-canvas`, `hairline`. В коде используются классы `bg-canvas`, `text-ink`, `border-hairline` — на dark mode они должны иметь counterpart (`bg-canvas-dark`, `text-ink-dark`). Сейчас неясно, как это решается — через CSS-vars в `global.css` или дублирование.
- **Референс:** Cal.com dark mode (есть, но не в `DESIGN.md`).
- **Что сделать:** **отдельная задача design-system** (вне discovery-аудита). Здесь — отметить как кросс-экранный блокер: дать `DESIGN.md` секцию «Dark Theme» с парными токенами.
- **Сложность:** L (system-wide).
- **Mobile / Web / Both:** Both.

#### 20. **`client/[id].tsx`** — нет иконки «верифицирован» (если телефон подтверждён)
- **Что не так:** клиент авторизуется через phone+OTP, значит телефон верифицирован. Этого сигнала на карточке нет.
- **Референс:** Profi.ru верификация мастеров (phone-verified бейдж).
- **Что сделать:** при `user.phone_verified_at != null` показать chip «Телефон подтверждён» рядом с badge «Клиент».
- **Сложность:** S.
- **Mobile / Web / Both:** Both.

---

## Кросс-экранные паттерны

1. **Sticky bottom CTA-bar** — паттерн отсутствует у `master/[id]` и `category/[id]` (где «Опубликовать заказ» был бы уместен). Это **главный conversion-инструмент** в маркетплейсах услуг (Airbnb Reserve, Thumbtack Get matches, Craigslist Reply). Ввести как переиспользуемый компонент `<StickyCTABar primary onPress>` + safe-area-aware.
2. **Skeleton-loaders нет нигде в группе** — везде `ActivityIndicator`. По принципу 4 — это блокер «скорости». Создать `MasterCardSkeleton`, `CategoryGridSkeleton`, `MasterPublicSkeleton`.
3. **Search bar отсутствует на главной и в категории** — главный паттерн **TaskRabbit + Yelp + DoorDash + Whatnot**. Сейчас вообще нет точки входа в поиск. Это критичный gap для discovery.
4. **Цветные accent-pills (bg-accent-soft + text-accent) используются для категорий мастера и тегов** — выбивается из Cal.com-минимализма (1-й принцип). Заменить на нейтральные `surface-card` pills везде.
5. **Dark mode не описан на уровне токенов** — все экраны используют `bg-canvas`, `text-ink`, `border-hairline` без dark-counterparts. Блокер для тёмной темы — нужна работа в `DESIGN.md` + tailwind-config.
6. **Empty states слабые** — на `index.tsx` («Категории не настроены, свяжитесь с поддержкой» — техническая фраза), на `category/[id].tsx` («Пока никто не работает» — нет CTA), на `MasterHomeContent.tsx` («Заявок пока нет» — есть текст, но нет CTA «Что я могу сделать?»). Везде нужна модель «эмпатичный текст + 1 чёткий CTA».
7. **Гео не интегрировано** — нет городского селектора в hero главной, нет radius-фильтра в категории, нет мини-карты на карточке мастера (Яндекс.Услуги — главный референс для гео). Это блокирует «мастера в радиусе X км» — главный фильтр regional-маркетплейса.
8. **Фото-плотность низкая** — главный визуальный нерв продукта (2-й принцип) — большие фото — не реализован: на главной нет фото мастеров вообще, в категории — 48px аватары, на карточке — 96px аватар. Везде должны быть фото-блоки минимум 96px (карточки) и full-bleed hero (детальный экран).

## Что отлично — НЕ трогать

1. **`CategoryTile` с обложкой** — full-bleed expo-image + LinearGradient + label снизу — это образцовый Cal.com-style блок, держим как есть. Поднять качество fallback-режима (см. 17), но full-cover mode оставить.
2. **`PortfolioLightbox` + `PortfolioGrid`** — существуют и работают (см. master/[id] строки 39, 240, 257). Только переиспользовать в hero-mosaic (см. 2).
3. **`ServiceRow` в `category/[id]`** — простая строка с урgency-label и avg-check — минималистично, в Cal.com эстетике. Достойно остаётся, но перенести в chip-row (см. 5).
4. **`StatChip` на master/[id]`** — `bg-surface-2` + иконка lucide + caption — корректный Cal.com-pill. Только заменить `surface-2` на `surface-card` (см. 11).
5. **Pull-to-refresh** работает на всех 4 экранах через `usePullToRefresh` — это правильная mobile-конвенция. Держим.
6. **Branching client/master content** в `index.tsx` через `MasterHomeContent` vs `ClientHomeContent` — архитектурно чисто, без if-каскадов.
7. **Avatar-fallback с initials по seed** в `<Avatar>` — корректный паттерн, держим (на пустых аватарках не показывается «no-image» иконка — это правильный UX).

---

## Executive summary (для главной сессии)

Главный вывод аудита Discovery-группы: **карточка мастера сейчас визуально-слабая и без conversion-инструментов** — нет hero-фото, нет sticky-CTA «Написать», портфолио маленькое и спрятано, рейтинг — одна строка. Это не Thumbtack pro detail, на который мы ровняемся, а скорее «расширенный аватар». **Главная — плоский каталог без поиска и без top-recommended-мастеров**, противоречит модели TaskRabbit/Yelp/DoorDash, где главная — это live feed с фото-карточками. **Список мастеров в категории** мельче, чем у TaskRabbit (нет фото работ, нет hourly rate, нет «выполнено N задач»). **Карточка клиента** в скоупе — самый минимальный экран, ок как baseline, но не хватает Trust-метрик (активные заказы, response time). **Critical bottleneck для discovery**: нет sticky-CTA-bar, нет search-bar, нет hero-фотографий, цветные accent-pills выбиваются из Cal.com минимализма, skeleton-loaders отсутствуют, dark-mode токенов нет в `DESIGN.md`. Подробно — 20 находок в `/Users/ruslancherbizhev/Desktop/xtrud/.claude/audit-2026-05-12/discovery.md` (5 🔴 critical, 9 🟡 important, 6 🟢 polish), все с привязкой к Lazyweb-референсам (12 URL) и к 4 главным (Profi.ru / Яндекс.Услуги / TaskRabbit / Thumbtack).

---

## Использование Lazyweb

Сделано **6 поисковых запросов**:
1. `marketplace home feed categories grid` — 6 экранов (Buzzfeed, Temu, Facebook, Farfetch, Whatnot, Etsy)
2. `TaskRabbit browse taskers list service provider` — 6 экранов (Yelp, Craigslist, **TaskRabbit ×1**, DoorDash, Airbnb, ...)
3. `Thumbtack pro detail page service provider profile` — 6 экранов (Craigslist listing, The Information, Yelp, **TaskRabbit ×1**, Truth Social, Alibaba)
4. `photo gallery portfolio provider sticky CTA book now` — 6 экранов (преимущественно hotel hero-layouts — для модели hero+sticky CTA)
5. `service category list with subcategories prices urgency` — 5 экранов (Craigslist, Alibaba, Rover, Farfetch, Costco)
6. `Airbnb host profile reviews ratings photo grid` — 3 экрана (**Airbnb listing detail**, Google Maps review, VRBO)

Все ссылки сохранены в таблице рефов выше. Прямых **Thumbtack** скриншотов в Lazyweb не нашлось — заменили на **Airbnb listing detail (R3)** + **Craigslist listing (R10)** + **Alibaba supplier (R9)**, которые покрывают тот же паттерн «hero + sticky CTA + trust-metrics». Прямой Thumbtack-сигнал берётся из текста `PRODUCT_CONTEXT.md` как первичный референс.
