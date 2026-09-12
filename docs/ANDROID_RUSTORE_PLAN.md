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


### 4.1. Публикация через API

FACT (документация RuStore, 2026-09-12): `POST https://public-api.rustore.ru/public/auth/`
принимает `keyId`, `timestamp` и `signature` — подпись SHA512withRSA от
строки `keyId + timestamp`, закодированная в Base64; в ответ приходит `jwe`
на 900 секунд. Приватный ключ владельца лежит на VDS
(`/root/.config/xtrud/rustore/api-key.pem`, права 600, в Git его нет).

UNKNOWN: `keyId` из Консоли ещё не получен — без него авторизация в API
невозможна.

Важное ограничение (FACT): API доступен только тем, у кого в Консоли уже есть
хотя бы одна активная версия приложения. Значит **первая публикация делается
руками** через веб-консоль, и автоматизировать имеет смысл только обновления.

## 5. Push на Android — RuStore

DECISION владельца 2026-09-12: сразу вариант RuStore Push, без FCM.

Как это работает и чего не может (FACT, документация RuStore 2026-09-12):

- телефон получает токен у RuStore, сервер шлёт уведомление в
  `POST https://vkpns.rustore.ru/v1/projects/<projectId>/messages:send`
  с сервисным токеном проекта в заголовке;
- доставка возможна, только если на телефоне **установлен RuStore**,
  человек в нём **авторизован**, приложению разрешена фоновая работа, а
  **отпечаток подписи** сборки заведён в RuStore Консоль;
- телефон без RuStore (например, APK скачан с сайта) push не получит —
  уведомления там останутся внутри приложения, счётчики приходят живым
  каналом `/v2/events`.

Сделано в коде (сборка не проверена на телефоне):

| Часть | Файл |
|---|---|
| Отправитель | `server/src/push/rustore.ts` |
| Маршрутизация по платформе | `server/src/push/routes.ts` |
| Настройки сервера | `RUSTORE_PUSH_PROJECT_ID`, `RUSTORE_PUSH_SERVICE_TOKEN` |
| Платформа в выборке токенов | `supabase/migration-drafts/0193_push_targets_platform.sql` |
| Токен на телефоне | `src/features/notifications/rustore-push.ts` |
| Нажатие на уведомление | `src/features/notifications/use-notification-tap.ts` |
| Идентификатор проекта в манифесте | `plugins/with-rustore-push.js` |

Чтобы это заработало, нужны два значения из RuStore Консоль
(«Push-уведомления → Проекты»): **Project ID** — в сборку через
`EXPO_PUBLIC_RUSTORE_PROJECT_ID`, и **сервисный токен** — на сервер.
Порядок раскатки: миграция 0193 → образ `xtrud-api` → сборка приложения.

## 5.1. Отпечаток ключа подписи

Нужен в двух местах: RuStore Консоль (условие доставки push) и
`.well-known/assetlinks.json` на `xtrud.pro`, если делать Android App Links.

```
SHA-256: 19:89:CC:E9:23:30:8A:88:5C:68:4F:7A:96:1B:9B:95:9B:21:8B:94:C9:90:32:92:C4:0B:D3:54:87:44:6F:C3
```

Ключ: `/root/.config/xtrud/android-signing/upload.keystore`, алиас
`xtrud-upload`, RSA 4096, действует до 28.01.2054. В Git его нет; в сборке он
появляется из секретов репозитория.

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
