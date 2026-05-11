# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

---

## Текущее состояние

**Sprint 3 (master path + category detail + role switcher) закрыт.** Полный flow обеих ролей готов в коде:
- Client путь: phone → role «Я ищу мастера» → каталог из 26 visible L2 → детали категории с L3 услугами
- Master путь: phone → role «Я мастер» → master profile wizard → каталог + role switcher в хедере для переключения между client/master view

База расширена: 6 миграций, RPC `complete_master_onboarding` для атомарного завершения мастер-онбординга, 0 lints у advisor security.

**Готов к sprint 4** (атмосферные фото категорий + master_categories link table + order flow + реальный SMS-OTP).

---

## Инфра

| Ресурс | Значение |
|---|---|
| GitHub | https://github.com/killianche/xtrud (private, ssh, branch `main`) |
| CI | https://github.com/killianche/xtrud/actions — ✅ зелёный |
| Supabase project ref | `wgeimsajvjkzrrnfrnkb` |
| Supabase URL | https://wgeimsajvjkzrrnfrnkb.supabase.co |
| Supabase region | eu-central-1 (Frankfurt) |
| Supabase organization | Madinah_magazaurov |
| Supabase plan | Free (0 ₽/мес) |
| Bundle ID | `com.xtrud.app` (iOS + Android) |
| Env-ключи | `.env.local` (gitignored), шаблон `.env.example` |

---

## Стек (зафиксирован)

**Frontend:** Expo SDK 54 (universal) + Expo Router v6 + React 19 + RN 0.81 + new architecture.
**Стили:** NativeWind 4 + Tailwind 3.4 + CSS-vars для тем (light/dark).
**State:** Zustand (theme) + TanStack Query 5 (server).
**Формы:** React Hook Form 7 + Zod 3 + @hookform/resolvers.
**Backend:** Supabase Postgres + Auth + Storage. Клиент: @supabase/supabase-js 2.105.
**Шрифт:** Inter 400/500/600/700 через @expo-google-fonts/inter (load в _layout).
**Иконки:** lucide-react-native v1.14.
**Lint/format:** Biome 2.4.
**Деплой (план):** EAS Build/Submit (mobile) + Vercel/Cloudflare Pages (web).
**CI:** GitHub Actions (typecheck + biome ci на каждый PR и main).

---

## Структура проекта

```
xtrud/
├── app/                         # Expo Router
│   ├── (auth)/                  # auth-flow group
│   │   ├── _layout.tsx
│   │   ├── phone.tsx            # ввод телефона с маской
│   │   └── verify.tsx           # OTP (sprint 1 — любой код)
│   ├── (tabs)/                  # после-логина group
│   │   ├── _layout.tsx
│   │   └── index.tsx            # заглушка "Главная"
│   ├── _layout.tsx              # root: SplashScreen, fonts, AuthGate
│   └── +html.tsx                # web shell с viewport + theme guard
├── src/
│   ├── components/
│   │   └── AppText.tsx          # обёртка над Text с weight + maxFontSizeMultiplier
│   ├── features/auth/
│   │   ├── validation.ts        # Zod-схемы + phone маска/normalize
│   │   ├── use-auth-session.ts  # подписка на supabase.auth.onAuthStateChange
│   │   └── use-auth-mutations.ts # useSendOtp, useVerifyOtp
│   ├── hooks/
│   │   └── use-color-scheme.ts
│   ├── lib/
│   │   ├── auth.ts              # signInAnonymouslyWithPhone, signOut
│   │   ├── colors.ts            # палитра (WCAG-fixed)
│   │   ├── env.ts               # Zod-валидация EXPO_PUBLIC_*
│   │   ├── storage.ts           # SecureStore + localStorage адаптеры
│   │   ├── supabase.ts          # singleton client с pkce, autoRefresh
│   │   ├── theme.ts             # Zustand store
│   │   └── tokens.ts            # spacing, fontSize, radius, etc.
│   └── types/
│       └── database.ts          # auto-generated из Supabase
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql        # cities, users, master_profiles, categories
│   │   └── 0002_split_private_fields.sql # users_private + advisor fixes
│   └── seed/
│       └── categories.sql       # 10 L1 + 66 L2 + 262 L3
├── .github/workflows/ci.yml     # typecheck + biome
├── .claude/
│   ├── rules/working-rules.md
│   └── settings.json            # permissions allowlist
├── assets/images/               # icons, splash
└── [configs: app.json, tsconfig, babel, metro, tailwind, biome, etc.]
```

---

## Что готово (Sprint 1 — фундамент + auth)

### Подготовка (до sprint 1)
- [x] **2026-05-11** — CLAUDE.md (120 строк) + `.claude/rules/working-rules.md` (autoload)
- [x] **2026-05-11** — выбран стек Expo universal + Supabase
- [x] **2026-05-11** — Supabase-проект создан, env-keys получены
- [x] **2026-05-11** — git + GitHub repo + начальный коммит
- [x] **2026-05-11** — закоммичены документы параллельного агента (PROJECT_MAP, DESIGN_SYSTEM, CROSS_PLATFORM_RULES, CATEGORIES_AND_PROFILES, AUDIT, COMPETITOR_INSIGHTS, PRODUCT_BLINDSPOTS)

### Sprint 1
- [x] **2026-05-11** — **1.1** Expo scaffold (commit `538195f`): package.json под SDK 54, NativeWind v4, Biome 2.4, TS strict + noUncheckedIndexedAccess. 789 пакетов, expo install --check ok.
- [x] **2026-05-11** — **1.2** Design tokens (commit `5cddc26`): `src/lib/{tokens,colors,theme}.ts`, `src/hooks/use-color-scheme.ts`, `src/components/AppText.tsx`. CSS-vars в `global.css`. **WCAG-fix**: `muted-soft` `#9ca3af→#71717a` (4.61:1), `accent` light `#3b82f6→#2563eb` (5.6:1).
- [x] **2026-05-11** — **1.3** Supabase client (commit `5ade197`): `src/lib/{env,storage,supabase}.ts`. KV-адаптер с чанкингом ≤1800 байт для iOS Keychain. AppState listener для autoRefresh. QueryClientProvider с дефолтами под mobile-сети.
- [x] **2026-05-11** — **1.4** DB schema (commit `ac518f0`): миграции `0001_init.sql` + `0002_split_private_fields.sql`. 7 таблиц с RLS: cities, users, users_private, master_profiles, categories_l1/l2/l3. Триггер `handle_new_auth_user`. Advisor security = **0 lints** после split-table.
- [x] **2026-05-11** — **1.5** Categories seed (commit `9475661`): 49 KB SQL с **10 L1 + 66 L2 + 262 L3**. 26 L2 visible (по решению пользователя). 4 L3 с requires_license. 23 L3 с seasonality=wedding_season.
- [x] **2026-05-11** — **1.6** Auth flow (commit `642e72b`): phone+verify экраны с RHF+Zod, маска `+7 XXX XXX-XX-XX`, cooldown 60с, autofocus, AuthGate с redirect. Inter font (4 веса), SafeAreaProvider, SplashScreen guard. anon-sign-in за кулисами, phone сохраняется в users_private.
- [x] **2026-05-11** — **1.7** CI (commit `619083c`): GitHub Actions с typecheck + biome ci. Первый прогон ✅ 31 секунда. concurrency cancel-in-progress.
- [x] **2026-05-11** — `.claude/settings.json` с permissions allowlist для смягчения подтверждений.

### Sprint 2 (онбординг + каталог клиента)
- [x] **2026-05-11** — **2.1** Migration 0003 + AuthGate routing (commit `2c2f25f`): `users.onboarding_completed_at` + `users.active_role` enum + CHECK constraint (active_role='master' ⇒ is_master=true) + partial index. `useUserRecord` hook (TanStack Query, staleTime 5 мин). AuthGate переписан под 3 группы — `(auth)` / `(onboarding)` / `(tabs)`. Advisor security = 0 lints.
- [x] **2026-05-11** — **2.2** Role selection screen (commit `eb42338`): полноценный UI с 2 карточками (lucide Search/Briefcase), accessibilityState selected, accent-soft фон выбранной, CTA "Продолжить", error display. `useCompleteOnboarding` mutation обновляет `users.{is_master, active_role, onboarding_completed_at}` + invalidates query.
- [x] **2026-05-11** — **2.3** Main client screen (commit `5d394c8`): `useVisibleCategories` для 26 L2, `CategoryTile` компонент с iconMap (~50 lucide icons), grid 2/3/4-кол. адаптивный, ScrollView без виртуализации, loading/error/empty states, header с приветствием по first_name + role badge + signOut. **Без атмосферных фото — sprint 4+.**

### Sprint 3 (master path + category detail + role switcher)
- [x] **2026-05-11** — **3.1** Category detail screen (commit `544838a`): динамический роут `app/(tabs)/category/[id].tsx` с `href:null` в Tabs (скрыт из таб-бара). `useCategoryDetail` загружает L2 + L3. Список услуг через `ServiceRow` с lucide Shield для requires_license, формат "от X ₽" через Intl.NumberFormat ru-RU, urgency на русском (Срочно/На неделе/В течение месяца), правильное склонение «услуга/услуги/услуг» с учётом 11-19. Tap по плитке теперь реально навигирует.
- [x] **2026-05-11** — **3.2** Migration 0004 — extended master_profile fields (commit `b4af8e1`): добавлены 11 полей в master_profiles (experience_years, has_tools, has_transport, service_radius_km, work_schedule jsonb, languages text[], tax_status, inn, team_size, home_clients_policy), 2 enums (tax_status, home_clients_policy), CHECK на bio.length≤500 и ИНН.length∈{10,12}, partial index по (status, service_radius_km).
- [x] **2026-05-11** — **3.3** Master onboarding wizard (commits `3680ec9`):
  - Migration 0005 + 0006 — RPC `complete_master_onboarding(...)`. Изначально SECURITY DEFINER, advisor предупредил → 0006 переключает на SECURITY INVOKER (RLS уже даёт нужные права, plpgsql функция сама по себе транзакция). Advisor security = 0 lints.
  - `useCities` hook (staleTime 1ч), `useSubmitMasterProfile` mutation через `supabase.rpc`.
  - `app/(onboarding)/master-profile.tsx` — single-screen form: имя/фамилия (validation regex Unicode letters), город (pills из cities), район (опц.), bio (multiline 500 max), experience_years + service_radius_km (number inputs side-by-side), has_tools/has_transport (RN Switch с accent track).
  - role.tsx обновлён: master → push на master-profile, client → completeOnboarding сразу.
  - Zod схема без `.optional().default()` (иначе IN vs OUT тип конфликтует с Control<T>).
- [x] **2026-05-11** — **3.4** Role switcher pill (commit `ac5626a`): `RoleSwitcher` компонент с двумя pill-кнопками («Клиент» / «Мастер»), показывается только если is_master=true. `useSetActiveRole` mutation UPDATE users.active_role + invalidate userRecord. Контент главной по active_role пока не меняется (sprint 4).

---

## Что дальше (Sprint 4 — приоритет)

1. **🟢 Включить Anonymous Sign-Ins в Supabase Dashboard** (5 минут): Authentication → Sign In/Up → "Allow anonymous sign-ins" = ON. Без этого ВЕСЬ flow не запустится в Simulator.
2. **Master view главного экрана** — другой контент при active_role='master': лента заявок (или заглушка «Заявки скоро»), переключатель уже на месте.
3. **Master_categories link table** — миграция 0007 для many-to-many master ↔ L2 категорий (max 5 per master, см. CATEGORIES_AND_PROFILES §4). Без этого мастер не появляется в каталоге.
4. **Атмосферные фото категорий** — `categories_l1.cover_image_url` + сигнатурный паттерн DESIGN_SYSTEM §9.1 (тёмное фото + overlay-gradient + лейбл белым). Источники: Unsplash/Pexels.
5. **Фото-инфра** — Supabase Storage bucket «portfolio» с RLS + клиентский resize через expo-image-manipulator (CATEGORIES_AND_PROFILES §6). При >50GB → миграция на R2 (zero egress).
6. **Order flow (заявки клиента)** — миграция 0008 для `orders` таблицы из CATEGORIES_AND_PROFILES §8.2 + create-order wizard + лента в /(tabs)/orders.
7. **Реальный phone OTP** — заменить anon на signInWithOtp/verifyOtp. Включить SMS-провайдера в Dashboard.
8. **Альтернативный логин: Telegram Login Widget** — бесплатно, 100% покрытие в регионе (AUDIT.md).
9. **Test runner setup** — Vitest для unit (validation, storage чанкинг), Maestro mobile E2E.
10. **EAS Build setup** — eas.json, первый dev-build.

---

## Блокеры

- ⏳ **Anonymous Sign-Ins disabled в Supabase Dashboard** — критично для тестирования sprint 1.6 auth-flow. Включается одним тогглом, MCP не предоставляет (только UI).
- ⏳ **Реальный SMS-провайдер для OTP** — sprint 2, потребует регистрации и оплаты у Twilio/MessageBird/Smsc.ru. Альтернативы: Telegram Login Widget (бесплатно).

---

## История ключевых решений

### 2026-05-11 — Sprint 3.3: RPC complete_master_onboarding с SECURITY INVOKER
**Выбрано:** функция SECURITY INVOKER (не DEFINER), хотя оба варианта работают функционально.

**Обоснование:** Supabase advisor flag'ает SECURITY DEFINER функции callable authenticated через RPC как WARN (lint 0029). Поскольку RLS на public.users (auth.uid()=id) и public.master_profiles (auth.uid()=user_id) уже разрешает нужные операции, bypass через DEFINER не нужен. PL/pgSQL функция атомарна сама по себе — UPDATE + UPSERT в одной транзакции. Advisor = 0 lints.

**Migration history:** 0005 (изначально DEFINER) + 0006 (CREATE OR REPLACE на INVOKER) — оставлены оба чтобы сохранить immutable migration history.

### 2026-05-11 — Sprint 3.3: Master wizard на одном экране, не многошаговый
**Выбрано:** все поля master profile (имя, фамилия, город, район, bio, опыт, инструмент, транспорт, радиус) на одном экране через ScrollView + KeyboardAvoidingView.

**Альтернатива (отброшена):** 7-шаговый wizard из CATEGORIES_AND_PROFILES §2.1. Многошаговый flow добавляет step navigation, draft persistence, indicator UI — серьёзный overhead для sprint 3 scope. На одном экране пользователь видит всё, может скроллить и поправить — UX простой.

**Условие пересмотра:** sprint 4+ если масштаб полей вырастет (категории, портфолио, график) — разбить на 3-4 шага.

### 2026-05-11 — Sprint 2.3: bento-grid без фото в первой итерации
**Выбрано:** упрощённая сетка плиток с lucide-иконкой + surface-2 фоном вместо сигнатурного DESIGN_SYSTEM §9.1 паттерна (тёмное атмосферное фото + overlay-gradient + лейбл).

**Обоснование:** атмосферные фото для 26 категорий — это (а) 30-50 МБ assets, (б) подбор/curation/правовая чистка, (в) загрузка в Supabase Storage / R2 + клиентский resize через expo-image-manipulator. Это полноценная задача sprint 3+ с фото-инфрой. Сейчас лучше показать MVP-сетку, чем застрять.

**Условие пересмотра:** sprint 3 когда настроим R2 + источник фото.

### 2026-05-11 — Sprint 2.1: split-table подход к "приватный/публичный" профиль расширен на onboarding state
**Выбрано:** `users.onboarding_completed_at: timestamptz NULL` как маркер "выбрал ли пользователь роль" — публичная инфа.

**Альтернатива (отброшена):** хранить в `users_private` чтобы не было видно другим — overkill, статус онбординга семантически такой же публичный как `is_master`.

### 2026-05-11 — Sprint 1: anonymous-сессия как первичный auth механизм
**Выбрано:** anonymous sign-in под капотом + phone сохраняется в `users_private` без OTP-верификации.

**Обоснование:** реальный phone-OTP требует подключения SMS-провайдера через Supabase Dashboard (Twilio / MessageBird / Vonage / Smsc.ru). На старте sprint 1 это блокирует разработку и требует оплаты. Anonymous даёт реальную сессию + RLS работает + триггер создаёт `users` запись. UX phone-flow выглядит как настоящий OTP — пользователь вводит номер, "получает код" (симуляция 800ms), "вводит код" (любой 6-значный). В sprint 2 — 2-3 строки замены: `signInAnonymously` → `signInWithOtp`/`verifyOtp`.

**Условие пересмотра:** в sprint 2 — реальный OTP.

### 2026-05-11 — Sprint 1.4: split-table для приватных полей users
**Выбрано:** разделить `public.users` на 2 таблицы — `users` (публичный профиль) и `users_private` (phone, birth_year, gender, last_active_at) с RLS `auth.uid() = user_id`.

**Обоснование:** изначально пытался сделать SECURITY DEFINER view `users_public` для отдачи только публичных полей. Supabase advisor вернул ERROR `security_definer_view` (Lint 0010). Split-table — стандартный паттерн Supabase: чистый advisor, простой `SELECT *` для публичных читателей, RLS защищает приватные поля без хаков с views.

**Альтернатива (отброшена):** column-level GRANTs — невозможно совместить с row-level access "владелец видит всё, остальные — только публичные".

### 2026-05-11 — Sprint 1.5: 26 L2 visible (вместо 13 из PROJECT_MAP)
**Выбрано:** 13 главных категорий из PROJECT_MAP §5.12 + все 5 L2 в L1 Авто + все 7 L2 в L1 Бьюти + школа/языки/религиозное в Education = ~26 visible L2.

**Обоснование:** PROJECT_MAP §5.12 называет "Авто" и "Бьюти" как монолитные категории, но в фактической таксономии CATEGORIES_AND_PROFILES §1.3 эти L1 имеют 5 и 7 L2-подкатегорий. Логичнее показать «маникюр + парикмахер + массаж» как visible, чем выбрать один. Пользователь подтвердил это решение.

### 2026-05-11 — Стек: Expo universal (web + iOS + Android в одной кодовой базе)
**Выбрано:** Expo SDK 54+ с Expo Router v6, NativeWind 4, Zustand, TanStack Query, RHF + Zod, Supabase JS, Reanimated 4.

**Деплой:** EAS Build/Submit для mobile, Vercel или Cloudflare Pages для web.

**Альтернативы:** Monorepo Next.js + Expo раздельно (отброшено — слишком много дублирования), Flutter (другая экосистема), PWA-only (не дотягивает до нативных приложений).

### 2026-05-11 — Sprint 1.2: WCAG-фикс контраста palette
**Выбрано:** `muted-soft` light `#9ca3af → #71717a` (zinc-500, 4.61:1 на #fff ✅ AA), `accent` light `#3b82f6 → #2563eb` (blue-600, 5.6:1 на #fff ✅ AA body).

**Обоснование:** оригинальные значения из DESIGN_SYSTEM.md не проходят WCAG AA для body-текста (2.95:1 и 3.7:1). Подъём на 1-2 тона делает их accessible без потери визуального duxa Cal.com-стиля.

### 2026-05-11 — GitHub-репо: приватный
**Выбрано:** `killianche/xtrud` private. Переключение private→public — одна команда, обратный путь сложнее.

### 2026-05-11 — Supabase: регион eu-central-1, Free tier
**Выбрано:** Frankfurt, $0/мес. Регион нельзя сменить после создания.

### 2026-05-11 — Документация: разбита на короткий CLAUDE.md + детальные `.claude/rules/*.md`
**Выбрано:** CLAUDE.md ~120 строк + `.claude/rules/working-rules.md` с `paths: ["**/*"]` для автозагрузки. Рекомендация best-practice репо: «under 200 lines for reliable adherence».
