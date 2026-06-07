# Как выложить Expo-приложение в App Store — полная инструкция для агента

> **Кому:** AI-агенту, который собрал **другое** приложение владельца (Коран с
> переводом на ингушский) и должен выложить его в App Store. Ты «знаешь только своё
> приложение» — этот документ объясняет ВСЁ остальное: какие есть доступы, как
> собрать и отправить приложение **полностью автоматически (без кодов 2FA)**, на
> какие грабли мы наступили на первом приложении (xtrud) и как их обойти, и как
> по шагам заполнить кабинет App Store Connect.
>
> Документ составлен по реальному опыту выкладки **xtrud** (Expo SDK 54 + EAS),
> доведённой до загрузки в App Store. Команды могли обновиться — сверяйся с
> `eas --help` и docs.expo.dev, если что-то не сходится.

---

## 0. Суть за 30 секунд

Приложение на **Expo (React Native)**. iOS собирается **в облаке EAS** (Mac/Xcode
для сборки НЕ нужны), потом загружается в **App Store Connect**. Весь процесс —
автоматический по **App Store Connect API-ключу** (`.p8`), без ручного ввода кода
2FA. Поток (один раз на приложение):

1. Настроить `app.json` (имя, bundle id, иконка, версия, только iPhone).
2. Создать запись приложения в App Store Connect → получить числовой `ascAppId`.
3. Настроить `eas.json` (профили + переменные окружения + submit с ключом).
4. `eas login` → `eas init --force` (привязать к Expo-аккаунту).
5. Собрать: первый раз — через `expect` (создать сертификат), дальше `--non-interactive`.
6. Отправить: `eas submit --latest`.
7. В App Store Connect заполнить витрину + анкеты → **Submit for Review**.

---

## 1. Что владелец передаёт тебе ОТДЕЛЬНО (секреты, НЕ в git)

Эти вещи нельзя коммитить и нельзя писать в публичные переменные. Владелец даёт их
тебе в рабочей сессии:

1. **App Store Connect API-ключ** — файл `AuthKey_XXXXXXXXXX.p8`. ⚠️ Главный секрет.
   Тот же ключ, что использовался для xtrud, **подходит и для Корана** (один ключ на
   всю команду Apple). Положи его **вне репозитория**: `~/.expo-asc-keys/` + `chmod 600`.
2. **Пароль от Expo-аккаунта** (или Expo access token) — для `eas login`.
3. **Секреты бэкенда Корана**, если он есть (свой Supabase / API-ключи). Если Коран
   — оффлайн-контент без сервера, бэкенд-секреты не нужны.

Если владелец прислал `.p8` внутри папки проекта — **сразу перенеси его наружу** и
добавь в `.gitignore` (см. §4), чтобы случайно не закоммитить.

---

## 2. Общие идентификаторы (НЕ секреты — можно использовать как есть)

Это не пароли, без `.p8` они бесполезны, поэтому привожу для удобства:

| Что | Значение |
|---|---|
| **Apple Team ID** | `ZNK264PD9Y` |
| **Apple ID (логин в App Store Connect)** | `blakeisrael509495@aol.com` (пароль/2FA — у владельца) |
| **ASC API Key ID** | `MFXS9GDD4X` (если владелец даёт новый ключ — будет свой) |
| **ASC API Issuer ID** | `6fc51340-af9d-4698-99ff-0c2b56adab1d` |
| **Expo-аккаунт** | `pmrhhm` (почта `pmrhhm@gmail.com`) |

Одна Apple-membership (Team `ZNK264PD9Y`) = можно выкладывать сколько угодно
приложений, нужен только **новый bundle id** на каждое.

---

## 3. Что у Корана СВОЁ (не переиспользовать от xtrud)

- **bundle identifier** — уникальный, напр. `com.<имя>.quran` (у xtrud `com.xtrud.app`).
- **slug / name** в `app.json`; Expo-проект создаётся заново через `eas init`.
- **Запись приложения** в App Store Connect (своя, с новым bundle id) → свой `ascAppId`.
- **Бэкенд** — если есть, ОТДЕЛЬНЫЙ Supabase/сервер со своими ключами. Если Коран
  оффлайн — бэкенда нет.
- **Иконка 1024×1024, скриншоты, описание, ключевые слова** — свои.

---

## 4. Подготовка проекта

### 4.1 `app.json`
```jsonc
{
  "expo": {
    "name": "Коран",                       // как на устройстве
    "slug": "quran-ingush",                // латиницей, без пробелов
    "owner": "pmrhhm",                      // Expo-аккаунт владельца
    "version": "1.0.0",
    "ios": {
      "supportsTablet": false,              // ВАЖНО: только iPhone (см. грабли §6.5)
      "bundleIdentifier": "com.xxx.quran",  // УНИКАЛЬНЫЙ
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
        // + описания доступов (NS...UsageDescription), если используешь камеру/гео/фото
      }
    },
    "icon": "./assets/icon.png"             // 1024×1024, БЕЗ прозрачности (см. §6.6)
    // extra.eas.projectId допишет `eas init`
  }
}
```

### 4.2 `.gitignore` (защита ключа)
Добавь, чтобы `.p8` никогда не попал в git:
```
*.p8
AuthKey_*.p8
.env
.env.local
```

### 4.3 `.npmrc` (иначе облачная сборка падает на установке зависимостей)
Создай файл `.npmrc` в корне проекта:
```
legacy-peer-deps=true
```

### 4.4 `eas.json`
```jsonc
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "local" },
  "build": {
    "base": {
      "node": "20.18.0",
      "env": {
        // ⚠️ Облако НЕ видит .env.local! Все EXPO_PUBLIC_* переменные — СЮДА.
        // Публичные ключи (Supabase anon/publishable) класть можно. Секретные — НЕЛЬЗЯ.
        "SENTRY_DISABLE_AUTO_UPLOAD": "true"  // если используешь @sentry/react-native (см. §6.4)
      }
    },
    "production": {
      "extends": "base",
      "autoIncrement": true,                 // авто-увеличение build number
      "ios": { "resourceClass": "m-medium" }
      // НЕ добавляй "channel" без установленного expo-updates
    }
  },
  "submit": {
    "production": {
      "ios": {
        // Ключ для НЕинтерактивной отправки. ascApiKeyPath — ПУТЬ к .p8 (не сам ключ).
        "ascApiKeyPath": "/Users/<USER>/.expo-asc-keys/AuthKey_XXXXXXXXXX.p8",
        "ascApiKeyId": "MFXS9GDD4X",
        "ascApiKeyIssuerId": "6fc51340-af9d-4698-99ff-0c2b56adab1d",
        "appleTeamId": "ZNK264PD9Y",
        "ascAppId": "<числовой ID приложения из App Store Connect>"
        // НЕ указывай appleId — он включает интерактивный вход с 2FA
      }
    }
  }
}
```

### 4.5 Создать запись приложения в App Store Connect
- appstoreconnect.apple.com → **My Apps** → «+» → **New App**.
- Platform iOS, Name, Primary language (Русский), Bundle ID (тот же, что в app.json),
  SKU (любой уникальный) → Create.
- Открой **App Information** → запомни числовой **Apple ID приложения** (`ascAppId`) →
  впиши его в `eas.json` (submit).

### 4.6 Привязать проект к Expo
```bash
cd <папка проекта>
npx eas login            # почта pmrhhm + пароль владельца
npx eas init --force     # создаст @pmrhhm/<slug>, впишет projectId в app.json
```

---

## 5. Автоматическая сборка по ключу (без 2FA) — главное

Положи ключ вне репозитория и задай переменные:
```bash
mkdir -p ~/.expo-asc-keys
mv AuthKey_XXXXXXXXXX.p8 ~/.expo-asc-keys/ && chmod 600 ~/.expo-asc-keys/AuthKey_XXXXXXXXXX.p8

export EXPO_ASC_API_KEY_PATH="$HOME/.expo-asc-keys/AuthKey_XXXXXXXXXX.p8"
export EXPO_ASC_KEY_ID="MFXS9GDD4X"
export EXPO_ASC_ISSUER_ID="6fc51340-af9d-4698-99ff-0c2b56adab1d"
export EXPO_APPLE_TEAM_ID="ZNK264PD9Y"
export EXPO_APPLE_TEAM_TYPE="INDIVIDUAL"
```

### 5.1 ⚠️ ПЕРВАЯ сборка — через `expect` (создать сертификат)
`eas build --non-interactive` **отказывается** создавать distribution-сертификат в
первый раз («Run this command again in interactive mode»). Обходим псевдо-интерактивом
через `expect` (он есть в macOS). Создай `/tmp/eas_build.exp`:
```tcl
#!/usr/bin/expect -f
log_user 1
set timeout 600
spawn npx eas build --platform ios --profile production --no-wait
expect {
  -re {\(Y/n\)} { send -- "y\r"; exp_continue }
  -re {\(y/N\)} { send -- "y\r"; exp_continue }
  -re {Generate a new[^\r\n]*\?} { send -- "y\r"; exp_continue }
  -re {Reuse[^\r\n]*\?} { send -- "y\r"; exp_continue }
  eof
}
```
Запусти (переменные из 5 должны быть экспортированы): `expect /tmp/eas_build.exp`.

⚠️ **Важно:** когда дойдёт до «Set up Push Notifications for your project?» —
это ведёт к APNs-ключу, который требует входа по паролю Apple (ключом нельзя).
Либо push тебе не нужен (Коран — оффлайн), тогда expo-notifications вообще не ставь
(см. §6.3). Если `expect` случайно ответил «y» и попал в запрос Apple ID/пароля —
прерви (Ctrl+C), сертификат к этому моменту уже создан.

### 5.2 Дальше — обычная неинтерактивная сборка
После того как сертификат+профиль созданы один раз:
```bash
npx eas build --platform ios --profile production --non-interactive --no-wait
```
`--no-wait` ставит сборку в очередь и сразу возвращает ссылку
`https://expo.dev/accounts/pmrhhm/projects/<slug>/builds/<id>`. Сборка идёт в
облаке ~15–25 мин. Следить за статусом:
```bash
npx eas build:view <build-id> --json   # поле "status": IN_QUEUE / IN_PROGRESS / FINISHED / ERRORED
```

---

## 6. Грабли сборки (мы на каждой споткнулись — НЕ повторяй)

### 6.1 `npm ci` в облаке падает на установке зависимостей
- **Конфликт peer-deps** → `.npmrc` с `legacy-peer-deps=true` (см. §4.3).
- **Рассинхрон package.json ↔ package-lock.json** → ошибка «Missing X from lock file».
  Чинится локально: `npm install` → закоммить обновлённый `package-lock.json`.

### 6.2 Версии пакетов
Перед сборкой прогони `npx expo-doctor` — ловит несовместимые версии заранее.

### 6.3 Push-уведомления ломают сборку без APNs-ключа
Если в проекте есть **`expo-notifications`**, он автоматически добавляет iOS-разрешение
`aps-environment`, а provisioning profile его не содержит (push требует **APNs-ключ
Apple**, недоступный через API-ключ). Симптом: сборка падает «Provisioning profile …
doesn't include the aps-environment entitlement».
- **Коран скорее всего push не нужен** → просто **не ставь** `expo-notifications`.
- Если он уже стоит, но push не нужен в первой версии → удали пакет
  (`npm uninstall expo-notifications`) и сделай хук-обёртку no-op.
- Если push реально нужен → владелец создаёт APNs-ключ на developer.apple.com → Keys
  (галка «Apple Push Notifications service») и добавляет в EAS (`eas credentials`).

### 6.4 Sentry ломает сборку на выгрузке символов
Если есть `@sentry/react-native` без настроенных `SENTRY_ORG/PROJECT/AUTH_TOKEN` —
приложение компилируется, но падает на шаге выгрузки source maps. Фикс: в `eas.json`
env поставь `SENTRY_DISABLE_AUTO_UPLOAD=true` (см. §4.4). Если Sentry не используешь —
ничего не нужно.

### 6.5 iPad → требование iPad-скриншотов
Если в `app.json` `ios.supportsTablet: true`, Apple требует загрузить отдельные
скриншоты для iPad Pro 13". Чтобы приложение было **только для iPhone** (и iPad-скрины
не требовались) — поставь `ios.supportsTablet: false` и пересобери. После — в кабинете
ОБЯЗАТЕЛЬНО выбери именно эту (iPhone-only) сборку, иначе старая всё ещё «тянет» iPad.

### 6.6 Значок приложения не должен иметь альфа-канал (прозрачность)
Иначе Apple отклоняет («App icon can't contain alpha channel»). Сделать чистый
1024×1024 без прозрачности (Python+Pillow):
```python
from PIL import Image
img = Image.open('source_logo.png').convert('RGB')      # convert('RGB') убирает альфу
img.resize((1024,1024), Image.LANCZOS).save('assets/icon.png', 'PNG')
```
Иконка должна быть **квадратной, без скруглений** — Apple скруглит сама.

### 6.7 Как прочитать лог упавшей сборки (вместо «UNKNOWN_ERROR»)
```bash
URL=$(npx eas build:view <id> --json | python3 -c "import sys,json;print(json.load(sys.stdin)['logFiles'][0])")
curl -s "$URL" | brotli -dc | python3 -c "import sys,json;[print(json.loads(l).get('phase',''),json.loads(l).get('msg','')) for l in sys.stdin if l.strip()]"
```
Лог сжат **brotli**, внутри JSON-строки с `phase`/`msg`. Подписанная ссылка живёт
~15 мин (если протухла — запроси `build:view` заново).

---

## 7. Отправка в App Store Connect (submit)

С ключом в submit-профиле (см. §4.4) — одной командой, без 2FA:
```bash
npx eas submit --platform ios --profile production --latest --non-interactive
```
(`--latest` берёт последнюю успешную сборку). Через ~5–10 мин Apple её обработает —
сборка появится в кабинете и станет выбираемой в разделе «Сборка/Build».

Проверить состояние сборок через ASC API (если надо точно): сборка в состоянии
`VALID` = обработана и готова к выбору.

---

## 8. App Store Connect — заполнение кабинета (по шагам)

Когда жмёшь «Добавить для проверки», Apple показывает список красных ошибок — каждую
закрываешь так:

### 8.1 «Информация о приложении» (общее для всех версий)
- **Название**, **Подзаголовок** (до 30 симв.).
- **Категория**: Основная (для Корана подойдёт «Образование» или «Образ жизни»),
  Дополнительная — по желанию. *(Ошибка «указать основную категорию».)*
- **Права на контент** (Content Rights): если в приложении нет лицензионного стороннего
  контента — выбери «**не содержит сторонний контент**». *(Ошибка «сведения о правах
  на публикуемые материалы».)*
- **Возрастной рейтинг** → «Изменить» → на все вопросы «Нет» → выйдет 4+
  (для Корана можно уточнить «Религиозные/культурные темы», если спросят, но обычно 4+).
- **URL политики конфиденциальности** — ОБЯЗАТЕЛЬНО, и ссылка должна открываться БЕЗ
  логина. Если у Корана нет своего сайта — сделать простую HTML-страницу политики и
  выложить (можно на том же сервере, что xtrud, отдельным путём).

### 8.2 Страница версии 1.0.0
- **Описание**, **Ключевые слова** (до 100 символов, через запятую без пробелов),
  **Support URL**, **Copyright** (`2026 <название>`).
- **Скриншоты** — минимум под один размер iPhone (6.9" или 6.7"), 3–10 шт. С iOS 17+
  достаточно одного набора 6.9" (1320×2868) — Apple растянет на меньшие модели.
- **Сборка/Build** — выбери нужную (iPhone-only!) сборку `1.0.0 (N)`.

### 8.3 «Конфиденциальность приложения» (анкета о данных)
- Вверху впиши **URL политики**.
- В «Сбор данных» отметь **только то, что реально собираешь**. Для оффлайн-Корана,
  возможно, **ничего** (тогда выбери «Данные не собираются»). Если есть закладки/
  настройки локально на устройстве и они не уходят на сервер — это НЕ сбор данных.
- Для каждого собираемого типа: цель → «Функциональные возможности приложения»;
  «Связано с личностью?» → обычно Да; «Используется для отслеживания?» → **Нет**
  (рекламы/трекинга нет).
- Не отмечай типы, которые не собираешь (физический адрес, поддержку и т.п.) — иначе
  карточка приложения покажет ложь.

### 8.4 «Цены и доступность» (Pricing)
- Поставь цену **0,00 / Бесплатно**. ⚠️ Без выбранной цены отправить НЕЛЬЗЯ (частая
  забытая ошибка). Базовую страну менять не нужно — бесплатное приложение бесплатно везде.

### 8.5 Аккаунт для проверки (если в приложении ЕСТЬ вход)
Если у Корана нет логина (оффлайн) — этот раздел не нужен, галку «Sign-in required»
не ставь. Если вход есть — Apple ОБЯЗАТЕЛЬНО его тестирует:
- Включи «Sign-In Required», дай **рабочий** тест-логин+пароль и короткую заметку, как войти.
- ⚠️ Тест-аккаунт должен реально работать в **production-сборке** (не demo-режим). Если
  пароль не уверен — задай его заново через бэкенд напрямую, чтобы 100% работал.
  (Неработающий тест-вход — причина №1 отказа на первом релизе.)

### 8.6 Отправка
«Добавить для проверки» → если красных ошибок не осталось → **«Отправить на проверку»
(Submit for Review)**. При отправке Apple спросит про:
- **Шифрование (Export Compliance)** → «не используем нестандартное шифрование»
  (мы заранее ставим `ITSAppUsesNonExemptEncryption: false` в app.json → вопроса может
  не быть).
- **Рекламный идентификатор (IDFA)** → «Нет».

Статус станет **Waiting for Review** → обычно проверка 1–3 дня, придёт письмо.

---

## 9. Чек-лист перед «Submit for Review»
- [ ] `app.json`: name, slug, owner=pmrhhm, version 1.0.0, новый bundleId, supportsTablet=false, icon 1024 без альфы
- [ ] App record создан → `ascAppId` вписан в `eas.json`
- [ ] `.npmrc` (legacy-peer-deps), `.gitignore` (*.p8), env в `eas.json`
- [ ] Сборка собрана и в состоянии VALID, отправлена через `eas submit`
- [ ] В кабинете выбрана iPhone-only сборка
- [ ] Описание, ключевые слова, скриншоты, категория, возраст (4+), copyright
- [ ] Privacy Policy URL открывается без логина
- [ ] Анкета «Конфиденциальность» заполнена/опубликована
- [ ] Цена = Бесплатно
- [ ] Тест-аккаунт ревьюеру (если есть вход) — проверен, что работает
- [ ] Никаких заглушек/lorem ipsum/англ. placeholder — Apple за это отклоняет

---

## 10. Полезные ссылки
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Submit: https://docs.expo.dev/submit/ios/
- Сборка в CI / ASC API-ключ: https://docs.expo.dev/build/building-on-ci/
- App Store review guidelines: https://developer.apple.com/app-store/review/guidelines/

---

*Составлено по реальному опыту выкладки **xtrud** (Expo SDK 54 + EAS, доведено до
загрузки в App Store, 2026-06-07). Team ID `ZNK264PD9Y`, Expo `pmrhhm`. Главный
секрет — файл `.p8` (ASC API-ключ), его владелец передаёт отдельно и в git он не
коммитится.*
