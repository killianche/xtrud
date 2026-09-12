# Android и публикация в RuStore

**Имя для запроса:** «нужен Android», «RuStore», «Xiaomi/Samsung/Huawei».

Статус: план работ. Стратегия платформ — [`MOBILE_RELEASE_STRATEGY.md`](MOBILE_RELEASE_STRATEGY.md),
эксплуатационные различия платформ — [`../CROSS_PLATFORM_RULES.md`](../CROSS_PLATFORM_RULES.md).
Этот документ — единственный источник по Android-выпуску и RuStore.

## 1. Запрос владельца (2026-09-12)

Приложение должно устанавливаться на Android — Xiaomi, OPPO, Huawei, Samsung и
прочие, — с публикацией в RuStore. Это отменяет заморозку Android от
2026-08-30 (`MOBILE_RELEASE_STRATEGY.md` §1) для всего, что перечислено ниже.

## 2. Где мы сейчас — проверено кодом

- FACT кодовая база общая: экраны и логика в `app/` и `src/` платформенно
  нейтральны. iOS-специфика уже изолирована адаптерами с Android-веткой:
  `src/components/ui/SystemIcon.tsx` (SF Symbols → Phosphor),
  `GlassSurface.tsx`, `GlassButton.tsx`, `FilterChip.tsx`
  (Liquid Glass → обычная поверхность). Второй копии бизнес-логики нет.
- FACT конфигурация Android есть: `app.json` → `android.package`
  `com.xtrud.app`, `versionCode` 1, `blockedPermissions` с `RECORD_AUDIO`,
  adaptive icon в трёх слоях, `predictiveBackGestureEnabled: false`.
- FACT профиль сборки есть: `eas.json` → `production.android.buildType`
  `app-bundle` (AAB), `preview.android.buildType` `apk`.
- FACT гейты частично знают про Android: `scripts/release/check-mobile-config.mjs`
  (package, отсутствие микрофона, AAB в production) и
  `check-version-consistency.mjs` (`versionCode` ≥ опубликованного, ключ
  `--store-release android`), `release/production.json` →
  `stores.android.latestPublishedVersionCode: null`.
- FACT сборки Android не было ни разу: ledger пуст, в `.github/workflows/`
  только `ios.yml`, скрипт `store:check:android` из `AGENT_WORKFLOW.md` §4 в
  `package.json` отсутствует (есть только `store:check:ios`).
- FACT push сегодня только Apple: `src/features/notifications/use-register-push-token.ts`
  берёт родной токен устройства, `server/src/push/apns.ts` шлёт напрямую в APNs,
  `xtrud_api.push_targets()` (`supabase/migration-drafts/0180_push_apns_own_server.sql`)
  отдаёт **все** токены пользователя без фильтра по платформе. Android-токен
  сейчас уйдёт в APNs и будет удалён как «чужой».
- FACT запасной канал уже есть и работает без push: `GET /v2/events` +
  опрос раз в 20 с (STATUS 2026-09-08). Поэтому отсутствие push на Android —
  ухудшение, а не блокер запуска.
- FACT сервер и файлы платформенно нейтральны: `https://api.xtrud.pro`,
  свой S3/nginx. Ничего Apple-специфичного в контракте API нет.

## 3. Что мешает — список работ

| # | Что | Почему это работа |
|---|---|---|
| A | Ключ подписи (upload keystore) | Без него нет ни AAB, ни APK. Потеря ключа = невозможность обновлять приложение; нужен бэкап у владельца. |
| B | Конвейер сборки | На VDS нет JDK и Android SDK, свободно 7 ГБ — собирать здесь нельзя. Сборка на ubuntu-раннере GitHub тем же `eas build --local`, что у iOS. |
| C | Push на Android | Нужен второй отправитель и фильтр по платформе в `push_targets`. Варианты — §5. |
| D | Восстановление выбора фото | `CROSS_PLATFORM_RULES.md` §3: `getPendingResultAsync` не реализован. Android может убить процесс во время выбора фото. |
| E | Системные механики | edge-to-edge, системная кнопка «Назад», клавиатура (`KeyboardAvoidingView` без `behavior`), Keystore, каналы уведомлений — проверяются только на устройстве. |
| F | Deep links | `applinks:xtrud.pro` объявлен только для iOS. Android App Links требуют `.well-known/assetlinks.json` с отпечатком SHA-256 ключа подписи (зависит от A). |
| G | Материалы RuStore | Карточка, скриншоты с Android-устройства, возрастной рейтинг, политика, описание. |
| H | Гейт релиза | `store:check:android`, ledger `versionCode`, Android-раздел в `RELEASE_RUNBOOK.md`. |

## 4. Требования RuStore — проверено 2026-09-12

- FACT аккаунт: регистрация в RuStore Консоль через VK ID; типы — физическое
  лицо, самозанятый, ИП, юридическое лицо; аккаунт проходит проверку.
  Монетизация через платёжные инструменты RuStore для физлиц и самозанятых
  отключена с 2026-02-01; для xtrud это не важно — платежей в приложении нет.
- FACT сборка: принимаются и APK, и AAB; `targetSdkVersion` ≥ 28; при наличии
  нативного кода нужны 64-битные библиотеки (`arm64-v8a`). Ключ подписи —
  RSA не менее 2048 бит; AAB подписывается ключом загрузки.
- UNKNOWN: точные сроки модерации, состав обязательных материалов карточки и
  правила автопубликации — проверить в RuStore Консоль после регистрации
  (документация rustore.ru отвечала 429 при проверке с VDS).

## 5. Push на Android — три варианта

| Вариант | Где работает | Цена |
|---|---|---|
| Без push на старте | везде | 0 работы. Уведомления видны в приложении, счётчики живые через `/v2/events`; телефон не звонит, пока приложение закрыто. |
| RuStore Push SDK | устройства с установленным RuStore, включая Huawei без сервисов Google | нативный модуль `react-native-rustore-push` (gitflic, не npm-реестр) + свой Expo config plugin + отправитель на сервере. UNKNOWN: требуется ли RuStore на устройстве для доставки — проверить в документации. |
| FCM (Google) | Xiaomi, OPPO, Samsung и все с сервисами Google; **не** на новых Huawei | `google-services.json`, проект Firebase, отправитель FCM v1 на сервере. Зависимость от Google в российском продукте. |

Решение владельца требуется до реализации C.

## 6. Порядок работ

1. **Сборка существует.** Ключ подписи (A) → workflow `android.yml` (B) →
   preview APK как артефакт. Результат: файл, который ставится на телефон.
2. **Живое устройство.** Установка APK на Android владельца; проверка §3 E, D
   и полного сценария: регистрация, публикация задания, фото, отклик, звонок.
   До этого любое утверждение «Android работает» — UNKNOWN.
3. **Правки после устройства.** Что нашлось на шаге 2, включая D.
4. **Push (C)** — по решению владельца из §5.
5. **RuStore.** Аккаунт владельца → карточка и материалы (G) → AAB из
   production-профиля → загрузка → модерация.
6. **Гейт (H)** и запись опубликованного `versionCode` в
   `release/production.json`.

Шаги 1–3 не зависят от RuStore-аккаунта и делаются сразу. Шаг 5 без владельца
невозможен: регистрация идёт на его имя.

## 7. Прямая установка APK

RuStore — не единственный путь: APK можно отдавать с `xtrud.pro`. Это полезно
для теста и для устройств без RuStore, но не заменяет магазин (нет обновлений
и доверия установки из неизвестного источника). Решение о публикации APK на
сайте — отдельное, за владельцем.
