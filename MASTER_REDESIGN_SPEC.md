# MASTER_REDESIGN_SPEC.md — Перенос клиентского визуала на все мастер-экраны

> Цель: подтянуть мастер-side к качеству клиентских экранов. Сейчас клиент-главная и `/orders/new` ощущаются как Vercel-уровень, а мастер-side — как stub (plain ActivityIndicator, плоские chip-row, без hero-иллюстраций, без декоративных фигур, без glow на primary action).
>
> Этот файл — точка входа: **что именно** заимствуем у клиента + **в каких экранах** мастера применяем + **в каком порядке**.
>
> Связано: [DESIGN.md](DESIGN.md) (токены) · [MASTER_ACCOUNT_SPEC.md](MASTER_ACCOUNT_SPEC.md) (структура аккаунта) · [STATUS.md](STATUS.md) (где мы сейчас)

---

## TL;DR

**8 визуальных паттернов** клиента, которые надо перенести на мастер-экраны:

1. **Hero-иллюстрация с tinted-фоном + декоративные фигуры** (3-4 круга/квадрата с разной opacity + центр-иконка в canvas-circle). Эталон — `FeaturedRequests` и `DescribeTaskCallout` в `app/(tabs)/index.tsx`.
2. **Theme-aware glow на primary action** — белое свечение (`box-shadow: 0 0 18px rgba(255,255,255,0.06)…`) на dark, мягкий drop-shadow на light. Эталон — Hero search.
3. **Section gap `mt-10`** между крупными блоками + `text-title-lg` semibold заголовок + опц. `text-body-sm text-mute` подзаголовок.
4. **Animated fade-in** при появлении async-данных (`Animated.timing` opacity, 280ms). Эталон — `TopMasters`, `AllCategories`.
5. **Skeleton повторяющий форму реальной карточки** — НЕ `<ActivityIndicator />` посередине пустого экрана. Эталон — `MasterMiniCard` skeleton (180×180 + 3 строки), `OrderRowsSkeleton`.
6. **HelpCallout-style плашка** с pink-coral gradient-логотипом + 2-line copy. Эталон — `<HelpCallout>` под списком категорий.
7. **Color-icons** для категорий через `getCategoryColorIconUrl` (Iconify CDN fluent-color set), Lucide моно как fallback.
8. **Empty/error state с иллюстрацией** — иконка 48px в canvas-soft-2 круге + заголовок + объяснение + CTA. НЕ просто текст «ничего не нашли».

**11 мастер-экранов** для редизайна (по приоритету):

| # | Экран | Где живёт | Боль сейчас |
|---|-------|-----------|--------------|
| 1 | **Поиск заказов** | `app/(tabs)/orders/search.tsx` | Plain `ActivityIndicator` при загрузке, плоские chip-row фильтры, голый header, нет иллюстрации в empty-state |
| 2 | **Главная мастера** | `src/features/master-view/MasterHomeContent.tsx` | Только AvailabilitySwitcher + StatsBlock + CTA. Нет hero, нет featured-блока, нет персонализации |
| 3 | **Мои заказы (3 таба)** | `app/(tabs)/orders/index.tsx` (master-режим) | Tab-bar плоский, empty-state бедный, нет иллюстраций в каждом табе |
| 4 | **Карточка заказа (вид мастера)** | `app/(tabs)/orders/[id].tsx` (when not own) | Форма отклика плоская, нет hero, нет успокаивающего callout «Лимит откликов на сегодня» |
| 5 | **Чаты — список** | `app/(tabs)/chats/index.tsx` | Empty-state бедный, нет иллюстрации, аватары без availability-dot для master-side |
| 6 | **Чат — диалог** | `app/(tabs)/chats/[id].tsx` | Header плоский, нет sticky-блока «о заказе» сверху, нет quick-actions для мастера |
| 7 | **Профиль мастера (свой)** | `app/(tabs)/profile/index.tsx` (master-режим) | Plain stats, нет hero, нет «share-кнопки» для лендинга |
| 8 | **Редактирование профиля** | `app/(tabs)/profile/edit-master.tsx` | Form плоская, нет prog-bar «прокачка профиля», нет verification-секции |
| 9 | **Категории мастера (edit)** | `app/(onboarding)/master-categories.tsx` | Используется и в edit-режиме — нет hero, нет помощника «как выбрать» |
| 10 | **Услуги мастера (CRUD)** | `src/features/master-services/MasterServicesSection.tsx` | Inline-форма примитивная, нет иллюстрации empty-state |
| 11 | **Портфолио (CRUD)** | `src/features/profile/PortfolioGrid.tsx` (edit-режим) | Empty state без иллюстрации, нет prog-индикатора количества фото |

---

## Раздел 1. Инвентарь паттернов клиента (8 штук)

### Паттерн 1 — Hero-иллюстрация с tinted bg + декоративные фигуры

**Где в коде эталон:** `app/(tabs)/index.tsx` ⟶ `FeaturedRequests` (строки 197-291) и `DescribeTaskCallout` (299-337).

**Структура:**

```tsx
<View className={`h-28 ${tintBg} items-center justify-center relative overflow-hidden`}>
  {/* 3-4 декоративные фигуры — canvas-цвета с разной opacity */}
  <View className="absolute rounded-full bg-canvas"
        style={{ top: -18, left: -16, width: 64, height: 64, opacity: 0.35 }} />
  <View className="absolute rounded-full bg-canvas"
        style={{ bottom: -14, right: -10, width: 52, height: 52, opacity: 0.45 }} />
  <View className="absolute rounded-md bg-canvas"
        style={{ top: 18, right: 18, width: 18, height: 18, opacity: 0.55,
                 transform: [{ rotate: "12deg" }] }} />
  {/* Центральная иконка в canvas-circle */}
  <View className="h-14 w-14 items-center justify-center rounded-full bg-canvas">
    <Icon size={28} strokeWidth={1.5} color="currentColor" />
  </View>
</View>
```

**Tint-цвета (из `tailwind.config`):**
- `bg-badge-sky` — клининг / повседневное
- `bg-badge-violet` — privacy / AI / премиум
- `bg-badge-amber` — срочное / ремонт
- `bg-badge-emerald` — деньги / поручительства (новое — для мастер-стейта success)

**Когда применять у мастера:**
- Hero на главной мастера (welcome-block)
- Hero «Откликов сегодня: 3 из 5» с амбер-tint когда осталось ≤2
- Hero «Меня выбрали 2 раза» с emerald-tint
- Empty-state «Заявок пока нет» с sky-tint + иконка inbox
- Section-header в edit-master «Прокачайте профиль» с violet-tint

### Паттерн 2 — Theme-aware glow на primary action

**Где в коде эталон:** `app/(tabs)/index.tsx` ⟶ `Hero` функция, строки 364-371.

```ts
const searchShadow = isDark
  ? "0 0 0 1px rgba(255,255,255,0.1), 0 0 18px rgba(255,255,255,0.06), 0 0 40px rgba(255,255,255,0.03), 0 2px 10px rgba(0,0,0,0.1)"
  : "0 2px 10px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.015)";
```

Применяем через `style={{ boxShadow: searchShadow }}` к `<Pressable>` обёртке primary action.

**Когда применять у мастера:**
- Кнопка «Откликнуться» на карточке заказа (главный CTA)
- Кнопка «Добавить категорию» в edit-master (когда у мастера 0 категорий)
- Поле ввода сообщения в чате (primary input)

### Паттерн 3 — Section gap и заголовки

**Эталон:** `mt-10` между секциями, внутри секции `mt-3..mt-4` к контенту от заголовка.

```tsx
<View className="mt-10">
  <View className="px-5">
    <AppText weight="semibold" className="text-title-lg text-ink">
      Лучшие мастера рядом
    </AppText>
    <AppText className="mt-1 text-body-sm text-mute">По рейтингу и отзывам</AppText>
  </View>
  {/* контент */}
</View>
```

**Когда применять у мастера:**
- Везде где сейчас `gap-6` или `mt-4` между блоками — повышаем до `mt-10` для крупных секций.
- Каждая секция получает заголовок (`text-title-lg semibold`) + опционально подзаголовок (`text-body-sm text-mute`).

### Паттерн 4 — Animated fade-in для async данных

**Эталон:** `TopMasters` и `AllCategories`, строки 425-436 / 599-608.

```tsx
const opacity = useRef(new Animated.Value(0)).current;
useEffect(() => {
  if (!isLoading && data && data.length > 0) {
    Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }
}, [isLoading, data, opacity]);

return <Animated.View style={{ opacity }}>{/* ... */}</Animated.View>;
```

**Когда применять у мастера:**
- Master Home — fade-in MasterStatsBlock когда загрузился
- Orders feed — fade-in списка после load
- Chat list — fade-in диалогов
- Master profile — fade-in портфолио / отзывов

### Паттерн 5 — Skeleton по форме реальной карточки

**Эталон 1:** `TopMasters` skeleton (`MasterMiniCard` shape) — строки 455-467.

```tsx
<View style={{ width: 180 }}>
  <Skeleton width={180} height={180} className="rounded-lg" />
  <Skeleton height={16} width={140} className="mt-3 rounded" />
  <Skeleton height={12} width={110} className="mt-2 rounded" />
  <Skeleton height={12} width={70} className="mt-2 rounded" />
</View>
```

**Эталон 2:** `OrderRowsSkeleton` (есть в проекте, см. `src/components/Skeleton.tsx`).

**Что переписать у мастера:**
- `app/(tabs)/orders/search.tsx` строка 234-236 — `<ActivityIndicator />` → `OrderRowsSkeleton` (3-4 шт).
- `MasterStatsBlock` строки 27-29 — серый прямоугольник 188px → структурный skeleton (1 wide card + 3 tiles).
- `MasterHomeContent` — добавить skeleton'ы для всех секций при загрузке.

### Паттерн 6 — HelpCallout-style плашка

**Эталон:** `src/components/HelpCallout.tsx` — pink-coral gradient logo (56×56) + bold-title + body-link copy.

**Когда применять у мастера:**
- Под профилем мастера — «Расскажите о вашей работе клиентам» (CTA → редактировать bio).
- Под пустым feed заявок — «Не получаете заявки? Расширьте категории / увеличьте радиус».
- Под чатом — «У вас закрыт N сделок без отзыва — попросите клиента оставить».

### Паттерн 7 — Color-icons для категорий

**Эталон:** `getCategoryColorIconUrl(l2Id)` → Iconify CDN fluent-color URL. Fallback на Lucide моно через `getCategoryIcon(iconName)`. См. `src/lib/category-color-icons.ts` + `docs/ICONS.md`.

```tsx
const colorUrl = getCategoryColorIconUrl(cat.id);
{colorUrl ? (
  <Image source={{ uri: colorUrl }} style={{ width: 24, height: 24 }} />
) : (
  <Icon size={20} strokeWidth={1.5} color="currentColor" />
)}
```

**Уже применено** в `OrderRow` (используется и у мастера). Нужно проверить, что:
- master-categories chip-list на главной использует color-icons (сейчас plain text).
- edit-master категории в форме показывают color-icons.

### Паттерн 8 — Empty/error state с иллюстрацией

**Эталон:** `app/(tabs)/orders/index.tsx` empty-state (master-режим). Структура:

```tsx
<View className="items-center rounded-xl bg-canvas-soft-2 px-6 py-10">
  <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas">
    <Icon size={24} strokeWidth={1.75} color={muteColor} />
  </View>
  <AppText weight="semibold" className="mt-4 text-title-md text-ink">
    Заявок пока нет
  </AppText>
  <AppText className="mt-2 text-center text-body-sm text-muted">
    Здесь появятся новые заявки клиентов по вашим категориям.
  </AppText>
  <Button onPress={ctaAction} variant="secondary" size="sm" className="mt-4">
    Расширить категории
  </Button>
</View>
```

**Усиление:** заменить простой круг с иконкой на **hero-иллюстрацию** (Паттерн 1) — tinted-фон + декоративные фигуры + центр-иконка. Это превращает empty в полноценный визуальный момент, а не «ошибку приложения».

---

## Раздел 2. План редизайна по экранам (порядок исполнения)

Каждый экран = одна сессия / один turn. Перед редизайном — посмотреть скрин в preview, замерить gap, потом переписать. Lazyweb используется когда ищем референсы конкретных pattern'ов (search-screens, chat-headers, etc.).

### Этап 1 — Поиск заказов (`/orders/search`) ⟶ ПЕРВЫЙ

**Файл:** `app/(tabs)/orders/search.tsx`

**Что меняем:**
- Header → подтянуть к стилю клиентского `Hero` (lighter + bigger title `text-display-sm`, фильтр-pill справа с glow на dark).
- Заменить плоский `ActivityIndicator` → `OrderRowsSkeleton` x4.
- Empty-state → hero-иллюстрация (Паттерн 1, tint = sky) + заголовок + CTA «Сбросить фильтры» (если есть).
- Filter-block (when expanded) → перенести в **BottomSheet** (как `<LocationPicker>` в orders/new) — на mobile экспандируемый блок занимает половину экрана, лучше bottom-sheet. На web — оставить inline.
- Кнопки L2 chips → переиспользовать `<Chip>` из `src/components/ui/` (уже есть unified компонент).
- Карточки заказов — добавить fade-in (Паттерн 4).
- HelpCallout снизу: «Не нашли подходящих? Включите больше категорий в профиле» с CTA → /profile/edit-master.

### Этап 2 — Главная мастера (`MasterHomeContent`)

**Файл:** `src/features/master-view/MasterHomeContent.tsx` (полный rewrite, ~200 строк).

**Что меняем — новая структура:**

1. **Hero-приветствие** (`mt-6`): tinted hero (Паттерн 1, tint = sky) + большой заголовок «Доброе утро, Руслан» + sub «3 заявки ждут отклика» (если есть match).
2. **AvailabilitySwitcher** (`mt-6`): без изменений (уже OK), но обернуть в Card.
3. **MasterStatsBlock** (`mt-10`): обернуть top-card с лимитом откликов в **violet-tint hero** (Паттерн 1) — лимит превращается из «инфо-карточки» в **визуальный геймификационный момент** («Прокачивай!»). Прогресс-бар — толще, glow-эффект на заполненной части.
4. **Featured Today заявки** (`mt-10`): новый блок — 3 hot-заявок горизонтальной каруселью (по моим L2, urgent сверху). Каждая карточка = `OrderRow` mini-вариант (180×120). Аналог клиентского `TopMasters`.
5. **HelpCallout** (`mt-10`): «Получаете мало заявок? Расширьте категории» → `/profile/edit-master`.
6. **Pull-to-refresh** + scroll-to-top reset (как у клиента).

### Этап 3 — Мои заказы (`(tabs)/orders/index.tsx`, master-режим)

**Файл:** `app/(tabs)/orders/index.tsx` — большой файл, нужно переписать master-side секции (3 таба).

**Что меняем:**
- Tab-bar → подтянуть к Vercel underline-style (текущий — просто chip).
- Каждый таб — empty-state с hero-иллюстрацией (разный tint per tab):
  - **Новые** = sky («Здесь появятся подходящие заявки. Расширьте категории чтобы получать больше.»).
  - **Я откликнулся** = amber («Пока вы не отправили ни одного отклика. Вернитесь на главную и просмотрите ленту.»).
  - **Меня выбрали** = emerald («Вас ещё не выбрали ни на один заказ. Отвечайте быстрее на новые заявки — это даёт +30% к шансу выбора.»).
- `OrderRowsSkeleton` x4 при загрузке.
- Animated fade-in списков.

### Этап 4 — Карточка заказа (вид мастера) (`/orders/[id]`)

**Файл:** `app/(tabs)/orders/[id].tsx`

**Что меняем (master-side):**
- Hero-блок сверху — большое название заявки + status-pill + meta-row (категория, urgency, бюджет, локация) на violet-tinted hero (Паттерн 1).
- Sticky bottom — кнопка «Откликнуться» с glow (Паттерн 2). При лимите 5/5 — disabled + красный мини-callout «Лимит на сегодня исчерпан».
- Форма отклика — обернуть в Card, prog-индикатор «N символов из 500» mono-шрифтом.
- Под формой — HelpCallout (Паттерн 6) «Хотите больше шансов? Прикрепите 1-2 фото похожих работ» с CTA → откроет picker.

### Этап 5 — Чаты — список (`/chats`)

**Файл:** `app/(tabs)/chats/index.tsx`

**Что меняем (master-side):**
- Header — `text-display-sm` «Чаты» + filter chip (Активные/Все).
- Empty-state — hero-иллюстрация (sky) + «Здесь появятся диалоги с клиентами» + CTA «На главную».
- Каждый чат-row — добавить availability-dot на аватар клиента, last-message preview уже есть.
- Animated fade-in.

### Этап 6 — Чат — диалог (`/chats/[id]`)

**Файл:** `app/(tabs)/chats/[id].tsx`

**Что меняем (master-side):**
- Header — sticky info-card сверху: название заявки + status-pill + кнопка «К заявке».
- Quick-actions row под header — 3 chip'а: «Я выехал», «На месте», «Закончил» (для in-progress заказов).
- Поле ввода — добавить glow на dark (Паттерн 2).
- Empty-state (если новый чат, нет сообщений) — иллюстрация + «Поприветствуйте клиента» + 3 шаблона быстрого старта.

### Этап 7 — Профиль мастера (`/profile`)

**Файл:** `app/(tabs)/profile/index.tsx` (master-режим).

**Что меняем:**
- Hero — большая карточка с аватаром + именем + бейджем верификации на violet-tinted hero (Паттерн 1).
- Stats grid (3-4 tile'а): «Рейтинг ★», «Закрытых сделок», «Откликов всего», «На сервисе с YYYY».
- Section «Моя видимость» (`mt-10`) — switch «Виден в каталоге», link «Поделиться профилем» → копирует public URL.
- Section «Мои категории» (`mt-10`) — chips с color-icons + CTA «Управлять».
- HelpCallout «Привлеките больше клиентов — добавьте видео-визитку» (TBD в Phase-3).

### Этап 8 — Редактирование профиля (`/profile/edit-master`)

**Файл:** `app/(tabs)/profile/edit-master.tsx`

**Что меняем:**
- Заголовок страницы — `text-display-sm` «Профиль мастера» + sub «Изменения видны клиентам сразу».
- Sectional layout с заголовками (Паттерн 3):
  - «Об авторе» (имя, фамилия, аватар, город, район)
  - «Опыт и условия» (лет, has_tools, has_transport, радиус)
  - «О себе» (bio textarea с counter)
  - «Услуги и цены» (`MasterServicesSection`)
  - «Верификация» (новое — pre-filled status, кнопки «Подтвердить ИНН» / «Загрузить документ»)
- Sticky bottom save button с glow.

### Этап 9 — Категории мастера (`(onboarding)/master-categories.tsx`, edit-режим)

**Файл:** `app/(onboarding)/master-categories.tsx`

**Что меняем:**
- Hero сверху — tinted-block (sky) + заголовок «Какие услуги вы оказываете?» + sub «До 5 категорий — выбирайте те, в которых уверены».
- Каждая категория-chip — color-icon + название (Паттерн 7).
- Counter «N/5 выбрано» с прогресс-баром.
- HelpCallout снизу (если 0 выбрано) — «Не уверены? Начните с одной — добавите остальные потом».

### Этап 10 — Услуги (`MasterServicesSection`)

**Файл:** `src/features/master-services/MasterServicesSection.tsx`

**Что меняем:**
- Empty-state — hero-иллюстрация amber + «Добавьте услуги с ценами — клиент сразу поймёт сколько вы берёте» + CTA «Добавить первую услугу».
- Каждая service-row — улучшить inline-форму: pricing-mode chip-row + price-helper «✨ В среднем берут X ₽» (уже есть, но визуально плоский).

### Этап 11 — Портфолио

**Файл:** `src/features/profile/PortfolioGrid.tsx` + edit-режим.

**Что меняем:**
- Empty-state — hero violet + «Добавьте 5+ фото — мастера с портфолио получают в 3× больше заявок» + CTA.
- Прог-индикатор количества фото (X/30) сверху.
- Каждое фото — hover-state (на web) + delete-кнопка появляется в углу.

---

## Раздел 3. Чек-лист для каждого экрана

Перед закрытием задачи редизайна — пройти чек-лист:

- [ ] Все 8 паттернов рассмотрены — какие применимы, какие нет (записать в отчёте).
- [ ] Сверка с DESIGN.md типографики (`text-title-lg` для секций, `text-body-md` для основного текста).
- [ ] Цвета только через NativeWind className из colors.ts (не inline `style={{color:"#fff"}}`).
- [ ] Empty / loading / error state покрыты с иллюстрацией.
- [ ] Animated fade-in добавлен для async данных.
- [ ] Skeleton повторяет форму реальной карточки.
- [ ] Theme-aware glow на primary action.
- [ ] Dark mode проверен в preview.
- [ ] Скриншот сделан, выглядит финально.
- [ ] `tsc --noEmit` чисто.
- [ ] Запись в STATUS.md + соответствующая секция в SESSION_SUMMARY.

---

## Раздел 4. История решений

| Дата | Решение | Why |
|------|---------|-----|
| 2026-05-15 | Делать редизайн **по одному экрану** в turn, не батчем | Размер задачи — 11 экранов × ~200 строк каждый. Батч не пройдёт по контексту, и пользователь не сможет давать фидбек после каждого. |
| 2026-05-15 | Перенос **8 паттернов** клиента, не «прямой клон» | Мастер-роль ≠ клиент-роль. Hero «Найдутся мастера» бесмыслен у мастера; вместо него — «Доброе утро, Руслан» с подсказкой про активные заявки. |
| 2026-05-15 | **Hero-иллюстрация = главный визуальный приём** | Декоративные shapes в Vercel docs covers стиле — это и есть «иллюстрации, цвета, свечение» которые user попросил перенести. Никаких стоковых картинок (правило проекта). |
| 2026-05-15 | Lazyweb — для конкретных pattern'ов (search, chat-header, empty-state), не для общей эстетики | Общая эстетика уже зафиксирована в DESIGN.md + клиентских экранах. Lazyweb помогает с UX-нюансами конкретного экрана. |

---

## Связанные документы

- [DESIGN.md](DESIGN.md) — токены, цвета, типографика, минимальные размеры шрифта.
- [MASTER_ACCOUNT_SPEC.md](MASTER_ACCOUNT_SPEC.md) — структура аккаунта мастера (БД + UI).
- [.claude/rules/design-quality.md](.claude/rules/design-quality.md) — чек-лист качества UI перед закрытием задачи.
- [.claude/rules/lazyweb-rules.md](.claude/rules/lazyweb-rules.md) — когда искать референсы.
- `app/(tabs)/index.tsx` — эталон клиентской главной (Hero + FeaturedRequests + DescribeTaskCallout + TopMasters + AllCategories + HelpCallout).
- `src/components/HelpCallout.tsx` — эталон «pink-coral gradient + 2-line text» плашки.
- `src/components/OrderRow.tsx` — карточка заказа (используется и у клиента, и у мастера).
