# xtrud — mobile-first правила iOS + Android + supporting web

> Актуально на 2026-08-26. Этот документ описывает эксплуатационные различия
> платформ. Визуальные правила находятся в `DESIGN.md` и `UI_PATTERNS.md`, а
> сборка и выкладка — в `PROJECT_OPERATIONS.md`.

## 1. Область действия

- Главный продукт — мобильное приложение; iOS является первым production и
  ежедневным visual/device контуром.
- Android разрабатывается в общей кодовой базе сразу. Его production-релиз
  идёт после iOS, но первый preview/device smoke обязателен до заморозки iOS
  release candidate и повторяется после каждого крупного vertical slice.
- Web — supporting surface для legal/support/account deletion, recovery,
  universal links и совместимости маршрутов; он не определяет mobile UX.
- По умолчанию экран, feature, schema валидации и запросы к данным общие.
- Platform gate допустим только там, где различается capability браузера и
  native runtime. Нельзя создавать две копии бизнес-логики ради небольшого
  визуального отличия.

Фактический стек: Expo SDK 57, Expo Router, NativeWind 4, React Native Web,
Reanimated 4, TanStack Query 5, Zustand, react-hook-form/zod, Supabase.

## 2. Источники истины

| Область | Редактируемый источник | Производное |
|---|---|---|
| Экраны и логика | `app/`, `src/` | web bundle, native binary |
| Ассеты | `assets/`, `public/` | оптимизированные файлы сборки |
| Native config | `app.json`, config plugins, зависимости | `ios/`, `android/` |
| Версии native | `app.json`, `eas.json` | EAS/App Store artifacts |
| Web build/deploy | `scripts/build-web-local.mjs`, `deploy/web.sh` | `dist/`, VPS |
| Цвета и токены | `src/lib/colors.ts`, `src/lib/tokens.ts`, `tailwind.config.ts`, `global.css` | runtime styles |
| Текст | `src/components/AppText.tsx` | platform text rendering |
| Backend contract | migrations/functions + проверенный live schema dump | Supabase runtime |

Правила:

1. `dist/`, `.expo/`, `ios/`, `android/`, EAS binary, App Store binary и файлы
   на VPS не являются исходниками.
2. `ios/` и `android/` вручную не редактировать. Native-изменение выражается
   через Expo config, зависимость или config plugin.
3. Web, iOS и Android релизы независимы. Общий commit не означает
   автоматическую выкладку всех платформ.
4. Backend должен оставаться совместимым со всеми поддерживаемыми версиями mobile:
   установленный binary нельзя мгновенно заменить вместе с web.

## 3. Общий код и platform capabilities

| Capability | Общий Interface / Adapter | Web Implementation | iOS Implementation | Android Implementation |
|---|---|---|---|---|
| Session storage | `src/lib/storage.ts` | `localStorage` под SSR guard | chunked Keychain через `SecureStore` | chunked Keystore через `SecureStore` |
| Supabase client | `src/lib/supabase.ts` | PKCE, URL session detection | PKCE, AppState token refresh | PKCE, AppState token refresh |
| Выбор и подготовка фото | `src/lib/image-upload.ts` | скрытый DOM input внутри helper | Expo Image Picker | сейчас Expo Image Picker; recovery через `getPendingResultAsync` ещё не реализован и блокирует Android-ready |
| Подтверждение действия | `src/lib/confirm.ts` | browser confirm | `Alert` | `Alert` |
| Внешняя ссылка | `src/lib/open-link.ts` | browser/opening fallback | React Native Linking | React Native Linking/intent |
| Тема | `src/hooks/use-color-scheme.ts` | DOM class + system media query | Appearance/NativeWind | Appearance/NativeWind |
| Ширина приложения | `src/lib/use-app-width.ts` | ширина `PhoneFrame`, максимум 480 | ширина устройства | ширина устройства |
| Back navigation | `src/lib/use-safe-back.ts` | browser history-aware | Router stack-aware/swipe-back | Router stack-aware/system Back |

Новый platform-specific Adapter добавляется только на реальном Seam между
browser API и native API. Бизнес-правила остаются над этим Interface.

Прямые обращения экранов к `window`, `document`, `navigator`, `localStorage`,
`SecureStore`, DOM input или `Alert.alert` запрещены, если уже существует общий
Adapter. Любой browser global обязан быть защищён `Platform.OS === "web"` и
SSR-проверкой `typeof ... !== "undefined"`.

## 4. Layout, safe area и тема

1. Основная web-оболочка остаётся телефонной колонкой шириной не более 480 px.
   Это продуктовое решение, а не временный breakpoint.
2. Для ширины layout использовать `useAppWidth()`. `useWindowDimensions()`
   допустим для полноэкранного overlay/lightbox или когда нужна физическая
   ширина окна, а не ширина приложения.
3. Safe area применяется ровно один раз владельцем соответствующего края.
   Нельзя складывать inset родителя, дочернего экрана и bottom sheet.
4. Web viewport и Safari/PWA safe area проверяются в конечном export. Источник
   итоговой HTML-нормализации — `scripts/build-web-local.mjs`.
5. Light, dark и system должны совпадать между NativeWind, CSS variables, DOM
   `.dark` и inline-цветами иконок/модалей.
6. Все UI-цвета берутся из токенов. Inline hex разрешён только для технических
   метаданных платформы и явно зафиксированных исключений.
7. Системный шрифт — действующее решение. Inter/Geist и иной custom font нельзя
   добавлять без изменения `DESIGN.md`.
8. Тач-цель не меньше 44×44 pt; если видимая иконка меньше, использовать
   `hitSlop`. Для нового интерактива использовать `Pressable`.

## 5. Текст, ввод, клавиатура и accessibility

1. Пользовательский текст рендерится через `AppText`, если компонент не требует
   строго RN `Text` API.
2. Шкала типографики определяется `DESIGN.md`/Tailwind tokens, а не этим файлом.
3. `KeyboardAvoidingView`: `behavior="padding"` на iOS; текущий общий Adapter
   не задаёт `behavior` на Android/web. Android IME обязан пройти device smoke,
   а не считаться корректным по iOS-проверке.
4. Scroll-форма задаёт `keyboardShouldPersistTaps`, прокрутку к первой ошибке и
   одну общую zod-схему для web/iOS/Android.
5. Input должен иметь label, error state, корректный `textContentType` /
   `autoComplete`, enter-key behavior и доступный размер шрифта.
6. `maxFontSizeMultiplier` для Text/Input централизуется в общих компонентах.
   Новые raw `TextInput` без этой политики не добавлять.
7. Hover — только дополнительный `web:` state; каждый интерактив обязан иметь
   понятный pressed/focus/disabled state и без hover.

## 6. Изображения, файлы, ссылки и диалоги

1. Загрузка аватара, портфолио и фото заказа идёт только через
   `src/lib/image-upload.ts`; там находятся MIME/размер/ориентация и различия
   browser/native picker.
2. Для сетевых изображений предпочтителен `expo-image`. RN `Image` допустим для
   небольших bundled assets или доказанной совместимости, но не должен обходить
   `realAvatarUrl()`/`Avatar` для пользовательских аватаров.
3. Подтверждение удаления и иных важных действий — через `confirmAsync()`.
4. `tel:`, WhatsApp и внешние HTTP(S) URL — через `openExternalUrl()`.
5. Ошибка permission/picker/upload обязана иметь понятное состояние на web,
   iOS и Android; молча проглатывать её нельзя.

## 7. Навигация и ссылки

1. Внутренняя навигация — Expo Router.
2. Переход на новый уровень — `router.push`; завершение wizard/auth redirect —
   `router.replace`.
3. Кнопка назад использует `useSafeBack(fallback)`, а не слепой `router.back()`.
4. `window.history` допустим только в web-only helper очистки auth callback.
5. Каждый публичный detail route тестируется обычным переходом, browser refresh,
   прямым URL и cold app launch.
6. Корни продукта живут в `Tabs`; detail/picker/edit живут в native `Stack`
   над Tabs или во вложенном Stack своего таба. Detail запрещено объявлять
   скрытым `Tabs.Screen`: это лишает iOS стандартного edge-swipe.
7. В настоящем Stack `useSafeBack` выполняет native pop. Path-history — только
   fallback между navigator'ами/deep link и обязана синхронизироваться с pop.
8. Кнопка Back, iOS edge-swipe и системное удаление маршрута используют одну
   semantic policy. Dirty-форма применяет `usePreventRemove`; успешное
   сохранение разрешает ровно один исходный transition.
9. Каждая правка навигации до отчёта проходит отдельный review роли
   `xtrud-designer` и независимый iOS QA: button Back, edge-swipe, отменённый
   наполовину swipe, повторный Back, light/dark и cold fallback.

### Матрица deep links

| Сценарий | Web URL | `xtrud://` | HTTPS Universal Link |
|---|---|---|---|
| Сброс пароля | `https://xtrud.pro/reset-password` | не основной путь | не подтверждён |
| Legal pages | поддержан | не требуется | не требуется |
| Master/order detail | поддержан как route | тестировать перед заявлением поддержки | не подтверждён |

`app.json` содержит `associatedDomains`, но end-to-end AASA/cold-launch тест не
зафиксирован. Поэтому HTTPS universal links пока нельзя считать рабочими.
Наличие config и `scheme: "xtrud"` само по себе этого не гарантирует.

## 8. Auth, storage и server state

1. Supabase client создаётся один раз в `src/lib/supabase.ts`.
2. Web хранит сессию в localStorage через Adapter; iOS/Android — в SecureStore
   (Keychain/Keystore) через тот же Adapter.
3. Server state — TanStack Query. Локальные preferences/UI state — Zustand.
4. Logout очищает session-dependent query cache и возвращает предсказуемый route.
5. Любой persisted PII draft имеет TTL и явные clear rules.
6. PKCE callback, recovery и session persistence тестируются отдельно на web,
   iOS и Android; Android PASS требует APK/device evidence.
7. Изменение Supabase URL/JWT означает повторный вход. Установленный iOS или
   Android binary с вшитым URL сам не переключится на новый backend.
8. Для новых релизов backend URL должен быть собственным стабильным доменом
   `https://api.xtrud.pro`, а не hostname конкретного провайдера.
9. Перед несовместимым backend cutover выпускается переходная iOS-версия и
   механизм минимально поддерживаемой версии/обязательного обновления; Android
   beta затем проверяется против того же API contract.

### Universal task draft и auth-return

Полный продуктовый контракт —
[`docs/UNIVERSAL_TASK_BOARD.md`](docs/UNIVERSAL_TASK_BOARD.md). Platform contract:

1. Черновик имеет версию schema, timestamp/TTL и owner/session binding; поля
   восстанавливаются одинаково на web/iOS/Android через общий store/adapter.
2. Guest submit ведёт в обычный login/register и возвращает на `/orders/new`.
   После возврата draft повторно валидируется; auto-publish запрещён.
3. Web reload/browser Back, iOS cold/warm return и Android cold/warm/activity
   recreation — отдельные тесты. Нельзя считать in-memory navigation
   достаточной persistence; Android остаётся `UNKNOWN` до device evidence.
4. Web `blob:` URL не является сохранённым фото. Временные фото либо копируются
   в управляемое хранилище с TTL/cleanup, либо UI явно требует reattach. На
   iOS/Android то же правило действует для временного picker URI; Android
   pending-result recovery пока не реализован.
5. Logout/account switch очищает или изолирует PII-черновик; новый пользователь
   не получает адрес, текст и фото предыдущего.
6. Реализация хранит persistent draft поколениями с сериализованными
   `get/set/remove`, UTF-8 byte-safe chunks и fail-closed hydration. Фото URI
   остаются только в памяти; после cold return UI явно требует reattach.
7. Guest journey можно claim только точным authenticated `userId` вместе с
   guest fingerprint и TTL. Видимая Back-кнопка очищает journey до
   `useSafeBack()` (`REPLACE`), а успешный auth `REPLACE` сохраняет его до
   одноразового claim.

### Universal category picker

Для 10 L1 используется общий полноэкранный search-first flow L1 → L2 → L3,
а не platform-specific копии и не горизонтальная chip-row.

- Web: keyboard navigation, focus ring, Enter для выбора, Escape/back для
  закрытия, browser refresh/direct URL без потери согласованного draft.
- iOS: клавиатура не перекрывает результаты/sticky CTA; safe area применяется
  один раз; back gesture сохраняет введённый search и draft.
- Общие состояния: initial, search, no-results/unknown, loading, error, offline,
  selected и disabled. Результаты и server eligibility одинаковы на платформах.
- Android наследует общий код, но считается непроверенным до preview build и
  реального device QA.

## 9. Web supporting contract

Разработка и проверка:

```bash
npm run web:dev
npm run web:build:preview
npm run web:build:production
```

- `npm run web` не использовать, пока он не приведён к тому же проверенному
  watcher/build path.
- Изменение любого `EXPO_PUBLIC_*` требует cold Metro/export build.
- Preview может включать demo только явно; production обязан иметь demo=false.
- Production export должен содержать `release.json` и проходить smoke-check.
- Deploy выполняется только `deploy/web.sh`, из clean `main == origin/main` и
  только по явной команде владельца.

Обязательная web-матрица:

- 375 px, 480 px и wide desktop shell;
- light/dark/system;
- refresh и прямой вход на публичные routes;
- login, registration, recovery callback;
- photo picker/upload/delete;
- телефон/WhatsApp;
- Safari iPhone safe area и standalone/PWA, если он заявлен.

## 10. iOS contract

Локальная проверка и release:

```bash
npm run ios
eas build --profile preview --platform ios
eas build --profile production --platform ios
```

- Production build только из clean `main == origin/main` после полного gate.
- После EAS build фиксируются Git SHA, EAS build ID, marketing version и build
  number; фактический auto-increment синхронизируется обратно в `app.json`.
- Env из `eas.json` вшивается в binary. Его изменение требует новой сборки.
- В проекте сейчас не настроен гарантированный OTA contract (`updates.url` +
  `runtimeVersion`); на OTA при миграции backend рассчитывать нельзя.
- Submit в App Store и публикация версии — отдельные действия по явной команде.

Обязательная iOS-матрица:

- clean install и upgrade с предыдущей App Store версии;
- cold launch, warm resume, offline/online return;
- session persistence и принудительный повторный вход;
- клавиатура на каждой форме;
- notch/home indicator;
- photo/camera permissions и upload;
- внешние ссылки;
- recovery/deep link;
- light/dark/system;
- новый backend на реальном устройстве до App Store submit.

## 11. Общий quality gate

Перед merge/release:

```bash
npm run typecheck
npm run tokens:check
npm test
npx biome ci .
npm run web:build:production
```

Для UI дополнительно выполняются design-enforcement grep-проверки и визуальный
preview по правилам проекта. Красный существующий baseline не игнорируется и не
маскируется: он фиксируется отдельным blocker и устраняется отдельной серией.

## 12. Android contract

Android нельзя называть production-ready до:

1. первой EAS preview APK;
2. проверки на реальном устройстве;
3. аудита permissions, включая удаление необоснованного `RECORD_AUDIO`;
4. проверки edge-to-edge, safe area, back gesture, keyboard и file picker;
5. проверки SecureStore/Keystore и notification strategy;
6. подготовки Google Play Data Safety и отдельной release-матрицы.

До этого Android-совместимость является обязательным архитектурным ограничением,
а отсутствие реального Android QA указывается как `UNKNOWN`. Оно не блокирует
локальную iOS-разработку, но блокирует заморозку mobile release candidate после
крупного vertical slice и любые заявления Android-ready.
