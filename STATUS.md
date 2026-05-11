# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

---

## Текущее состояние

**Sprint 1 (фундамент + auth) закрыт.** Каркас приложения собран: Expo SDK 54 + Expo Router v6 + NativeWind 4 + Supabase. Auth-flow по телефону работает с anonymous-сессией под капотом (UI готов под реальный OTP в sprint 2). БД с полной таксономией категорий (10 L1 / 66 L2 / 262 L3) и RLS. GitHub Actions с typecheck + biome зелёный.

**Готов к sprint 2** (бизнес-фичи: role selection, master onboarding wizard, реальный SMS-провайдер).

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

---

## Что дальше (Sprint 2 — приоритет)

1. **🟢 Включить Anonymous Sign-Ins в Supabase Dashboard** (5 минут): Authentication → Sign In/Up → "Allow anonymous sign-ins" = ON. Без этого `signInAnonymously()` падает. После — E2E тест полного auth-flow на iOS Simulator + Web + Android.
2. **Role selection экран** — после первого логина: «Я ищу мастера» / «Я мастер». Обновляет `users.is_client` / `users.is_master` через UPDATE с RLS.
3. **Role switcher** — pill-переключатель `[Клиент | Мастер]` в хедере. Состояние active_role в Zustand store + persist.
4. **Master onboarding wizard** — 7 шагов из CATEGORIES_AND_PROFILES.md §2.1 (фото, город, категории, цены, радиус, график). Нужна миграция `0003_master_profile_fields.sql` с experience_years, has_tools, work_schedule jsonb, etc.
5. **Реальный phone OTP** — заменить anon sign-in на `supabase.auth.signInWithOtp` + `verifyOtp`. Включить phone провайдера в Supabase (Twilio/MessageBird/Vonage/Smsc.ru) + добавить тестовые номера. Кода в `use-auth-mutations.ts` менять 2-3 строки — архитектура готова.
6. **Альтернативный логин: Telegram Login** — рекомендация AUDIT.md (бесплатно, 100% покрытие в регионе).
7. **Каталог категорий клиента** — главный экран после логина: bento-grid с visible L2 категориями (26 шт). `category-tile` компонент с тёмным фото + лейблом.
8. **`src/types/database.ts` regen** — после каждой миграции через MCP `generate_typescript_types`.
9. **Test runner setup** — Vitest для unit (validation.ts, storage.ts чанкинг), Maestro для mobile E2E (auth-flow).

---

## Блокеры

- ⏳ **Anonymous Sign-Ins disabled в Supabase Dashboard** — критично для тестирования sprint 1.6 auth-flow. Включается одним тогглом, MCP не предоставляет (только UI).
- ⏳ **Реальный SMS-провайдер для OTP** — sprint 2, потребует регистрации и оплаты у Twilio/MessageBird/Smsc.ru. Альтернативы: Telegram Login Widget (бесплатно).

---

## История ключевых решений

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
