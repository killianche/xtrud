# iOS Foundation — канонический стандарт качества iOS-приложения xtrud

> Статус: DECISION владельца 2026-08-29 «продукт становится iOS-only» (Android
> отложен до завершения iOS, web сведён к минимуму). Этот файл — рабочий
> стандарт для iOS-контура. Он **не** дублирует `DESIGN.md` (токены),
> `UI_PATTERNS.md` (компонентные паттерны), `CROSS_PLATFORM_RULES.md`
> (platform seams) и `docs/UI_ICONS.md` (icon set). При конфликте применяется
> приоритет из [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) §1.
>
> Каждое правило ниже проверяемо на текущем коде. Утверждения помечены
> **FACT** (проверено кодом/первичным источником), **DECISION** (решение
> владельца), **UNKNOWN** (не проверено + способ проверки).

Проверенное состояние стека на 2026-08-29 (**FACT**, `package.json`, `app.json`):
Expo SDK `~54.0.37`, React Native `0.81.5`, React `19.1.0`, expo-router `~6.0.24`,
Reanimated `~4.1.1` + react-native-worklets `0.5.1`, FlashList `2.0.2`,
NativeWind `^4.2.1`, `newArchEnabled: true`, `supportsTablet: false`,
`userInterfaceStyle: "automatic"`, marketing version `1.0.2`, iOS build `12`;
последний опубликованный store-релиз — `1.0.1` / build `11`
(`release/production.json`).

---


## 0. Каждый экран — iOS 26 Liquid Glass

> DECISION владельца 2026-09-07: «фильтры, пилюли, строки поиска, всё —
> полностью как в последнем iOS, Liquid Glass. Запиши в документацию, что
> каждый дизайн у нас соответствует iOS Liquid Glass последней версии».

Правило: любой новый или изменённый экран сначала ищет системный аналог в
iOS 26 и повторяет его материал, форму и поведение. Таблица соответствий —
источник для приёмки (`design-enforcement.md` §1):

| Элемент xtrud | Аналог iOS 26 | Компонент |
|---|---|---|
| Строка навигации без фона, круглые стеклянные «назад»/действия; фон и компактный заголовок — при прокрутке | Navigation bar iOS 26 (Liquid Glass, scroll edge effect) | `LargeTitleBar`, `NavCircleButton` |
| Крупный заголовок 34 pt в содержимом, уезжает при прокрутке | Large title | `LargeTitleBlock`, `useLargeTitle` |
| Круглые кнопки фильтров напротив крупного заголовка — отдельная на категорию, место и сортировку (с оттенком, когда фильтр применён); каждая открывает свою системную шторку выбора | Кнопки в строке заголовка (Почта, App Store, Карты) | `NavCircleButton`, `LargeTitleAction`, `PickerSheetPage` |
| Поле поиска — стеклянная капсула 48 pt, системный крестик в поле, рядом круглая стеклянная кнопка «X», прекращающая поиск; поле ввода растянуто на всю капсулу (тап в любое место ставит курсор) | Search field iOS 26 | `SearchField`, `NavCircleButton` |
| Поля ввода — `TextInput` растянут на всю плитку (`alignSelf: stretch`), тап в любое место плитки ставит курсор | UITextField в inset-ячейке | `ComposerField`, `Input` |
| Списки выбора и настроек — inset grouped, плитки иконок 36 pt, галочка/шеврон | Настройки, шторки выбора | `InsetGroup`, `InsetRow`, `PickerSheetPage` |
| Главное действие — выпуклая стеклянная капсула 56 pt с оттенком | Prominent glass button | `GlassButton`, `ComposerScreen`, `FormScreen` |
| Плавающая круглая кнопка действия над нижним меню | «Новая заметка» в Заметках | `FloatingActionButton` |
| Нижнее меню — системное, стеклянное, с SF Symbols | UITabBar iOS 26 | `NativeTabs` |
| Служебные иконки | SF Symbols | `SystemIcon` |
| Шторки выбора — системные formSheet с грабером и детентами | UISheetPresentationController | `Stack.Screen presentation="formSheet"` |
| Списки действий — системный лист | UIAlertController (action sheet) | `ActionSheetIOS` |
| Шкала текста | Large Title 34 / Title 1 28 / Title 2 22 / Body 17 / Callout 16 / Subheadline 15 / Footnote 13 | токены `text-ios-*` |

Без стекла (iOS до 26, Android) те же компоненты рисуют поверхность с
волосяной границей — экран остаётся правильным.

## 1. Принципы

1. **Платформа диктует поведение, бренд диктует контент.** Навигация, жесты,
   модальности, клавиатура, шрифт, haptics — как в iOS. Цвет, тон, иллюстрации,
   структура карточек — xtrud. Нельзя изобретать замену системному поведению
   ради визуального единства с web.
2. **Системный шрифт (SF Pro) и Dynamic Type — не опция.** Текст обязан
   масштабироваться настройкой пользователя.
   ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography))
3. **Контент — главный слой, хром — плавающий над ним.** Apple: «Liquid Glass is
   best reserved for the navigation layer that floats above the content of your
   app. Making it apply to content layers would make it compete with other
   elements and muddy the hierarchy»
   ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials),
   [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
   Практический вывод для xtrud: стеклянные/полупрозрачные эффекты допустимы
   только на tab bar, header и floating CTA, никогда на карточках списка.
4. **Ни один экран не готов без прогона на реальном iPhone** в light и dark, с
   VoiceOver и увеличенным Dynamic Type. Симулятор — не замена.
5. **Никакой эмуляции Android.** `slide_from_right`, material ripple,
   FAB-паттерны, Android back-семантика в iOS-контуре не используются.

---

## 2. Навигация

Канон iOS-навигации в xtrud — native stack (`react-native-screens`) под
expo-router.
([Native Stack Navigator](https://reactnavigation.org/docs/native-stack-navigator/),
[Expo Router modals](https://docs.expo.dev/router/advanced/modals/))

**Обязательно:**

1. **Иерархия:** корни продукта — в `Tabs`; detail / picker / edit / формы — в
   native `Stack` над Tabs (уже зафиксировано в `CROSS_PLATFORM_RULES.md` §7.6).
   Detail нельзя объявлять скрытым `Tabs.Screen` — это ломает edge-swipe.
2. **Анимация push:** только `animation: "default"` (или отсутствие опции).
   `slide_from_right`/`slide_from_left` на iOS документированно
   «falls back to the default animation» — это мёртвая настройка, вводящая в
   заблуждение. Использовать `simple_push` только когда включён
   `fullScreenGestureEnabled`.
3. **Edge-swipe back обязателен на каждом push-экране** (`gestureEnabled: true`,
   default). Отключать только на экранах, где выход разрушает данные, и тогда
   через `usePreventRemove`, а не через жёсткий `gestureEnabled: false`.
   Обязательный ручной тест: half-swipe с отменой (см. `CROSS_PLATFORM_RULES.md`
   §7.9).
4. **Модальность выбирается по смыслу, а не по удобству реализации:**
   - самостоятельная задача, отменяемая целиком → `presentation: "modal"`;
   - выбор параметра/фильтра/подтверждение → `presentation: "formSheet"` с
     `sheetAllowedDetents` (`'fitToContents'` или массив долей высоты, например
     `[0.5, 1]`), `sheetGrabberVisible: true`, `sheetCornerRadius`;
   - продолжение текущего flow → обычный push.
   Full-screen `<Modal>` из RN допустим только для lightbox/фото-просмотра.
5. **Заголовки.** Стандарт с 2026-09-06 — `src/components/ui/LargeTitle.tsx`:
   крупный заголовок 34/41 в содержимом, компактный 17/22 в закреплённой
   стеклянной строке навигации при прокрутке, действия справа текстом в
   акценте или иконкой в круге. Это воспроизводит поведение `headerLargeTitle`
   там, где нативный header недоступен из-за кастомных панелей под ним
   (поиск, фильтры, сегменты). `ScreenHeader` остаётся для detail-экранов с
   кнопкой «назад» и коротким заголовком.
5a. **Отступ от чёлки.** Каждый маршрут в `app/` учитывает `insets.top` сам или
   через компонент, который это делает (`LargeTitle`, `PickerSheetPage`,
   шторки). Правило закреплено тестом
   `src/components/ui/screen-top-inset-contract.test.ts`.
6. **Поиск.** Поисковый UI на экране, где поиск — основной режим, реализуется
   `headerSearchBarOptions` (native `UISearchController`), а не кастомным
   `TextInput` в контенте. Кастомный `SearchBar` допустим как inline-фильтр
   внутри контента.
7. **Tab bar.** Целевое состояние — `NativeTabs` из
   `expo-router/unstable-native-tabs`: на iOS 26+ система рисует tab bar в
   Liquid Glass, даёт `minimizeBehavior="onScrollDown"`, `role="search"` и
   SF Symbols через проп `sf`. Ограничения (**FACT**, те же docs): API в alpha,
   высота таб-бара не измеряется, вложенных native tabs нет, динамическое
   добавление табов не поддерживается
   ([Native tabs](https://docs.expo.dev/router/advanced/native-tabs/)).
   Переход на NativeTabs — отдельная задача с device-QA.
8. **Alert vs ActionSheet.** Деструктивное подтверждение — alert с
   `destructive`-стилем (через общий `confirmAsync()`). Выбор из 3+ действий над
   объектом — action sheet или context menu, не самодельный full-screen лист.
9. **Deep links** (`applinks:xtrud.pro`, scheme `xtrud`) проверяются cold и warm
   launch на каждый публичный detail route.

---

## 3. Типографика и layout

1. **Шрифт — системный.** На native `fontFamily` не задаётся (это и есть SF Pro).
   Решение зафиксировано в `AppText.tsx` и `AGENTS.md`; Geist/Inter добавлять
   нельзя.
2. **Body-опора — 17 pt.** Базовый iOS Body в Dynamic Type — 17 pt
   ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)).
   Наша шкала (`tailwind.config.ts`) `body-md: 16px` — осознанный xtrud-override
   (**DECISION**, `DESIGN.md`), но **основной читаемый текст экрана не должен
   быть мельче 16 px**, а `caption: 12px` — абсолютный минимум и только для
   бейджей/счётчиков.
3. **Dynamic Type обязателен.** Любой пользовательский текст рендерится через
   `AppText`; сырой `<Text>`/`<TextInput>` без политики
   `maxFontSizeMultiplier` не добавляется (`CROSS_PLATFORM_RULES.md` §5.6).
4. **Ограничение масштаба — по слою, а не глобально.** `maxFontSizeMultiplier`
   ≤ 1.3 допустим только там, где обрезка ломает функцию (бейдж, чип, счётчик,
   однострочная метрика). Основной контент — заголовки экранов, описания
   заданий, тексты откликов, отзывы, кнопки — должен доходить до
   Accessibility-размеров. Apple прямо ожидает поддержки Larger Accessibility
   Sizes (AX1–AX5) для основного текста
   ([Larger Text evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria/)).
5. **Никакого уменьшения шрифта ради вёрстки** — меняем плотность или переносим
   строку; `numberOfLines` + `flex-shrink` (`DESIGN.md`).
6. **Layout адаптируется к масштабу текста.** Фиксированная `height` у строки с
   текстом запрещена — `minHeight` + вертикальный padding. Ряды
   `icon + text + chevron` при AX-размерах переносят текст или уходят в столбец.
7. **Safe area применяется один раз владельцем края**
   (`CROSS_PLATFORM_RULES.md` §4.3): inset родителя и экрана не складываются.
8. **Тач-цель — минимум 44×44 pt.** Apple: «Controls should measure at least 44
   points x 44 points»
   ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
   [UI Design Dos and Don'ts](https://developer.apple.com/design/tips/)).
   Если видимый элемент меньше — обязателен `hitSlop`, доводящий область до 44.

---

## 4. Цвет, материалы, темы

1. **Единственный источник цвета — `src/lib/colors.ts`**; CSS-переменные
   генерируются (`npm run tokens`). Inline hex в UI запрещён, кроме технических
   метаданных платформы (`CROSS_PLATFORM_RULES.md` §4.6).
2. **Обе темы обязательны.** `userInterfaceStyle: "automatic"` (**FACT**,
   `app.json`) + in-app override через `ThemeSwitcher`. Ни один экран не
   принимается без скриншотов light и dark.
3. **Контраст.** Текст на фоне — минимум 4.5:1 для основного и 3:1 для крупного;
   Apple выделяет «Sufficient Contrast» отдельным критерием доступности
   ([Accessibility Nutrition Labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)).
   Токены `mute`/`hairline` не используются для несущего текста.
4. **Смысл никогда не передаётся только цветом.** Статус заказа, ошибка формы,
   активный таб — цвет + иконка/текст/форма (критерий «Differentiate Without
   Color Alone», там же).
5. **Материалы.** Полупрозрачность и blur — только для навигационного слоя
   (tab bar, header, floating CTA), см. §1.3. На iOS 26+ целевой инструмент —
   `expo-glass-effect` (`GlassView`/`GlassContainer`, поверх `UIVisualEffectView`,
   c fallback на обычный `View` ниже iOS 26)
   ([Expo: Liquid Glass](https://expo.dev/blog/liquid-glass-app-with-expo-ui-and-swiftui)).
   Вариант `Regular` — по умолчанию; `Clear` — только с dimming-слоем под ним
   ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
   Пока пакет не установлен — стеклянные эффекты не имитируются градиентами.
6. **Status bar.** Стиль должен следовать теме. Любая правка `app.json`
   (`UIViewControllerBasedStatusBarAppearance`, `UIStatusBarStyle`) и
   `<StatusBar style>` проверяется на устройстве в обеих темах
   ([expo-status-bar](https://docs.expo.dev/versions/latest/sdk/status-bar/)).
7. **Иконки.** DECISION владельца 2026-09-06 (вечер): «ориентируемся на
   последний iOS — какие иконки там, такие и у нас». Служебные иконки
   интерфейса («назад», «закрыть», галочка выбора, «+», стрелка чипа, лупа,
   вкладки) — SF Symbols через `SystemIcon` (`src/components/ui/SystemIcon.tsx`,
   пакет `expo-symbols`) с запасной Phosphor-иконкой того же смысла для
   Android/web ([expo-symbols](https://docs.expo.dev/versions/latest/sdk/symbols/)).
   Иконки категорий и содержимого — Phosphor в одном стиле (`docs/UI_ICONS.md`,
   референс Thumbtack). В одном визуальном ряду не смешивать: ряд служебных
   кнопок — только SF, ряд категорий — только Phosphor; плитка категории рядом
   с системной галочкой в строке списка — допустимо, как иконка приложения
   рядом с галочкой в Настройках.

---

## 5. Motion и haptics

1. **Пружины, а не длительности.** Переходы состояний, появление листов,
   раскрытие блоков делаются через `withSpring` (Reanimated 4). Линейный
   `Animated.timing` из RN — legacy и не добавляется в новый код. Reanimated 4
   требует New Architecture и отдельного пакета `react-native-worklets`
   ([Reanimated 4](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started))
   — оба условия в проекте выполнены (**FACT**, `package.json`, `app.json`).
2. **Reduce Motion обязателен.** Декоративные анимации выключаются целиком;
   анимации, несущие смысл (переход иерархии, смена статуса), заменяются на
   dissolve/fade
   ([Reduced Motion evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/)).
   Инструменты: `useReducedMotion()` и параметр `reduceMotion: ReduceMotion.System`
   в `withTiming`/`withSpring`, `.reduceMotion()` у layout-анимаций
   ([Reanimated accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility)).
   Отсутствие обработки Reduce Motion — блокер приёмки анимированного экрана.
3. **Анимация живёт на UI-потоке.** Любая анимация в списке, в жесте или под
   пальцем — только Reanimated worklet. Никаких `setState` на каждый кадр.
4. **ProMotion.** На 120 Гц-устройствах рывки заметнее; каждый анимированный
   экран проверяется на реальном ProMotion-iPhone.
   **UNKNOWN:** какие модели iPhone доминируют у пользователей в Ингушетии —
   проверяется App Store Connect → Analytics → Devices; до проверки исходим из
   худшего случая (и ProMotion, и старые 60 Гц).
5. **Haptics — часть iOS-качества, а не украшение.** Канон (`expo-haptics`,
   [docs](https://docs.expo.dev/versions/latest/sdk/haptics/)):
   - `selectionAsync()` — смена выбора: чип, сегмент, шаг пикера, переключение
     таба, выбор категории/города;
   - `impactAsync(ImpactFeedbackStyle.Light|Medium)` — фиксация жеста: закрытие
     листа, срабатывание swipe-action, drag-snap;
   - `notificationAsync(NotificationFeedbackType.Success|Warning|Error)` —
     результат операции: заказ опубликован, отклик отправлен, ошибка формы,
     удаление аккаунта.
   Запрещено: haptics на каждом скролле, на каждом рендере, на пассивных
   событиях. Учитывать, что Taptic Engine молчит в Low Power Mode (там же) —
   haptics никогда не является единственным сигналом результата.
6. **Shared element transitions** не используются и не вводятся без отдельного
   DECISION. **UNKNOWN:** production-статус shared transitions в Reanimated 4 —
   проверяется в docs.swmansion.com перед внедрением.

---

## 6. Списки и производительность

1. **Каждый список, который может вырасти больше экрана, — виртуализованный.**
   `ScrollView` + `.map()` допустим только для фиксированного набора (≤ ~15
   элементов, не растущий от данных).
2. **Дефолт — `FlashList` v2** (в проекте `2.0.2`, **FACT**). В v2 `estimatedItemSize`,
   `estimatedListSize`, `estimatedFirstItemOffset` удалены/deprecated;
   `maintainVisibleContentPosition` включён по умолчанию; для сеток —
   проп `masonry` вместо `MasonryFlashList`; для состояния элемента —
   `useRecyclingState`/`useLayoutState`
   ([FlashList v2 changes](https://shopify.github.io/flash-list/docs/v2-changes)).
   Передавать `estimatedItemSize` в новый код — ошибка.
3. **Рециклинг требует чистых элементов.** Элемент списка не хранит `useState`,
   зависящий от `item`, без `useRecyclingState` — иначе при переиспользовании
   ячейки утечёт чужое состояние.
4. **Изображения — только `expo-image`** для сетевых картинок
   (`CROSS_PLATFORM_RULES.md` §6.2), с явными `contentFit`, `transition`,
   `placeholder` и заданными размерами контейнера.
5. **Pull-to-refresh** — `RefreshControl` c `tintColor` из токенов темы.
6. **Производительность проверяется на release-сборке**, не в dev.

---

## 7. Accessibility

Обязательный минимум для каждого экрана:

1. **Каждый интерактив** имеет `accessibilityRole`, осмысленный
   `accessibilityLabel` (не «кнопка», а действие) и `accessibilityState`
   (`disabled`, `selected`, `busy`).
2. **`accessibilityHint`** — там, где результат действия неочевиден
   («Откроет форму отклика», «Удалит аккаунт без восстановления»).
3. **Декоративное скрывается:** иллюстрации, фоновые градиенты, дублирующие
   иконки — `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`.
4. **Порядок фокуса VoiceOver** соответствует визуальному; карточка списка —
   один элемент фокуса, а не 6 отдельных текстов.
5. **Динамические изменения объявляются:** ошибки формы, счётчики, результаты
   поиска — `accessibilityLiveRegion` / `AccessibilityInfo.announceForAccessibility`.
6. **Dynamic Type до AX-размеров** (§3.4), **44×44 pt** (§3.8), **контраст** и
   **не-только-цвет** (§4.3–4.4), **Reduce Motion** (§5.2).
7. Целевой формат самопроверки — категории Apple Accessibility Nutrition Labels:
   VoiceOver, Larger Text, Sufficient Contrast, Differentiate Without Color
   Alone, Reduced Motion, Dark Interface
   ([overview](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)).
   Заполнение labels пока добровольное (**FACT**, там же); дата обязательности —
   **UNKNOWN**, проверяется в App Store Connect Help / Apple Developer News.

---

## 8. App Store compliance gates

Проверяется перед каждым submission; провал любого пункта — блокер.

| # | Требование | Источник | Состояние в xtrud |
|---|---|---|---|
| 1 | Удаление аккаунта инициируется **из приложения**, а не только деактивация | [5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/), [Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/) | **FACT** есть: `src/features/auth/use-delete-account.ts` → RPC `delete_my_account`, UI в `app/(details)/profile/settings.tsx` (двойное подтверждение + `signOut`) |
| 2 | Privacy Policy: ссылка в метаданных App Store Connect **и внутри приложения**, с описанием удержания/удаления данных | [5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/) | **FACT** in-app есть: `app/legal/privacy.tsx`, доступен анонимно (allowlist в `app/_layout.tsx`), проверяется `npm run release:legal:check` |
| 3 | Support URL с рабочим способом связи | [1.5 Developer Information](https://developer.apple.com/app-store/review/guidelines/) | **UNKNOWN**: значение поля Support URL в App Store Connect — проверяется в ASC перед submit |
| 4 | UGC: фильтрация нежелательного контента | [1.2](https://developer.apple.com/app-store/review/guidelines/) | **UNKNOWN**: серверная пре-модерация заданий/фото/отзывов не подтверждена кодом — проверяется в `supabase/migrations` + edge functions |
| 5 | UGC: механизм жалобы на контент + своевременная реакция | [1.2](https://developer.apple.com/app-store/review/guidelines/) | **FACT** есть: `src/features/reports/*`, `src/features/reviews/ReportReviewSheet.tsx`, разбор в `app/(details)/admin/reports.tsx`. SLA реакции — **UNKNOWN** |
| 6 | UGC: **блокировка** abusive-пользователя | [1.2](https://developer.apple.com/app-store/review/guidelines/) | **FACT отсутствует**: нет ни UI, ни таблицы/RPC блокировок (grep по `block`/`Заблокировать` — пусто). Это прямой риск reject |
| 7 | Опубликованные контакты разработчика | [1.2](https://developer.apple.com/app-store/review/guidelines/) | **UNKNOWN**: проверяется на `xtrud.pro` и в ASC |
| 8 | Privacy manifest `PrivacyInfo.xcprivacy` с required-reason API и собранными причинами зависимостей | [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [Describing data use](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests), [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/) | **FACT**: `ios.privacyManifests` задан в `app.json` — 4 `NSPrivacyAccessedAPITypes` (агрегированы из `.xcprivacy` зависимостей) и 13 `NSPrivacyCollectedDataTypes`, `NSPrivacyTracking: false`. Ключ поддержан схемой `@expo/config-types` и `@expo/config-plugins/build/ios/PrivacyInfo.js` (`withPrivacyInfo` в default-плагинах prebuild), подтверждён `npx expo config --type introspect`. Apple «does not correctly parse all the PrivacyInfo files included by static CocoaPods dependencies» — агрегация остаётся на нас. Достаточность — **UNKNOWN**, проверяется ответом ASC на upload |
| 9 | ATT (`AppTrackingTransparency`) при трекинге между приложениями | [5.1.2](https://developer.apple.com/app-store/review/guidelines/) | **FACT** не требуется на текущем коде: `expo-tracking-transparency` не установлен, IDFA не используется. При добавлении рекламы/атрибуции пункт становится блокером |
| 10 | Билд полностью функционален, без плейсхолдеров, с demo-доступом для ревью | [2.1](https://developer.apple.com/app-store/review/guidelines/) | **FACT**: production-профиль EAS выставляет `EXPO_PUBLIC_ENABLE_DEMO=false` (`eas.json`); demo-аккаунт для ревьюера — **UNKNOWN** |
| 11 | Экспорт-шифрование объявлено | — | **FACT**: `ITSAppUsesNonExemptEncryption: false` в `app.json` |
| 12 | Номер сборки уникален и не повторяет опубликованный | `AGENT_WORKFLOW.md` §4 | **FACT**: `npm run store:check:ios`; ledger — `release/production.json` (ios 1.0.1 / build 11) |

Гигиена (не gate): все iOS usage-description строки на русском и по делу —
**FACT**, `app.json` (`NSPhotoLibraryAddUsageDescription`, photos/camera из
`expo-image-picker` plugin).

---

## 9. Gap-анализ текущего кода

### 9.1 Что уже соответствует (FACT)

- **Detail-экраны в root native Stack** (`app/(details)/*`), а не скрытыми
  `Tabs.Screen` — edge-swipe работает (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`).
- **Удаление аккаунта** реализовано полностью (см. §8.1).
- **Legal-экраны доступны анонимно** + автопроверка (`app/legal/*`, `release:legal:check`).
- **Единая палитра и генерация токенов**: `src/lib/colors.ts` → `global.css`, `tokens:check`.
- **Системный шрифт с табличными цифрами** (`src/components/AppText.tsx`).
- **Accessibility-разметка широко присутствует**: 96 из 138 `.tsx`; 314
  `accessibilityRole`, 208 `accessibilityLabel`, 58 `accessibilityState`,
  19 `accessibilityLiveRegion`.
- **New Architecture включён**, Reanimated 4 + worklets установлены корректно.
- **`supportsTablet: false`** — соответствует iPhone-only позиционированию.
- **Жалобы на контент** реализованы для заданий/профилей/отзывов.

### 9.2 Нарушения — по влиянию на качество

> ⚠️ Снимок августа 2026, оставлен как история разбора. К сентябрю устранены:
> модальности iOS (`formSheet` + detents везде, `BottomSheet` удалён),
> haptics (`src/lib/haptics.ts`, 12 файлов), Reduce Motion
> (`useReducedMotion`), виртуализация (`FlashList` на 7 экранах),
> `TabBar` → `NativeTabs`. Актуальное состояние — §0 и `TASKS.md`.

**P0 — риск rejection или сломанный базовый iOS-опыт**

1. **Нет блокировки пользователей** (Guideline 1.2). Grep по `block_user`,
   `blocked_users`, «Заблокировать» — ноль совпадений в `src/`, `app/`,
   `supabase/`. Требуется UI (в профиле мастера/клиента и в отклике) + таблица
   с RLS + фильтрация заблокированных из выдачи.
2. **Нет `ios.privacyManifests` в `app.json`.** При добавлении любой новой
   native-зависимости (или при ужесточении проверки ASC) upload будет
   отклонён. Нужен явный агрегированный манифест.
3. ~~**`maxFontSizeMultiplier={1.3}` захардкожен в `AppText`**~~ — **Устранено
   2026-08-30**: кап снят в `src/components/AppText.tsx`, текст масштабируется
   на всём диапазоне Dynamic Type; политика `maxFontSizeMultiplier` по слою
   остаётся допустимой только для бейджей/чипов/счётчиков.
4. ~~**Тач-цели ниже 44 pt.**~~ — **Устранено 2026-08-30**: `Button` `SIZE_MAP`
   переведён на `minHeight`, размер `sm` (32 pt, 0 вызовов в коде) убран,
   `md` поднят до 44 pt (`src/components/ui/Button.tsx`). Все интерактивные
   `h-9 w-9`/`h-8 w-8` без `hitSlop` найдены заново (4 шт. — прежние 15/4
   относились к коду, часть которого с тех пор удалена, включая
   `MasterServicesSection`) и закрыты `hitSlop={8}`; остальные `h-9 w-9`/`h-8
   w-8` уже имели достаточный `hitSlop` или были декоративными (не
   интерактивными) элементами внутри более крупной touch-área.

**P1 — заметная разница с нативным ощущением**

5. **Модальностей iOS нет вообще.** `presentation:` не встречается ни в одном
   файле `app/` и `src/`. Все «листы» — самодельный
   `src/components/ui/BottomSheet.tsx`: RN `<Modal transparent>` + JS
   `Animated.timing` (240/200 мс, линейно), full-screen, без detents, без
   grabber, без интерактивного dismiss-жеста. Это самый большой одиночный
   разрыв с iOS-качеством. Целевое: `formSheet` + `sheetAllowedDetents` +
   `sheetGrabberVisible` (см. §2.4).
6. **Нет haptics.** `expo-haptics` не установлен, ноль вызовов в коде. Ни один
   тап, выбор, публикация заказа или ошибка не даёт тактильного отклика.
7. **Нет обработки Reduce Motion.** Ноль вхождений `useReducedMotion`,
   `ReduceMotion`, `AccessibilityInfo` в `src/` и `app/`. Все анимации
   (`Skeleton`, `PortfolioLightbox`, `BottomSheet`) играют всегда.
8. **Списки не виртуализованы.** `FlashList` используется ровно в одном месте —
   `app/(tabs)/orders/search/index.tsx:168`. Ленты главной, избранного, поиска,
   категории, кейсов мастера, карточки мастера построены на `ScrollView`/`FlatList`
   (`app/(tabs)/index.tsx`, `app/(tabs)/favorites.tsx`, `app/(details)/search.tsx`,
   `app/(details)/category/[id].tsx`, `app/(details)/master/[id].tsx`,
   `app/(details)/master-cases/[id].tsx`).
9. **Reanimated почти не используется:** только `app/_layout.tsx` (side-effect
   import), `src/components/Skeleton.tsx`, `src/features/profile/PortfolioLightbox.tsx`.
   Анимации, где они есть, идут через RN `Animated` — §5.1.
10. **`animation: "slide_from_right"`** в `app/_layout.tsx:245` и
    `app/(auth)/_layout.tsx:5`. На iOS это документированно падает в
    default-анимацию, то есть настройка не делает ничего и маскирует
    отсутствие осознанного выбора перехода.
11. **Нативный header не используется нигде:** `headerShown: false` глобально,
    ноль вхождений `headerLargeTitle` и `headerSearchBarOptions`. Значит нет
    large titles, нет системного collapse, нет `UISearchController`.
12. **`RefreshControl` с хардкодом `tintColor="#2563eb"`**
    (`src/hooks/use-pull-to-refresh.tsx:32`) — цвет вне палитры (`accent` =
    `#fe5574`, `link` = `#0070f3`) и не меняется в dark.
13. **`PhoneFrame` обёрнут вокруг корневого `Stack`** (`app/_layout.tsx`). На
    native он возвращает `children` без изменений (**FACT**,
    `src/components/PhoneFrame.tsx`), то есть безвреден, но держит web-специфичный
    слой в критическом пути iOS-навигации — при iOS-only стратегии его следует
    вынести из root layout.
14. **Кастомный `TabBar`** (`src/components/TabBar.tsx`, `TAB_HEIGHT = 52`,
    Phosphor-иконки, синтетический центральный псевдо-таб) вместо native tabs:
    нет Liquid Glass, нет системного scroll-to-top/minimize, нет SF Symbols.

**P2 — гигиена**

15. ~~`ScreenHeader` фиксирует `height: 64`~~ — **Устранено 2026-08-30**:
    `src/components/ui/ScreenHeader.tsx` использует `minHeight`, title растёт
    на AX-размерах вместо обрезки.
16. Иконочная кнопка `iconAction` в `ScreenHeader` — `h-10 w-10` (40 pt), но с
    `hitSlop={8}` (реальная тач-цель 56 pt) — требованию §3.8 не противоречит.
17. `32` вызова `Alert.alert` в коде при наличии общего адаптера
    `src/lib/confirm.ts` — часть из них, вероятно, обходит адаптер
    (`CROSS_PLATFORM_RULES.md` §3 прямо это запрещает). **UNKNOWN**: сколько
    именно нарушают правило — нужен точечный аудит вызовов.

### 9.3 UNKNOWN и способ проверки

| Вопрос | Способ проверки |
|---|---|
| Минимальная поддерживаемая версия iOS у текущего билда | `ios/Podfile`/`Podfile.properties.json` после `npx expo prebuild`, либо ASC → App Information |
| Достаточность privacy manifest | Upload билда в TestFlight — Apple присылает предупреждения о недекларированных required-reason API |
| Support URL и контакты разработчика | App Store Connect → App Information |
| Наличие пре-модерации UGC на backend | Аудит `supabase/migrations/*` и Edge Functions на триггеры/очередь модерации |
| SLA реакции на жалобы | Владелец: описать процесс разбора `admin/reports` |
| Демо-аккаунт для App Review | ASC → Version → App Review Information |
| Доля ProMotion-устройств у аудитории | ASC → Analytics → Devices |
| Production-статус shared element transitions в Reanimated 4 | docs.swmansion.com перед внедрением |
| Целесообразность апгрейда Expo SDK 54 → 56 | SDK 56 (релиз 21.05.2026) требует iOS 16.4+ и Xcode 26.4+, включает стабильный Expo UI (SwiftUI) и iOS Widgets; SDK 55+ убирает Legacy Architecture и ключ `newArchEnabled`. Решение — отдельная задача с полным regression-прогоном ([SDK 55](https://expo.dev/changelog/sdk-55), [SDK 56](https://expo.dev/changelog/sdk-56)) |

---

## 10. Приёмочный чек-лист iOS-экрана

Перед отчётом по любому новому/изменённому экрану:

1. Light и dark на реальном iPhone.
2. Dynamic Type: Large (default) и AX3 — ничего не обрезано, не наехало.
3. VoiceOver: пройден весь сценарий свайпами, порядок логичен, все действия
   озвучены.
4. Reduce Motion включён — экран работает и не мигает.
5. Edge-swipe back: полный, отменённый наполовину, повторный.
6. Клавиатура: поле не закрыто, `keyboardShouldPersistTaps`, скролл к первой
   ошибке.
7. Все тач-цели ≥ 44×44 pt (визуально или через `hitSlop`).
8. Списки: виртуализация там, где данные растут; проверка на release-сборке.
9. Haptics — на выборе, результате и ошибке; нигде не на скролле.
10. Нет `Alert.alert`/`window`/hex-цветов в обход общих адаптеров и токенов.
11. `npm run quality:check` — после последней правки (`AGENT_WORKFLOW.md` §5).
