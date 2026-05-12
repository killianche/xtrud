# Аудит: Orders (заказы клиента + лента заказов мастера)

## TL;DR

В целом каркас уже опрятный (Cal.com-эстетика, чистая типографика, два режима под клиента и мастера), но **состояние заказа не видно**: на экране списка нет статуса, на детали статус «спрятан» в текстовых подсказках, без `OrderStatusBadge` нельзя отличить `open` от `in_progress / completed / cancelled`. **Самая большая дыра — отсутствие выхода для клиента**: нет кнопки «Отменить заказ» (T2/T6) и нет «Опубликовать ещё раз / клонировать» после `cancelled / completed`. Форма `orders/new.tsx` слишком линейная: 6 секций в один скролл без stepper'а и без оценки «сколько откликов» в реал-тайме — конкурируем с Profi.ru / TaskRabbit, где клиент видит «осталось 1 шаг» и «обычно отвечают за 30 мин». Меньшие, но критичные баги: tabs у мастера ломаются на маленьких экранах (3 длинных пилюли в одну строку), счётчики `(N)` подсвечиваются голубым `bg-accent` — это нарушает монохромный CTA-слой DESIGN.md, а ⭐-рейтинг в форме отзыва сделан текстовыми символами `★` вместо иконок Lucide (масштабирование и a11y ломаются).

---

## Экраны в скоупе

- `app/(tabs)/orders/index.tsx` — список заказов (две ветки: `ClientOrdersView`, `MasterOrdersView` с tabs Новые / Я откликнулся / Меня выбрали)
- `app/(tabs)/orders/[id].tsx` — детали заказа (общий блок + Responses + Completion + Reviews, ~1100 строк)
- `app/(tabs)/orders/new.tsx` — создание заказа (single-screen форма через `OrderFormBody`)
- `app/(tabs)/orders/edit/[id].tsx` — редактирование (только при `status='open'`)
- `app/(tabs)/orders/_layout.tsx` — Stack-обёртка
- Связанные компоненты: `src/components/OrderRow.tsx`, `src/features/orders/OrderFormBody.tsx`, `src/features/orders/order-schema.ts`, `src/features/orders/OutcomeTrackingModal.tsx`

---

## Референсы, на которые опирались (Lazyweb + 4 главных)

Реальные результаты Lazyweb (URL подписаны supabase token-ом — могут протухнуть через час, но `screenshotId` стабилен):

1. **TaskRabbit — Select a Tasker** (Lazyweb `screenshotId=9021`, lifestyle119_taskrabbit) — карточка таскера с rate / rating / completed-count / bio-snippet, фильтр-чипы и слайдер цены. Главный референс для карточки отклика и для нашего `ClientResponseRow`.
2. **TaskRabbit — Home / Browse** (`screenshotId=82073`) — таб-навигация Home / Tasks / My Taskers / Profile + категорийные карусели. Подтверждает «двухуровневая навигация: Tasks как отдельный таб с подсекциями» — у нас уже так, но реализация TabPill голубым акцентом не из эстетики Cal.com.
3. **Duckbill — multi-step service request** (`screenshotId=67474`) — поле «бюджет» как отдельный шаг с back/next + close. Реф для разбиения нашего `orders/new` на 4–5 шагов с stepper'ом.
4. **Duckbill — booked task review** (`screenshotId=67484`) — экран брони показывает «дата, описание, intake-ответы (площадь, тип жилья, бюджет, предпочтения)» как ключ-значение список перед действиями. Реф для шапки `OrderInfoBlock` и для wizard summary.
5. **Ro — Order details + activity timeline** (`screenshotId=16509`, similarity 0.69) — заголовок статуса крупно, primary CTA «Track shipment», timeline шагов с датами. Главный реф для шапки состояния и timeline на `[id].tsx`.
6. **Amazon — Order tracking** (`screenshotId=63694`) — крупный статус «Arriving today», прогрессный таймлайн ordered → shipped → out-for-delivery → delivered. Реф для визуализации 6 статусов state-machine.
7. **Uber Eats — order tracking «Preparing»** (`screenshotId=5812`) — крупный заголовок «Preparing your order», ETA, прогресс-индикатор, ниже карточка деталей. Реф для in_progress.
8. **Alibaba — quote requests inbox** (`screenshotId=21066`) — список «request title, дата, число котировок (badge unread), статус-тег Approved». Прямой аналог нашего ClientOrdersView со счётчиком откликов + статусом — у нас сейчас этого статус-тега нет.
9. **Rebag — Sold/Active/Inactive sellers dashboard** (`screenshotId=8942`) — сегмент-контрол статусов в шапке маркетплейс-листинга. Реф для **клиентского** списка: добавить фильтр «Активные / В работе / Завершённые».
10. **Bins — Sold tab with status segmented (Sold/Ready/Moving/Completed/Canceled)** (`screenshotId=72835`) — буквально те же 5 статусов, что у нас в state-machine. Подтверждает паттерн.
11. **eBay — Hermes flow** (`screenshotId=20685`) — карточка листинга с phantom-elements: фото / title / condition / price / shipping / authenticity-badge. Реф для плотности карточки, наш OrderRow слишком плоский без визуального якоря (нет фото / иконки категории).
12. **BetterMe — multi-step form** (`screenshotId=7631`) и **PrimeStoreCard — register flow** (`screenshotId=19487`) — короткий progress-индикатор сверху + back + next в bottom-stick. Реф для wizard `orders/new`.

Четыре главных функциональных референса (Profi.ru, Яндекс.Услуги, TaskRabbit, Thumbtack) применяются ниже в каждой находке.

---

## Находки

### 🔴 Критично (ломает UX или конверсию)

#### 1. **`[id].tsx`** + **`index.tsx` (OrderRow)**, **нет видимого статуса заказа — пользователь не понимает, что с заказом**

- **Что не так:** state-machine описывает 6 статусов (`draft / open / in_progress / completed / cancelled / expired`), но на карточке в списке (`OrderRow`) статуса нет вообще, а на детали статус «зашит» в косвенные подсказки: маленькая зелёная карточка «Вы выбрали мастера. Заказ в работе.» (строка 330), или текст «Клиент уже выбрал мастера. Отклики больше не принимаются.» (строка 583), или просто `ВЫБРАН` в углу одного из откликов. Клиент не видит «у меня сейчас 4 открытых, 2 в работе, 1 отменён», мастер не видит на карточке в фиде, «новый этот заказ или клиент уже кого-то выбрал». В коде нет ни одного `OrderStatusBadge`-компонента — `grep` пуст.
- **Референс:**
  - **Profi.ru** мобильный таб «Мои заказы»: каждая строка несёт цветовой тег `Активна / В работе / Завершён / Отменён`.
  - **Bins** Lazyweb `screenshotId=72835` — буквально те же 5 статусов в segmented-control.
  - **Ro** `screenshotId=16509` — крупный «Delivered» в шапке детали.
  - **Alibaba** `screenshotId=21066` — статус-тег прямо в строке списка.
- **Что сделать:**
  1. Завести `src/components/OrderStatusBadge.tsx` — pill-бейдж 4 пресета: `open` (нейтральный `bg-surface-card` / `text-body`), `in_progress` (нейтральный с тонкой обводкой `border-success/40`), `completed` (`bg-success-soft` / `text-success`), `cancelled` + `expired` (`bg-surface-3` / `text-muted-soft`). 13px caption, padding 4×10, `rounded-pill`. Тексты: «Открыт», «В работе», «Завершён», «Отменён», «Истёк».
  2. На `OrderRow` поставить бейдж справа от категорийной chip (в той же верхней строке) — тогда плотность не растёт.
  3. На `[id].tsx OrderInfoBlock` — рядом с категорийной chip (строка 224) поставить тот же бейдж. Это убирает необходимость отдельной зелёной карточки на 330 — она остаётся как secondary helper, но главный сигнал — бейдж.
  4. У мастера на `[id].tsx` — если `status !== 'open'` и мастер не picked, показывать бейдж с текстом «Закрыт — выбрали другого мастера» (вместо текущей серой плашки).
- **Сложность:** S
- **Mobile / Web:** Both (на web бейдж работает 1-в-1, цвета те же).

#### 2. **`[id].tsx` (client view)**, **нет кнопки «Отменить заказ» — клиент не может уйти из `open` без бага-обходов**

- **Что не так:** state-machine допускает T2 (`open → cancelled`) и T6 (`in_progress → cancelled`), но в UI кнопки «Отменить» нет. Единственный путь — `OutcomeTrackingModal`, который сам показывается только через 3 дня после `accept`, и только триггер «Не договорились». То есть клиент, который опубликовал заявку и через 5 минут передумал, **не может её закрыть из UI**. RPC и RLS уже готовы — это чистый UX-gap.
- **Референс:**
  - **YouDo** и **Profi.ru** — на детали «Моего заказа» снизу в overflow-меню/тапе на «…» всегда есть «Отменить заказ», часто с подкатегорией причины.
  - **DoorDash** Lazyweb `screenshotId=79012` — статус Cancelled с timestamp + «Reorder» как реф для terminal-screen.
  - **Thumbtack** — Project page → menu → Archive / Cancel project.
- **Что сделать:**
  1. На `[id].tsx` для owner: при `status='open'` рядом с карандашом-редактирования (строка 110–120) добавить кнопку-иконку «…» (kebab) → bottom-sheet с пунктами «Редактировать», «Отменить заказ». Кнопка-карандаш в текущем виде маленькая и одинокая — оверфлоу решает обе задачи.
  2. Для `in_progress` (T6) — там тоже нужна «Отменить» (по state-machine разрешено), но **только** через подтверждение-sheet с текстом «Это закроет заказ. Мастер увидит, что вы отменили работу. Отзыв станет недоступен». Это критично — сейчас клиент не имеет легитимного пути уйти, только баг-обход.
  3. После отмены — экран не закрывать, а оставить с бейджем «Отменён» + текстовой подсказкой «Вы можете создать заявку заново» и кнопкой `secondary` «Опубликовать похожий заказ».
- **Сложность:** M (UI + дублирование данных в новую черновую форму)
- **Mobile / Web:** Both. На web — overflow меню как dropdown справа в header.

#### 3. **`new.tsx`**, **6 секций в один скролл без шага и без «как у Profi.ru — мастера напишут сами»**

- **Что не так:** форма создания — это ScrollView с 6 группами полей (категория chips → название → описание → город → район → срочность → бюджет). На маленьком iPhone это >2 экранов скролла с одной CTA «Опубликовать» внизу. Нет:
  - Прогресса (сколько ещё шагов).
  - «Опциональное → можно пропустить» — все поля визуально одинаковые, хотя `district` и `budget` де-факто опциональные.
  - Реалтайм-подсказки «обычно отвечают за 30 минут / в этой категории 12 мастеров в Магасе».
  - Категорийный picker — это flat-список chips, что не масштабируется. У Profi.ru — иерархия L1→L2→L3 (плитка категорий с иконками, потом подкатегория, потом лист). Сейчас даже 30 категорий уже создадут wrap-стену из pills.
- **Референс:**
  - **TaskRabbit** request flow (`screenshotId=82073` + общеизвестный паттерн): шаги «Что нужно сделать? → Где? → Когда? → Детали → Цена → Подтвердить» с прогрессом, primary CTA внизу, back наверху.
  - **Profi.ru** «оставить заявку — специалисты сами напишут»: после публикации экран ожидания с «обычно первый отклик за 20 мин» + примеры мастеров.
  - **Duckbill** `screenshotId=67474` — отдельный шаг под бюджет.
  - **Profi.ru каталог** — категория сначала картинкой/иконкой, потом подкатегория.
- **Что сделать:**
  1. Превратить `new.tsx` в **wizard из 4 шагов** (Expo Router stack уже есть): `Шаг 1. Что нужно (категория + краткое название)` → `Шаг 2. Подробности (описание)` → `Шаг 3. Где и когда (город, район, срочность)` → `Шаг 4. Бюджет`. Финальный шаг — review-сводка (как Duckbill `screenshotId=67484`).
  2. Сверху — линейный progress (4 точки или полоска), Cal.com-стиль: тонкий `h-1` `bg-surface-2` + `bg-primary` для пройденного. Никаких «Step 1 of 4» — только визуально.
  3. Snap-CTA внизу: `Назад` `secondary` + `Далее` `primary` в fixed-bottom (учесть `insets.bottom`). На последнем шаге — `Опубликовать`.
  4. На шаге 1 ниже инпута «Название» добавить **живую плашку trust-сигнала**: «В категории X в Магасе сейчас 12 мастеров, средний ответ за 25 мин» — статистика приходит запросом по `l2Id+cityId`. Если пока нет API — добавить статичную плашку «Опубликуйте заявку — мастера откликнутся в течение часа» (она уже есть на `index.tsx`, перенести в new).
  5. После submit — экран `submitted` (новый): «Заявка опубликована. Обычно первый отклик приходит за 30 минут» + список «как пока ждёте: посмотрите мастеров в категории X». Сейчас просто `router.back()` — это анти-Profi.ru, мы лишаем клиента эмоции «я двинулся».
  6. На шаге 1 категорийный picker заменить на 2-уровневый bottom-sheet (L1 plitka с иконками → L2 list). Это решит и масштабирование, и даст Profi.ru-стиль.
- **Сложность:** L (это рефакторинг + новый submitted-экран)
- **Mobile / Web:** На мобайле — wizard, как описано. На web — **широкий single-screen** с теми же группами в карточках в две колонки (left: form, right: «как это работает» панель Profi.ru-стиля). Wizard на web ломает паттерн «keyboard-first» — там пользователь хочет видеть всё одним глазом и табать по Tab.

#### 4. **`index.tsx` (MasterOrdersView)**, **tab pills «Новые / Я откликнулся / Меня выбрали» вылезут за экран при счётчиках, голубой акцент нарушает DESIGN.md**

- **Что не так:**
  - 3 длинных русских лейбла + счётчик `(N)` в pill — на iPhone SE / SE2 (320–375 dp) и при крупной системной шрифтовой настройке (Dynamic Type) три пилюли перестанут влезать в одну строку, а контейнер `self-start rounded-pill bg-surface-2 p-1` не предполагает wrap. Сейчас они переползут на новую строку и сломают визуальный паттерн «один pill-контейнер».
  - Активная пилюля рисуется `bg-canvas` (правильно по DESIGN.md), но **счётчик** активной пилюли — `bg-accent` (синий, строка 294). По DESIGN.md `brand-accent #3b82f6` — для редких inline-ссылок, **не для primary signal**. Цвет CTA-слоя у нас монохромный (`#111111`). Голубая «капля» в pill ломает Cal.com-эстетику и создаёт фальшивый «notification»-сигнал.
- **Референс:**
  - **TaskRabbit** Home (`screenshotId=82073`): нижняя навигация, а не pill-tabs наверху. Когда у TaskRabbit есть pill-tabs внутри страницы (Browse Taskers — фильтры) — они короткие и без счётчиков.
  - **Cal.com DESIGN.md**: `nav-pill-group` активная вкладка — `bg-canvas` + subtle shadow, счётчиков на pills нет.
  - **Profi.ru мастер-кабинет**: вкладки горизонтально-скроллируемые + статус-точка `•` вместо числа.
- **Что сделать:**
  1. Завернуть pill-row в `ScrollView horizontal` (без `showsHorizontalScrollIndicator`) с `contentContainerStyle: { paddingHorizontal: 24 }`. Тогда на маленьких экранах он скроллится, а не лопается.
  2. Счётчик активной пилюли — заменить `bg-accent` на `bg-primary` (`#111111`) с `text-on-primary` — монохромно. Счётчик неактивной — оставить `bg-surface-3` (как сейчас).
  3. На очень малых счётчиках (1 цифра, 0–9) — поменять пилюлю на точку `•` `bg-primary` 6×6 — это Profi.ru-стиль и убирает гиперактивный визуальный шум.
  4. Сократить лейблы под mobile: `Новые` / `Отклики` / `Выбран`. Текст и так по-русски короткий, но «Я откликнулся» — 12 символов, можно ужать до «Отклики».
- **Сложность:** S
- **Mobile / Web:** На web pill-tabs работают, но добавить hover-state (по DESIGN.md явно сказано «no hover styling beyond primary darkens» — значит, оставить как есть, только дать `cursor: pointer`).

#### 5. **`[id].tsx` (master review + client review)**, **звёзды нарисованы текстом `★`, форма выглядит сломанной**

- **Что не так:** строки 859–869 (просмотр) и 907–926 (ввод) — это `<AppText weight="bold">★</AppText>` с класcами `text-warning` / `text-muted-soft`, размер `text-display-md` (36px). Это:
  1. **Не масштабируется** через `maxFontSizeMultiplier` единообразно — Dynamic Type сломает выравнивание.
  2. **Не консистентно** с DESIGN.md и с уже использующимся `<Star>` из `lucide-react-native` (см. строку 277 — рейтинг клиента нарисован правильно через Lucide).
  3. **A11y:** `accessibilityLabel={`${s} звёзд`}` есть, но glyph `★` не во всех системных шрифтах одинаково отрисовывается; крупная typography-зависимая иконка ломает row-alignment.
  4. Активная звезда `text-warning` (по DESIGN.md `#f59e0b`) — это правильно, но визуально в Cal.com принят `badge-orange #fb923c` (он мягче, теплее). Сейчас warning читается «предупреждение», а не «оценка».
- **Референс:**
  - **TaskRabbit** Tasker rating (`screenshotId=9021`) — заливные звёзды иконкой, чёткие.
  - **Cal.com DESIGN.md** `rating-stars` (строка 257–260): `textColor: badge-orange`, не warning.
  - **Thumbtack** Pro detail — большие иконковые ⭐ заливные.
- **Что сделать:**
  1. Использовать `<Star>` из Lucide везде. Размер: для ввода — `size={36}`, для просмотра в `myReview` — `size={20}`. Активные: `fill="#fb923c" color="#fb923c"`, неактивные: `fill="transparent" color="#d4d4d8"` (или token `muted-soft`).
  2. Цвет токена сменить: использовать `colors.badge-orange` (`#fb923c`) вместо `warning`. Это и DESIGN.md, и semantic разделение.
  3. Сделать `<RatingInput>` отдельным компонентом и переиспользовать в client/master review sections (сейчас полный copy-paste 100 строк, строки 907–926 vs 1038–1056).
- **Сложность:** S
- **Mobile / Web:** Both. На web — добавить keyboard navigation (стрелки + Space), accessibility role `radiogroup`.

---

### 🟡 Важно (заметно ухудшает опыт)

#### 6. **`[id].tsx` (clientOrdersView empty state + MasterOrdersView TabPill)**, **iconography «ClipboardList» не различает контексты**

- **Что не так:** все три empty-state карточки (ClientOrdersView line 109, NewOrdersTab line 396, RespondedTab line 460, AssignedTab line 504) используют один и тот же серый `ClipboardList` 24×24 в круге surface-3. Это «безопасно», но не несёт смысла. У клиента empty = «ты ещё не создал ни одной заявки», у мастера empty = «никто не откликнулся / тебя пока не выбрали» — это очень разные эмоции.
- **Референс:**
  - **TaskRabbit** empty My Taskers — иллюстрация рукопожатия + CTA.
  - **Thumbtack** empty projects — иллюстрация «папка» с CTA «Get matches».
  - **Profi.ru** empty — крупная иллюстрация-нерв + 1 CTA.
- **Что сделать:**
  1. Минималистично (без иллюстраций — Cal.com их не использует): подобрать **разные** Lucide-иконки по контексту:
     - `ClientOrdersView` empty → `FilePlus` (написать заявку)
     - `NewOrdersTab` empty → `Inbox`
     - `RespondedTab` empty → `Send`
     - `AssignedTab` empty → `UserCheck`
  2. На `ClientOrdersView` empty уже есть подпись «Создайте первую заявку — это бесплатно», но **нет CTA-кнопки внутри карточки**. CTA сейчас живёт во FAB справа-снизу, что для первого опыта — слабый сигнал. Добавить в EmptyCard вторичную кнопку «Создать заявку» (`button-primary`).
- **Сложность:** S
- **Mobile / Web:** Both.

#### 7. **`new.tsx` (категория и город как chips на ScrollView)**, **не масштабируется и не помогает выбрать правильно**

- **Что не так:** категории и города выводятся как flat-список chips через `flex-wrap`. На 4 категории и 2 города это нормально, но на 30+ категорий — стена pills (производительность + визуально). И главное — нет поиска. Profi.ru-стиль = быстрый поиск + категории как иерархия.
- **Референс:**
  - **Profi.ru** категорийный picker — поиск + L1 plitka.
  - **TaskRabbit** Home (`screenshotId=82073`) — карусели категорий с большими тач-таргетами.
- **Что сделать:**
  1. Заменить chip-сетку категорий на bottom-sheet picker: tap на текущую категорию → bottom-sheet с TextInput поиска вверху + `FlashList` категорий L2 (можно с группировкой по L1).
  2. Город — тот же паттерн. На старте у нас 2 города (Магас, Назрань), сейчас chips OK, но при расширении на 5+ городов сразу нужен picker.
  3. Если на старте оставляем chips — добавить `<ScrollView horizontal>` обёртку, чтобы не было wrap'а из 20 строк.
- **Сложность:** M
- **Mobile / Web:** На web категории удобнее как `<select>` с datalist или как combobox.

#### 8. **`[id].tsx`**, **нет таймлайна перехода статусов (Lazyweb `screenshotId=16509`, `63694`)**

- **Что не так:** клиент не видит истории — когда заказ был опубликован, когда первый отклик, когда выбран мастер, когда work-completed. У нас есть `created_at`, `updated_at`, `picked_master_id`. Этого достаточно для базового timeline'а.
- **Референс:**
  - **Ro** order details + activity timeline (`screenshotId=16509`, similarity 0.69 — самый близкий результат).
  - **Amazon** order tracking (`screenshotId=63694`) — крупный «Arriving today» + timeline шагов.
- **Что сделать:**
  1. На `[id].tsx` под Description (после строки 254), для `status !== 'open'`, добавить компактный таймлайн в стиле Cal.com: 3–4 вертикальные точки `bg-primary` / `bg-surface-strong`, рядом текст «Опубликован • 25 апр», «Выбран мастер • 2 ч назад», «Работа завершена • вчера».
  2. Не делать pixel-perfect Amazon-стиль — у нас услуги, не доставка. Компактный (≤120dp высота), text-first.
- **Сложность:** M (требует достать или вычислить timestamp'ы переходов; для T3/T4 у нас уже `updated_at` после accept/complete; для T1 — `created_at`)
- **Mobile / Web:** Both.

#### 9. **`[id].tsx` (master response form)**, **5 полей в один scroll и невалидный лейаут поле «Сообщение» — нет лимита-каунтера на 1000 символов**

- **Что не так:** Master отклик-форма (строки 591–769) — это price-mode chips + price-inputs + lead-time + message + submit. У `message` лимит 1000, но **нет live-counter'а** (`{value.length}/1000`), а ещё `placeholder` («Здравствуйте, готов взять. Опыт в этой задаче…») задаёт слишком слабый шаблон. У TaskRabbit / Thumbtack message-форма обычно даёт «шаблоны быстрых ответов» — 3 chips с «Доступен сегодня», «Уточню детали в чате», «Беру срочно».
- **Референс:**
  - **TaskRabbit** chat (общеизвестный паттерн) — quick-reply chips над клавиатурой.
  - **Thumbtack** pro-to-customer message — шаблоны + counter.
  - **Telegram** — char counter в правом нижнем углу caption.
- **Что сделать:**
  1. Под textarea message добавить `<AppText className="text-caption text-muted-soft text-right">{value.length}/1000</AppText>`.
  2. Над textarea — 3–4 chip-шаблона: «Здравствуйте, готов взять, уточню детали в чате», «Доступен сегодня, могу подъехать в течение часа», «Беру срочно, цена обсуждаема». Tap → вставка в начало message (не replace).
  3. Lead-time как chip-row с пресетами: «Сегодня», «Завтра», «На неделе», «Договоримся» — пользователь редко пишет вручную (это видно по placeholder'у «Завтра / 2-3 дня / на следующей неделе» — сам автор формы понимает, что выбор узкий).
- **Сложность:** S
- **Mobile / Web:** Both.

#### 10. **`[id].tsx` (ClientResponsesSection / ClientResponseRow)**, **карточка отклика не показывает фото мастера и его рейтинг — а это TaskRabbit-эталон**

- **Что не так:** `ClientResponseRow` (строка 408+) показывает только имя мастера ссылкой `text-accent` + цену + срок + сообщение. **Нет аватара мастера, нет рейтинга, нет числа выполненных работ.** Это противоречит принципу 2 («Классные фото — главный визуальный нерв») и принципу 6 — клиент не может принять решение, ему нужно тапать в `/master/[id]`.
- **Референс:**
  - **TaskRabbit Select a Tasker** (`screenshotId=9021`, samestyle 1-в-1): photo 56–72px + name + rate + ★ rating + review count + completed-count + bio-snippet. Это лучший pattern для нашего ResponseRow.
  - **Thumbtack Pro card** — большое фото + rating + «5 hires this month» как trust-signal.
- **Что сделать:**
  1. `ClientResponseRow` переделать: слева `<Avatar size="md">` (48–56), справа от него стек — `name (semibold) + rating + completed-count`, ниже цена + срок + truncated message (2 lines), под этим — `button-primary` «Принять отклик» только если `canAccept`.
  2. Сейчас на ResponseRow нет хука к master profile — добавить `useMasterRating(response.master_id)` или прокинуть `master.rating_avg / master.reviews_count / master.completed_jobs_count` в payload `useOrderResponses`.
  3. Если данных пока нет в схеме — поставить заглушки «Новый мастер» с тонкой `border-warning/20` (но без цвета warning-плашки — Cal.com нам этого не разрешает).
- **Сложность:** M (требует расширить fetch + изменить layout; новый touch на бекенд минимальный — мы это и так читаем для master detail page)
- **Mobile / Web:** Both. Принципиально.

#### 11. **`edit/[id].tsx`**, **нет диффа «что изменили» и нет предупреждения, что мастера получат пуш об изменении**

- **Что не так:** заказ можно отредактировать пока `status='open'`, но **отклики уже могли прийти**. Сейчас edit-screen не сообщает «6 мастеров уже откликнулись на старую версию заявки — они могут не понять изменение». И side-effect (rerendering feed для мастеров) непрозрачен.
- **Референс:**
  - **YouDo / Profi.ru** — при правке открытого заказа всплывает баннер «3 мастера откликнулись — они увидят обновление».
  - **Thumbtack** — Edit project с явным «pros you've contacted will see the update».
- **Что сделать:**
  1. В шапке `edit/[id].tsx` (после h1 «Редактирование», строка 159) подгрузить `useOrderResponses(orderId).data?.length` и если > 0 — info-баннер `bg-surface-2 rounded-lg p-3`: «N мастеров уже откликнулись. Они получат обновление. Бюджет / категорию / город менять не рекомендуется».
  2. Если хочется жёстко — категорию и город заблокировать `lockCategory={true}` (флаг в `OrderFormBody` уже есть, но в edit не используется!). Сейчас разрешено сменить категорию у заказа, на который пришли отклики мастеров из старой категории — это семантический баг.
- **Сложность:** S
- **Mobile / Web:** Both.

#### 12. **`index.tsx` (ClientOrdersView)**, **FAB «Создать заказ» — pill 220×56, но не «sticky»: при коротком списке он перекрывает контент**

- **Что не так:** `Pressable` с `absolute right-6 bottom-6` (строка 122) — это правильный FAB, но он широкий (текст + Plus icon = ~180dp). На пустом экране он наезжает на EmptyCard CTA-зону. Cal.com-эстетика: FAB либо иконка (44–56), либо extended pill. Если pill — он не должен жить над пустым экраном, потому что empty-state сам по себе CTA.
- **Референс:**
  - **TaskRabbit** Home (`screenshotId=82073`) — нет FAB, основное действие в самой ленте.
  - **Material 3 FAB** spec — extended FAB OK, но скрывать на пустом state.
  - **Profi.ru** — кнопка «Создать заказ» крепится к нижнему safe-area-row как full-width когда список пуст.
- **Что сделать:**
  1. На empty-state (когда `!hasOrders && !isLoading`) — **не показывать** floating FAB. Вместо этого внутри `EmptyCard` встроить `button-primary` «Создать заявку» по ширине карточки.
  2. На заполненном списке — оставить как есть, но сжать до `Plus` icon-only при scrollY > 100 (классика Material).
- **Сложность:** S
- **Mobile / Web:** На web FAB вообще не нужен — CTA «Создать заявку» в правом верхнем углу страницы (паттерн Linear / Cal.com).

---

### 🟢 Nice to have (полировка)

#### 13. **`[id].tsx OrderInfoBlock`**, **категорийная chip слабо акцентирована, время публикации спрятано**

- **Что не так:** chip `bg-surface-2 px-3 py-1` (строка 224) — это правильный Cal.com-стиль, но рядом нет ни время-метки, ни статус-бейджа. Шапка ощущается «голой». Также нет «опубликовано N минут назад» — клиент и мастер не понимают свежесть.
- **Референс:**
  - **eBay listing** (`screenshotId=20685`) — компактный meta-row под title.
  - **Thumbtack Project page** — datestamp в meta-row.
- **Что сделать:** В строке 224 рядом с категорийной chip поставить ту же chip-обёртку с `<Clock size={10}/> 2 ч назад` (можно reuse функцию `timeAgo` из OrderRow).
- **Сложность:** S
- **Mobile / Web:** Both.

#### 14. **`new.tsx` + `[id].tsx`**, **бюджет «Договорной» доминирует визуально — клиент не понимает, что лучше**

- **Что не так:** в форме (`OrderFormBody`) 3 chip — `Точная / Диапазон / Договорная` равноправны, активная выделяется `bg-accent-soft border-accent`. Но **«Договорная» — это анти-trust сигнал для мастера** — заявка без бюджета хуже ранжируется на TaskRabbit и Profi.ru. Сейчас мы не подсказываем клиенту это.
- **Референс:**
  - **TaskRabbit** показывает hourly rate всегда, бюджет — обязательное поле.
  - **Profi.ru / YouDo** — «Договорная» допустимо, но рядом подсказка «Заявки с бюджетом получают на 30% больше откликов».
- **Что сделать:** Под chip-row добавить `text-caption-xs text-muted` микро-подсказку «Заявки с указанным бюджетом получают на 30% больше откликов». Это правило 6 (функциональность) + повышает конверсию response-rate.
- **Сложность:** S
- **Mobile / Web:** Both.

#### 15. **`[id].tsx (master response form, price chips)`**, **chip «Договорная» по умолчанию — анти-Profi.ru**

- **Что не так:** `defaultValues.priceMode: "negotiable"` (строка 510) — мастер по умолчанию шлёт без цены. Profi.ru / Thumbtack этот паттерн ломали явно — у мастера должно быть выгодно поставить цену.
- **Что сделать:** Default — `exact`. И добавить **под price-mode chips** микро-подсказку: «Клиенты выбирают мастеров с конкретной ценой чаще».
- **Сложность:** XS
- **Mobile / Web:** Both.

#### 16. **`[id].tsx`**, **карточка-info «Вы выбрали мастера. Заказ в работе» (line 330–336) дублирует то, что должен делать бейдж**

- **Что не так:** после введения `OrderStatusBadge` (находка #1) эта зелёная плашка становится избыточной. Она занимает много места.
- **Что сделать:** Удалить плашку. Вместо неё — рядом с бейджем «В работе» текстовая подсказка `text-caption text-muted` «Чтобы завершить заказ — нажмите ниже».
- **Сложность:** XS
- **Mobile / Web:** Both.

#### 17. **Везде**, **`active:opacity-70` / `active:opacity-80` непоследовательно**

- **Что не так:** иконки и primary CTA в файлах используют разные значения active-opacity: `active:opacity-70` (Pressable «Назад», ResponseRow), `active:opacity-80` (primary submit), `active:opacity-60` (TabPill inactive). DESIGN.md не описывает active-tokens, но визуально это даёт «дрожание».
- **Что сделать:** Завести utility `pressableScale` / `pressableFade` и нормировать: primary → 0.85, secondary/icon → 0.7. Зафиксировать в DESIGN.md как pending decision (это и есть пробел dark-токенов, упомянутый в BRIEF).
- **Сложность:** S (косметика)

#### 18. **`new.tsx` / `edit/[id].tsx`**, **submit error показан мелким `text-caption text-error` без иконки и без retry**

- **Что не так:** строки 113–119 (`new.tsx`), 175–181 (`edit`). Просто красный текст. На реальных ошибках сети (offline, 5xx) — не понятно, что делать.
- **Что сделать:** Стандартизовать error-state как `<View className="rounded-md border border-error/30 bg-error-soft p-3 flex-row gap-2">` с `<AlertCircle/>` + текст + ссылка «Повторить». В индексе уже есть retry (line 76–84 ClientOrdersView) — переиспользовать паттерн.
- **Сложность:** S

---

## Кросс-экранные паттерны

1. **Отсутствует `OrderStatusBadge`** — единственный самый высокий-impact gap. Сейчас статус живёт в косвенных подсказках (зелёные плашки, текст «Клиент уже выбрал», слово `ВЫБРАН`). Это нарушает принцип 6 (функциональность) и принцип 3 (удобство): пользователь должен сходу понимать, на каком шаге его заказ.

2. **Голубой `bg-accent` (`#2563eb` / `#3b82f6`) применён неконсистентно:**
   - имя клиента/мастера ссылкой (`text-accent`) — ok как inline-link;
   - chip выделения категории/города/срочности в форме (`bg-accent-soft border-accent`) — приемлемо;
   - **счётчик в активной TabPill** (`bg-accent`, строка 294) — **анти-Cal.com**, монохромный CTA-слой ломается.
   - **активный мастер-response плашка** (`border-accent bg-accent-soft`, строка 551) — ok, но конкурирует с success-плашкой `border-success bg-success-soft` (когда `isPickedMaster`). Два разных «green/blue» сигнала рядом — выбрать один.
   - **Recommendation:** свести голубой к inline-link + form chip selected. На status signals (success / picked / pending) использовать `success`/`primary` монохромно.

3. **Empty states все одинаковые** (ClipboardList icon + title + subtitle). Контекстно разные эмоции должны давать разные иконки и **inline-CTA** в самой карточке (см. находку #6 + #12).

4. **Активный/неактивный pill-стиль одинаков в 4 местах:** OrderFormBody (категория, город, срочность, бюджет), master response price-mode. Унификация уже есть, но `accessibilityState={{ selected }}` стоит не везде — например, в TabPill (строка 279) есть, в category-chip в OrderFormBody (строка 81) есть. Это хорошо — оставить.

5. **Web-специфика игнорируется:** все экраны написаны mobile-first под `KeyboardAvoidingView` + safe-area, но при web-render (Expo Web) FAB, wizard, и empty state будут странно смотреться на широком экране. Нужен явный breakpoint-разлив: `index.tsx` на ≥768 — двухколоночный (left: orders list, right: detail preview), `new.tsx` на ≥1024 — single-form + side-panel «как это работает» (Profi.ru-стиль).

6. **Dark mode пробел:** DESIGN.md в основном описывает light, дарк-токены `surface-card-dark`, `accent-soft-dark`, `success-soft-dark` нигде не прописаны. На текущих экранах в dark-mode плашки `bg-success-soft` / `bg-accent-soft` будут читаться плохо — нужны явные dark-варианты или dynamic-token через NativeWind CSS vars.

7. **A11y `accessibilityHint` пропущен почти везде** — есть `accessibilityLabel` (хорошо) и `accessibilityRole="button"` (хорошо), но `accessibilityHint` (что произойдёт по тапу) не указан. Для destructive actions («Принять отклик» — это блокирует другие отклики; «Работа выполнена» — terminal) hint обязателен.

8. **TimeAgo функция** (OrderRow) дублирована в `ClientResponseRow` неявно (там нет timestamp вообще). Вынести в `src/lib/time.ts` и использовать везде.

---

## Что отлично — НЕ трогать

1. **Структура файлов и разделение ролей** на странице `[id].tsx`: `OrderInfoBlock` (общий) → `CompletionSection` → `ClientResponsesSection` / `MasterResponseSection` → `ClientReviewSection` / `MasterReviewSection`. Это правильный композиционный паттерн под state-machine.

2. **OutcomeTrackingModal** (строки 79–93, 183–201) и его выделение в отдельный pure-store (`outcome-store.ts` + тесты `outcome-store.test.ts`) — отличный пример AI-friendly архитектуры из CLAUDE.md. Логика «спросить через 3 дня» — это правильный nudge без агрессии.

3. **`OrderFormBody` как переиспользуемый компонент** между `new` и `edit/[id]` (с флагом `lockCategory`) — DRY на месте. Только не забыть передавать `lockCategory={true}` в edit-режиме (находка #11).

4. **Tab-system MasterOrdersView** (Новые / Я откликнулся / Меня выбрали) — правильно разделяет ментальные модели мастера. TaskRabbit делает то же (Tasks / My Taskers разделены), Profi.ru мастер-кабинет — тоже. Удалять/мерджить не нужно.

5. **Pull-to-refresh** через `usePullToRefresh()` подключён в обоих видах списка — это правильная mobile-конвенция.

6. **`maxFontSizeMultiplier={1.3}`** на TextInput'ах — правильное ограничение Dynamic Type, иначе input рвёт layout.

7. **RLS-симметричный UI:** код в `EditOrderScreen` явно проверяет `isOwner` + `isEditable` (status='open') и шлёт UPDATE — это совпадает с RLS-policy `orders_owner_edit_open`. Не разваливать эту симметрию.

8. **«Опубликуйте заявку — мастера откликнутся в течение часа»** на ClientOrdersView (строка 60–62) — отличный trust-сигнал и Profi.ru-pattern. Только хорошо бы перенести его и на submitted-экран после публикации (находка #3).

9. **OrderInfoBlock author-row** (строка 257–284) с аватаром клиента, его рейтингом и ссылкой на профиль — правильная двусторонняя rating-модель (Airbnb-style). Это база под reputation-economy в Ингушетии.

10. **Категорийная chip в шапке `OrderInfoBlock` и в `OrderRow`** — Cal.com-стиль на месте, `bg-surface-2 rounded-pill px-3 py-1` — это эталонно. Сохранить.

---

## Сверка с задачей

- ✅ Прочитал PRODUCT_CONTEXT.md, DESIGN.md, BRIEF.md, docs/order-states.md.
- ✅ Прочитал все 4 экрана (`index.tsx`, `[id].tsx`, `new.tsx`, `edit/[id].tsx`) + `_layout.tsx` + связанные `OrderRow`, `OrderFormBody`, `order-schema.ts`.
- ✅ Lazyweb использован 6 раз (queries: order list status badges, TaskRabbit request task, order detail tracking timeline, Thumbtack project page, booking budget form, Profi/Yandex order, multi-step progress, cancel confirm). Цитированы 12 конкретных скриншотов с `screenshotId`.
- ✅ Каждая находка опирается минимум на 1 из 4 главных рефов (Profi.ru, Яндекс.Услуги, TaskRabbit, Thumbtack) + Lazyweb-данные где это применимо.
- ✅ Прошёл по 4 шляпам (Mobile UX, Visual, Conversion, A11y) — Mobile UX в #1, #2, #4, #12; Visual в #4, #5, #16, #17; Conversion в #2, #3, #6, #9, #10, #14, #15; A11y в #5, #7, кросс-патт. #7.
- ✅ Все рекомендации — конкретные правки, никаких «полностью переделать».
- ✅ Каждая находка имеет severity (🔴 / 🟡 / 🟢), complexity (XS / S / M / L), Mobile / Web / Both.
- ✅ Создание заказа (`new.tsx`) рассмотрено как критичный экран — находка #3 + #7 + #14.
- ✅ State-machine связь явно прописана: находка #1 (бейдж под все 6 статусов), #2 (T2/T6 — отсутствует UI cancel), #8 (timeline переходов).
- ✅ Отчёт по-русски.
- ✅ Файл сохранён в `/Users/ruslancherbizhev/Desktop/xtrud/.claude/audit-2026-05-12/orders.md`.
