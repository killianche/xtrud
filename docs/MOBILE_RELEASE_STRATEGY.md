# Mobile-first стратегия xtrud

## TL;DR

**Имя для запроса:** «сначала iOS», «когда Android», «mobile-first».

xtrud — мобильное приложение с общей Expo-кодовой базой. Разработка и первый
production-релиз идут через iOS, потому что iOS уже опубликован и имеет рабочий
release ledger.

**Android заморожен** (DECISION владельца, 2026-08-30) до полного завершения
iOS. Это отменяет прежнее правило про обязательный Android preview/device smoke
до заморозки iOS release candidate — см. раздел 8.

Web сокращён до supporting surface, необходимого для соответствия требованиям
App Store: legal/support/account deletion, password recovery и
AASA/universal links. Он не является продуктом и не диктует мобильную
навигацию.

## 1. Проверенные факты

- Клиент построен на Expo SDK 57, React Native 0.86, Expo Router и TypeScript;
  конфигурация iOS и Android находится в `app.json` и `eas.json`.
- iOS `com.xtrud.app` опубликован как 1.0.1 build 11 по
  `release/production.json`; `app.json` содержит следующий локальный build 12,
  но это не доказывает публикацию.
- Android `com.xtrud.app` и production AAB profile настроены, но EAS build,
  Google Play listing и device QA не подтверждены.
- Backend URL и publishable key вшиваются в native binary. Смена Supabase Cloud
  на `https://api.xtrud.pro` требует нового build и не может полагаться на DNS
  или неподтверждённый OTA.
- Текущий production backend — Supabase Cloud. Новый Beget VPS отсутствует,
  поэтому mobile development продолжается против Cloud, а backend changes
  остаются additive, backward-compatible и feature-off.

## 2. Почему iOS-first

> ⏸ Пункт 3 порядка ниже (ранний Android preview) приостановлен решением
> владельца от 2026-08-30 — см. раздел 8.


Одновременный store launch сейчас удвоит release и device QA в момент, когда
основной flow меняется. Полностью отложенный Android создаст другой риск:
keyboard, system Back, edge-to-edge, permissions, photo picker, `content://`,
Keystore и intents обнаружатся слишком поздно.

Поэтому применяется один порядок:

1. Domain/data logic, zod schemas, hooks, query keys и бизнес-тесты пишутся без
   platform fork.
2. Vertical slice визуально и функционально доводится на iOS.
3. До заморозки slice выполняются Android export/prebuild/static permission
   gate, затем preview APK и smoke на реальном устройстве, когда доступен EAS и
   устройство.
4. iOS проходит TestFlight, upgrade и device E2E первым.
5. Android получает отдельную полировку, Data Safety, beta и Google Play gate.

Platform-specific code допустим только как Adapter на реальном Seam. Две копии
заказов, откликов, валидации или server state запрещены.

## 3. Первый продуктовый вертикальный срез

Критический MVP-путь:

1. клиент создаёт задание в одном route: сначала описывает потребность и
   подтверждает предложенную категорию, затем заполняет компактные детали;
2. исполнитель видит релевантное открытое задание;
3. исполнитель отправляет один отклик с сообщением и ценой;
4. клиент сравнивает отклики и сам открывает телефон/WhatsApp исполнителя;
5. номер клиента исполнителю не раскрывается.

Не входят: in-app chat, выбор победителя, статус сделки «в работе», escrow,
споры и платформенные платежи. Каталог исполнителей остаётся вторичным путём и
не должен задерживать order-response slice. Полный контракт —
`docs/SIMPLE_FLOW.md` и `docs/UNIVERSAL_TASK_BOARD.md`.

## 4. Gate каждого vertical slice

### Общие автоматические проверки

- `npm run quality:check`;
- одни и те же business tests для iOS/Android implementations;
- нет прямого platform API в экране, если существует Adapter;
- loading/empty/error/offline/permission-denied/double-submit покрыты;
- light/dark/system и Dynamic Type/TalkBack/VoiceOver учтены в design review.

### iOS

- compact и большой реальный iPhone;
- clean install и upgrade с последней поддерживаемой App Store версии;
- cold/warm launch, session persistence, keyboard, swipe-back, safe area;
- Photos limited access, камера, upload, deep/recovery link;
- `npm run store:check:ios` перед production build.

### Если EAS Submit завис

FACT (2026-09-02): четыре отправки EAS Submit простояли `IN_QUEUE` больше трёх
часов при статусе Expo «Operational». Обход — официальный build-uploads API
App Store Connect (API 4.1), целиком с VDS:

1. скачать IPA сборки из EAS (`eas build:view <id> --json` → `artifacts.buildUrl`);
2. `npm run release:asc:upload -- <путь к .ipa>` — версия и номер сборки берутся
   из `app.json`, ключ API — из `/root/.config/xtrud/asc.json` вне репозитория;
3. дождаться `COMPLETE`, затем `processingState: VALID` в App Store Connect;
4. отменить зависшие отправки: `eas submit:cancel <id>`, иначе они позже зальют
   устаревшие сборки.

Transporter и altool не вариант: они требуют macOS, а Mac владельца не трогаем.

### Android

> ⏸ Заморожено с 2026-08-30 — см. раздел 8. Проверки ниже не выполняются и не
> блокируют iOS-срез до снятия заморозки.

- финальный manifest не содержит необоснованный `RECORD_AUDIO`;
- edge-to-edge, system Back, keyboard/IME и photo picker;
- cold/warm launch, Keystore/session и `content://` uploads;
- preview APK на реальном устройстве до заявления Android-ready;
- `npm run store:check:android` перед production build.

Отсутствие EAS build или реального устройства — `UNKNOWN`, а не PASS.

## 5. Backend transition

Пока отдельного Beget нет, `eas.json` и `release/production.json` остаются на
Supabase Cloud. Когда backend пройдёт production overlay, два clean restore,
S3, negative-auth, PITR и monitoring gates:

1. выпустить transition iOS build против стабильного `api.xtrud.pro`;
2. проверить TestFlight и обратную совместимость старого binary;
3. провести final DB + Storage delta и закрыть Cloud writes;
4. переключить backend без двух одновременно writable production систем;
5. наблюдать iOS, затем запустить Android internal beta на том же API contract.

До первой записи в новом backend допустим DNS rollback. После первой записи
слепой DNS rollback запрещён: нужен roll-forward или проверенный обратный delta.
Опубликованный mobile binary не откатывается; используется feature-off,
maintenance или новый build.

## 6. UNKNOWN, которые нельзя угадывать

- фактическая Android device matrix;
- текущий размер аудитории и минимальная доля adoption transition build;
- launch load, SLO, supply threshold и численные бизнес-метрики;
- конкретные категории с обязательной лицензией/верификацией;
- provider push/SMS/email и его российская доступность;
- фактический Beget endpoint/region/resources до создания и read-only preflight.

Каждый UNKNOWN получает отдельную проверку. Он не останавливает безопасную
локальную разработку, но блокирует зависимый release или внешний cutover.

## 7. История решения

- **2026-08-25** — владелец закрепил приложение как главный продукт и разрешил
  выбрать порядок платформ. Совет продукта, разработки и дизайна единогласно
  выбрал iOS-first release с общей архитектурой и ранним Android preview.

## 8. Заморозка Android

> DECISION владельца, 2026-08-30. Отменяет требование Android preview/device
> smoke из разделов выше до снятия заморозки.

Продукт доводится до конца на iOS. Android не собирается, не проверяется и не
выпускается, пока iOS не завершён.

### Что это значит на практике

- Android build, device QA и store submission не выполняются;
- вертикальный срез не блокируется отсутствием Android-проверки;
- в отчётах Android — не `UNKNOWN`, требующий проверки, а осознанно
  замороженная платформа.

### Что намеренно НЕ удалено

Из `package.json` убраны только два скрипта: `android` и `store:check:android`.
Конфигурация сохранена:

| Что | Почему сохранено |
|---|---|
| блок `android` в `app.json` | `check-mobile-config.mjs` требует `android.package` и `blockedPermissions` с `RECORD_AUDIO`; `check-version-consistency.mjs` требует положительный `android.versionCode` |
| профили `android` в `eas.json` | `check-mobile-config.mjs` требует `buildType: app-bundle` в production |
| `stores.android` в `release/production.json` | ledger опубликованных номеров; разрыв связи build number ↔ Git SHA запрещён `docs/AGENT_WORKFLOW.md` §4 |
| иконки `assets/images/android-*` | 98 KB, привязаны к `app.json` |

Удаление этого потребовало бы переписать три release-гейта и два тестовых
файла ради ~30 строк конфигурации — больше правок, чем экономии, и риск в
release-контракте накануне iOS-релиза. Заморозка даёт тот же результат
бесплатно.

### Снятие заморозки

Отдельной задачей: вернуть два npm-скрипта, выполнить preview build, пройти
device QA на реальном устройстве, и только затем планировать store submission.
Нативный каталог `android/` в репозитории отсутствует и генерируется
`expo prebuild`.

## Сборка на GitHub Actions (с 2026-09-06)

> DECISION владельца: у EAS кончился бесплатный лимит облачных сборок iOS;
> собираем на macOS-раннере GitHub.

- Сценарий: `.github/workflows/ios.yml` («iOS → TestFlight», запуск кнопкой
  Run workflow; поля — «Что нового» и ID группы TestFlight).
- Раннер `macos-26` (Xcode 26 — нужен SDK iOS 26 для Liquid Glass). Сборка —
  `eas build --platform ios --profile production-local --local`: тот же движок,
  что в облаке EAS, но на нашем раннере; лимит EAS не расходуется (локальные
  сборки в EAS всегда бесплатны).
- Профиль `production-local` в `eas.json` — это `production` +
  `credentialsSource: "local"`: подпись берётся из `credentials.json`, который
  сценарий собирает из секретов репозитория на время сборки и стирает после.
- Загрузка в App Store Connect — `scripts/release/asc-upload-build.mjs`,
  публикация в TestFlight — `scripts/release/asc-publish-testflight.mjs`
  (ждёт обработку, пишет «Что нового», отправляет на проверку, добавляет в
  группу). Оба читают ключ из файла `XTRUD_ASC_CONFIG`.
- Секреты репозитория: `IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`,
  `IOS_PROFILE_BASE64`, `ASC_KEY_P8_BASE64`, `ASC_KEY_ID`, `ASC_ISSUER_ID`,
  `ASC_APP_ID`, `EXPO_TOKEN`. Сертификат и профиль выгружены из EAS
  (`eas credentials → Download credentials from EAS`), p12 перепакован под
  собственный пароль; оригиналы лежат на VDS в `/root/.config/xtrud/ios-signing/`
  (0600) и в Git не попадают (`.gitignore`: credentials.json, credentials/).
- Стоимость (FACT, docs.github.com): приватный репозиторий на плане Free —
  2 000 минут/мес, macOS считается ×10 → ~200 «маковских» минут, сверх —
  $0,062/мин. Публичный репозиторий — стандартные раннеры бесплатны.
- FACT 2026-09-06: первый успешный прогон — сборка 29 (1.0.3), ~20 минут. Важно:
  p12 для секрета должен быть в legacy-формате (3DES/SHA1, `openssl pkcs12
  -export -legacy`) — с шифрованием по умолчанию OpenSSL 3 `security import`
  на macOS молча не импортирует ключ, и EAS падает на «hasn't been imported».
- Что расходуется: **минуты сборки**, не хранение. Одна сборка ≈ 20 минут
  macOS = ≈ 200 «минут» лимита (×10). Артефакты (IPA) хранятся 7 дней и на
  лимит не влияют. Кэш CocoaPods/eas-cli в сценарии сокращает время сборки.
- FACT 2026-09-06: репозиторий `killianche/xtrud` публичный (переключил
  владелец; у токена агента нет права Administration). На публичном
  репозитории стандартные macOS-раннеры бесплатны без лимита — сборки iOS
  ничего не стоят. Перед этим история Git проверена на секреты: настоящих
  значений нет, только имена переменных и тестовые заглушки.
- Перед запуском сценария на VDS обязателен зелёный `npm run release:check`
  и поднятый `buildNumber` в `app.json` (гейт версий выполняется и на раннере).

## Push-уведомления: подготовка (2026-09-08)

Сделано без участия владельца, через App Store Connect API:

- Идентификатору `com.xtrud.app` включена возможность `PUSH_NOTIFICATIONS`
  (`POST /v1/bundleIdCapabilities`). Проверка:
  `GET /v1/bundleIds?filter[identifier]=com.xtrud.app&include=bundleIdCapabilities`.
- Изменение возможности инвалидирует все профили подписи, поэтому создан
  новый: `xtrud AppStore push 2026-09-08` (`POST /v1/profiles`,
  `IOS_APP_STORE`, сертификат `IOS_DISTRIBUTION`). Внутри профиля
  `aps-environment = production` — проверено `strings`.
- Профиль лежит на VDS `/root/.config/xtrud/ios-signing/profile.mobileprovision`
  (0600) и загружен в секрет репозитория `IOS_PROFILE_BASE64`. Следующая
  сборка подписывается им автоматически.

Осталось от владельца: ключ APNs (`.p8`), его Key ID и Team ID. Создание —
developer.apple.com → Certificates, Identifiers & Profiles → Keys → «+» →
имя, галочка «Apple Push Notifications service (APNs)» → Continue →
Register → Download (файл скачивается один раз).

После ключа в работе остаётся: вернуть `expo-notifications` в приложение
(сейчас пакет удалён, хук `use-register-push-token.ts` — заглушка),
поднять модуль отправки в `server/` и перевести `notify_user` на него.

