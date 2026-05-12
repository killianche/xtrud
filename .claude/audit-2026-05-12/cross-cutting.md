# Аудит: Cross-cutting (Responsive Web ≠ Mobile + Dark theme + сквозные проблемы)

## TL;DR

Три сквозные проблемы пересекают все 5 групп экранов:

1. **Web — это «mobile, растянутое до 1440px».** В коде нет ни одного `Platform.OS === "web"` или брейкпойнта для структурного выбора layout (top-nav vs bottom-tabs, split vs stacked). Единственное место с `md:/lg:` — сетка категорий на главной (`app/(tabs)/index.tsx:130`). Chats, orders, profile на десктопе — пустые поля воздуха слева/справа от 414-pixel mobile-колонки. Нет theme-toggle в шапке, нет breadcrumbs, нет keyboard-shortcuts, нет hover-state.
2. **Dark theme: токены в `src/lib/colors.ts` уже есть (full palette light + dark, 2 экспорта), но компоненты их не используют — хардкодят `#0a0a0a`/`#71717a`/`#ffffff` через `color={...}` Lucide-иконок и `placeholderTextColor`.** Тёмная тема **сломана не из-за отсутствия токенов в DESIGN.md (как считали остальные агенты), а из-за того, что компоненты не подключены к токенам.** Это рефакторинг, не дизайн-задача.
3. **Skeleton-loaders отсутствуют везде.** 46 использований `ActivityIndicator` вместо skeleton'ов нарушают принцип №4 «скорость» (см. PRODUCT_CONTEXT.md). На каждом list-экране пользователь видит пустой canvas → круг → контент. Должно быть: pre-shaped skeleton → контент.

Все 18 найденных проблем выводятся из этих трёх корней + типичных продуктовых дыр (empty/error states, image-pipeline, i18n, a11y).

## Скоуп

Сквозные проблемы, обнаруженные **по всем 5 группам** одновременно. Не дублирует находки `auth-onboarding.md`, `discovery.md`, `orders.md`, `chats.md`, `profile.md` — даёт системный взгляд + конкретный список файлов для рефакторинга.

Изученные файлы каркаса:
- `app/_layout.tsx` (root: fonts, AuthGate, SplashScreen)
- `app/+html.tsx` (web shell с theme-guard скриптом)
- `app/(tabs)/_layout.tsx` (Tabs + badges)
- `src/lib/colors.ts` (light + dark палитры)
- `src/lib/tokens.ts` (spacing/radius/shadow)

Прогрепанные паттерны (через Bash):
- `Platform.OS` — найдено 14 точек, **все** про KeyboardAvoidingView (8×) и push-token (5×). **0 точек** про web vs mobile layout.
- `md:` / `lg:` / `useWindowDimensions` — 4 точки: главная (категории-сетка), PortfolioGrid, PortfolioLightbox, Avatar. **Остальные 23 экрана — фиксированная mobile-разметка.**
- `Skeleton` / `skeleton` — 0 матчей. `ActivityIndicator` — 46 матчей.
- Хардкод-цветов в `color={"#..."}` Lucide-иконок и `placeholderTextColor` — 40+ точек в `app/` и `src/features/`.

## Референсы, на которые опирались

### Lazyweb (3 поиска)

- **Wix Marketplace desktop** ([siteId 11005](https://www.wix.com/marketplace)) — пример полноценного web-layout маркетплейса услуг: top-nav с категориями, search в header, многоколоночный grid карточек. Прямой эталон того, что у нас должно быть на десктопе **вместо** растянутого bottom-tabs.
- **Deezer desktop sidebar** (siteId 17977) — dark-mode persistent sidebar с группами навигации, активным item'ом. Образец для chats sidebar на web.
- **Overcast — theme settings** (screenshotId 14783) — mobile theme picker: «Always Use Dark Mode» toggle + раздельные accent-цвета для light/dark. Шаблон settings-экрана для нашей `profile/index.tsx`.
- **BuzzFeed — theme picker** (screenshotId 15046) — классическая mobile-форма: Match System / Light Mode / Dark Mode (radio-list с checkmark). Самый чистый паттерн для xtrud.
- **Hoopla loader** (siteId 49) — пример пустой `ActivityIndicator`-only заставки — то, чего **нужно избегать**.

### Из 5 предыдущих отчётов (агрегировано)

- Profi.ru «Мои заказы» (orders.md → 🔴#1) — наглядные status-pills, образец для нашего отсутствующего `OrderStatusBadge`.
- TaskRabbit Select-a-Tasker (discovery.md, orders.md) — sticky CTA-bar внизу карточки. У нас нет ни на одном detail-экране.
- Airbnb host showcase vs settings (profile.md → 🔴#2) — «посмотреть как клиент» режим.
- Slack desktop split (chats.md → 🔴#4) — sidebar+main для веб-чата.
- Thumbtack pro detail — большое hero-фото + trust-signals (discovery.md → 🔴#3).
- Cal.com (DESIGN.md источник) — Inter + Cal Sans, мягкие радиусы, белый canvas. **Не повторяем — он уже наш базис.**

---

## A. Responsive Web ≠ Mobile

### 🔴 Критично

#### A1. На вебе bottom-tabs вместо top-nav — нарушение web-конвенций
**Файл:** `app/(tabs)/_layout.tsx` (весь файл рендерит `<Tabs>` от `expo-router` без `Platform.OS` ветвления).
**Что не так:** `expo-router` `<Tabs>` на web рендерится как нижняя панель — пользователь на десктопе тянется курсором в самый низ. Это паттерн mobile-app, а не web-app.
**Референс:** **Wix Marketplace desktop** (Lazyweb siteId 11005) — top-nav с категориями и search в шапке. Привязка к 4 главным: TaskRabbit web (taskrabbit.com) имеет top-nav, не bottom-tabs.
**Что сделать:**
- Завернуть `<Tabs>` в `Platform.OS === "web" && width >= 768` → рендерить кастомный `<WebShell>` с top-nav (logo + ссылки «Главная / Заказы / Чаты / Профиль» + theme-toggle + аватар).
- На mobile-web (width < 768) — оставить bottom-tabs.
**Severity:** 🔴 / **Mobile:** Both (web-only правка, mobile не трогаем) / **Dark:** учитывается, top-nav должен иметь `bg-canvas` / `text-ink` через токены / **Complexity:** **L** (новый компонент `WebShell` + правки 5 layout-файлов).

#### A2. На вебе нет sidebar для chats — split layout отсутствует
**Файл:** `app/(tabs)/chats/_layout.tsx`, `app/(tabs)/chats/index.tsx`, `app/(tabs)/chats/[id].tsx`.
**Что не так:** Сейчас на десктопе пользователь открывает чат → инбокс пропадает, нужно жать «Назад». На любом мессенджере (Slack, Telegram Web, Beeper, Profi.ru) — split: слева список диалогов, справа активный.
**Референс:** **Deezer desktop sidebar** (Lazyweb siteId 17977) — pattern persistent sidebar. **Slack web** (упомянуто в chats.md). Привязка к 4 главным: **Thumbtack messages** на десктопе — split-view (chats.md → 🔴#4).
**Что сделать:**
- В `chats/_layout.tsx` добавить ветку для web/desktop: рендерить `<View className="flex-1 flex-row">` → `<ChatsList className="w-[320px] border-r" />` + `<ChatDetail className="flex-1" />`.
- На mobile-web и mobile — оставить stacked-стек.
**Severity:** 🔴 / **Mobile:** Web-only / **Dark:** учитывается / **Complexity:** **M** (один layout-файл + минорные правки index/[id]).

#### A3. Theme-toggle на вебе не виден — пользователь не может переключить тему
**Файл:** `app/+html.tsx` (theme-guard скрипт уже читает `localStorage("theme")`), `src/lib/theme.ts` (Zustand store, мы должны убедиться, что есть `setTheme(value: "light" | "dark" | "system")`).
**Что не так:** На вебе нет header'а, нет места для toggle. На mobile есть Settings → theme, на web — нет вообще.
**Референс:** **Overcast theme settings** (Lazyweb screenshotId 14783) для UX переключателя. Для web — **Cal.com header** (есть theme-toggle справа в шапке). Привязка: TaskRabbit на десктопе — нет toggle, но у нас принцип №5 «современность» требует.
**Что сделать:**
- В `<WebShell>` (см. A1) добавить иконку Sun/Moon из lucide-react-native с popover «Светлая / Тёмная / Системная».
- На mobile — toggle уже должен быть в `profile/index.tsx` (см. profile.md → 🔴#1 — там tracked отдельно).
**Severity:** 🔴 / **Web-only** / **Dark:** core к проблеме / **Complexity:** **S** (после того как A1 готов).

### 🟡 Важно

#### A4. Max-width контейнеры отсутствуют — текст растягивается на 1920px
**Файлы:** все `app/(tabs)/*.tsx` и `app/(auth)/*.tsx` рендерят `<View className="flex-1 px-5">`. На 1920px текст идёт через всю ширину — нечитаемо.
**Что не так:** На вебе длина строки > 100 символов снижает читаемость (типографика говорит 60–80 оптимум).
**Референс:** Cal.com (источник дизайн-системы) использует `max-w-7xl mx-auto`. Profi.ru на десктопе центрирует контент в ~1200px.
**Что сделать:** Завернуть содержимое каждого web-page в `<View className="web:max-w-[1120px] web:mx-auto w-full">` (через NativeWind `web:` префикс). Где это — общий компонент `<PageContainer>` сделать, не дублировать.
**Severity:** 🟡 / **Web** / **Dark:** не релевантно / **Complexity:** **M** (один общий компонент + 15 экранов оборачиваем).

#### A5. Hover-states / focus-ring на web отсутствуют — pressable выглядят неинтерактивно
**Файлы:** все `<Pressable>` в коде (`grep -rn "<Pressable" app/ src/ | wc -l` даст ~80+).
**Что не так:** На вебе курсор → нет визуальной реакции. На клавиатурной навигации (Tab) — нет focus-ring.
**Референс:** Cal.com, Linear, любое веб-приложение — hover на кнопку меняет opacity или background.
**Что сделать:** Завести базовый `<Pressable className="active:opacity-80 web:hover:opacity-90 web:focus-visible:ring-2 web:focus-visible:ring-ink">` — NativeWind 4 поддерживает `web:` префикс. Минимум — обновить `<Button>` и tappable card-компоненты (`CategoryTile`, `OrderRow`, etc.). Уровень focus-ring — для a11y клавиатурной навигации.
**Severity:** 🟡 / **Web** / **Dark:** focus-ring в dark = `ring-fafafa` / **Complexity:** **M** (правки 5-7 компонентов).

#### A6. Modal на web — full-screen вместо центрированного dialog
**Файлы:** `src/features/orders/OutcomeTrackingModal.tsx`, web-варианты `Alert.alert`.
**Что не так:** RN `Modal` на вебе закрывает весь экран. На десктопе ожидается центрированный dialog с backdrop.
**Референс:** Cal.com booking confirm, Linear issue-create. **TaskRabbit web** — центрированный dialog для confirm.
**Что сделать:** Для `Modal` ввести wrapper `<AppModal>` который на web (`useWindowDimensions().width >= 768`) рендерит как центрированный card шириной 480px.
**Severity:** 🟡 / **Web** / **Dark:** учитываем bg / **Complexity:** **M**.

### 🟢 Nice to have

#### A7. Keyboard shortcuts — нет ни одного
На вебе ожидается: `/` → focus search, `g h` → home, `n` → new order, `Esc` → close modal. Для маркетплейса категории Cal.com / Linear — стандартный паттерн. **Complexity:** L (новая `useKeyboardShortcut` инфраструктура), **Web-only**.

#### A8. Breadcrumbs на web для глубокой навигации
`Главная > Категория «Сантехники» > Магомед А.` На mobile back-кнопка достаточна, на web breadcrumbs дают context. Реф: Profi.ru desktop. **Complexity:** S, **Web-only**.

#### A9. URL slugs вместо UUID в адресной строке
`/master/3f8a-...-uuid` → `/master/magomed-santehnik-magas`. Это SEO + share-friendly. Сейчас через `[id].tsx` идёт UUID. **Complexity:** M (нужно поле `slug` в БД + edge function для генерации). **Web** primarily, mobile тоже выигрывает в deeplinks.

---

## B. Dark theme

### Ключевое открытие

**Тёмная палитра в коде уже определена** в `src/lib/colors.ts` (строки 57-93): `darkColors` экспорт с полным набором — canvas, surface-1/2/3, hairline, ink, body, muted, accent, success/warning/error и т.д. WCAG-фиксы упомянуты в комментарии (light/accent → `#2563eb`, dark/accent остался `#3b82f6` потому что на чёрном контраст 5.7:1).

**Корневая проблема:** компоненты **не подключены** к этим токенам. Lucide-иконки прокидываются `color="#0a0a0a"` напрямую, `placeholderTextColor="#71717a"` хардкодится, `tabBarBadgeStyle: { backgroundColor: "#ef4444" }` — без обращения к `lightColors`/`darkColors`.

Поэтому **DESIGN.md не нужно расширять для dark** (этого ожидали остальные агенты) — нужно сделать рефакторинг привязки компонентов к существующим токенам.

### 🔴 Критично

#### B1. Lucide-иконки везде с хардкод-цветом — на dark будут невидимыми
**Файлы (точечный список из grep):**
- `app/(tabs)/profile/index.tsx:138,229,246`
- `app/(tabs)/category/[id].tsx:62`
- `app/(tabs)/profile/edit-master.tsx:112`
- `app/(tabs)/master/[id].tsx:77,165`
- `app/(tabs)/chats/[id].tsx:101,188`
- `app/(tabs)/orders/new.tsx:86`
- `app/(tabs)/orders/index.tsx:110,128,373,539`
- `app/(tabs)/client/[id].tsx:53,134`
- `app/(tabs)/orders/[id].tsx:108,238`
- `app/(tabs)/orders/edit/[id].tsx:125`
- `app/(onboarding)/role.tsx:39` (тут условный, но всё ещё хардкод `"#374151"`)
- `app/(onboarding)/master-categories.tsx:76`
- `app/(onboarding)/master-profile.tsx:74`
- `app/(tabs)/chats/index.tsx:73`
- `src/features/profile/PortfolioLightbox.tsx:222,237,247`
- `src/features/orders/OutcomeTrackingModal.tsx:53`
- `src/features/master-view/MasterHomeContent.tsx:53,87`
- `src/components/CategoryTile.tsx:177`
- `src/components/OrderRow.tsx:71`

Всего ~26 файлов с хардкод-цветами на Lucide-иконках.

**Что не так:** В dark canvas = `#0a0a0a`. Иконка `color="#0a0a0a"` на canvas `#0a0a0a` = невидима.
**Референс:** Любое приложение с dark themes — Cal.com, Linear, Notion — иконки идут через CSS-переменные / токены.
**Что сделать:** Завести `useThemeColor(token: ColorToken): string` хук, который возвращает текущее значение токена (light или dark) на основе Zustand `useTheme`. Тогда:
```tsx
const inkColor = useThemeColor("ink");
<ChevronLeft color={inkColor} />
```
**Severity:** 🔴 / **Both** (mobile тоже сломан в dark) / **Complexity:** **L** (новый хук + правка 26 файлов).

#### B2. `placeholderTextColor` хардкоден — placeholder в dark не виден
**Файлы (точечный список):**
- `app/(tabs)/chats/[id].tsx:173`
- `app/(tabs)/orders/[id].tsx:650,674,704,730,932,1063`
- `app/(auth)/phone.tsx:70`
- `app/(auth)/verify.tsx:117`
- `src/features/master-profile/MasterProfileFormBody.tsx:135,247,293`
- `src/features/orders/OrderFormBody.tsx:145,369,415`

Всего 16 точек.

**Что не так:** В dark `#71717a` на `#0a0a0a` = 4.2:1 (borderline acceptable per colors.ts комментарий), но если ink станет `#fafafa` (что должно), то placeholder и primary text сольются.
**Что сделать:** То же что B1 — через `useThemeColor("muted-soft")`.
**Severity:** 🔴 / **Both** / **Complexity:** **M** (тот же хук, 16 точек).

#### B3. Badge fixed `backgroundColor: "#ef4444"` в `tabBarBadgeStyle`
**Файл:** `app/(tabs)/_layout.tsx:73,84`.
**Что не так:** Хардкод `#ef4444` для unread-badge — в dark должен идти через `darkColors.error`.
**Что сделать:** `backgroundColor: useThemeColor("error")`.
**Severity:** 🔴 / **Both** / **Complexity:** **S**.

### 🟡 Важно

#### B4. `+html.tsx` background harcode `#ffffff`/`#0a0a0a` дублирует `colors.ts`
**Файл:** `app/+html.tsx:23-26`.
**Что не так:** `body { background-color: #ffffff }` и `@media (prefers-color-scheme: dark) { body { background-color: #0a0a0a } }` — values захардкодены вне `colors.ts`. Если палитра изменится, эти числа отстанут.
**Что сделать:** Сгенерировать `+html.tsx` style через JS-template из `lightColors.canvas` / `darkColors.canvas`. Либо вынести в CSS-переменные с правкой `global.css`.
**Severity:** 🟡 / **Web** / **Complexity:** **S**.

#### B5. Box-shadow `shadowColor: "#000"` хардкод в `tokens.ts`
**Файл:** `src/lib/tokens.ts:145,152,159`.
**Что не так:** На dark canvas `#000` тень невидима. Должен быть chromatic shadow (например `rgba(0,0,0,0.6)`) или специальный dark-вариант.
**Что сделать:** Раздвоить `shadows` на `lightShadows` / `darkShadows` либо параметризовать через `useThemeShadow` хук.
**Severity:** 🟡 / **Both** (dark mobile сейчас без теней) / **Complexity:** **M**.

#### B6. PortfolioLightbox — белый close-icon, ок для дарка, но `bg-black/90` хардкод
**Файл:** `src/features/profile/PortfolioLightbox.tsx`.
**Что не так:** Lightbox всегда black backdrop, это ок (стандартный photoviewer pattern). Но `color="#ffffff"` для X/ChevronLeft/Right работает в обеих темах — это ок. Просто отметить как **исключение**: lightbox = всегда тёмный.
**Severity:** 🟡 (документировать в DESIGN.md как exception) / **Both** / **Complexity:** **S** (комментарий в `DESIGN.md`).

### 🟢 Nice to have

#### B7. Accent color picker (как Overcast)
В Settings — позволить выбрать accent (синий/зелёный/фиолетовый). У нас принцип №5 «современность» это поддерживает. **Complexity:** L. Откладываем до Sprint 22+.

#### B8. Динамический theme-meta (`<meta name="theme-color">`) на web для PWA
`app/+html.tsx` сейчас не содержит `<meta name="theme-color">`. На PWA это меняет цвет верхней панели браузера. **Complexity:** S, web-only.

#### B9. Dark в DESIGN.md — добавить **визуальную секцию-демонстрацию**
DESIGN.md описывает Cal-эстетику в основном на light. Стоит добавить в конце секцию «Dark theme» с примерами карточки/CTA/таблицы в dark, чтобы у будущего дизайнера была visual reference. Токены есть в `colors.ts`, документация — нет. **Complexity:** S.

---

## C. Прочие сквозные

### 🔴 Критично

#### C1. Skeleton-loaders отсутствуют (46× `ActivityIndicator`) — нарушение принципа №4 «скорость»
**Файлы:** grep `ActivityIndicator` — 46 матчей по `app/` и `src/`. Все list-экраны (orders, chats, master, category, profile) и detail-экраны показывают spinner вместо pre-shaped skeleton.
**Что не так:** Принцип №4 PRODUCT_CONTEXT.md: «feed должен пролистываться плавно, open масштабируется (skeleton-loaders, не белые экраны)». Сейчас open = белый экран → spinner → контент. Это «дёшево» и нарушает Cal.com-эстетику.
**Референс:** Cal.com booking page — skeleton-cards. Linear issue list — skeleton-rows. **Hoopla loader** (Lazyweb siteId 49) — антипример, такого избегаем. Привязка к 4 главным: **TaskRabbit** browse Taskers — skeleton-карточки при загрузке (упомянуто в discovery.md → 🔴#5).
**Что сделать:**
- Завести компонент `<Skeleton variant="text|circle|rect" w={..} h={..} />` с `expo-linear-gradient` + `react-native-reanimated` shimmer.
- Composable skeletons для типичных шаблонов: `<MasterCardSkeleton>`, `<OrderRowSkeleton>`, `<ChatRowSkeleton>`.
- Заменить `ActivityIndicator` на список соответствующих skeleton'ов везде где это первичная загрузка.
- `ActivityIndicator` оставить только для in-button loading (submit) и pull-to-refresh — там он уместен.
**Severity:** 🔴 / **Both** / **Dark:** учитывается, skeleton-gradient через токены `surface-1` → `surface-2` / **Complexity:** **L** (новый базовый компонент + 4 composable + правки 15+ экранов).

#### C2. Empty states — каждая группа реализует свой, нет единого шаблона
Из 5 отчётов:
- discovery.md: empty state на главной — «Категорий нет» текст без иллюстрации.
- orders.md: empty state — иконка `ClipboardList` + текст «Заказов нет», но **без CTA «Создать заказ»**.
- chats.md: empty state — иконка `MessageCircle` + текст, но нет hint «Начните диалог из карточки мастера».
- profile.md: portfolio empty — технический текст «Нет работ».
- auth.md: не релевантно.

**Что не так:** Принцип №3 «удобство» требует чёткий next step. Без CTA empty state — это тупик.
**Референс:** Notion empty state, Linear empty state — иллюстрация + 1 строка hint + 1 primary CTA. Привязка к 4 главным: **Profi.ru** «У вас пока нет заказов» с кнопкой «Создать заказ».
**Что сделать:** Завести `<EmptyState icon={Icon} title={...} hint={...} cta={...} />` компонент. Подставить везде. Иллюстрации можно опционально — на старте достаточно Lucide-иконки + правильного copywriting.
**Severity:** 🔴 / **Both** / **Dark:** учитывается / **Complexity:** **M**.

### 🟡 Важно

#### C3. Error states / offline — где есть, где нет
**Что не так:** Из 5 отчётов: ошибки чаще всего показаны через `Alert.alert("Ошибка", e.message)` — техническая, не human-readable. Offline-баннера нет (нет хука `useNetInfo`).
**Что сделать:**
- `<ErrorState icon={CloudOff} title="Не удалось загрузить" hint="Проверьте интернет" cta={onRetry} />` — компонент.
- Global offline-banner внизу через `@react-native-community/netinfo` (или skip, если уже стоит). **Complexity:** M.
**Severity:** 🟡 / **Both**.

#### C4. Image pipeline — `expo-image` используется, но без `placeholder`/`blurhash`/`transition`
**Файлы:** PortfolioGrid, Avatar, master-detail header — используют `<Image>` из RN, не `<Image>` из `expo-image`. Принцип №4 требует progressive load (blurhash).
**Референс:** Airbnb — blurhash для host photos. Thumbtack — placeholder для pro photos.
**Что сделать:** Заменить `react-native Image` на `expo-image` с `placeholder={{ blurhash: ... }}` + `transition={200}`. Hash хранится в БД (если ещё нет — добавить колонку). **Complexity:** M (нужна миграция БД для хранения blurhash + edge function для генерации при upload).
**Severity:** 🟡 / **Both** / **Dark:** placeholder фон через `surface-2`.

#### C5. Toast / Snackbar — единого компонента нет
**Что не так:** Подтверждения действий идут через `Alert.alert("Готово", "Заказ создан")` — это modal, мешает работе. На web модалка ещё хуже.
**Референс:** Linear toast «Issue created • Undo» внизу. Cal.com — top-right toast.
**Что сделать:** `react-native-toast-message` или собственный компонент с Zustand-store. Toast живёт 3 сек, имеет undo-actionslot. **Complexity:** M.
**Severity:** 🟡 / **Both**.

#### C6. A11y — `accessibilityLabel` / `accessibilityRole` пропущены системно
Из 5 отчётов: agent profile/discovery/chats отметили, что Lucide-иконки и Pressable-карточки не имеют `accessibilityLabel`. Screen reader озвучивает «button» вместо «Открыть карточку мастера Магомед».
**Что сделать:** На каждой Pressable-карточке (`MasterCard`, `OrderRow`, `ChatRow`, `CategoryTile`) добавить `accessibilityLabel={...}` с человеческим описанием. На иконках без текста — `accessibilityLabel`. **Complexity:** M, **Both**.
**Severity:** 🟡.

#### C7. Fonts — Cal Sans display-шрифт **не подгружен**
**Файл:** `app/_layout.tsx:98-102` — `useFonts({ Inter_400, Inter_500, Inter_600, Inter_700 })`. **Cal Sans отсутствует** в загружаемых шрифтах.
**Что не так:** DESIGN.md прописывает «Cal Sans (display) + Inter (body/UI)». Заголовки сейчас идут на Inter Bold — это работает, но не Cal.com-эстетика.
**Что сделать:** Добавить Cal Sans (он open-source, `cal-sans` npm package либо self-host через `expo-font`). Прописать в `tailwind.config.js`/`global.css` как `font-display`. Использовать на h1/h2.
**Severity:** 🟡 / **Both** / **Complexity:** **S** (10 минут на установку + правка `_layout.tsx`).

### 🟢 Nice to have

#### C8. i18n — текст хардкоден по-русски, заготовки под мультиязычность нет
**Что не так:** Все строки UI на русском прямо в JSX. PRODUCT_CONTEXT.md упоминает ингушский как приоритет 2. Когда придёт время — переписывать весь UI.
**Что сделать:** Завести `i18n-js` + ru.json. Сейчас можно даже не переводить — просто вытащить строки в один файл. **Complexity:** L (для всей кодовой базы).
**Severity:** 🟢 / **Both**.

#### C9. Splash screen — text-only, нет логотипа
**Файл:** `app/_layout.tsx:33` использует `expo-splash-screen`, но `app.json` (не смотрел) скорее всего стандартный Expo splash. Должен быть логотип xtrud.
**Severity:** 🟢 / **Mobile primarily** / **Complexity:** S.

#### C10. PWA / offline-shell на web
`app/+html.tsx` не содержит `manifest.json`, `service worker`, `theme-color meta`. Это блокирует install-prompt на mobile-web и offline-кэш. **Complexity:** M, **Web-only**, low priority.

---

## Кросс-экранные паттерны (резюме для команды)

1. **Все правки B1+B2+B3 — это один технический пакет «подключить компоненты к colors.ts через useThemeColor»**. Делается одним Sprint'ом (1-2 дня). Когда сделано — все агентские находки про «dark theme не работает» из 5 отчётов **закрываются одним патчем**.
2. **Все правки A1+A2+A3+A4+A5 — это один технический пакет «WebShell + responsive layout»**. Делается отдельным Sprint'ом (3-5 дней). Это **большая работа** — рекомендация откладывать до того, как mobile UX стабилизирован (см. рекомендации agent'ов по auth/discovery/orders).
3. **Skeleton + EmptyState (C1+C2)** — один пакет «полировка loading/empty states». 1 Sprint (2-3 дня). Закрывает п. №4 «скорость» из принципов.
4. **Cal Sans (C7)** — буквально 10 минут, нужно сделать сразу.
5. **Image pipeline (C4)** — пересекается с findings из discovery.md (фото мастеров) и profile.md (портфолио). Это **уже большой Sprint** про upload UX + progressive loading.

## Что отлично — НЕ трогать

1. **`src/lib/colors.ts`** — полная палитра light + dark с WCAG-комментариями про контраст. Образцовая структура. Шапка-комментарий объясняет почему именно эти hex'ы. Не трогать, только подключить компоненты.
2. **`app/+html.tsx` theme-guard inline-скрипт** — корректно устраняет FOUC при гидрации, читая `localStorage("theme")` до парсинга body. Это grown-up web-engineering, который часто пропускают даже зрелые проекты.
3. **`app/_layout.tsx` AuthGate** — чистый 3-state router (auth / onboarding / tabs) с правильной обработкой loading-состояний. Race-condition на `user record` упомянут в комментарии — это правильное поведение AI-friendly кода (см. working-rules.md).
4. **`tabBarBadge` через Zustand + Realtime hooks** в `(tabs)/_layout.tsx` — образец интеграции в data-layer. После рефакторинга hex → токен (B3) не трогать.
5. **Inter из `@expo-google-fonts`** — load в `_layout.tsx` правильно, SplashScreen не скрывается до `fontsLoaded`. Достаточно добавить Cal Sans тем же паттерном.
6. **Биом конфиг + `_e` для unused vars** — мелочь, но видно, что есть стиль.

## Приоритеты следующих спринтов (мои рекомендации)

| Sprint | Пакет | Из этого отчёта | Из 5 групп | Эффект |
|---|---|---|---|---|
| Sprint 22 | **Dark-fix через useThemeColor** | B1, B2, B3, B5 | profile.md → 🔴#1; все «dark не работает» | Тёмная тема перестаёт быть «блокером DESIGN.md» — становится фичей |
| Sprint 23 | **Cal Sans + Skeleton + EmptyState** | C1, C2, C7 | discovery.md → 🔴#5; orders.md polish; chats.md polish | Закрывает принцип №4 + №5 |
| Sprint 24 | **Image pipeline + portfolio upload UX** | C4 | profile.md → 🔴#3; discovery.md → 🔴#3 | Закрывает принцип №2 «фото — главный визуальный нерв» |
| Sprint 25 | **Web Shell (top-nav + sidebar + max-width)** | A1, A2, A3, A4, A5, A6 | chats.md → 🔴#4; discovery web-вариант | Делает «web как полноценное приложение», а не растянутый mobile |
| Sprint 26+ | A7 keyboard shortcuts, A8 breadcrumbs, A9 slug-URLs, C5 toast, C6 a11y, C8 i18n | — | — | Полировка |

---

## Краткие выводы для main session

- **Не нужно ждать переписывать DESIGN.md под dark** — токены уже есть в `colors.ts`. Главное — рефакторинг hex → токен.
- **Web ≠ Mobile** — требует отдельного Sprint'а (Sprint 25 в моём списке), это большая, но локализованная работа: один `<WebShell>` + правки 4-5 layout-файлов.
- **Skeleton + EmptyState + Cal Sans** — быстрый win на 2-3 дня, заметно поднимет «качество» в восприятии пользователя.
- Все хардкод-цвета (40+ точек) перечислены пофайлово в B1/B2/B3 — можно делать механически.
