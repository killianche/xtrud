# LAUNCH READINESS — 2026-05-18

Синтез **5 параллельных аудит-отчётов**, цель — установить **что нужно сделать чтобы запустить xtrud в публичный prod**. Это файл-точка-входа для launch-спринта; детали — в `research/launch_audit_2026-05-18/`.

---

## TL;DR

**Готовность к публичному запуску: ~50%.**

| Слой | Оценка | Комментарий |
|---|---|---|
| Backend (схема, RLS, lifecycle, миграции) | **85%** | Architecturally production-grade, 80 миграций, audit log, 8 статусов lifecycle. |
| Frontend (экраны, UX, dark mode, a11y) | **85%** | 37/39 routes готовы, 0 TODO/FIXME, 355 a11y-атрибутов. |
| Critical paths (E2E flow) | **75%** | Lifecycle + reviews ✅, регистрация + push на новый заказ ❌. |
| **Operational (auth, push, monitoring)** | **15%** | Mock OTP, нет edge function, нет FCM/APNs, нет Sentry. |
| **Legal / Store** | **0%** | Нет PP/ToS, нет удаления аккаунта, нет Apple/Google аккаунтов. |
| **Connect-the-dots** | **90%** | Только 3 phantom hook'а и 1 phantom RPC. |

**Главный вывод:** код-база зрелая и хорошо документирована (это редко); тормозит запуск — **обвязка вокруг кода** (auth provider, legal, store builds, monitoring). При фокусе одного senior'а fulltime — **3–4 недели до beta-launch'а в Республике Ингушетия**.

### Топ-5 блокеров запуска (в порядке риска)

1. 🔴 **Mock OTP + demo password `xtrud` в production-bundle** — любой может войти под любым номером. [`src/features/auth/use-auth-mutations.ts:20`](src/features/auth/use-auth-mutations.ts), [`src/lib/auth.ts:21`](src/lib/auth.ts).
2. 🔴 **Edge function `notify` не в git** — `supabase/functions/` пустая, push-инфраструктура шлёт в endpoint которого нет в репо. Невозможно ревью / DR.
3. 🔴 **Нет push-trigger'а на INSERT orders** — мастера НЕ получают уведомление о новом заказе. Success-screen клиента обманывает обещание «15-60 минут».
4. 🔴 **Legal: 0%** — нет Privacy Policy / Terms / 152-ФЗ согласия / удаления аккаунта. Apple/Google review отклонит первым шагом.
5. 🔴 **`is_demo` флаг не фильтруется в UI** — реальные пользователи увидят 30 demo-аккаунтов (Алина, Магомед, Адам…) вперемешку.

---

## Детальные отчёты

| Роль | Файл | Готовность слоя |
|---|---|---|
| Backend / Supabase audit | [`research/launch_audit_2026-05-18/01_backend.md`](research/launch_audit_2026-05-18/01_backend.md) | 55% (architectural 85%, operational 50%) |
| Frontend / UI audit | [`research/launch_audit_2026-05-18/02_frontend.md`](research/launch_audit_2026-05-18/02_frontend.md) | 85% |
| Critical Path / E2E audit | [`research/launch_audit_2026-05-18/03_critical_paths.md`](research/launch_audit_2026-05-18/03_critical_paths.md) | 75-80% |
| Production Readiness / Infra | [`research/launch_audit_2026-05-18/04_production.md`](research/launch_audit_2026-05-18/04_production.md) | 35-40% |
| Connect-the-dots | [`research/launch_audit_2026-05-18/05_connect_dots.md`](research/launch_audit_2026-05-18/05_connect_dots.md) | 90% |

---

## 🔴 P0 — Блокеры публичного запуска

Без этого пользователей не пускаем. Сгруппировано по природе работы.

### Группа 1 — Auth / SMS (3-4 дня)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-01 | Mock OTP: `setTimeout(800ms)` + игнорирует код | [`src/features/auth/use-auth-mutations.ts:20`](src/features/auth/use-auth-mutations.ts) | Подключить SMS-провайдер (МТС Exolve / SMSC.ru), включить Phone provider в Supabase Auth Dashboard, заменить на `supabase.auth.signInWithOtp` + `verifyOtp` | M (3 дня) |
| P0-02 | Demo password `xtrud` в исходниках | [`src/lib/auth.ts:21`](src/lib/auth.ts) | Удалить demo-flow из production-bundle. Закрыть за `EXPO_PUBLIC_ENABLE_DEMO=false` или build-target | S (0.5 дня) |
| P0-03 | Captcha на OTP send отсутствует — бот сольёт SMS-баланс | n/a | hCaptcha / Cloudflare Turnstile через Supabase Auth flow | S (1 день) |
| P0-04 | `is_admin=true` хардкоднут на demo-юзер `f0000002-...` | [`supabase/migrations/0030_*.sql:70`](supabase/migrations/) | Launch-prep миграция: `UPDATE users SET is_admin = false WHERE is_demo = true` | XS (10 мин) |

### Группа 2 — Push / Notifications (2-3 дня)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-05 | Edge function `notify` ОТСУТСТВУЕТ в git | [`supabase/functions/`](supabase/functions/) пуст, только `.gitkeep` | `supabase functions download notify` → коммит. Параметризовать URL через vault | M (1 день) |
| P0-06 | FCM (Android) + APNs (iOS) credentials не настроены | EAS не настроен | Настроить через `eas credentials`. Если edge `notify` использует Expo Push API — credentials берутся автоматически | S (0.5 дня админ-работы) |
| P0-07 | **Нет push-trigger'а на INSERT `orders`** — мастера НЕ получают уведомление о новом заказе | [`supabase/migrations/0018_push_triggers.sql`](supabase/migrations/0018_push_triggers.sql) (есть messages/responses/accept, но нет orders) | Новая миграция `0083_notify_masters_on_new_order.sql`: AFTER INSERT trigger → рассылка push мастерам по `master_categories ⨝ master_service_areas` | M (1 день) |
| P0-08 | `notify_secret` в plaintext в коммите 0018 | [`supabase/migrations/0018_push_triggers.sql:27`](supabase/migrations/0018_push_triggers.sql) | Ротация секрета → `vault.create_secret` → удалить значение из миграции (заменить на `vault.read_secret`) | S (0.5 дня) |

### Группа 3 — Demo isolation (1 день)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-09 | `is_demo` флаг **не фильтруется в UI** — реальные клиенты увидят demo-мастеров | `useMastersByL2`, `useAllOpenOrders`, `useTopMasters` | Добавить `.neq('is_demo', true)` либо env-флаг `EXPO_PUBLIC_DEMO_MODE` | S (0.5 дня) |
| P0-10 | `useTopMasters` не фильтрует `is_hidden_from_search` — privacy bug | [`src/features/master-view/use-top-masters.ts:38`](src/features/master-view/use-top-masters.ts) | Добавить `.eq('is_hidden_from_search', false)` (соседний `useMastersByL2` фильтрует корректно) | XS (1 строка) |
| P0-11 | `get_master_stats` RPC живёт в БД, но НЕ в миграциях | UI: [`src/features/master-view/use-master-stats.ts:24`](src/features/master-view/use-master-stats.ts), TS-типы: [`src/types/database.ts:1504`](src/types/database.ts) | `SELECT pg_get_functiondef(...)` → миграция `0084_get_master_stats.sql`. Или: дропнуть hook + MasterStatsBlock (сейчас не рендерится) | S (0.5 дня) |

### Группа 4 — Onboarding мастера (2-3 дня)

Без этого мастер на public launch **невидим клиентам** даже после регистрации.

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-12 | **Service areas вне onboarding** — мастер не выбирает города/районы → невидим в location-фильтрах | onboarding flow `(onboarding)/master-*` | Добавить шаг `/(onboarding)/master-areas` между `master-photo` и `master-profile`, использовать `useSetMasterServiceAreas` | M (1 день) |
| P0-13 | **Прайс-лист вне onboarding** — мастер выходит без услуг, его карточка пустая | onboarding flow | Либо новый шаг визарда (1-3 ключевые услуги), либо strong nudge на главной мастера с deep-link на `/profile/services-suggest` | M (1 день) |
| P0-14 | UI паспорт-верификации мастера ОТСУТСТВУЕТ — backend готов (0070), фронт пустой | [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | `/profile/verification` экран + image-picker (паспорт) → upload в private bucket → status-poll + бейдж «паспорт подтверждён» на `/master/[id]` | L (2 дня) |

### Группа 5 — Legal / 152-ФЗ (2 дня dev + внешние согласования)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-15 | Privacy Policy / Terms of Service — стабы `Alert.alert("Скоро")` | [`app/(tabs)/profile/settings.tsx:130-137`](app/(tabs)/profile/settings.tsx) | Написать (или адаптировать template) → разместить как `<WebView>` в `/legal/terms` + `/legal/privacy` → активные ссылки + чекбокс на `/auth/phone` | M (1 день dev + 1 день юрист) |
| P0-16 | **Удаление аккаунта отсутствует** — Apple/Google требуют с 2022 | n/a | RPC `delete_my_account()` (cascade reviews → NULL, anonymize messages, soft-delete profile) + UI на `/profile/settings` с double-confirm | M (1 день) |
| P0-17 | 152-ФЗ: уведомление в РКН + текст согласия | n/a | Юрконсультант. ~5K ₽, внешнее ожидание ~30 дней (можно параллельно) | внешнее |

### Группа 6 — Store builds (3 дня dev + внешние ожидания)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-18 | `extra.eas.projectId` отсутствует | [`app.json`](app.json) | `eas init` → копирование projectId | XS (10 мин) |
| P0-19 | Apple Developer + Google Play console аккаунты | n/a | Купить ($99 + $25), пройти KYC | внешнее (1-7 дней Apple, 1-3 дня Google) |
| P0-20 | EAS submit-профили пусты | [`eas.json:60`](eas.json) | ASC API key + Play Console service account JSON | S (1 день) |
| P0-21 | Свой домен (xtrud.ru / .app) | сейчас `xtrud.alanbani.ru` (чужой) | Купить + DNS + перевод деплоя | S (1 день dev + ожидание DNS) |

### Группа 7 — Observability (1 день)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-22 | Нет Sentry / нет Error Boundary в корне → крэш = белый экран | [`app/_layout.tsx`](app/_layout.tsx) | `@sentry/react-native` + Expo plugin + DSN в env. + `<ErrorBoundary>` в `app/_layout.tsx` | S (0.5 дня) |
| P0-23 | Нет ни одного analytics событьями (нельзя посчитать funnel первых 24ч) | n/a | PostHog (free до 1M events) + 10 ключевых events (signup, role_chosen, first_order, response_sent, accepted, completed, review_left) | S (1 день) |

### Группа 8 — Перфоманс / UX-блокеры (1.5 дня)

| # | Что | Откуда | Fix | Effort |
|---|---|---|---|---|
| P0-24 | Не виртуализированные feed'ы → JS-thread фризы на 200+ заявок | [`app/(tabs)/orders/search/index.tsx:152`](app/(tabs)/orders/search/index.tsx), MasterDashboardOrders, /notifications, /chats, /orders | `<ScrollView>{items.map(...)}</ScrollView>` → `<FlatList>` в 5 экранах | M (1-1.5 дня) |

---

### P0 итого

**~25 dev-дней** для одного senior'а full-time. Календарно **3-4 недели** с учётом внешних ожиданий (KYC Apple/Google, DNS, юрист, РКН).

---

## 🟡 P1 — Сильно влияет на качество запуска

Можно запустить без этого, но первая неделя будет болезненной. Закрывать в порядке списка.

1. **`chat-images` bucket — public** (privacy by obscurity). Перевести в private + signed URL TTL ≤ 1h через новую RPC `get_chat_image_url`.
2. **Realtime: `orders` и `order_responses`** не в publication → клиент видит отклики только после refresh. `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
3. **`useMarkFeedSeen` ни разу не вызывается** — badge counter `/orders` только растёт. Добавить `useEffect` на mount `/(tabs)/orders/index.tsx` для роли master. **Effort: XS, 5 строк.**
4. **`SECURITY DEFINER` функции без `search_path = ''` или `pg_temp`** (~5 функций). Supabase advisor подсветит. Добавить `SET search_path = pg_temp, public`.
5. **Double-blind reviews не реализован** — risk «ответок» в малом регионе. Lifecycle.md §6 спецификация. RLS-фильтр `visible_to_other_side` + cron close window 14d.
6. **Окно отзыва 14d не enforced** — после `completed` отзыв можно оставить когда угодно. Cron `nightly_close_review_windows` + RLS.
7. **`useFeaturedCategories` orphan** — колонка `categories_l2.is_featured` есть, hook написан, в UI не используется. Подключить к hero-секции главной или дропнуть.
8. **Hardcoded supabase URL** в 3 миграциях (`wgeimsajvjkzrrnfrnkb...`). Перенести в vault.
9. **`ActivityIndicator` вместо skeleton на 8 экранах** — нарушение design-quality.md (`/orders`, `/notifications`, `/admin`, `/useful*`, `/orders/[id]`, `/profile/edit-*`, `/profile`).
10. **Native-геолокация no-op** — `src/lib/use-user-city.ts:140`. `expo-location` для автоопределения города на native.
11. **Push notification settings экран** для управления категориями.
12. **runtimeVersion + EAS Update** — для OTA-апдейтов критических багов (без него — 7 дней Apple review).
13. **Push rate-limit per user / device** — бот может DDoS-ить устройства жертв.
14. **`NSUserTrackingUsageDescription`** в `infoPlist.ios` — Apple требует с iOS 14.5.
15. **AI moderation на UGC** (OpenAI Moderation бесплатно) — защита от harassment.
16. **Возрастной gate (18+)** на phone-экране.
17. **Staging environment** — отдельный Supabase project + `staging.xtrud.ru`.
18. **Supabase Pro ($25/мес)** — PITR backups + 30d retention.
19. **Phantom hooks cleanup** — `useOpenDispute`, `useSocialGraph`, `useTeam`, `useMasterFeed`, `MasterStatsBlock` (если решим дропнуть `get_master_stats`).
20. **Lucide → Phosphor migration finish** в ScreenHeader / BottomSheet / chats/[id].

**P1 итого: ~12 dev-дней.**

---

## 🟢 P2 — Nice to have / Phase 1 AI

Из [`AUDIT_2026-05-16.md`](AUDIT_2026-05-16.md) Phase 1 (Sprint 22-25), не блокирует launch, но определяет конкурентоспособность:

1. AI-генератор описания услуги (фото → текст + теги) — Replicate / Claude Haiku.
2. AI-фильтр спам-откликов (embedding similarity).
3. Шаблоны быстрых ответов мастеру.
4. «Время первого ответа» бейдж + lead-decay.
5. Дашборд статистики мастеру (если реализуем `get_master_stats`).
6. Public Master Pages с schema.org — SEO канал прироста.
7. Telegram Mini App + `@xtrudbot` AI-агент.
8. AI-визард создания заявки (голос/текст → JSON).
9. Карма-система (`user_reputation` таблица + soft-warn / hide-profile).
10. Admin panel UI (сейчас 5% — `Alert.alert` меню).
11. Калькулятор слотов / booking.
12. Map view мастеров.
13. Phone masking МТС Exolve (privacy сильно ценится в регионе).
14. Структурированные отзывы (rating per dimension: качество / срок / цена).
15. T14 (`disputed → resolved`) admin RPC + UI.
16. T2 (`closed_for_reviews`) cron — после 30 дней нельзя добавить отзыв.

**P2 итого: 2-3 месяца Phase 1 + Phase 2.**

---

## 📅 Sprint-план: 3 недели до beta

Подход — **3 параллельных потока**: dev (P0), legal (parallel), KYC внешний (parallel). Один senior + юрист + проджект для KYC и DNS.

### Неделя 1 — Auth, push, demo-isolation

**День 1-3 — Real OTP:**
- P0-01 — МТС Exolve / SMSC интеграция, Supabase Phone provider, `signInWithOtp` + `verifyOtp`.
- P0-02 — Удалить demo password из bundle, закрыть за `EXPO_PUBLIC_ENABLE_DEMO`.
- P0-03 — Captcha (hCaptcha) на OTP send.
- P0-04 — Launch-prep миграция: убрать `is_admin=true` с demo-юзеров.

**День 4 — Push edge function:**
- P0-05 — `supabase functions download notify` → коммит.
- P0-06 — EAS credentials FCM + APNs.
- P0-08 — Ротация `notify_secret` через vault.

**День 5 — Push trigger + Demo isolation:**
- P0-07 — Миграция `0083_notify_masters_on_new_order.sql`.
- P0-09 — Фильтр `is_demo` в `useMastersByL2`, `useAllOpenOrders`, `useTopMasters`.
- P0-10 — Фильтр `is_hidden_from_search` в `useTopMasters`.
- P0-11 — Миграция `0084_get_master_stats.sql` (или drop hook + MasterStatsBlock).

**Параллельно (другие исполнители):**
- Юрист: написание PP/ToS/152-ФЗ согласия.
- Проджект: регистрация Apple Developer + Google Play.

### Неделя 2 — Onboarding, legal, observability, store

**День 6-7 — Onboarding мастера:**
- P0-12 — Шаг `master-areas` в onboarding.
- P0-13 — Шаг прайс-лист в onboarding.

**День 8-9 — Verification UI:**
- P0-14 — `/profile/verification` экран + image-picker + бейдж.

**День 10 — Legal в UI:**
- P0-15 — Routes `/legal/terms` + `/legal/privacy`, ссылки в `/profile/settings`, чекбокс на `/auth/phone`.
- P0-16 — RPC `delete_my_account` + UI на settings.

**День 11 — Observability + perf:**
- P0-22 — Sentry + Error Boundary.
- P0-23 — PostHog + 10 funnel events.
- P0-24 — Виртуализация feed'ов (5 экранов на FlatList).

### Неделя 3 — Store builds, домен, beta-launch

**День 12 — EAS / Store:**
- P0-18 — `extra.eas.projectId`.
- P0-20 — EAS submit профили (ASC API key + Play service account).
- P0-21 — Домен `xtrud.ru` / `.app` купить + DNS.

**День 13-14 — TestFlight + Internal Testing:**
- Первая submit в TestFlight (iOS).
- Первая submit в Google Play Internal Testing.
- Smoke-тест 5 critical flows на реальных устройствах.

**День 15 — Buffer + публичная beta:**
- Фиксы найденного в TestFlight.
- P1 quick wins (skeleton вместо ActivityIndicator, `useMarkFeedSeen`, native-геолокация).

**Внешние ожидания (идут параллельно):**
- KYC Apple: 1-7 дней.
- KYC Google: 1-3 дня.
- РКН-уведомление 152-ФЗ: 30 дней (можно стартовать в неделю 1, не блокирует beta для closed audience).
- DNS propagation: до 48ч.

---

## Что УЖЕ ХОРОШО (не трогать)

Чтобы не сломать в спешке:

1. **Backend схема и RLS** — 27 таблиц, RLS на всех, 0 дыр, все FK с индексами.
2. **Lifecycle 8 статусов / 15 transitions T1–T15** — реализован полно (T10/T12 dispute осознанно скрыты, T14 admin OK для текущего scope).
3. **Audit log `order_status_log`** + 3 cron'а — production-ready.
4. **Mutual reviews + recalc_master_rating trigger** — обе стороны, рейтинги пересчитываются.
5. **Search RPC `search_categories`** + FTS + trigram + synonyms — подключён в UI 2026-05-16.
6. **Chat unread tracking** + photos + daily limit (5/день) — работает.
7. **UI: 0 TODO/FIXME, 0 console.log, 355 a11y, эмодзи как иконки отсутствуют, DiceBear allowlist enforced.**
8. **Dark mode + web + native + WebShell desktop** — без расхождений.
9. **Документация** (CLAUDE.md → STATUS.md → 9 design-doc'ов) — новый агент входит в контекст за 15 минут.

---

## Связанные документы

- [`AUDIT_2026-05-16.md`](AUDIT_2026-05-16.md) — продуктовый аудит (Phase 1 AI-фичи Sprint 22-25).
- [`STATUS.md`](STATUS.md) — текущее состояние + история решений.
- [`docs/lifecycle.md`](docs/lifecycle.md) — спецификация state-machine.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — backend верификации (frontend TBD P0-14).
- [`.claude/rules/connect-the-dots.md`](.claude/rules/connect-the-dots.md) — правило про неподключённый бэк.

---

## Bottom line

xtrud — **редкий случай** проекта где код-база **обгоняет инфра-обвязку**. 80 миграций, 39 routes, чистый код, документация для AI-сессий. Что мешает запуску — это **классическая «последняя миля»**: реальный SMS, FCM/APNs, legal, store-аккаунты, monitoring. Это **не write-the-code work, это setup-and-paperwork work**, которое не делается «в один Edit».

При фокусе одного senior'а на 3-4 недели календарных и параллельной работе юриста + KYC — **beta-launch в Республике Ингушетия достижим к 2026-06-15**.

Phase 1 AI-фичи (AUDIT_2026-05-16 Sprint 22-25) — после первой волны пользователей, ~2 месяца дополнительно.
