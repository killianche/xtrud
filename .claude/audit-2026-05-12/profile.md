# Аудит: Profile (мой профиль + редактирование профиля мастера)

## TL;DR

Текущий «Профиль» — гибрид settings hub и owner-view карточки мастера: висит аватар + рейтинг + город, потом «Редактировать профиль / Категории / Портфолио / Выйти». На уровне дизайна — нет тёмной темы (хардкод `#0a0a0a`, `#71717a`, `#2563eb`), нет theme toggle (а это пункт DESIGN.md + PRODUCT_CONTEXT.md), portfolio upload идёт **через системный пикер без crop/ratio/min-size** (это ломает принцип №2 «Фото — главный визуальный нерв»), а на `edit-master` радиус задаётся `number-pad`-инпутом без слайдера/карты (Яндекс.Услуги делают это иначе). Нет showcase-режима «как меня видит клиент», нет полей телефона/контактов/услуг с прайсом — мастер редактирует кусок данных, но не управляет своей публичной карточкой. Главные правки — S/M, перерисовка целиком не нужна.

## Экраны в скоупе

- `/Users/ruslancherbizhev/Desktop/xtrud/app/(tabs)/profile/index.tsx` — мой профиль (settings hub + owner-view + портфолио)
- `/Users/ruslancherbizhev/Desktop/xtrud/app/(tabs)/profile/edit-master.tsx` — редактирование расширенного профиля мастера (имя, город, bio, опыт, радиус, инструмент, транспорт)
- `/Users/ruslancherbizhev/Desktop/xtrud/app/(tabs)/profile/_layout.tsx` — Stack без хедера, slide_from_right

Связанные:
- `/Users/ruslancherbizhev/Desktop/xtrud/src/features/master-profile/MasterProfileFormBody.tsx` — общая форма (используется и в онбординге, и в редактировании)

## Референсы, на которые опирались

### Главные четыре (PRODUCT_CONTEXT)
- **Thumbtack pro account / pro detail** — образец «карточки исполнителя нового поколения»: большое фото, photo gallery, FAQ, trust-signals блоками. Мы должны уметь видеть превью этого. Бриф PRODUCT_CONTEXT.md.
- **Яндекс.Услуги (Исполнители)** — гео-карточка с радиусом выезда на мини-карте, простой кабинет исполнителя. Используем как опору для радиуса.
- **Profi.ru** — кабинет мастера, верификация, привязка категорий — поддерживаем разделение Profile-as-settings vs Profile-as-showcase.
- **TaskRabbit** — Tasker profile с минимумом шума, чистая типографика; используется как образец Owner-view header'а с большим фото.

### Lazyweb (платформенный опыт паттернов)
- **Telegram, edit profile (screenshotId 12005, mobile)** — единый экран edit profile с photo, name, bio, phone, theme color, log out, явный Cancel / Done. Близкий по составу к нашему случаю.
- **Spotify settings (9556, mobile)** — settings list с iconified-rows + chevron'ом, profile header сверху. Эталон settings hub структуры.
- **Believe finance (70221, mobile)** + **Lawfully (69109, mobile)** — edit profile: avatar + edit-photo control + name + bio с countervalue + disabled Save до изменений.
- **TikTik Studio (21643, mobile)** + **Medium edit profile (14511, mobile)** — bio с явным character counter, external links, photo upload row.
- **Airbnb account screen (88079, mobile)** — наглядное разделение: profile header → notifications → промо-карта «Start hosting» → settings list по категориям. Подтверждает PRODUCT_CONTEXT §Airbnb.
- **Photoroom portrait setup (69627, mobile)** — отдельный экран позиционирования фото (drag/pinch) перед сохранением. Хороший образец для crop step.
- **Asana portfolios (15159)** + **Canva projects library (85184)** + **VSCO photo picker (68421)** — портфолио grid + photo-picker modal с tabs «Recents / Albums».
- **Overcast theme settings (14783, mobile)** + **Brave appearance (19398, mobile)** + **NYT Games (13652, mobile)** + **AP display theme (14483, mobile)** + **Trello (69847, mobile)** — образец трёх-радио «Automatic / Light / Dark» как bottom-sheet или inline row.
- **Craigslist location picker (65480, mobile)** + **Citizen alert radius (10266, mobile)** + **Citymapper radius overlay (15757, mobile)** + **Redfin map (67604, mobile)** — мини-карта с radius-circle поверх + slider/CTA-row снизу. Прямой референс для service-radius экрана.

---

## Находки

### 🔴 Критично (ломает UX, конверсию или дизайн-принципы)

#### 1. **`profile/index.tsx`** — Theme toggle отсутствует, dark mode не поддерживается

**Что не так:**
- На экране используются захардкоженные hex'ы: `color="#0a0a0a"` (ChevronLeft, x2), `color="#71717a"` (ChevronRight, x2), `color="#374151"` (LogOut), `color="#f59e0b"` (Star, заливка), `color="#ffffff"` (Pencil), `color="#2563eb"` (Plus). Они не реагируют на dark theme.
- Нет UI-контрола для смены темы вообще. В CLAUDE.md и PRODUCT_CONTEXT написано: «Темы: light + dark с переключателем», «На вебе — видимый toggle в header. На mobile — следовать системной теме + override в настройках». Сейчас ни системного, ни override-варианта в UI не существует.
- В edit-master.tsx — те же хардкоды: `color="#0a0a0a"`, `placeholderTextColor="#71717a"`, `trackColor={{ true: "#2563eb", false: "#e5e7eb" }}`.

**Референс:**
- AP display theme (Lazyweb 14483) и Brave appearance (19398) — bottom-sheet с тремя радио «Automatic / Light / Dark» прямо из settings list.
- Telegram edit-profile (12005) — `theme color` row внутри edit profile, не отдельный экран.

**Что сделать:**
1. Добавить row «Тёма» в settings-секцию profile/index.tsx (после Portfolio, перед «Выйти») с подзаголовком «Системная» / «Светлая» / «Тёмная». Тап → bottom-sheet с 3 радио-кнопками.
2. Завести `useThemeStore` (Zustand) с `mode: 'system' | 'light' | 'dark'`, прокинуть через NativeWind `colorScheme`.
3. Все hardcoded hex'ы из `index.tsx` и `edit-master.tsx` заменить на токены из DESIGN.md через CSS-vars (`text-ink`, `text-muted`, `text-accent`, `border-hairline`).
4. На вебе (Expo Web) — этот же контрол **продублировать в top-nav** иконкой sun/moon (правило из BRIEF: «На вебе пользователь должен иметь видимый theme-toggle»).

**Принципы:** №5 «Современность» (аккуратные dark + light темы), №6 «Функциональность» (если в DESIGN.md заявлен dark — он должен работать).
**Сложность:** M. **Платформа:** Mobile + Web (Web требует видимый toggle в шапке, Mobile — отдельный экран/sheet).

---

#### 2. **`profile/index.tsx`** — нет showcase-режима «Посмотреть как клиент»

**Что не так:**
- Текущий экран — Frankenstein: сверху owner-view (аватар + имя + бейдж «Мастер» + рейтинг + город), снизу — settings list. Мастер не может одним тапом увидеть, **как его карточку видит клиент** в каталоге.
- Это ломает принцип Airbnb (PRODUCT_CONTEXT §Airbnb: «разделение Host profile (showcase) vs My account (settings)»), на который мы явно ссылаемся.
- Особенно болезненно для портфолио — мастер не знает, как его фото скомпонованы в публичной карточке (Thumbtack pattern с большим hero-фото + фото-grid).

**Референс:**
- Airbnb account screen (Lazyweb 88079) — отдельный link «View profile» наверху, отдельный список настроек снизу. Switch to hosting — отдельный CTA.
- Thumbtack pro detail (PRODUCT_CONTEXT, главный референс для карточки мастера) — то самое, что должно открыться по «Посмотреть как клиент».

**Что сделать:**
1. Под аватаром (`/profile/index.tsx`, после блока с именем + бейджем + рейтингом + городом, ~ строка 210) добавить text-link **«Посмотреть как клиент»** для мастеров. По тапу — push на ту же страницу, что и публичная карточка мастера (`/(tabs)/home/master/[id].tsx` или эквивалент в группе Home). Параметр `?preview=1` отключит CTA «Написать в чат» и заменит на ленту «Так видят вас клиенты».
2. Для клиента (не-мастер) — этот link не показывается.

**Принципы:** №3 «Удобство» (главный сценарий «понять, что я выгляжу хорошо» за 1 тап), №6 «Функциональность» (showcase ≠ settings — сейчас они слиплись).
**Сложность:** S (доп. строка + flag в preview-режиме на уже существующем экране). **Платформа:** Both.

---

#### 3. **`profile/index.tsx`** — Portfolio upload без crop / aspect-ratio / min-resolution

**Что не так:**
- `onAddPortfolio` (строка 81) делает `uploadPortfolio.mutateAsync()` → `addPortfolioItem.mutateAsync()`. Никакого crop, никакой проверки минимального разрешения, никакого выбора aspect-ratio. Системный image-picker возвращает что есть.
- В PortfolioGrid (см. строки 263–273) фото отображаются в сетке — мы не знаем, какие ratio. Если мастер загрузил селфи 9:16 и фото-плитку 1:1 рядом — grid поедет.
- Это прямо ломает принцип №2 «Классные фото — главный визуальный нерв. Upload-пайплайн должен помочь сделать фото хорошим (crop, ratio, минимальное разрешение)».
- Дополнительно: на «загружаем…» / «удаляем…» **тот же `ActivityIndicator` без skeleton'ов в grid** → мерцающий placeholder в стиле принципа №6 anti-pattern.

**Референс:**
- **Thumbtack photo gallery** (PRODUCT_CONTEXT, главный референс для портфолио) — единый ratio и единое min-resolution в галерее мастера.
- **Airbnb host photo grid** (PRODUCT_CONTEXT упоминает) — те же требования.
- Photoroom portrait setup (Lazyweb 69627) — отдельный экран drag/pinch для позиционирования фото перед сохранением. Прямой паттерн crop-step.
- VSCO photo picker (68421) — мульти-выбор + Recents/Collections tabs (если решим масс-загрузку).

**Что сделать:**
1. В `use-upload-image.ts` (или в обёртке для portfolio) включить `expo-image-picker` с `allowsEditing: true, aspect: [4, 3], quality: 0.85` — даёт встроенный crop (iOS/Android) и единый landscape-ratio под grid.
2. Перед `mutateAsync` валидировать `result.width >= 1200` и `result.height >= 900`. Если меньше — `Alert` «Фото слишком маленькое. Минимум 1200×900. Снимите ближе или выберите другое».
3. На время загрузки рисовать **placeholder-tile в grid** (`bg-surface-2 rounded-md` с `ActivityIndicator` внутри), а не общий индикатор под grid'ом.
4. В подзаголовке секции (строка 259) заменить «Фото работ повышают доверие клиентов» на конкретное: «Фото работ повышают доверие. Снимайте горизонтально, разрешение от 1200×900.»
5. Подумать о progressive image: `expo-image` + `placeholder` (blurhash) на уже загруженных. (Скорее всего уже стоит в PortfolioGrid — проверить.)

**Принципы:** №2 «Фото — главный визуальный нерв», №4 «Скорость» (skeleton вместо мерцания), №6 «Функциональность» (нет полу-готовых состояний).
**Сложность:** M (crop + min-res + tile-skeleton). **Платформа:** Mobile (web — отдельная история через `<input type="file">` + html5 cropper, отметить как L follow-up).

---

#### 4. **`edit-master.tsx`** — Радиус выезда — голый number-pad input, без слайдера и карты

**Что не так:**
- Строка ~169: `NumberField label="Радиус выезда, км" placeholder="10"`. Мастер вбивает «10» вручную клавиатурой. Нет ощущения «10 — это сколько вокруг моего города».
- В PRODUCT_CONTEXT главный референс для гео-карточки — **Яндекс.Услуги**: «гео-карточка мастера (радиус выезда на мини-карте)». Сейчас этого паттерна нет ни на edit, ни на public-карточке.
- Дополнительно: schema позволяет `serviceRadiusKm: 0` (см. `defaultValues`), при этом 0 = «не выезжаю», но UX этого не объясняет. И «999 км» легко вбить случайно.

**Референс:**
- **Яндекс.Услуги** (PRODUCT_CONTEXT, главный реф) — радиус-circle на мини-карте + slider.
- Craigslist location picker (Lazyweb 65480) — full-screen карта + highlighted radius circle + CTA «choose this location with radius». Близкий паттерн.
- Citizen (10266) — alert radius на карте.
- Citymapper (15757) — radius overlay для walking time.

**Что сделать:**
1. Заменить NumberField для `serviceRadiusKm` на компонент `<ServiceRadiusPicker>`:
   - Сверху мини-карта (react-native-maps, на web — fallback на статичный mapbox/yandex-static `<Image>`), центр — координата выбранного города.
   - Поверх — `<Circle>` с `radius = serviceRadiusKm * 1000`.
   - Снизу — slider 0–50 км, шаг 5 (Slider из `@react-native-community/slider`), и под ним подпись `«10 км вокруг Магаса»` или `«Только в городе»` при 0.
   - Над картой — chip-row с пресетами «В городе / 10 км / 25 км / По всей республике (50 км)».
2. Зафиксировать `serviceRadiusKm: max 50` в `master-profile-schema.ts` (Ингушетия 3.6 тыс. км² — больше 50 не имеет смысла) — отметить в отчёте о schema.

**Принципы:** №3 «Удобство» (слайдер быстрее клавиатуры), №2 (карта — это уже визуал, не текст), №5 «Современность».
**Сложность:** M (компонент + интеграция карты; на web S — статичный preview-кадр map-tile).
**Платформа:** Both, с deg fallback на web (статичный image вместо interactive map).

---

#### 5. **`edit-master.tsx`** — нет полей телефона, контактов и услуг с прайсом

**Что не так:**
- Edit-master содержит: имя/фамилия, город, район, bio, опыт, радиус, инструмент, транспорт. Всё.
- Нет:
  - **Телефон** (есть только в auth-сессии, но мастер не может его поменять, не может посмотреть, какой телефон видит клиент в карточке).
  - **WhatsApp / Telegram** (для региона Ингушетия это вход в коммуникацию ВАЖНЕЕ in-app чата — PRODUCT_CONTEXT: «региональная специфика, рынок маленький, репутация важнее формальной верификации»).
  - **Услуги с прайсом** (Profi.ru, Яндекс.Услуги — обязательный блок). Сейчас «Категории» — отдельная страница онбординга без прайса.
- В index.tsx подзаголовок строка 225: «Имя, город, bio, опыт, **инструмент и транспорт**» — это и есть всё, что можно отредактировать. Для пользователя это «и всё?».

**Референс:**
- Telegram edit profile (Lazyweb 12005) — `change phone number` row внутри edit profile.
- **Profi.ru** (PRODUCT_CONTEXT) — услуги с прайс-индикатором, обязательный блок мастера.
- **Яндекс.Услуги** — прайс-индикатор «средняя цена за это в вашем городе».
- Expedia profile details (12878) — basic info + contact info блоками с edit.

**Что сделать:**
1. В `edit-master.tsx` после блока «Опыт / Радиус» добавить секцию **«Контакты»**:
   - Read-only row «Телефон: +7 ... 12-34» + text-link «Сменить» → отдельный flow re-auth по OTP (на этот аудит — не реализовать, отметить в TODO).
   - Editable row **WhatsApp / Telegram** (опц., text input с auto-format).
2. На уровне navigation добавить (или явно проставить link, если screen уже есть) — **«Услуги и прайс»** под «Категории» в `index.tsx` (~ строка 247). По тапу — push на `/(tabs)/profile/services` (вне scope этого аудита, но отметить как блокер «не существует»).
3. В подзаголовке шортката (строка 225) после правок написать **точный** список: «Имя, фото, контакты, bio, опыт, радиус».

**Принципы:** №3 «Удобство» (главное действие мастера — управлять своей публичной карточкой; контакты и услуги — её ядро), №6 «Функциональность» (форма без ключевых полей — это полу-готовое состояние).
**Сложность:** S для WhatsApp/Telegram + ссылок-stub, L для отдельного экрана «Услуги и прайс» (но это вне scope этой группы).
**Платформа:** Both.

---

### 🟡 Важно (заметно ухудшает опыт)

#### 6. **`profile/index.tsx`** — Avatar block не дотягивает до Cal.com / Thumbtack пропорций; «Pencil»-кнопка пересекает рамку

**Что не так:**
- Аватар `<Avatar size="xl">` (~ строка 153) + накладной круг 36×36 с pencil в правом нижнем углу `-bottom-1 -right-1 absolute ... border-2 border-canvas bg-accent`. На dark theme `border-canvas` (белый по DESIGN.md) на тёмном фоне будет резать глаз белой каймой.
- Цвет круга — `bg-accent` (накладывает синий на монохромный Cal.com). По DESIGN.md primary CTA — `#111111`, accent `#3b82f6` появляется редко. Здесь pencil-badge именно акцентный — но в брифе и DESIGN.md синий = "rarely", "near-monochrome". На Thumbtack/Airbnb edit-фото обычно — нейтральный круг с тенью.
- Имя `text-display-sm` (28px Cal Sans, по DESIGN.md) — ок, но `mt-4` после аватара мало воздуха; принцип №1 «много воздуха».

**Референс:**
- Believe (Lazyweb 70221) — edit-photo как нейтральная chip-кнопка под фото, не overlay-pencil.
- Bins (72821) — pencil поверх фото, но круг inверсный (тёмный на светлом).
- Airbnb account (88079) — текстовая ссылка «View profile» под именем, без pencil-badge.

**Что сделать:**
1. Заменить `bg-accent` → `bg-ink` (или `bg-primary`), `border-2 border-canvas` оставить — на dark theme white-border на чёрном круге читается. Pencil — `color="#ffffff"`.
2. Подобрать чуть больше воздуха: `mt-6` вместо `mt-4` перед именем; `mt-3` вместо `mt-2` перед бейджем-роли.
3. Бейдж «Мастер / Клиент» (~ строка 188) `bg-surface-2 px-3 py-1` — рассмотреть `bg-ink text-on-primary` для мастера, чтобы был visual cue «верифицированный мастер» (Profi.ru-паттерн). Не критично, но усиливает trust.

**Принципы:** №1 (монохром Cal.com), №5 (dark theme аккуратная).
**Сложность:** S. **Платформа:** Both + dark mode.

---

#### 7. **`profile/index.tsx` + `edit-master.tsx`** — отсутствует character counter и hint в bio

**Что не так:**
- В `MasterProfileFormBody.tsx` bio: `maxLength={500}`, лейбл «О себе (опц., до 500 символов)» — но реально активный counter «`X / 500`» не показывается. Это нарушение «функциональности» — пользователь печатает «вслепую» до отрезания.
- Placeholder `"Опыт в стройке от фундамента до кровли..."` — годный пример, но один; нет hint «Что писать: ваш опыт, ваши сильные стороны, что отличает».

**Референс:**
- Medium edit profile (Lazyweb 14511) — character counters на name и bio полях.
- TikTik (21643), Lawfully (69109) — counter рядом с label.

**Что сделать:**
1. В блоке Bio (`MasterProfileFormBody.tsx`, ~ строки 120–154) под `<TextInput>` добавить `<AppText className="text-caption text-muted mt-1">{value?.length ?? 0} / 500</AppText>`. Подсветить красным при `>= 480`.
2. Под label добавить `<AppText className="text-caption text-muted-soft mt-1">Расскажите про опыт, чем гордитесь, чем отличаетесь. Без оборотов «в кратчайшие сроки».</AppText>`. Это и hint, и анти-Avito (anti-pattern в принципах).

**Принципы:** №6 «Функциональность», №3 «Удобство».
**Сложность:** S. **Платформа:** Both.

---

#### 8. **`edit-master.tsx`** — нет «Cancel/Done» в header'е; нет dirty-check на back

**Что не так:**
- Header `~ строка 104` — только `ChevronLeft → router.back()`. Если пользователь поправил bio, нажал назад — изменения **потеряются молча**.
- Save-кнопка живёт в самом низу формы (~ строка 168), а на длинной форме её не видно до scroll.
- iOS-конвенция (и Cal.com modal-стиль): «Cancel» слева, «Done / Save» справа в header'е.

**Референс:**
- Telegram edit profile (Lazyweb 12005) — Cancel / Done в навигационной полосе.
- Goodreads edit profile (854) — те же Cancel/Done в header'е.
- Lawfully (69109) — disabled Save до изменений (в header'е).

**Что сделать:**
1. В header'е `edit-master.tsx`: добавить справа `Pressable` «Сохранить», `disabled = !isFormDirty || !isValid || isBusy`. Слева — оставить `ChevronLeft`, но переименовать accessibilityLabel в «Отмена» (или показывать text «Отмена» если есть несохранённые изменения).
2. Использовать `formState.isDirty` из react-hook-form. При `isDirty && router.back()` → `Alert.alert("Изменения не сохранены", "Выйти без сохранения?", [Отмена, Выйти])`.
3. Bottom-кнопку «Сохранить» можно оставить как дублирующую — keep для длинных форм + small-screen, но **сделать sticky** (фикс в нижнем safe-area) на скроллируемой форме. Принцип thumb-zone (правило BRIEF).

**Принципы:** №3 «Удобство», №6 «Функциональность» (не теряем данные).
**Сложность:** S. **Платформа:** Mobile (на web — header sticky уже работает; dirty-check одинаков).

---

#### 9. **`profile/index.tsx`** — портфолио лимит и empty state выглядят как технический ограничитель, а не как onboarding

**Что не так:**
- Счётчик `{portfolio.data?.length ?? 0}/{PORTFOLIO_MAX}` (~ строка 256) — холодный «3/12». Для мастера, у которого `0/12`, это не CTA, а голая статистика.
- Subtitle «Фото работ повышают доверие клиентов» (~ строка 260) — общая фраза, не объясняет «зачем именно столько».
- На `length === 0` PortfolioGrid пустой (или с заглушкой — не видно из этого файла). Empty state как мощный визуальный hook отсутствует.
- Принцип №2: фото — главный визуальный нерв. Empty state портфолио должен **подталкивать** к загрузке.

**Референс:**
- **Thumbtack photo gallery** (PRODUCT_CONTEXT) — empty state с прямой кнопкой «Add your first photo» + примеры качественных фото из других мастеров.
- Asana portfolios empty (Lazyweb 15159) — message + primary action «New portfolio».
- Believe (70221) — visible empty avatar + CTA «Upload».

**Что сделать:**
1. Если `portfolio.data.length === 0`: вместо grid рисовать **dashed-border zone** (`border-2 border-dashed border-hairline bg-surface-2 rounded-lg p-6`) с иконкой ImagePlus 32, заголовком «Покажите свои работы» (`text-title-md`), подзаголовком «Карточки с фото получают в 3 раза больше откликов» (если есть данные; иначе мягче: «Фото — главное, что смотрят клиенты») и одной центральной кнопкой `bg-ink text-on-primary` «Добавить первое фото».
2. Счётчик `0/12` показывать только начиная с `length >= 1`.
3. После загрузки первого фото — `length === 1`, показать tooltip / inline hint «Добавьте ещё 2–3 для лучшего эффекта».

**Принципы:** №2 «Фото — нерв», №3 «Удобство» (CTA очевидный).
**Сложность:** S. **Платформа:** Both.

---

#### 10. **Кросс-экран** — фокус и keyboard accessibility на web

**Что не так:**
- `edit-master.tsx` — длинная форма, на web (Expo Web export) Tab-навигация по полям не настроена. `Switch`, `Pressable` для city-chip — лучше иметь focus-ring.
- На `MasterProfileFormBody.tsx` city-chip'ы (~ строки 73–96) — `Pressable`, не `<button>`/`<radio>`. На web это будет `<div>` без role/aria.
- `accessibilityRole="button"` на Pressable city-chip — корректно, но **группа** не имеет `accessibilityRole="radiogroup"`.
- На вебе Switch (toggle) из RN не имеет видимого focus-ring.

**Референс:**
- BRIEF §A11y: «keyboard accessible на вебе, role, accessible navigation, screen reader».

**Что сделать:**
1. Обернуть city-chips в `<View accessibilityRole="radiogroup" accessibilityLabel="Город">`.
2. Каждый chip → `accessibilityRole="radio"` с `accessibilityState={{ checked: selected }}`.
3. На web в global stylesheet добавить `:focus-visible` outline для Pressable (NativeWind variant `focus-visible:ring-2 ring-ink`).
4. Все TextInput'ы — `returnKeyType="next"` и связь через `ref.current?.focus()` (классика iOS), на web Tab сам работает.

**Принципы:** №3 «Удобство» (web keyboard), №6 «Функциональность» (a11y — это работа на всех платформах).
**Сложность:** S. **Платформа:** Both (с фокусом на Web).

---

#### 11. **`profile/index.tsx`** — Logout как обычная кнопка-rectangle внизу, без визуального отделения

**Что не так:**
- «Выйти» (~ строка 317) — такой же `h-12 rounded-md border-hairline bg-canvas` как и «Добавить фото» (~ строка 280). Деструктивное действие визуально не отличается от регулярного.
- Используется `text-body` (серый) и `color="#374151"` для LogOut-иконки — то есть **в одну строку с body** на light theme, а не destructive-red.
- Это и subtle (что хорошо — не пугает), и confusing (что плохо — может тапнуться случайно при portfolio actions).

**Референс:**
- Telegram (Lazyweb 12005) — отдельная sectioned-list строка «Log out» с явной красной типографикой.
- Spotify settings (9556) — Log out как обычная row внутри settings, но **отделена от content** sectioned-divider'ом.
- Airbnb account (88079) — Log out внизу с явной mt-12+ отбивкой и без сильного цвета (но в отдельной секции).

**Что сделать:**
1. Перед блоком «Выйти» (~ строка 316) поставить `<View className="mt-12 h-px bg-hairline mx-6" />` — sectioned-divider (Cal.com hairline-soft паттерн).
2. `LogOut` иконку оставить серой, **но** тап → Alert уже есть (хорошо). В сам Alert текст «Выйти?» — конкретный «Закроем сессию. Можно будет войти заново со своим номером.» — у вас уже ок.
3. Не делать red `text-error` — это «destructive but recoverable» (можно перевойти), а не «удалить аккаунт». Cal.com-стиль монохромен.
4. Под кнопкой «Выйти» — мелкая подпись `text-caption text-muted-soft text-center mt-2`: «Версия 0.1.0» (если есть useUpdates). Это AI-friendly: новый агент сразу понимает, какая версия установлена. Соответствует Airbnb / Spotify settings footer.

**Принципы:** №1 «Минимализм» (нет агрессивных красных), №6 «Функциональность» (sectioned-divider — функция, не декор).
**Сложность:** S. **Платформа:** Both.

---

### 🟢 Nice to have (полировка)

#### 12. **`profile/index.tsx`** — Top bar дублирует tab-bar контекст

**Что не так:**
- Header строки 130–144: `ChevronLeft`-back + title «Профиль» + пустой `w-10`. Но `profile/index.tsx` — это **корневой экран вкладки**. Tab-bar уже показывает «Профиль», back навигации нет (некуда).
- `router.back()` на корневом экране tab'а ведёт куда?  При первом запуске стек пустой → ничего не произойдёт или вылетит к предыдущей вкладке. Это полу-работающее состояние (anti-principle №6).

**Что сделать:**
1. На корневом экране profile/index.tsx — убрать ChevronLeft, заменить на **большой Cal Sans h1 «Профиль»** слева (по DESIGN.md `text-display-sm` или `display-md`), без back. Это эталон Cal.com hero-band.
2. Backless layout — RouterStack уже без header'а; этот in-screen header можно сделать частью scroll-контента (как Airbnb/Cal.com), он скроллится с контентом.
3. На edit-master.tsx — ChevronLeft оставить, он корректен.

**Референс:** Airbnb account (88079) — большой «Profile» заголовок без back на root tab.
**Сложность:** S. **Платформа:** Mobile (Web — top-nav имеет свой раздел, screen-header может вообще скрываться).

---

#### 13. **`edit-master.tsx`** — числовое поле «Опыт, лет» как text input — слабо

**Что не так:**
- `NumberField "Опыт, лет" placeholder="5"` — keypad. Пользователь может вбить «50». Большинство мастеров — 1–20 лет.
- Возможна интересная UX-форма: stepper `−` `5 лет` `+` (как Photoroom/Apple Calendar).

**Референс:** Lazyweb 21643 (TikTik) — поля с counters.
**Что сделать:** Заменить на `<Stepper>` 0–40 с шагом 1. Дополнительно — пресет-чипы «Меньше года / 1–3 / 3–7 / 7+».
**Сложность:** S. **Платформа:** Both.

---

#### 14. **`profile/index.tsx`** — рейтинг ★ + count в одну строку с бейджем-роли — мелко

**Что не так:**
- Строки 187–202: бейдж «Мастер» (rounded-pill bg-surface-2) + ★ 4.8 (12) — всё в одну строку 14px caption.
- На Thumbtack pro detail рейтинг — крупный (24–32px) элемент с разбивкой «X.X · Y отзывов» под именем.
- Принцип №2 (qual signals — визуальный нерв).

**Что сделать:** Под именем (~ строка 184) сделать строку рейтинга **отдельной**, ★ size 18 (не 14), `text-body-md font-semibold` для значения + `text-body-sm text-muted` для count + после count — text-link «Отзывы» (push to reviews-list — отдельный экран вне scope).
**Сложность:** S. **Платформа:** Both.

---

#### 15. **`edit-master.tsx`** — Toggle Row (инструмент / транспорт) — flat, без иконок

**Что не так:**
- `ToggleRow` (~ строки 320–334) — text + Switch на `bg-surface-2`. Без иконок (Wrench, Truck), без подсказки «зачем».
- Mastera Profi.ru ставят галки «есть свой автомобиль» — критично для оценки выезда. Сейчас непонятно, для чего.

**Что сделать:** Перед label добавить `<Wrench size={20}/>` / `<Truck size={20}/>`. Под label `text-caption text-muted` подзаголовок «Клиенту не нужно покупать инструмент / Готовы выехать в любую точку радиуса». Иконки взять из lucide.
**Сложность:** S. **Платформа:** Both.

---

#### 16. **`profile/index.tsx`** — категории shortcut ведёт в onboarding flow

**Что не так:**
- Строка 235: `router.push("/(onboarding)/master-categories")`. То есть переиспользуется онбординг-экран как редактор. Это работает, но визуально может показать «Шаг N из M» баннер / прогресс-бар onboarding'а.
- Чисто инженерное замечание — функционал может сломаться, если onboarding-экран не рассчитан на «вход с уже выбранными».

**Что сделать:** Проверить, нет ли в master-categories.tsx баннера onboarding'а — если есть, добавить условие `?mode=edit` для скрытия. Этот аудит — не код-ревью, поэтому здесь только флаг.
**Сложность:** S. **Платформа:** Both.

---

## Кросс-экранные паттерны

1. **Hardcoded hex-цвета в обоих файлах** (`#0a0a0a`, `#71717a`, `#374151`, `#2563eb`, `#f59e0b`, `#ffffff`) → ломают тёмную тему. Заменить на семантические токены NativeWind (`text-ink`, `text-muted`, `text-body`, `text-accent`, `bg-accent`, etc.).
2. **DESIGN.md dark theme не описан детально** — это БЛОКЕР, отметить в кросс-экранных. Любая dark-рекомендация (пункт 1, 6) упирается в отсутствие dark-палитры. Нужно: добавить в DESIGN.md секцию `colors.dark.canvas`, `dark.surface-card`, `dark.ink`, `dark.muted` и т.д.
3. **Loading state одинаков везде = `<ActivityIndicator>` без skeleton'а.** На portfolio (строка 303), на user-loading (строка 117), на city-loading (строка 64 в FormBody). Заменить минимум на portfolio-tile-skeleton (важнейший visual). Принцип №4 «Скорость», anti-pattern «мигающие плейсхолдеры».
4. **Error state молчит.** В `edit-master.tsx` (строка 88) — `catch (_e) {}` молча игнорит. Под формой только `submitError` рендерится — но если RPC упадёт сетью, message всё равно появится. Текст ошибки `"Не удалось сохранить. {submitError}"` — техничный, без user-friendly summary. Заменить на матч по error-code, fallback «Не удалось сохранить. Проверьте интернет и попробуйте снова.»
5. **TextInput без `returnKeyType` и без `onSubmitEditing`** в FormBody. На iOS keyboard «Return» не двигает к следующему полю — фрустрация на длинной форме.
6. **Cancel/Done pattern отсутствует везде** — на edit-master нет sticky Save, нет dirty-check на back, нет clear save flow в header'е. Это паттерн всей платформы — должен быть консистентен с другими edit-экранами (вне scope: возможно, в edit-категориях, edit-аватаре).
7. **`safe-area-context` paddingTop применяется на root View, но KeyboardAvoidingView в edit-master.tsx — на корне.** На iOS клавиатура с KeyboardAvoidingView "padding" + paddingTop insets может давать двойной paddingTop. Тестировать на физическом устройстве.
8. **«Cal Sans»-display нигде не используется по делу.** В `edit-master.tsx` (~ 145) заголовок «Профиль мастера» — `text-display-sm tracking-tight`, это норм. В `index.tsx` имя пользователя — `text-display-sm` без `tracking-tight`. DESIGN.md `display-sm` имеет `letterSpacing: -0.5px` — выставить явно через NativeWind utility (`tracking-tight` = `-0.025em` по Tailwind, **не** -0.5px). Это полировка №5 «Современность».

---

## Что отлично — НЕ трогать

1. **Структура файлов** — `MasterProfileFormBody` вынесен и переиспользуется между онбордингом и edit-master.tsx. Это правильный AI-friendly паттерн (DRY + читаемо).
2. **Avatar component с `seed={user.id}`** — гарантирует стабильный fallback при отсутствии фото. Сохранить.
3. **`Alert.alert` confirm-flow для destructive-actions** (remove avatar, delete portfolio, sign out) — корректный iOS/Android-конвенционный паттерн. Сохранить.
4. **`canAddPortfolio` + sectioned-state с limit-message** (строки 295–301) — функция явная, ошибки нет, лимит читаемый.
5. **`accessibilityLabel` и `accessibilityRole="button"`** на ключевых Pressable — хорошая база a11y, выше среднего по проекту. Сохранить и расширить (см. п.10).
6. **`useMemo` для fullName, `useMyMasterProfile` + `useUserRecord` отдельными hooks** — чисто и тестируемо.
7. **PORTFOLIO_MAX и FormSchema через Zod** — валидация на месте, не зависает в UI-логике. Сохранить, расширить (см. п.4 — max 50 km radius).

---

## Sanity-check по 6 принципам и scope guard

| # | Принцип | Покрытие текущим UI | Закрывается находками |
|---|---|---|---|
| 1 | Минимализм | Близко (Cal.com-ish), но accent-pencil-кнопка ломает монохром | №6 |
| 2 | Фото = визуальный нерв | Сломано: upload без crop, нет empty hero, аватар маленький при empty | №3, №9 |
| 3 | Удобство | Bio без counter, радиус числом, нет Cancel/Done, нет showcase | №2, №4, №7, №8 |
| 4 | Скорость | ActivityIndicator вместо skeleton'ов в портфолио | №3 (часть про skeleton), кросс-#3 |
| 5 | Современность | Хедер дублирует tab, нет dark theme, нет theme toggle | №1, №12 |
| 6 | Функциональность | Hardcoded цвета, dirty-check нет, услуги/контакты отсутствуют | №1, №5, №8 + кросс |

**Scope guard:** все рекомендации соблюдают — не предлагаю эскроу, AI-генерацию bio, доставку, тендеры. Single-role (один аккаунт = одна роль) сохраняется.

---

## Что НЕ покрыто этим аудитом (нужно отдельно)

- **Showcase-экран «Карточка мастера для клиента»** — обсуждался как target для «Посмотреть как клиент», но сам экран — это группа Home / Master Detail, не Profile. См. рекомендацию №2 — она про link отсюда, не про сам showcase.
- **Verification flow** (паспорт, фото с документом — Profi.ru pattern). Вне scope текущего PRODUCT_CONTEXT pre-MVP, но архитектурно — поле `is_verified` в users/master_profiles нужно завести заранее.
- **Web-вариант top-nav с theme-toggle и user menu** — частично в №1, но полный web-layout — это группа «Navigation / Layout», не Profile.
- **`PortfolioGrid` и `PortfolioLightbox` internals** — компоненты не читались (вне файлов в scope). Рекомендации №3, №9 затрагивают их, но детали структуры grid и lightbox-zoom — отдельный аудит компонентов.
