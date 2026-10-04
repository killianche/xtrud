# Нижнее меню xtrud: как сделано и как повторить

> Для агента, который делает другое iOS-приложение в том же стиле.
> Источник истины — код [`app/(tabs)/_layout.tsx`](../app/(tabs)/_layout.tsx);
> этот документ — выжимка на 2026-10-04 (сборка 121).

## 1. Главная идея: меню не рисуется, оно системное

Нижнее меню в xtrud — **не самописный компонент**. Это родной `UITabBar`
iOS, в React Native он подключается через `NativeTabs` из expo-router. На
iOS 26 система сама рисует его в стиле **Liquid Glass**: стеклянная
плавающая панель, у выбранной вкладки подсвеченная «пилюля», правильная
анимация, VoiceOver и Dynamic Type. На iOS 18 и старше та же панель
становится классической системной.

Мы задаём только цвета, иконки и подписи. Всё остальное делает iOS. Поэтому
меню и выглядит как «последний iOS»: это он и есть.

Самописная панель в xtrud была и удалена: решение владельца от 2026-09-02,
образец — Thumbtack на iOS 26. Правило проекта: если у iOS есть родной
механизм, берётся он.

## 2. Стек и версии (FACT, `package.json`)

| Пакет | Версия |
|---|---|
| expo | ~57.0.20 |
| expo-router | ~57.0.19 (`expo-router/unstable-native-tabs`) |
| react-native | 0.86.3 (только New Architecture) |
| react-native-screens | ~4.26.0 |

Liquid Glass появляется только при сборке с Xcode 26 / iOS 26 SDK и только
на устройстве с iOS 26. Проверка в коде:
`isLiquidGlassAvailable()` из `expo-glass-effect`
([`GlassSurface.tsx`](../src/components/ui/GlassSurface.tsx), константа
`LIQUID_GLASS`).

## 3. Настройки панели (точная копия из xtrud)

```tsx
import { NativeTabs } from "expo-router/unstable-native-tabs";

<NativeTabs
  // До iOS 26: панель не становится прозрачной, когда список докручен до
  // края (иначе текст карточки читается сквозь меню). На iOS 26 не нужно.
  disableTransparentOnScrollEdge={!LIQUID_GLASS}
  tintColor={accent}                       // цвет выбранной вкладки
  indicatorColor={accentSoft}              // «пилюля» выбранной вкладки (iOS 26)
  iconColor={{ default: mute, selected: accent }}
  labelStyle={{ default: { color: mute }, selected: { color: accent } }}
  badgeBackgroundColor={error}             // кружок с числом
  labelVisibilityMode="labeled"            // Android: подписи видны всегда, как на iOS
>
  <NativeTabs.Trigger name="index">
    <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
    <NativeTabs.Trigger.Label>Главная</NativeTabs.Trigger.Label>
  </NativeTabs.Trigger>
  <NativeTabs.Trigger name="orders">
    <NativeTabs.Trigger.Icon
      sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }}
      md="check_circle"
    />
    <NativeTabs.Trigger.Label>Мои задания</NativeTabs.Trigger.Label>
    {badge ? <NativeTabs.Trigger.Badge>{badge}</NativeTabs.Trigger.Badge> : null}
  </NativeTabs.Trigger>
  {/* … ещё 3 вкладки по тому же образцу … */}
</NativeTabs>
```

Пять вкладок xtrud:

| Вкладка | SF Symbol (обычная / выбранная) | Android `md` |
|---|---|---|
| Главная | `house` / `house.fill` | `home` |
| Мои задания | `checkmark.circle` / `checkmark.circle.fill` | `check_circle` |
| Найти задание | `magnifyingglass` | `search` |
| Специалисты | `person.2` / `person.2.fill` | `group` |
| Аккаунт (имя пользователя, у гостя «Войти») | `person.crop.circle` / `person.crop.circle.fill` | `account_circle` |

Приём: у обычной вкладки иконка контурная, у выбранной — залитая (`.fill`).
Так делают системные приложения Apple.

## 4. Цвета (токены xtrud, `src/lib/colors.ts`)

| Роль | Светлая | Тёмная |
|---|---|---|
| accent — выбранная иконка и подпись | `#e11d48` | `#e11d48` |
| accent-soft — пилюля выбранной вкладки | `#ffe4ea` | `#4a1f29` |
| mute — невыбранные иконки и подписи | `#888888` | `#999999` |
| error — фон бейджа (текст на нём белый) | `#ee0000` | `#ef4444` |
| canvas — фон экранов (тема навигации) | `#ffffff` | `#0a0a0a` |
| ink — основной текст | `#171717` | `#fafafa` |
| hairline — линии | `#ebebeb` | `#333333` |

Цвет выбирается по текущей теме устройства, хексы в компонентах не
пишутся: всё идёт через токены. Почему пилюля в акценте: по умолчанию iOS
рисует её серой, и владелец назвал её «серой, непонятной» (2026-09-22).
Мягкий акцент совпадает с цветом выбранных фильтров в самом приложении.

Другое приложение подставляет **свой** бренд-цвет в `accent` и его бледный
вариант в `accent-soft`. Схема ролей остаётся той же.

Тема навигации (`ThemeProvider` из `expo-router/react-navigation`) тоже
получает эти токены: `background`/`card` = canvas, `border` = hairline,
`text`/`primary` = ink. Иначе на переходах мелькает чужой фон.

## 5. Подводные камни, которые мы уже прошли

1. **Не ставить картинку (PNG, аватар, логотип) иконкой вкладки.** На iOS 26
   одна такая вкладка ломает всю панель: подписи обрезаются («Гла…»,
   «Специа…») и съезжают вниз. Баг открыт: react-native-screens #4749,
   исправление #4750 на 2026-10 не выпущено. Используйте только SF Symbols.
2. **Короткие подписи.** На iOS 26 выбранная вкладка расширяется в пилюлю и
   отнимает ширину у соседей. Длинные подписи при пяти вкладках обрезаются.
   Имя пользователя мы режем до 12 символов.
3. **Всегда указывать `md` для Android.** SF Symbols на Android не
   рисуются, и без `md` вкладка остаётся пустой.
4. **Место под меню в списках.** Содержимое уходит под стеклянную панель,
   поэтому последнему элементу нужен отступ снизу. В xtrud один помощник на
   всё приложение — `useTabBarSpace()` ([`tab-bar-space.ts`](../src/lib/tab-bar-space.ts)):
   безопасная зона + высота панели (49 pt классическая, 64 pt с запасом на
   iOS 26) + 12 pt. Отступы «на глаз» в каждом экране — источник багов.
5. **Повторный тап по активной вкладке → наверх.** Стек вкладки на корень
   система сбрасывает сама. Прокрутку к началу сделали своим счётчиком
   (`src/lib/tab-scroll-reset.ts` + `listeners.tabPress`): системный
   поиск списка не находит его, если первым в экране стоит закреплённая
   шапка.
6. **Бейдж** — строка `"99+"` при числе больше 99. При нуле бейдж не
   рендерить.

## 6. Чтобы остальные элементы были в том же стиле

Правило xtrud ([`docs/IOS_FOUNDATION.md`](IOS_FOUNDATION.md) §0): каждый
элемент сначала ищет аналог в iOS 26 и повторяет его материал, форму и
поведение.

- **Стекло — только на навигационном слое**, который плавает над
  содержимым: нижнее меню, шапка, плавающая главная кнопка. Карточки и
  списки — без стекла. Это прямая рекомендация Apple (см. источники).
- **Шапка:** крупный заголовок 34 pt в начале содержимого. При прокрутке он
  уходит, появляется компактный заголовок, а под ним размытие, в котором
  содержимое растворяется (scroll edge effect iOS 26). «Назад» и действия —
  круглые стеклянные кнопки без плашки.
- **Главное действие** — выпуклая стеклянная капсула 56 pt. Под плавающей
  кнопкой внизу тоже размытие с градиентом, чтобы она не сливалась с
  текстом.
- **Списки и настройки** — inset grouped, как в «Настройках» iOS: плитки
  иконок 36 pt, галочка или шеврон.
- **Выбор из списка** — системная шторка (formSheet) с грабером. Список
  действий — системный action sheet.
- **Шрифт** — системный (SF Pro) с Dynamic Type без ограничения размера.
  Шкала: Large Title 34, Title 1 28, Title 2 22, Body 17, Callout 16,
  Subheadline 15, Footnote 13.
- **Тач-цели** — не меньше 44×44 pt. Обе темы проверяются обе.
- **Без iOS 26** (старые iPhone, Android) те же компоненты рисуют сплошную
  поверхность с тонкой границей, и экран остаётся правильным.

## 7. Если другое приложение на SwiftUI, а не на React Native

То же самое даёт системный `TabView` при сборке с iOS 26 SDK: Liquid Glass
включается автоматически. Схема: `Tab("Главная", systemImage: "house") { … }`,
цвет выбранной вкладки — `.tint(accent)`, бейдж — `.badge(n)`. Точные
имена модификаторов проверить по документации Apple для своей версии SDK
(UNKNOWN: в xtrud SwiftUI не используется, эти вызовы здесь не проверялись).

## 8. Откуда это взято

- Apple HIG, Materials:
  https://developer.apple.com/design/human-interface-guidelines/materials —
  Liquid Glass для навигационного слоя поверх содержимого.
- Apple, Adopting Liquid Glass:
  https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass —
  стандартные компоненты (tab bar, navigation bar) получают новый материал
  автоматически, если их не перекрашивать вручную.
- Apple HIG, Tab bars:
  https://developer.apple.com/design/human-interface-guidelines/tab-bars
- Apple HIG, Typography (Dynamic Type):
  https://developer.apple.com/design/human-interface-guidelines/typography
- Expo Router, Native Tabs (документация expo-router по
  `unstable-native-tabs` для вашей версии Expo).
- Продуктовый образец: Thumbtack на iOS 26 (решение владельца 2026-09-02).
- Внутренние документы xtrud: `docs/IOS_FOUNDATION.md` (§0 — таблица
  «элемент xtrud ↔ аналог iOS 26»), `.claude/rules/design-quality.md`,
  `UI_PATTERNS.md`, `DESIGN.md`.
