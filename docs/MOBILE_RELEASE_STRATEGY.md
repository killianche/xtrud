# Mobile-first стратегия xtrud

## TL;DR

**Имя для запроса:** «сначала iOS», «когда Android», «mobile-first».

xtrud — мобильное приложение с общей Expo-кодовой базой. Разработка и первый
production-релиз идут через iOS, потому что iOS уже опубликован и имеет рабочий
release ledger. Android не форкается и не откладывается до конца: shared
vertical slice обязан пройти Android preview/device smoke до заморозки iOS
release candidate. Android production выпускается отдельной волной после
стабилизации iOS.

Web сохраняется только как supporting surface: legal/support/account deletion,
password recovery, AASA/universal links и лёгкие публичные маршруты. Он не
является главным продуктом и не диктует мобильную навигацию.

## 1. Проверенные факты

- Клиент построен на Expo SDK 54, React Native 0.81, Expo Router 6 и TypeScript;
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

## 2. Почему iOS-first, но не iOS-only

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

### Android

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
