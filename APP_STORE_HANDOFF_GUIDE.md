# Инструкция по выкладке Expo-приложения в App Store (передача другому агенту)

> **Кому:** AI-агенту, который будет выкладывать в App Store другое приложение
> владельца (Коран с переводом на ингушский). Этот документ — выжимка опыта,
> полученного при выкладке приложения **xtrud**. Здесь: какие аккаунты есть, как
> устроен процесс, и на какие грабли НЕ наступать.
>
> **Кому НЕ показывать секреты:** в этом файле НЕТ паролей и секретных ключей —
> только что нужно и где взять. Сами пароли/ключи владелец передаёт агенту
> отдельно (в рабочей сессии), и они НИКОГДА не коммитятся в git.

---

## 0. Краткая суть

Приложение на **Expo (React Native)**. Выкладка через **EAS Build + EAS Submit**
(облачная сборка Expo) → в **App Store Connect**. Локально Mac не собирает iOS —
всё собирается в облаке EAS, поэтому Xcode и даже Mac для сборки не обязательны
(нужен только для запуска команд).

Поток (один раз на приложение):
1. Настроить `app.json` (имя, bundle id, иконка, версия).
2. Создать запись приложения в App Store Connect (или это делает владелец).
3. Настроить `eas.json` (профили сборки + env + submit).
4. `eas login` → `eas init` (привязать проект к Expo-аккаунту).
5. `eas build --platform ios --profile production` (собрать в облаке).
6. `eas submit --platform ios --profile production` (отправить сборку в App Store Connect).
7. В App Store Connect заполнить метаданные (описание, скриншоты, приватность,
   тест-аккаунт ревьюеру) → Submit for Review.

---

## 1. Общие аккаунты владельца (переиспользуются между приложениями)

> Имена/ID ниже не секретны. Пароли/ключи — у владельца, он даст отдельно.

### Apple
- **Apple Developer Program** — активен. **Team ID: `ZNK264PD9Y`**.
- **Apple ID разработчика (логин в App Store Connect):** `blakeisrael509495@aol.com`
  (пароль и 2FA — у владельца). Через него создаются приложения и сертификаты.
- Одна membership = можно выкладывать НЕСКОЛЬКО приложений (нужен только новый
  bundle identifier на каждое).

### Expo (EAS)
- **Expo-аккаунт: `pmrhhm`** (почта `pmrhhm@gmail.com`; пароль у владельца).
  Тот же аккаунт в приложении Expo Go на телефоне.
- В аккаунте есть личный профиль `pmrhhm` и команда `pmrhhms-team`. Для проекта
  использовать личный (`owner: "pmrhhm"` в app.json), если не нужна команда.
- Вход: `npx eas login` (интерактивно вводится почта+пароль) ИЛИ через токен
  (`EXPO_TOKEN`, создаётся на expo.dev → Settings → Access tokens).

### GitHub
- Аккаунт **`killianche`**. Под новое приложение — отдельный репозиторий.

### App Store Connect API key (КЛЮЧ для автоматической выкладки) — РЕКОМЕНДУЕТСЯ
- Чтобы агент мог собрать и отправить приложение **сам, без интерактивного ввода
  кода 2FA**, нужен **App Store Connect API Key** (файл `.p8` + Key ID + Issuer ID).
- Создаётся один раз на сайте: appstoreconnect.apple.com → **Users and Access** →
  вкладка **Integrations** → **App Store Connect API** → «+» → имя, доступ **Admin**
  → Generate → **скачать `.p8` (только один раз!)** + скопировать **Key ID** и
  **Issuer ID** (Issuer ID — общий вверху страницы).
- Один такой ключ под Team `ZNK264PD9Y` **работает для всех приложений** этой
  команды (и для xtrud, и для Корана). Если владелец уже сделал ключ для xtrud —
  он же подойдёт.
- ⚠️ `.p8` — секрет. Хранить вне git. Агенту передавать как файл + 2 ID отдельно.

---

## 2. Что у каждого приложения СВОЁ (НЕ переиспручать от xtrud)

- **bundle identifier** — уникальный, напр. `com.xtrud.app` у xtrud; у Корана будет
  свой, напр. `com.<имя>.quran`. Менять в `app.json` → `ios.bundleIdentifier`.
- **slug / name** в `app.json` и Expo-проект (`eas init` создаст новый).
- **Запись приложения** в App Store Connect (своя, с новым bundle id).
- **Бэкенд (Supabase)** — если у Корана свой бэкенд, это ОТДЕЛЬНЫЙ Supabase-проект
  со своими ключами. НЕ использовать ключи xtrud. Если бэкенд не нужен (Коран —
  оффлайн-контент) — Supabase вообще не нужен.
- **Иконка, скриншоты, описание, ключевые слова** — свои.

---

## 3. Пошаговый процесс (проверено на xtrud)

### Шаг 1. `app.json` — основное
```jsonc
{
  "expo": {
    "name": "Название приложения",      // как на устройстве
    "slug": "quran-ingush",             // латиницей, без пробелов
    "owner": "pmrhhm",                  // Expo-аккаунт-владелец
    "version": "1.0.0",                 // версия для пользователей
    "ios": {
      "bundleIdentifier": "com.xxx.quran",  // УНИКАЛЬНЫЙ
      "supportsTablet": true
    },
    "icon": "./assets/icon.png"         // 1024×1024, без прозрачности
    // extra.eas.projectId допишет `eas init`
  }
}
```

### Шаг 2. Создать приложение в App Store Connect
- appstoreconnect.apple.com → **My Apps** → «+» → **New App**.
- Platform: iOS. Name. Primary language. Bundle ID (тот же, что в app.json).
  SKU (любой уникальный). → Create.
- Запомнить **Apple ID приложения** (числовой `ascAppId`, виден в App Information)
  — он нужен для `eas submit`.

### Шаг 3. `eas.json`
Ключевые моменты (на них мы спотыкались — см. §4):
```jsonc
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "local" },
  "build": {
    "base": {
      "node": "20.18.0",
      "env": {
        // ⚠️ ВСЕ EXPO_PUBLIC_* переменные сюда! Облако НЕ видит .env.local.
        // Публичные ключи (anon/publishable) класть можно. Секретные — НЕЛЬЗЯ.
      }
    },
    "production": {
      "extends": "base",
      "autoIncrement": true,            // авто-увеличение build number
      "ios": { "resourceClass": "m-medium" }
      // НЕ добавлять "channel", если не установлен expo-updates (см. §4)
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "blakeisrael509495@aol.com",
        "appleTeamId": "ZNK264PD9Y",
        "ascAppId": "<числовой ID приложения из App Store Connect>"
        // ИЛИ через ASC API key (ascApiKeyPath/ascApiKeyId/ascApiKeyIssuerId)
      }
    }
  }
}
```

### Шаг 4. Привязать проект к Expo
```bash
cd <папка проекта>
npx eas login            # почта pmrhhm + пароль (у владельца)
npx eas init --force     # создаст @pmrhhm/<slug>, впишет projectId в app.json
```

### Шаг 5. Собрать
**Вариант с ASC API key (агент делает сам, без 2FA) — рекомендуется:**
- Положить `.p8`, экспортировать переменные (имена сверить с актуальной докой EAS,
  см. `eas build --help` / docs.expo.dev — на момент xtrud это связка
  appleId/teamId + ASC API key через `eas credentials` или env). Затем:
```bash
npx eas build --platform ios --profile production --non-interactive
```
**Вариант интерактивный (владелец вводит 2FA один раз):**
```bash
npx eas build --platform ios --profile production
# на вопрос Apple login → y → Apple ID → пароль → код 2FA
# на вопросы про сертификат/provisioning profile → y (EAS сделает сам)
```
Сборка идёт в облаке ~20–40 мин, даёт ссылку вида
`https://expo.dev/accounts/pmrhhm/projects/<slug>/builds/...`.

### Шаг 6. Отправить в App Store Connect
```bash
npx eas submit --platform ios --profile production --latest
```
(берёт последнюю сборку и заливает в App Store Connect; нужен ASC API key или
Apple-логин).

### Шаг 7. Метаданные и Submit for Review (в App Store Connect)
- Описание, подзаголовок, ключевые слова, категория, возрастной рейтинг.
- **Privacy Policy URL** — ОБЯЗАТЕЛЬНО, и должен открываться БЕЗ логина.
- **App Privacy** — анкета (какие данные собираете).
- **Скриншоты** — минимум под 6.9" или 6.7" iPhone (3–10 шт).
- **App Review Information → Sign-In Required** — если в приложении есть вход, дать
  ревьюеру РАБОЧИЙ тест-аккаунт (логин+пароль) + заметку, как войти.
- Иконка 1024×1024 (без прозрачности/скруглений).
- → **Add for Review / Submit for Review**.

---

## 4. ГРАБЛИ, на которые мы наступили (НЕ повторять)

1. **Облачная сборка не видит `.env.local`.** Если приложение читает
   `EXPO_PUBLIC_*` переменные (URL/ключи бэкенда) — их ОБЯЗАТЕЛЬНО продублировать
   в `eas.json` → `build.base.env`. Иначе собранное приложение не подключится к
   бэкенду. Публичные ключи (Supabase anon/publishable) класть туда безопасно.
2. **`channel` в production-профиле требует пакет `expo-updates`.** Если его нет —
   сборка падает на «expo-updates package is missing», а доустановка может упасть
   из-за конфликтов зависимостей. Решение для первого релиза: НЕ указывать
   `channel` (OTA-обновления добавить потом). Либо поставить `expo-updates` через
   `npx expo install expo-updates` (при конфликте — `npm install --legacy-peer-deps`).
3. **Demo/тестовые режимы выключать в проде.** Если есть флаг типа
   `EXPO_PUBLIC_ENABLE_DEMO` — в `eas.json` для production ставить `"false"`.
4. **Apple ОТКЛОНЯЕТ приложения с заглушками** (lorem ipsum, англ. placeholder,
   «тестовые» баннеры/данные). Перед сабмитом убрать весь placeholder-контент.
5. **2FA Apple нельзя автоматизировать.** Либо владелец вводит код один раз
   интерактивно, либо использовать ASC API key (см. §1). Других путей нет.
6. **`expo-doctor` перед сборкой.** `npx expo-doctor` — ловит несовместимые версии
   до того, как упадёт облачная сборка.
7. **Встроенная почта Supabase лимитирована** (если приложение шлёт письма) —
   для прода нужен внешний SMTP/ESP. (Актуально только если у Корана есть auth с
   письмами; для оффлайн-приложения — не нужно.)

---

## 5. Что передать агенту ОТДЕЛЬНО (секреты, не в этом файле)

Владелец передаёт агенту в рабочей сессии (не в git):
- Пароль от **Expo** (аккаунт `pmrhhm`) — для `eas login`. Или Expo access token.
- Доступ к **Apple ID** `blakeisrael509495@aol.com` (пароль + куда приходит 2FA),
  ЛИБО **App Store Connect API key** (`.p8` + Key ID + Issuer ID) — предпочтительно.
- Если у Корана есть бэкенд — ключи ЕГО Supabase (отдельный проект).

---

## 6. Полезные ссылки
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Submit: https://docs.expo.dev/submit/ios/
- App Store Connect API key: https://docs.expo.dev/app-signing/app-credentials/#app-store-connect-api-key
- App Store review guidelines: https://developer.apple.com/app-store/review/guidelines/

---

*Составлено по опыту выкладки xtrud (Expo SDK 54 + EAS). Team ID `ZNK264PD9Y`,
Expo `pmrhhm`. Версии команд могли обновиться — сверяться с `eas --help` и доками.*
