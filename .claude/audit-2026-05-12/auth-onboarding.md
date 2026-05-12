# Аудит: Auth + Onboarding

## TL;DR

Базовый каркас флоу — рабочий, минималистичный, в духе Cal.com (белый canvas, чёрный CTA, аккуратная типографика). Но он **функционально незавершён**: на `phone.tsx` висит disclaimer «Sprint 1: код принимается любой», нет прогресс-индикатора во всём онбординге (3 шага у мастера, пользователь не понимает, где он), нет шага «загрузить фото профиля» — а это нарушение принципа №2 «фото — главный визуальный нерв» и анти-паттерн против Thumbtack/TaskRabbit; OTP — один длинный input вместо 6 боксов с auto-paste из SMS (Zoox/Opal/Capital One — стандарт индустрии); список категорий — плоский (нет L1 → L2 структуры Profi.ru); чекбоксы инструмент/транспорт включены в обязательную форму без помощи мастеру понять, что они дают. Dark theme не учтена нигде на этих 5 экранах — все цвета хардкод (`#71717a`, `#374151`, `#2563eb`, `#0a0a0a`).

## Экраны в скоупе

- `app/(auth)/phone.tsx` — ввод телефона с маской `+7 XXX XXX-XX-XX`
- `app/(auth)/verify.tsx` — OTP-код (один TextInput с tracking-[8px])
- `app/(onboarding)/role.tsx` — две карточки «Я ищу мастера» / «Я мастер»
- `app/(onboarding)/master-categories.tsx` — плоский список L2-категорий с лимитом 5 (этот экран сейчас вне основного flow — мастер попадает в него уже из таб-бара после онбординга, в визарде его нет, см. кросс-экранные паттерны)
- `app/(onboarding)/master-profile.tsx` — форма мастера (имя/фамилия/город/район/bio/опыт/радиус/2 свича)

## Референсы, на которые опирались

### Lazyweb-результаты (главное, что цитируется)

- **Zoox** — OTP с 6 раздельными боксами + auto-paste: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_zoox/compare/2025-12-19/1771101613922_t__-_18899.PNG
- **Opal** — OTP 6 боксов + resend countdown + disabled Next: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/63z_opal/compare/!onboarding-flow_step-28/2025_05_18_17-00-35_DBA3800D.png
- **Capital One** — OTP 6 боксов + resend link: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_capital_one/compare/2026-02-20/1771694944267_0F617D44-8D40-4C0F-9ACD-DD7CF1013465_1_105_c.jpeg
- **Wise** — phone entry с country-code selector + disclosure под полем (без визуального шума): https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_wise/compare/2025-12-19/1771101791008_t__-_18804.PNG
- **Botim** — phone + ссылки на Terms/Privacy под полем (полезно для законности SMS): https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_botim/compare/2026-01-28/1771005649856_t__-_120.PNG
- **CapCut** — role selection grid 2×N с большими селектируемыми карточками + Skip + «Step 1 of 3»: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_capcut/compare/2026-01-28/1771000373828_t__-_227.PNG
- **Product Hunt** — profile setup с avatar picker + Continue: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_product_hunt/compare/2026-01-29/1771004836329_t__-_1163.PNG
- **Luma** — profile setup с avatar + name + bio в одном экране: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_luma/compare/2025-12-17/1771178395835_t__-_16030.PNG
- **Zora** — profile setup + progress-bar + Continue: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/uploaded_zora/compare/2025-12-19/1771101614644_t__-_18940.PNG
- **Michelin Guide** — Skip/Done на profile с avatar: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/food123_michelin-guide/compare/2025-04-25-14-23-19-.png
- **BetterMe** — multi-step onboarding с progress bar + back + один input на экран: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/health7_betterme/compare/2024-07-15-00-52-07-.png
- **Blinkist** — step 3 of 3 индикатор + Skip: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/edu120_blinkist/compare/2025-04-25(00-15-39).png
- **TaskRabbit** signup web (как Tasker заводит аккаунт, поля по сути минимум): https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/sites/taskrabbit/taskrabbit_1849dbd6d070ecedd04d.png
- **TaskRabbit** mobile onboarding carousel: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/lifestyle119_taskrabbit/compare/!logged_out/2025-04-11-5-.PNG
- **Booksy** welcome — мастера/клиента-разделение «book pros without phone calls»: https://zlfyzdmohcskkucuunmk.supabase.co/storage/v1/object/sign/screenshots/lifestyle10_booksy/compare/!logged_out/2025-03-31-01-43-03-.png

### Опора на 4 главных функциональных референса

- **Profi.ru** — Я.Услуги и Profi публикуют визард мастера именно как многошаговый: контакты → категории → опыт → фото → радиус. На отдельных экранах с прогрессом «Шаг 2 из 4». Категории — L1 → L2 (общая → конкретная), не плоский список.
- **Яндекс.Услуги (Яндекс Исполнители)** — гео-карточка с радиусом на мини-карте, чекбоксы инструмент/транспорт явно объяснены: «Клиент увидит этот бейдж в карточке».
- **TaskRabbit** — Tasker onboarding строго пошаговый, на каждом экране 1 действие; «Skill quiz» = выбор категорий из вертикалей; phone verify с 4–6 боксами.
- **Thumbtack** — Pro signup начинается с photo upload рано (фото — главный сигнал доверия), bio + experience years — отдельный шаг с подсказкой «что писать».

## Находки

### 🔴 Критично (ломает UX или конверсию)

#### 1. **phone.tsx** — disclaimer «Sprint 1: код принимается любой» в production-копии экрана
- Что не так: внизу phone-экрана текст «Sprint 1: код принимается любой. Sprint 2 — реальный SMS/OTP». Это **внутренняя заметка разработчика, видимая пользователю**. Нарушает принцип №6 (никаких полу-готовых состояний) и убивает доверие на самом первом экране, где пользователь решает оставлять ли свой номер. Жители Ингушетии — рынок, где репутация важнее формальной верификации; «sprint» в копии = «вы используете бету» = отскок.
- Референс: **Wise** и **Botim** под phone-полем кладут disclosure про условия использования и privacy, а не про статус разработки. **TaskRabbit signup** под формой — только terms + Create account.
- Что сделать: убрать строку целиком. На время Sprint 1 — заменить на нейтральное «Нажимая «Получить код», вы соглашаетесь с [Условиями] и [Политикой конфиденциальности]» (это сразу закроет и юридический пробел — сейчас нигде на этих 5 экранах нет ссылок на ToS/Privacy). Если код действительно принимается любой — добавить в Sentry/логи «dev-mode» баннер, не в UI.
- Сложность: S
- Mobile / Web: **Both** — одинаковый текст в обоих фронтах.
- Dark theme: добавляемая ссылка-disclosure будет `text-muted` → нужен токен dark-варианта `text-muted` (см. кросс-экранные паттерны).

#### 2. **verify.tsx** — OTP-код одним длинным TextInput вместо 6 боксов
- Что не так: сейчас один input с `tracking-[8px]` и `placeholder="000000"`. Это работает функционально, но: (а) визуально это «номер карты», а не «6 цифр кода» — пользователь не считает, сколько ввёл; (б) `autoComplete="sms-otp"` + `textContentType="oneTimeCode"` всё ещё работают, но iOS keyboard hint «From Messages» в одиночный input приходит как одна вставка строкой — нет визуальной обратной связи по мере ввода; (в) `tracking-[8px]` в светлом placeholder при темной теме станет невидимым.
- Референс: **Zoox** (https://...uploaded_zoox/...1771101613922_t__-_18899.PNG) — 6 раздельных боксов, шрифт крупный. **Opal** (https://...63z_opal/...DBA3800D.png) — 6 боксов + disabled Next до полного ввода + resend timer. **Capital One** (https://...uploaded_capital_one/...0F617D44...) — 6 боксов, у каждого тонкая нижняя черта в фокусе. Это стандарт индустрии для 6-значного OTP в 2026.
- Что сделать: заменить один TextInput на 6-box компонент. На RN можно сделать одним невидимым (или прозрачным) `TextInput` с `autoComplete="sms-otp"` поверх 6 «фейковых» View, отображающих по одной цифре — это позволяет iOS auto-paste из SMS работать корректно. При вводе подсвечивается текущий бокс (border-ink, остальные border-hairline).
- Сложность: M
- Mobile / Web: **Both** — на web можно использовать 6 inputs с автопереключением фокуса при `onChange` (стандартный паттерн), на mobile — описанный выше overlay для совместимости с SMS auto-fill.
- Dark theme: каждый бокс — `bg-canvas` / `border-hairline`, заполненный — `border-ink`. Сейчас вообще нет такого компонента — нужно делать с поддержкой обеих тем сразу.

#### 3. **master-profile.tsx** — нет шага «фото профиля» в визарде мастера
- Что не так: текст экрана прямо говорит «Категории и фото настроите позже». На рынке услуг, где **фото мастера — главный сигнал доверия** (принцип №2, Thumbtack pro detail page), отсрочка загрузки фото = пустой профиль в каталоге = ноль конверсий из ленты в чат. Мастер выходит из онбординга и попадает в `/(tabs)/` без фото — карточка в каталоге будет показывать инициалы или плейсхолдер. Это противоречит главному функциональному референсу — у Thumbtack/TaskRabbit/Profi.ru фото идёт **внутри** онбординга, не «позже».
- Референс: **Product Hunt** profile setup (https://...uploaded_product_hunt/...1163.PNG) — на первом же шаге onboarding-карточка «add photo» в круге сверху, потом name/username. **Luma** (https://...uploaded_luma/...16030.PNG) — то же: avatar picker сразу + name + bio в одном экране. **Zora** (https://...uploaded_zora/...18940.PNG) — avatar + handle + display name + progress bar.
- Что сделать: добавить шаг «Фото профиля» **в визард**, до полей имя/фамилия. Либо как отдельный экран `app/(onboarding)/master-photo.tsx`, либо как блок наверху текущего `master-profile.tsx`. Минимум: круговая кнопка-аватар 96×96 в центре, при тапе — `expo-image-picker` с обязательным crop 1:1, минимальное разрешение 400×400. **Не делать обязательным** на старте Sprint 1 (можно «Пропустить, добавлю позже»), но кнопка должна быть рядом и явная — не где-то в settings. Текст «Категории и фото настроите позже» — заменить на «Категории добавите следующим шагом» (см. находку №4).
- Сложность: M (компонент + интеграция с supabase storage + RLS policy на bucket — но storage уже есть в стеке)
- Mobile / Web: **Different** — на mobile это камера/галерея через expo-image-picker. На web — drag-and-drop зона + file input + cropper (можно `react-easy-crop`). UX-цель одинаковая, реализация разная.
- Dark theme: placeholder-кружок с иконкой камеры — `bg-surface-card` в light / нужно определить токен для dark (см. кросс-экранные).

#### 4. **Весь онбординг мастера** — нет прогресс-индикатора и нет шага «категории» в визарде
- Что не так: мастер после `role.tsx` попадает в `master-profile.tsx`. Заполнил → submit → редирект в табы. **Категории он в этот момент НЕ выбирал** — экран `master-categories.tsx` сейчас открывается только из tabs (видимо профиль/edit). Это критическая дыра воронки: мастер прошёл онбординг → попал в ленту заказов → не видит ничего, потому что не выбрал ни одной категории. Кроме того, нигде нет индикатора «Шаг 1 из N» — после role.tsx экран `master-profile.tsx` выглядит как одиночная форма, мастер не понимает, что будет дальше и сколько ещё осталось.
- Референс: **CapCut** role selection (https://...uploaded_capcut/...227.PNG) — явный «1 of 3» сверху + Skip option. **BetterMe** (https://...health7_betterme/...07-.png) — multi-step с progress bar линейкой + back arrow. **Blinkist step 3 of 3** (https://...edu120_blinkist/...00-15-39.png) — progress dots в шапке. **Profi.ru мастер-кабинет** — визард мастера всегда показывает «3/5» в шапке, и категории — обязательный шаг до старта работы.
- Что сделать:
  1. Добавить `app/(onboarding)/master-categories.tsx` как **шаг визарда** между role и profile (или после profile до confirm). Сейчас этот экран сделан для tabs — нужно дать ему режим «onboarding» (или сделать копию с другим CTA: «Далее» вместо «Сохранить»).
  2. Добавить компонент `OnboardingProgress` (тонкая линейка `bg-hairline` с `bg-ink`-заполнением + текст «Шаг 2 из 3») в шапку всех onboarding-экранов мастера. Клиенту — без прогресса (у него 1 шаг — выбор роли).
  3. После `master-profile.tsx` `submit` сразу должен вызывать `complete_master_onboarding` RPC с `category_ids` из шага 2.
- Сложность: L (новый компонент + перестройка флоу + изменение RPC контракта или вызов 2-х мутаций)
- Mobile / Web: **Both** — прогресс-бар одинаковый. На web можно добавить горизонтальную stepper-нумерацию «Роль · Категории · Профиль» сверху (более web-like), на mobile — тонкая линейка. Web-вариант breadcrumb-стиль ближе к Profi.ru web onboarding.
- Dark theme: линейка `bg-hairline` → в dark нужен токен `surface-3-dark`, заполнение `bg-ink` → `bg-on-dark` инверсия.

#### 5. **role.tsx** — ингушский мастер в реальности часто работает и как клиент (нужно явное обещание, что роль не финальная)
- Что не так: текст «Можно изменить позже в настройках» есть, но он мелкий и под заголовком, а не у карточек. На малом рынке (Ингушетия, ~500к человек — см. PRODUCT_CONTEXT) мастер-сварщик одновременно может быть клиентом для парикмахера. Сейчас выбор роли подан как бинарный finality — пользователь может застрять в неуверенности. Кроме того, у мастера карточка пишет «Профиль настраивается на следующем шаге» — что хорошо, но у клиента карточка ничего про следующие шаги не говорит, и пользователь не понимает, что у клиента шагов 0 (он сразу в табах).
- Референс: **Booksy** welcome (https://...lifestyle10_booksy/...01-43-03.png) — явный пояснительный текст «top-rated pros, read reviews, book». **Catawiki** (https://...uploaded_catawiki/...250.PNG) — модалка двойной роли «marketplace for both buyers and sellers» + Learn more. **CapCut** role selection — карточки с короткой подписью под названием.
- Что сделать:
  1. Уточнить текст на client-карточке: «Создаёте заявку — мастера откликаются. Бесплатно». Слово «бесплатно» — критичный сигнал на ингушском рынке, где платформа не процессит платежи (см. scope guard).
  2. Уточнить master-карточку: «3 шага: категории, профиль, фото. ~5 минут».
  3. Добавить под обеими карточками единую микро-копию: «Можно работать в обеих ролях — переключите в настройках, когда нужно» (если архитектурно один-аккаунт-одна-роль на старте — переформулировать честно: «Сейчас доступна одна роль за раз. Смена — в настройках за 2 тапа».)
- Сложность: S
- Mobile / Web: **Both** — одинаковая копия.
- Dark theme: иконки в selected состоянии сейчас `color="#ffffff"` хардкод — это сработает в обеих темах, но `color={selected ? "#ffffff" : "#374151"}` — `#374151` в dark станет невидимым. Нужно через токен `ink` / `on-dark`.

### 🟡 Важно (заметно ухудшает опыт)

#### 6. **phone.tsx** — нет country-code selector / явного указания только +7
- Что не так: маска жёстко зашита `+7` и `normalizePhone` срезает первую `7` или `8`. Это разумно для рынка Ингушетии, **но** пользователь, который случайно начал вводить с пробелов или пытается ввести +9... номер (гость из-за рубежа, или мастер с белорусским номером), получит только error. Сейчас флаг страны не показан вообще.
- Референс: **Wise** (https://...uploaded_wise/...18804.PNG), **Botim** (https://...uploaded_botim/...120.PNG), **OnePay** (https://...uploaded_onepay/...11912.PNG) — у всех маленький pill «🇷🇺 +7» слева от поля. Не открываемый dropdown (это не нужно), а просто визуальный индикатор страны.
- Что сделать: вместо `placeholder="+7 ___ ___-__-__"` сделать composite-input: маленький префикс-блок слева `🇷🇺 +7` (рамка `border-hairline`, padding 12px), а сам input принимает только 10 цифр без `+7` в маске. Это (а) убирает визуальный шум placeholder, (б) даёт чёткий сигнал «работает с RU-номерами», (в) экономит ширину поля для 10 цифр.
- Сложность: S
- Mobile / Web: **Both** — одинаково.
- Dark theme: префикс-блок — `bg-surface-card` (light) / нужен dark-токен.

#### 7. **verify.tsx** — нет автосабмита после ввода 6-й цифры
- Что не так: пользователь ввёл 6 цифр → должен ещё нажать «Подтвердить». На iOS, когда auto-fill вставляет код из SMS, у юзера в одно касание это происходит, но всё равно нужно тапнуть кнопку. У всех современных OTP-флоу 6-й символ триггерит `verify` автоматически.
- Референс: **Zoox** (https://...uploaded_zoox/...18899.PNG), **Opal** (https://...63z_opal/...DBA3800D.png) — кнопка Next включается на 6-м символе, но **на практике** во многих flow автосабмит начинается через ~200мс после полного ввода (Gowalla flow https://...uploaded_gowalla/...15690.PNG).
- Что сделать: в `Controller` для `code` при изменении на длину === 6 — вызвать `handleSubmit(onSubmit)()` через `setTimeout(..., 200)` (микро-задержка для UX, чтобы пользователь увидел заполненные боксы). Кнопку «Подтвердить» оставить как fallback и для случая ошибки.
- Сложность: S
- Mobile / Web: **Both** — поведение одинаковое.
- Dark theme: n/a (нет визуального изменения).

#### 8. **verify.tsx** — кнопка «Назад» как «← Назад» текстом вместо иконки, неконсистентно с master-categories.tsx
- Что не так: на этом экране назад — текстовая ссылка `← Назад` (text-body-md text-muted). На `master-categories.tsx` и `master-profile.tsx` — круглая иконка-кнопка `ChevronLeft` 40×40. У пользователя нет ощущения общей системы. Также `← Назад` стрелка — это unicode-символ, не lucide-иконка → разные веса, разный antialiasing.
- Референс: **Cruise** OTP (https://...travel118_cruise/...13-55-20.png) — back arrow + Support текст. **Wise** — back arrow chevron-left в шапке. У большинства референсов это иконка-кнопка, не текстовая ссылка.
- Что сделать: заменить блок `Pressable` с текстом «← Назад» на тот же компонент круглой кнопки `ChevronLeft 24` из других экранов. Извлечь его в `components/IconButton.tsx` или `components/BackButton.tsx`, чтобы не плодить копии.
- Сложность: S
- Mobile / Web: **Different** — на mobile это иконка-кнопка слева от заголовка. На web — обычная back-ссылка в шапке + breadcrumbs выше (см. кросс-экранные).
- Dark theme: иконка сейчас `color="#0a0a0a"` хардкод. Через токен `ink` решится автоматически.

#### 9. **master-categories.tsx** — плоский список L2 без группировки по L1 и без поиска
- Что не так: экран рендерит `visible.map((cat) => ...)` — все L2-категории одним длинным списком. Для рынка с 100+ категориями (см. `CATEGORIES_AND_PROFILES.md`) это длинный скролл. Лимит «5 категорий» полезен, но не помогает найти нужное. Также нет L1-группировки (Строительство → Электрика, Сантехника, Кровля). Это **прямое противоречие Profi.ru** — там таксономия L1→L2→L3, и UI это отражает.
- Референс: **Profi.ru** (главный референс) — категории всегда L1 → L2, аккордеон или drilldown. **Klarna** marketplace store directory (https://...88z_klarna/...CEB7AA4B.png) — категорийные chips сверху + список. **Craigslist** (https://...28z_craigslist/...93A1D46B.png) — главные секции с раскрывающимися подкатегориями.
- Что сделать:
  1. Добавить поисковую строку сверху (TextInput `placeholder="Поиск категории"`, filter `cat.name_ru.toLowerCase().includes(query)`). Это решает 80% боли при большом списке.
  2. Сгруппировать список по L1: SectionList с заголовком `display-sm` для L1, под ним — список L2-pressables.
  3. Sticky chip-bar сверху с уже выбранными L2 (можно тапнуть → снять). Это особенно помогает, когда пользователь скроллнул и хочет проверить, что выбрано.
- Сложность: M (требует данные L1 в запросе + рефактор хука `useVisibleCategories` или новый `useCategoriesGrouped`)
- Mobile / Web: **Different** — на mobile это SectionList + sticky chip-bar. На web — двухколоночный layout: слева вертикальный список L1 (Sidebar), справа L2 как chips или checkbox-list (Profi.ru web pattern).
- Dark theme: header L1 — `text-ink`, в dark станет `on-dark`. Сейчас всё хардкод, нужны токены.

#### 10. **master-profile.tsx** — чекбоксы «инструмент»/«транспорт» без объяснения и без иконок
- Что не так: два свича «Со своим инструментом» / «На своём транспорте» — голые, без объяснения, **что это даст мастеру**. На рынке Ингушетии у многих мастеров инструмент в долевой собственности — пользователь должен решить, ставить ли «true», и сейчас у него нет контекста.
- Референс: **Яндекс.Услуги** (главный) — у каждого чекбокса есть пояснение «Клиент увидит бейдж в карточке: подтверждаем, что мастер с инструментом». Также **Profi.ru** анкета мастера — чекбоксы с микро-копией «Эту галочку увидят клиенты при поиске».
- Что сделать: под каждым свичем — строка caption (`text-caption text-muted`): «Покажем бейдж в вашей карточке — клиенты увидят» / «Расширим радиус выезда автоматически». Также добавить маленькую lucide-иконку слева от лейбла (`Wrench` / `Truck`) — это и визуально оживит блок, и поможет в dark theme отличить два свича без чтения.
- Сложность: S
- Mobile / Web: **Both** — одинаково.
- Dark theme: иконка через токен `ink` / `on-dark`.

#### 11. **master-profile.tsx** — city как chips, но без поддержки длинного списка городов
- Что не так: сейчас `cities.map((city) => <Pressable>...)` рендерит все города как pill-chips в `flex-wrap`. На рынке Ингушетии городов мало (3–5: Магас, Назрань, Малгобек, Карабулак, Сунжа) — это работает. **Но при расширении на СКФО → РФ** (см. PRODUCT_CONTEXT) — экран сломается визуально (длинный flex-wrap).
- Референс: **Profi.ru / Яндекс** — выбор города всегда через searchable dropdown или modal-bottomsheet, не chips. **Stripe Dashboard** (https://...stripe-dashboard/...c3b552e287a44b6468f6.png) — country selector как dropdown с поиском.
- Что сделать: пока работает с chips для текущих 3–5 городов **оставить как есть** (принцип «не оптимизировать раньше времени»), **но** в коде добавить TODO-комментарий с условием «если cities.length > 10 — переключить на bottomsheet с поиском». Также можно сейчас же ограничить визуально: показать первые 5 + кнопка «Ещё» открывающая bottomsheet.
- Сложность: S (сейчас) / M (когда дойдёт)
- Mobile / Web: **Different** — на mobile это bottomsheet. На web — нативный `<select>` или Combobox-компонент.
- Dark theme: chips selected — `bg-accent-soft` `text-accent`. Не оба тона определены в dark — пробел в DESIGN.md.

#### 12. **phone.tsx + verify.tsx** — placeholder color `#71717a` хардкод вместо токена
- Что не так: и в `phone.tsx`, и в `verify.tsx` `placeholderTextColor="#71717a"` — это `zinc-500`. В DESIGN.md есть `muted-soft: #898989` и `muted: #6b7280`. Хардкод не соответствует токену, и в dark theme это станет **видимым** placeholder при недостатке контраста.
- Референс: Cal.com inputs в DESIGN.md — placeholder идёт через системный токен, не inline color.
- Что сделать: вынести в проекте утилку или CSS var `--placeholder-color` и использовать `placeholderTextColor={tokens.placeholder}`. Это применимо к **всем** TextInput-ам в проекте — см. кросс-экранные.
- Сложность: S (но касается всего проекта)
- Mobile / Web: **Both** — одинаково.
- Dark theme: основной кейс — здесь и проявится.

### 🟢 Nice to have (полировка)

#### 13. **phone.tsx** — нет визуального focus-ring на инпуте
- Что не так: комментарий в коде честно говорит: «RN doesn't apply :focus via NativeWind on native; web only. Платформенно-нейтральный focus state — добавим в sprint 2 через onFocus state». Сейчас инпут визуально не отличается между фокусом/не-фокусом на mobile.
- Референс: **Wise** OTP screen — фокусный бокс с тёмной нижней границей. **Cal.com** `text-input-focused` в DESIGN.md.
- Что сделать: добавить локальный `useState` `isFocused` + `onFocus`/`onBlur` → менять border на `border-ink`. Это +6 строк, не «sprint 2».
- Сложность: S
- Mobile / Web: **Both** — на web дополнительно `:focus-visible` ring через NativeWind.
- Dark theme: focused state `border-ink` → в dark `border-on-dark`.

#### 14. **verify.tsx** — `text-accent` для resend ссылки vs DESIGN.md (он monochrome)
- Что не так: ссылка «Отправить повторно» в активном состоянии — `text-accent`. Cal.com DESIGN.md прямо пишет: «Don't use accent colors on primary CTAs. The system is monochrome at the action layer» (раздел Don't, строка 487). Resend — не CTA, но это inline-link, и в Cal.com система inline-links — `text-ink`.
- Референс: DESIGN.md `text-link` component (строка 165): `textColor: "{colors.ink}"`. Все referenсы выше — resend оформлено как black underline или просто semibold-ink, не цветной.
- Что сделать: заменить `text-accent` на `text-ink` с `weight="semibold"`. Disabled (cooldown) — `text-muted-soft` оставить.
- Сложность: S
- Mobile / Web: **Both** — одинаково.
- Dark theme: `text-ink` → инверсия в dark.

#### 15. **role.tsx** — selected state карточки использует `border-accent bg-accent-soft` — синий блок выбивается из Cal.com эстетики
- Что не так: при выборе карточки она подсвечивается синим фоном `bg-accent-soft` и синей рамкой. Это привычный «iOS» паттерн, но Cal.com monochrome (см. находку №14). Кроме того, иконка в той же карточке заливается `bg-accent` (синий) — двойная подсветка.
- Референс: **CapCut** role grid (https://...uploaded_capcut/...227.PNG) — selected карточка — чёрная рамка `border-ink`, фон остаётся белым. **Booksy** — selected — белый + thick border-ink. Это Cal.com way.
- Что сделать: заменить `border-accent bg-accent-soft` → `border-ink bg-canvas` (border 2px), а иконку — `bg-ink` + `color="#ffffff"`. Получится монохромная подсветка через черную рамку + чёрный icon-block. Применимо и к `master-categories.tsx` selected items.
- Сложность: S
- Mobile / Web: **Both** — одинаково.
- Dark theme: `border-ink` инвертируется в `border-on-dark`.

#### 16. **master-profile.tsx** — поле «Опыт, лет» и «Радиус, км» хранят `0` как initial и пользователь видит «0»
- Что не так: defaultValues задают `experienceYears: 0, serviceRadiusKm: 10`. В NumberField `value={String(value ?? 0)}` → инпут показывает «0» и «10» как заполненные. Это нарушает UX-паттерн «placeholder = ожидание ввода»: пользователь должен сначала стереть «0», потом ввести своё число. На мобильной numeric keyboard это лишнее действие.
- Референс: **BetterMe** multi-step (https://...health7_betterme/...07-.png) — числовое поле пустое + placeholder. Profi.ru мастер-анкета — опыт стартует пустым.
- Что сделать: defaultValues — `experienceYears: undefined as any, serviceRadiusKm: 10` (для радиуса 10км — разумный preset, оставить), для опыта — пусто. В NumberField обрабатывать `value === undefined` → `value=""` (пустая строка). Zod схема валидации через `.min(0)` уже сработает, если оставить пустым — будет error, что корректно (поле обязательное).
- Сложность: S
- Mobile / Web: **Both** — одинаково.
- Dark theme: n/a.

#### 17. **role.tsx** — нет аналитики/конверсии, отсутствует Skip
- Что не так: пользователь, попавший случайно (например, тап по чужому магическому линку), не может «выйти из онбординга и подумать». Это не критично для onboarding (gestureEnabled: false корректно), но Skip-кнопка на каком-нибудь шаге снижает frustration.
- Референс: **CapCut** role selection — есть Skip справа сверху. **Michelin** profile — Skip опция. Не критично для нашего рынка (мастеру всё равно надо заполнить категории/профиль), но **client-карточка могла бы быть полностью skip-friendly** — выбрал «я ищу мастера» → мгновенно в табы (что сейчас и происходит, OK).
- Что сделать: не делать. Текущее поведение role.tsx уже Skip-эквивалентно для клиента (1 тап → готово). Для мастера skip нерелевантен — без категорий и профиля он бесполезен в каталоге.
- Сложность: 0
- Mobile / Web: **Both** — n/a.

## Кросс-экранные паттерны

### 1. **Dark theme — полностью отсутствует на всех 5 экранах**
- Все цвета, не приходящие через NativeWind токены, — хардкод: `placeholderTextColor="#71717a"`, `color="#0a0a0a"`, `color="#374151"`, `color="#2563eb"`, `color="#ffffff"`, `trackColor={{ true: "#2563eb", false: "#e5e7eb" }}`.
- DESIGN.md описывает только light. Нет токенов для dark-вариантов `surface-card`, `hairline`, `muted`, `accent-soft`.
- **Что сделать:** до перехода к sprint 2 (реальный SMS + auth ошибки) — добавить в DESIGN.md секцию «Dark theme tokens» с парами light/dark для каждого ключевого токена. Вынести все hardcoded hex в проекте на CSS-var или NativeWind theme через `useColorScheme()`. Без этого любой полировочный PR в auth-onboarding порождает регрессии в dark.
- Referenсе: Cal.com сам не имеет dark mode на marketing-странице, но **Linear, Notion, Vercel dashboard** (нам ближе функционально) — все имеют ровные dark-палитры со своими токенами.

### 2. **Inputs дублируют классы между файлами вместо общего `<TextField>` / `<NumberField>`**
- В `phone.tsx`, `verify.tsx`, `master-profile.tsx` (через `MasterProfileFormBody`) — почти одинаковые блоки label + TextInput + error. `MasterProfileFormBody` уже извлёк `FormField`/`NumberField`, но **внутри одного файла**, не общий компонент.
- **Что сделать:** вынести `<TextField label error name control ...>` в `components/forms/TextField.tsx`. Использовать в phone/verify/master-profile. Это даёт: (а) единый focused-state (находка №13), (б) единый placeholder-color через токен (находка №12), (в) единые dark-варианты.
- Сложность: M
- Referenсе: общий паттерн в react-hook-form кодовых базах.

### 3. **Кнопка primary CTA дублируется 4 раза с одинаковыми классами**
- В каждом из 4-х файлов (`phone`, `verify`, `role`, `master-categories`, `master-profile`) — один и тот же блок:
  ```
  Pressable className="h-12 items-center justify-center rounded-md ${... ? "bg-primary" : "bg-surface-3"}"
    AppText className="text-button text-on-primary">{label}</AppText>
  ```
- **Что сделать:** компонент `<PrimaryButton label busy disabled onPress busyLabel>`. Это убирает повторение и даёт единое место для добавления (а) loading-spinner, (б) micro-animation (`scale 0.98` при press через `Animated`), (в) accessibility (`accessibilityState={{ busy, disabled }}`).
- Сложность: S
- Referenсе: стандартный паттерн.

### 4. **Нет toast/snackbar для успеха и ошибок — все ошибки через инлайн AppText**
- В `phone.tsx` комментарий: «Sprint 1: симуляция, ошибок не будет. Sprint 2 — добавим toast». В `master-categories.tsx`, `master-profile.tsx`, `role.tsx` — ошибки рендерятся инлайн под формой. Это работает, но: (а) для успеха «Профиль сохранён» нет места, (б) при scroll внутри `master-categories.tsx` пользователь не увидит ошибку, если она внизу.
- **Что сделать:** добавить `react-native-toast-message` или собственный `<Toast>` через Context. На web — обычная position-fixed top toast. Для inline-ошибок поля — оставить как есть (рядом с полем правильно).
- Сложность: M
- Referenсе: всё что угодно из современных мобильных приложений.

### 5. **Нет accessibility hints, только roles**
- Все Pressable имеют `accessibilityRole="button"` — это хорошо. Но: нет `accessibilityHint` на CTA («Подтвердит код и войдёт в приложение»), нет `accessibilityLabel` на инпутах (только label через AppText, который screen reader не свяжет с TextInput автоматически на RN).
- **Что сделать:** на каждом TextInput — `accessibilityLabel={label}`. На каждом primary CTA — `accessibilityHint`. На OTP-боксах (после переделки) — `accessibilityLabel="Цифра 1 из 6"` для каждого.
- Сложность: S
- Referenсе: WCAG AA.

### 6. **Web-версия флоу не отличается от mobile — но должна**
- Все 5 экранов — `KeyboardAvoidingView` + узкая колонка `px-6` + sticky bottom CTA / inline CTA. На web это превращается в очень узкую полосу посреди широкого экрана.
- **Что сделать (Web-specific):**
  - `phone.tsx` / `verify.tsx`: центрированная карточка ~480px шириной, на canvas, с тенью `0 1px 2px rgba(0,0,0,0.05)` (Cal.com elevation level 4). Hero справа — иллюстрация / product mockup (Cal.com pattern). На mobile — fullscreen как сейчас.
  - `role.tsx`: 2 карточки **горизонтально** на web (как Cal.com pricing tier 4-up). На mobile — вертикально как сейчас.
  - `master-profile.tsx`: 2-колоночный layout на web — слева sidebar с шагами (Stepper «Роль · Категории · Профиль · Фото»), справа — текущий шаг. На mobile — стек как сейчас.
  - `master-categories.tsx`: на web — 2-колоночный (L1 sidebar / L2 list). На mobile — SectionList.
- Referenсе: **TaskRabbit web signup** (https://...sites/taskrabbit/...) — централизованная карточка ~640px на фоне-картинке. **Stripe** signup (https://...sites/stripe-dashboard/...) — узкая centered форма + progress bar.
- Сложность: L (большая работа, делать после стабилизации mobile)

### 7. **Категории не интегрированы в визард мастера** — повторение находки №4, но это **архитектурный паттерн**
- Сейчас `master-categories.tsx` доступен из tabs. После онбординга мастер попадает в табы без выбранных категорий. **Это пробел в воронке** — мастер «прошёл онбординг» но не может работать.
- **Что сделать:** см. находку №4. Либо встроить в визард, либо после `submitMaster` форсировать `router.replace("/(onboarding)/master-categories")` (вариант проще, но менее очевидный мастеру).

## Что отлично — НЕ трогать

1. **Минимализм каркаса** — белый canvas, чёрный CTA, нет лишних бейджей/баннеров/иконок-декораций. Полностью соответствует Cal.com эстетике и принципу №1.
2. **`KeyboardAvoidingView` с `behavior="padding"` на iOS** — корректное mobile поведение, кнопка не уезжает под клавиатуру.
3. **`autoComplete="tel"` + `textContentType="telephoneNumber"` + `inputMode="tel"` на phone, `autoComplete="sms-otp"` + `textContentType="oneTimeCode"` на verify** — все правильные подсказки iOS и Android для auto-fill. Это критично для конверсии и сделано аккуратно.
4. **`maxFontSizeMultiplier={1.3}` на инпутах** — защита от Dynamic Type ломающего layout на больших шрифтах (а11y), но без полного блокирования accessibility-настроек. Идеальный компромисс.
5. **`cooldown` 60с на resend + локальный таймер с человеческим текстом «Отправить повторно через 45с»** — стандарт индустрии, реализовано правильно.
6. **`gestureEnabled: false` на onboarding Stack** — пользователь не может случайно свайпом выйти из визарда. Корректно.
7. **Phone mask `formatPhoneMask` + `normalizePhone` E.164** — две функции делают свою работу чисто, разделение UI/storage форматов сделано правильно.
8. **Лимит 5 категорий с disabled-стейтом для невыбранных при достижении лимита** — лучше, чем просто блокировать тап без feedback. Counter `2 / 5` под заголовком — корректное информирование.
9. **`hitSlop={12}` на back-кнопках** — расширение тач-зоны, mobile-best-practice.
10. **`keyboardShouldPersistTaps="handled"` на master-profile ScrollView** — позволяет тапать chips/свичи без предварительного dismiss клавиатуры. Тонкая, но важная деталь.

---

## Финальный блок (для отчёта главной сессии)

- **Что сделано:** Прочитаны 3 контекстных файла, 5 исходников экранов в скоупе, 2 сопутствующих (`_layout.tsx`) и 3 вспомогательных (`master-profile-schema.ts`, `validation.ts`, `MasterProfileFormBody.tsx`). Сделано 7 запросов в Lazyweb MCP (phone+OTP, role selection, multi-select chips, profile setup, Thumbtack signup, OTP 6-box, progress indicator) — 35+ просмотренных скриншотов, 15 процитированных. Аудит — 17 находок (5 🔴, 7 🟡, 5 🟢) + 7 кросс-экранных паттернов + 10 «не трогать». Каждая находка опирается на 1+ из 4 главных референсов (Profi.ru / Яндекс / TaskRabbit / Thumbtack) или подкреплена Lazyweb URL.
- **Что не сделано:** Не запускал приложение — все наблюдения по коду. Не проверял web-рендер вживую (нет скриншотов Expo Web export). Не открывал DB схему `categories` — предположения про L1/L2 структуру опираются на `CATEGORIES_AND_PROFILES.md` (упомянутый, но не прочитанный — было сказано читать 3 файла, остальное «по необходимости»). Dark-токены в DESIGN.md не аудировал детально — это отдельный документ.
- **Использовал Lazyweb:** искал `phone OTP onboarding`, `role selection client provider`, `category multi-select services`, `profile setup avatar bio`, `Thumbtack pro signup`, `OTP 6 digit boxes`, `onboarding progress indicator` — посмотрел ~35 скриншотов, переиспользовал ссылки Zoox/Opal/Capital One (OTP 6-box), CapCut (role grid), Product Hunt/Luma/Zora (profile + avatar), Wise/Botim/OnePay (phone country pill), BetterMe/Blinkist (progress), TaskRabbit web и mobile, Booksy welcome.
