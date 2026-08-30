# Production Readiness audit — 2026-05-18

## TL;DR

xtrud — **НЕЛЬЗЯ запускать публично сегодня**. Реальный SMS-OTP **отсутствует** (любые 6 цифр проходят), любой клиент получает `signInAnonymously`, что превращает «регистрацию» в дверь в БД без верификации. Plaintext `notify_secret` в [`supabase/migrations/0018_push_triggers.sql:27`](../../supabase/migrations/0018_push_triggers.sql) — секрет в публичной истории git (репо private, но утечёт при первом open-source / leaked clone). Полностью отсутствуют монитринг (Sentry/PostHog), legal-страницы (Условия / Политика 152-ФЗ), удаление аккаунта (требование App Store с 2022), Apple/Google projectId в `app.json`, EAS submit-конфиг. Push-инфра написана, но edge function `notify/index.ts` отсутствует — пуш не дойдёт даже на native.

**Топ-3 блокера запуска:** (1) Mock OTP в [`src/features/auth/use-auth-mutations.ts:20`](../../src/features/auth/use-auth-mutations.ts) → реальный SMS-провайдер обязателен. (2) `notify_secret` plaintext в коммите 0018 + анонимный sign-in для всех новых пользователей. (3) Нет legal-страниц (Условия / Политика / 152-ФЗ согласие) — Apple/Google review не пропустит, в РФ — штраф РКН.

**Оценка готовности к публичному запуску:** ~**35–40%**. Core-UI и БД production-grade, но всё что вокруг (auth, monitoring, legal, store-builds, AI-фичи) — на нуле или mock.

---

## A. Сборка и deploy

### Что есть
- [`package.json`](../../package.json:6) — scripts: `start / android / ios / web / typecheck / lint / format / check / test / tokens / web:build / web:serve / web:dev`. Нет `deploy`, `build:android`, `build:ios`, `submit`.
- [`eas.json`](../../eas.json) — 4 профиля: `base / development / development-device / preview / production`. `appVersionSource: local`, `autoIncrement: true` (только iOS production). `submit.production: {}` — пустой, не настроен.
- [`deploy/web.sh`](../../deploy/web.sh) — bash-скрипт SSH-deploy на VPS `root@62.113.106.30` → `/var/www/xtrud` через scp+tar. Не идемпотентен (полностью чистит `${REMOTE_DIR}/*`). Не подходит для CI.
- [`deploy/Caddyfile.xtrud.example`](../../deploy/Caddyfile.xtrud.example) — Caddy конфиг с HSTS, X-Content-Type-Options, immutable-cache на ассеты, no-cache на index.html. **Конфиг живёт ТОЛЬКО на VPS**, изменения вручную через SSH.
- [`scripts/dev-web-local.mjs`](../../scripts/dev-web-local.mjs), [`scripts/build-web-local.mjs`](../../scripts/build-web-local.mjs) — workaround Expo SDK 54 web bug (patch `<script>` → `type="module"`).
- [`dist/`](../../dist/) — production build присутствует (`index.html`, `_expo/static/js/web/entry-8e9b0b9613ac7b6802f454259ae3c9a7.js`). Версия в bundle совпадает с current.

### CI/CD
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — только typecheck + biome + vitest. Нет: build, deploy, EAS build, release tags. Все деплои — руками через `bash deploy/web.sh`.

### Что плохо
- **Single SPOF**: web-deploy завязан на 1 VPS (`62.113.106.30`), 1 домен (`xtrud.alanbani.ru`). Падение VPS = downtime, без CDN / fallback.
- **Нет deploy-роли** в CI — пуш в `main` НЕ деплоит. Деплой только вручную с ноутбука.
- **`eas.json` env baked**: `EXPO_PUBLIC_SUPABASE_URL` хардкоден в [`eas.json:10`](../../eas.json). Когда появится `production-prod` Supabase отдельно от `production` Supabase — придётся править файл.
- Нет staging-окружения: ни staging-БД, ни staging-домена. Любая миграция — сразу в prod.

---

## B. Environment / secrets

### Env переменные (только public)
- [`.env.example`](../../.env.example) — содержит только 2 переменные: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Анон-ключ публичный по дизайну Supabase — OK.
- [`.env.local`](../../.env.local) — реальные значения проекта `wgeimsajvjkzrrnfrnkb`. **Не закоммичен** ([`.gitignore:38`](../../.gitignore)).

### Схема валидации
- [`src/lib/env.ts:12-17`](../../src/lib/env.ts) — Zod-валидация обеих переменных при загрузке bundle. Хорошо.

### 🔴 Утечки секретов (КРИТИЧНО)

1. **`notify_secret` в plaintext в миграции** — [`supabase/migrations/0018_push_triggers.sql:27`](../../supabase/migrations/0018_push_triggers.sql):
   ```sql
   PERFORM vault.create_secret(
     '8.6-xtrud-notify-MJ7kPq2RvN9wXcZbTfL5hYuD3sGaE6BoVISkUqAt',  -- ← СЕКРЕТ В КОММИТЕ
     'notify_secret', ...
   );
   ```
   Файл tracked в git, репо `killianche/xtrud` (private сейчас). При любом → open-source / leaked clone / fork → секрет уйдёт. Shared-secret даёт право слать пуш-уведомления любому пользователю. **Требует ротации** (`UPDATE vault.secrets ... ; UPDATE edge function env`) + переписать миграцию через `vault.create_secret(NULL, ...)` + `INSERT INTO vault.secrets` админом.

2. **Demo-пароль `xtrud` в исходниках** — [`src/lib/auth.ts:21`](../../src/lib/auth.ts) → `DEMO_PASSWORD = "xtrud"`. Запекается в web-bundle (видно в `dist/_expo/static/js/web/entry-*.js`). Любой человек, открывший devtools, может зайти под любым `+79000…` demo-аккаунтом → читать их заказы/чаты. Для prod нужно убрать demo-flow и отключить демо-аккаунты, либо назначить рандомные пароли и хранить только в seed-test.

3. **Hardcoded supabase URL в SQL миграциях** — `wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify` в [`0018`](../../supabase/migrations/0018_push_triggers.sql:51), [`0027`](../../supabase/migrations/0027_fix_notify_user_pgnet_api.sql:37), [`0028`](../../supabase/migrations/0028_notifications_table.sql:81). При миграции на другой Supabase project (staging, новый prod) — придётся переписывать миграции и аккуратно re-applying.

### EXPO_PUBLIC_* leakage check
Грепнул `src/`, `app/`: использования только в [`src/lib/env.ts`](../../src/lib/env.ts) и [`src/lib/supabase.ts`](../../src/lib/supabase.ts). **Нет** случайных `EXPO_PUBLIC_SERVICE_ROLE` / `EXPO_PUBLIC_API_KEY` / других чувствительных переменных. Хорошо.

---

## C. Auth / SMS

### 🔴 Mock OTP — главный блокер запуска

- [`src/features/auth/use-auth-mutations.ts:19-27`](../../src/features/auth/use-auth-mutations.ts):
  ```ts
  export function useSendOtp() {
    return useMutation({
      mutationFn: async (_input: SendOtpInput): Promise<{ ok: true }> => {
        await new Promise((resolve) => setTimeout(resolve, 800));  // ← 800ms задержка, ничего не шлёт
        return { ok: true };
      },
    });
  }
  ```
- [`src/features/auth/use-auth-mutations.ts:31`](../../src/features/auth/use-auth-mutations.ts): `code` параметр игнорируется. Любые 6 цифр проходят верификацию.
- [`src/lib/auth.ts:46-114`](../../src/lib/auth.ts): новый юзер получает `supabase.auth.signInAnonymously()` + UPDATE `users_private.phone`. Любой человек на сайте может ввести «+7 912 345-67-89» и зайти с этим номером как **никем не верифицированный** пользователь. Может создать заказ, отклик, чат, отзыв — всё под чужим номером.

**Что требуется:**
1. Выбрать SMS-провайдера (AUDIT_2026-05-16 → МТС Exolve / SMSC / SmsAero).
2. Включить Supabase Auth Phone provider, прописать креды провайдера.
3. Заменить `useSendOtp` на `supabase.auth.signInWithOtp({ phone })`.
4. Заменить `useVerifyOtp` на `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`.
5. Удалить `signInAnonymouslyWithPhone` или оставить только за `is_demo` фичей.
6. Включить captcha (hCaptcha / Cloudflare Turnstile) — Supabase поддерживает нативно — иначе любой ботом сольёт SMS-баланс.
7. Серверный rate-limit на OTP per phone / per IP (built-in Supabase + кастомный edge).

### Email
- `auth.users.email = <phone>@xtrud-demo.local` — синтетика для demo-аккаунтов (см. [`src/lib/auth.ts:30-37`](../../src/lib/auth.ts)). У реальных анонимных юзеров email будет `null`.
- В UI email спрятан (см. [`app/(tabs)/profile/settings.tsx:46`](../../app/(tabs)/profile/settings.tsx)). Согласуется с CLAUDE.md auth-политикой.

### Brute-force protection
- Нет captcha → бот может слать 1000 OTP/сек на одну ферму номеров и убить SMS-бюджет.
- Custom rate-limit на send_otp **не реализован**.

---

## D. Push notifications

### Что есть
- [`src/features/notifications/use-register-push-token.ts`](../../src/features/notifications/use-register-push-token.ts) — клиент: при первом логине получает Expo push-token, upsert в `notification_tokens`. На web — no-op. ОК.
- Миграция [`0017_notification_tokens.sql`](../../supabase/migrations/0017_notification_tokens.sql) — таблица `notification_tokens` с RLS.
- Миграции [`0018`](../../supabase/migrations/0018_push_triggers.sql), [`0027`](../../supabase/migrations/0027_fix_notify_user_pgnet_api.sql) — `notify_user` функция через pg_net → `https://<project>.supabase.co/functions/v1/notify` с x-notify-secret header.
- Server-side rate-limit в SQL: triggers `notify_new_message` / `notify_new_response` / `notify_order_accepted` ([`0018`](../../supabase/migrations/0018_push_triggers.sql)) НЕ имеют per-user rate-limit. Если бот шлёт 100 сообщений / сек — 100 пушей упадут на устройство.

### 🔴 Edge function `notify` ОТСУТСТВУЕТ
- [`supabase/functions/`](../../supabase/functions/) содержит только `.gitkeep`. Edge function `notify/index.ts` **не написана**.
- Это значит: `notify_user` шлёт POST в эндпоинт, которого нет. Push НЕ доходит даже на native.
- `MCP supabase__list_edge_functions` не вызывался (проект не в скоупе агенту), но в локальном репо функции нет — деплой через `supabase functions deploy notify` НЕ происходил из кодовой базы.

### EAS / Apple credentials
- [`app.json:60-64`](../../app.json) — `expo-notifications` plugin зарегистрирован, но **нет `extra.eas.projectId`** в app.json (грепнул — пусто). Без `projectId` `getExpoPushTokenAsync()` упадёт в продакшен сборке (development build ловит из cache, production — нет).
- iOS APN / Android FCM credentials в EAS — **не проверено** (нужен `eas credentials --platform ios`). Без них push не работает на iOS production.

### Push rate-limit
STATUS.md упоминает миграцию 0081 как «lifecycle RPC security definer» — это про разрешения, **НЕ про rate-limit пуша**. Server-side rate-limit per user **не реализован**. AUDIT_2026-05-16 в Phase 1 это не упоминает явно — нужно добавить.

---

## E. Monitoring / observability

### 🔴 Полное отсутствие
- В [`package.json`](../../package.json) грепнуто: **нет** Sentry, Bugsnag, Rollbar, LogRocket, Datadog. 
- В [`src/`](../../src/), [`app/`](../../app/) грепнуто: нет Posthog, Mixpanel, Amplitude, Segment. **0 событий не отслеживается.**
- Только 5 `console.warn` / `console.log` в коде ([`src/features/notifications/use-register-push-token.ts:75,80`](../../src/features/notifications/use-register-push-token.ts), [`src/lib/auth.ts:110`](../../src/lib/auth.ts)). В production-сборке логи теряются.
- **Error boundary** не найден — single React error в дереве → белый экран без recovery.
- Supabase Dashboard logs / alerts — не настроены (в коде нет конфигурации, нельзя проверить из репо).

### Что критично добавить до launch
1. **Sentry** (React Native SDK + Expo plugin) — для crash-tracking и performance.
2. **PostHog или Amplitude** — funnel первых сессий (sign-up → onboarding → first order → first chat). Без этого нельзя понять где дропаются юзеры.
3. **Supabase Logs** alerts (фильтр по `severity:error`) → Telegram-канал админа.
4. **Error Boundary** в `app/_layout.tsx` корне.

---

## F. Legal / compliance

### Что есть
- [`app/(auth)/phone.tsx:141`](../../app/(auth)/phone.tsx): «Продолжая, вы соглашаетесь с Условиями использования и Политикой конфиденциальности.» — **текст без ссылок и без активного согласия (нет чекбокса)**.
- [`app/(tabs)/profile/settings.tsx:131-137`](../../app/(tabs)/profile/settings.tsx):
  ```tsx
  <ActionRow label="Условия использования" onPress={() => Alert.alert("Скоро", "Раздел в разработке.")} />
  <ActionRow label="Политика конфиденциальности" onPress={() => Alert.alert("Скоро", "Раздел в разработке.")} />
  ```
- **Никаких реальных страниц нет.** TOS / Privacy Policy / Согласие на обработку ПД (152-ФЗ) — не существуют.

### 🔴 Что блокирует запуск
1. **Apple App Store Review (Guideline 5.1.1)** — требует Privacy Policy URL в Connect + в приложении. Без него reject 100%.
2. **Google Play Console** — требует Data Safety form + Privacy Policy URL. Без них reject.
3. **152-ФЗ (РФ)** — обработка ПД физлица без согласия = штраф до 700K ₽ за нарушение. Нужны: явное согласие (чекбокс), реквизиты оператора, регистрация в РКН (форма уведомления).
4. **Удаление аккаунта** — Apple требует с 2022, Google с 2023. В коде функция **отсутствует** (грепнул `delete.*account` — пусто). Sign-out есть, но это не то же самое.
5. **Возрастной gate (18+)** — не реализован. Для marketplace услуг (где есть chat с фото) нужен.

### Минимум для запуска
- Написать Privacy Policy + Terms of Service на русском, разместить на `xtrud.alanbani.ru/privacy` и `/terms` (статические HTML, не SPA-роут).
- Добавить активный чекбокс на phone-экране: «☐ Я принимаю Условия и даю согласие на обработку ПД» — без галки кнопка disabled.
- Реализовать `/profile/settings → Удалить аккаунт` (RPC `delete_my_account` с CASCADE / SET NULL + анонимизация отзывов).
- Подать уведомление в РКН об обработке ПД.

---

## G. Билды для сторов

### Что есть в [`app.json`](../../app.json)
- `name: "xtrud"`, `slug: "xtrud"`, `version: "0.0.1"`. **Версия не для prod** — нужно поднять минимум до `1.0.0`.
- iOS: `bundleIdentifier: "com.xtrud.app"` ✓. `supportsTablet: true`. Нет `buildNumber` (полагается на `autoIncrement` в eas.json). Нет `ios.usesNonExemptEncryption: false` → задержка review в Apple Connect.
- Android: `package: "com.xtrud.app"` ✓. `edgeToEdgeEnabled: true`. Нет `versionCode` (auto).
- Adaptive icon: все 3 layer'а (foreground / background / monochrome) есть в [`assets/images/`](../../assets/images/). ✓
- Splash screen: [`assets/images/splash-icon.png`](../../assets/images/splash-icon.png) ✓ + dark variant ✓.
- Permission strings: фото / камера — заполнены на русском ([`app.json:55-57`](../../app.json)). ✓

### 🔴 Чего нет
- **`extra.eas.projectId`** — отсутствует. Без него `eas build --profile production` упадёт с ошибкой / `expo-notifications` сломает push.
- **`runtimeVersion`** — отсутствует. EAS Update требует, иначе OTA-апдейты невозможны.
- **`ios.infoPlist.NSLocationWhenInUseUsageDescription`** — отсутствует. В будущем нужна geo (карта мастеров, фича из Phase 2) → reject.
- **`ios.infoPlist.NSUserTrackingUsageDescription`** — отсутствует. Apple требует с iOS 14.5 даже если приложение не трекает (формально).
- **`android.permissions`** — не настроен explicit allowlist. Android по умолчанию запросит всё.
- **Иконки app icon** — `icon.png` есть, но не проверено что это **реальный финальный** ассет (может быть placeholder).
- **EAS submit профиль** пустой ([`eas.json:60`](../../eas.json) `"submit": { "production": {} }`). Нет ASC API key, нет Google Play service account JSON path → submit невозможен.

---

## H. Perf / stability

### Что есть
- [`metro.config.js`](../../metro.config.js) — стандартный для Expo + NativeWind + SVG-as-component. Опасных хаков нет.
- [`babel.config.js`](../../babel.config.js) — минимальный (`babel-preset-expo` + `nativewind/babel`). OK.
- React Native packages с native-deps (нельзя в Expo Go): `expo-notifications`, `expo-secure-store`, `expo-image-manipulator`, `expo-image-picker`, `phosphor-react-native` (через `react-native-svg`), `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens`, `react-native-svg-transformer`. **Развёрнутый список — нужен Development Build, не Expo Go.** Это в норме для prod, но команду на onboard'е нужно предупредить.
- `newArchEnabled: true` ([`app.json:10`](../../app.json)) — Fabric / TurboModules ВКЛ. На RN 0.81 это стабильно, но есть риск edge-case крашей в библиотеках, которые не обновили совместимость.

### Что не проверено
- Bundle size — не измерял. На web `dist/_expo/static/js/web/entry-*.js` — нужно проверить через bundle-analyzer.
- Tree-shaking Phosphor — Phosphor RN экспортит все 9000+ иконок; если NativeWind не выгребает unused, bundle раздувается. AUDIT_2026-05-16 не упоминает.
- Тесты: vitest стоит, но `.test.ts` файлов мало (грепнул — нет UI-тестов на критических flow auth / order-create).

---

## I. Backup / disaster recovery

### Что есть
- Supabase **free tier** ([README.md:81](../../README.md): «Free tier») — автоматические daily backups 7 дней, потом удаляются. Восстановление — через Supabase Dashboard, не через CLI.
- Storage backup — не настроен. Bucket `master-verifications` (миграция 0070) — приватный, бэкап только при общем DB backup; **файлы хранятся отдельно**, нужно отдельное копирование (Supabase Storage НЕ входит в стандартный DB-бэкап).
- Migration rollback — миграции наколено («ALTER TYPE ADD VALUE» в 0071, см. STATUS) — **необратимы в PostgreSQL**. Нет `DROP VALUE`. Любая ошибочная enum-миграция = ребилд схемы.

### Что критично добавить
1. **Перейти на Supabase Pro $25/мес** → 7d → 30d backups + PITR (Point-in-Time Recovery, гранулярность 2 мин).
2. **Cron-задача еженедельный pg_dump → Storage / S3** (через GitHub Actions / Supabase Edge Function).
3. **Backup Storage buckets** — `gsutil rsync` или аналог в S3-совместимое хранилище.
4. **Runbook для rollback**: что делать если миграция 008X сломала prod — задокументировать процедуру.

---

## J. Domain / SSL

### Что есть
- `xtrud.alanbani.ru` — деплой target ([deploy/web.sh:9](../../deploy/web.sh)). Принадлежит «alanbani» (третий проект, не xtrud). Caddy на VPS даёт автоматический SSL через Let's Encrypt (`tls` директива в Caddyfile — implicit). Auto-renew работает.
- VPS — `root@62.113.106.30`. Единая точка отказа.

### 🔴 Что блокирует
1. **Домен не наш** — `xtrud.alanbani.ru` это subdomain чужого домена. Для prod нужен **свой**: `xtrud.ru` / `xtrud.app` / `xtrud.me`. Без него ни App Store бренд-проверка, ни доверие пользователей.
2. **App Store / Google Play аккаунты** — статус не известен из репо. Apple Developer ($99/год), Google Play ($25 one-time). Без них submit невозможен.
3. **Telegram-канал поддержки** — [`@xtrud_support`](https://t.me/xtrud_support) в [`app/(tabs)/profile/settings.tsx:48`](../../app/(tabs)/profile/settings.tsx). Не проверено, существует ли канал.
4. **VPS sysadmin** — никто кроме владельца не имеет ssh-ключа. Если он недоступен — деплой невозможен.

---

## K. AI features readiness

Из AUDIT_2026-05-16.md Phase 1 → 4 AI-фичи (#7, #8, #9, #12). Грепнул `src/`, `app/`: **0 AI-интеграций в коде**. Ни OpenAI, ни Anthropic, ни Cloudflare Workers proxy. Нет даже placeholder-папки `src/features/ai/`.

| Фича | Статус | Что нужно |
|---|---|---|
| AI-генератор описания услуги (фото → текст) | ❌ Не начато | Cloudflare Workers proxy → Haiku vision. ~$10/мес |
| AI-фильтр спам-откликов (embedding similarity) | ❌ Не начато | pgvector в Supabase + text-embedding-3-small + cron-job. ~$1-3/мес |
| OpenAI Moderation на UGC | ❌ Не начато | Edge function moderate-text + trigger на INSERT отзыва/сообщения. **БЕСПЛАТНО** через OpenAI Moderation API |
| AI-визард создания заявки (voice/text → JSON) | ❌ Не начато | Whisper STT + Haiku function-calling. Phase 2 |

Это P1 (не блокер launch), но Phase 1 Sprint 24 в AUDIT-плане — должно быть закрыто до того как стартанём агрессивный growth.

---

## 🔴 Блокеры публичного запуска (P0)

1. **Mock OTP в [`src/features/auth/use-auth-mutations.ts:20`](../../src/features/auth/use-auth-mutations.ts)** → подключить реальный SMS-провайдер (МТС Exolve / SMSC / SmsAero) через Supabase Auth Phone provider. Без этого любой может войти под чужим номером.
2. **`notify_secret` в plaintext в коммите 0018** → ротация секрета + `vault.update_secret` + удалить значение из миграции (использовать `vault.create_secret(null, name, desc)` + INSERT вручную через service-role).
3. **Demo-пароль `xtrud` в исходниках** ([`src/lib/auth.ts:21`](../../src/lib/auth.ts)) → удалить demo-flow из production-бандла (feature-flag `EXPO_PUBLIC_ENABLE_DEMO=false` или билд-таргет `--no-demo`).
4. **Edge function `notify` отсутствует** ([`supabase/functions/`](../../supabase/functions/) пуст) → написать `notify/index.ts` (Expo Push proxy с retry/dedup) + `supabase functions deploy notify`. Иначе push НЕ работает.
5. **Privacy Policy / Terms of Service не существуют** → написать + разместить + ссылки в [`app/(tabs)/profile/settings.tsx:131-137`](../../app/(tabs)/profile/settings.tsx) + активный чекбокс на phone-экране.
6. **Удаление аккаунта отсутствует** → RPC `delete_my_account` (cascade reviews to NULL, anonymize messages, soft-delete profile). Apple/Google требуют.
7. **Captcha на OTP send отсутствует** → hCaptcha / Cloudflare Turnstile через Supabase Auth flow. Иначе бот сольёт SMS-баланс за час.
8. **`extra.eas.projectId` в [`app.json`](../../app.json) отсутствует** → `eas init` + копирование projectId в config. Без него Production push сломан + `eas build production` ругается.
9. **Свой домен (xtrud.ru / .app)** не оформлен → купить + DNS + перевод деплоя.
10. **Apple Developer + Google Play console аккаунты** → купить ($99 + $25), пройти KYC (1-7 дней Apple, 1-3 дня Google).
11. **EAS submit-профили пусты** ([`eas.json:60`](../../eas.json)) → конфиг ASC API key + Play Console service account JSON.
12. **Sentry интеграция** → `@sentry/react-native` + Expo plugin + DSN в env. Без этого слепая зона на крашах.
13. **152-ФЗ: уведомление в РКН + текст согласия** → юр-консультант, ~5K ₽ + 30 дней рассмотрения.

---

## 🟡 Сильно влияет на качество запуска (P1)

1. **Analytics (PostHog или Amplitude)** — без funnel метрик нельзя понять где дропаются пользователи в первые 24ч.
2. **Error Boundary** в [`app/_layout.tsx`](../../app/_layout.tsx) корне — иначе single error = белый экран.
3. **Push rate-limit per user / per device** — нет в коде, спам-боты могут DDoS-ить устройства жертв.
4. **`runtimeVersion` для EAS Update** — без OTA-апдейтов критические баги фиксятся только новой store-сборкой (7 дней Apple review).
5. **`NSUserTrackingUsageDescription`** в iOS infoPlist — Apple требует с iOS 14.5.
6. **Hardcoded supabase URL в SQL миграциях** ([`0018:51`](../../supabase/migrations/0018_push_triggers.sql), [`0027:37`](../../supabase/migrations/0027_fix_notify_user_pgnet_api.sql), [`0028:81`](../../supabase/migrations/0028_notifications_table.sql)) → заменить на `current_setting('app.settings.notify_url')` через vault.
7. **Supabase Pro upgrade** ($25/мес) — PITR backups + 30d retention. Free tier — 7d daily backups.
8. **Cron backup Storage** — `master-verifications` bucket вне DB-бэкапа.
9. **Staging-окружение** — отдельный Supabase project + отдельный домен (`staging.xtrud.ru`).
10. **CI/CD deploy-job** — auto-deploy на staging при push в `develop`, manual approval для main.
11. **AI moderation на UGC** (фича Phase 1 #9 из AUDIT-2026-05-16) — бесплатно, защищает от harassment.
12. **Возрастной gate (18+)** на phone-экране.
13. **Bundle size analysis** — измерить и оптимизировать (особенно Phosphor tree-shake).
14. **Charging для Caddy** — VPS `62.113.106.30` принадлежит чужому проекту, нужно либо мигрировать на Vercel/CF Pages, либо взять свой VPS.

---

## 🟢 Можно после первой недели (P2)

1. AI-фичи Phase 1 (#7 описание, #8 спам-фильтр) — нужны для master retention, не для launch.
2. AI-визард создания заявки (#12, Phase 2).
3. Public Master Pages с schema.org (#10) — SEO канал прироста.
4. Структурированные отзывы (#13) — UX-улучшение.
5. Telegram Mini App (#17) — discovery-моат.
6. Карта мастеров (#16) — UX.
7. Phone masking МТС Exolve (#15).
8. Calendar slot-booking (#18).
9. Admin panel (#35) — пока spores можно разруливать через прямой SQL.
10. Performance tracing (Supabase Slow Query log + APM).

---

## Оценка готовности к публичному launch

**~35–40%**.

Обоснование:
- **Backend (БД, RLS, миграции, lifecycle)** — 90%, production-ready (см. AUDIT_2026-05-16 «80 migrations applied»).
- **Frontend (UI flows)** — 75%, core закрыт (auth → onboarding → orders → chats → reviews).
- **Auth (реальный)** — 5%, mock-OTP.
- **Push** — 30%, клиент готов, edge function не написана.
- **Legal** — 0%, нет ни одного из 4 обязательных элементов (TOS / Privacy / 152-ФЗ согласие / delete account).
- **Store builds (iOS/Android)** — 20%, `app.json` основа есть, но нет projectId / EAS submit / Apple-Google аккаунтов.
- **Monitoring** — 0%, нет Sentry / Analytics / Error Boundary.
- **Infra (deploy, domain, SSL)** — 40%, deploy ручной, домен не свой, single SPOF VPS.
- **AI-фичи Phase 1** — 0%, не начато.
- **Backup / DR** — 20%, только Supabase free-tier daily.

Среднее по 10 категориям ≈ **35%**.

---

## Estimate усилий

### P0 (блокеры) — ~3 недели full-time для 1 senior
- Real OTP + provider integration: 3 дня
- Edge function `notify` + push polish: 2 дня
- Privacy Policy + ToS + 152-ФЗ согласие + чекбокс: 2 дня (юрист 1 день + dev 1 день)
- Delete account RPC + UI: 1 день
- Captcha integration: 1 день
- App.json EAS projectId + EAS credentials setup: 1 день
- Свой домен (покупка + DNS + redirect): 1 день
- Apple Developer + Google Play аккаунты (KYC): 3-5 дней (внешнее ожидание)
- EAS submit профили + первая submit в TestFlight / Internal Testing: 1 день
- Sentry setup: 0.5 дня
- Demo-flow guard под feature flag + ротация notify_secret: 1 день
- 152-ФЗ уведомление в РКН: 30 дней (внешнее ожидание, можно параллельно)

**Чистый dev: ~15 рабочих дней. Календарно: 3-4 недели с учётом ожиданий внешних аппрувов.**

### P1 (качество запуска) — ~2 недели после P0
- PostHog + funnel events: 2 дня
- Error Boundary: 0.5 дня
- Push rate-limit: 1 день
- runtimeVersion + EAS Update flow: 1 день
- Hardcoded URL → vault refactor: 1 день
- Staging environment + CI deploy: 3 дня
- AI moderation: 1 день
- Возрастной gate: 0.5 дня
- Bundle size optim: 1 день
- VPS / Vercel миграция: 2 дня

**Итого: ~12 рабочих дней.**

### P2 (после первой недели) — Sprint 22-25 по плану AUDIT_2026-05-16
- AI-фичи Phase 1 (#7, #8, #9): 1-2 недели
- Public Master Pages SEO: 0.5 недели
- Admin panel: 1-2 недели
- Phase 2 фичи: 4-6 недель

**Итого Phase 1 + 2: ~2 месяца.**

---

## Что УЖЕ закрыто в STATUS (пропустил из аудита)

- ✅ Backend lifecycle (80 миграций, 8 статусов, 15 переходов, audit log, cron) — production-ready.
- ✅ Master verification backend (миграция 0070, RLS, private bucket).
- ✅ Search RPC `search_categories` подключён в UI (2026-05-16 fix).
- ✅ Lifecycle RPCs SECURITY DEFINER fix (миграция 0081).
- ✅ Phosphor миграция (UI icons).
- ✅ Desktop responsive + dark mode + WebShell.
- ✅ Mutual reviews end-to-end.
- ✅ Chat unread tracking, фото в чате, daily response limit (5/день).
- ✅ Privacy toggle для мастера (hidden from search).
- ✅ TS clean (0 ts-ignore), Biome clean, тесты проходят (vitest).
