# xtrud

Mobile-first маркетплейс услуг (исполнители ↔ заказчики) для Республики
Ингушетия. Главный продукт — iOS/Android-приложение в одной Expo-кодовой базе;
web сохраняется как supporting surface для legal/recovery/deep links.

## Стек

- **Frontend:** Expo SDK 57 + Expo Router — единая кодовая база для iOS (главная платформа), Android и supporting web
- **Backend:** свой сервер `xtrud-api` на Beget (Node 22 + Fastify), PostgreSQL 17
  с RLS, PostgREST как движок запросов, imgproxy для превью. Supabase как
  продукт не используется с 2026-09-08 — см. [docs/BACKEND_REWRITE_PLAN.md](docs/BACKEND_REWRITE_PLAN.md)
- **Клиент данных:** свой `src/lib/xtrud-client` (сессия, запросы, файлы), модуль `@/lib/supabase` — исторически то же имя
- **Стили:** NativeWind v4 (Tailwind для RN+web), тёмная тема через class strategy
- **State:** Zustand (клиент) + TanStack Query (сервер)
- **Формы:** React Hook Form + Zod
- **Шрифт:** системный (SF Pro / Segoe / Roboto) — Geist/Inter убраны 2026-05-23
- **Иконки:** Phosphor (`phosphor-react-native`); Lucide — legacy, в новом коде не использовать
- **Отслеживание сбоев:** Sentry (`src/lib/sentry.ts`, активен при `EXPO_PUBLIC_SENTRY_DSN`)
- **Lint/format:** Biome 2.x
- **Сборки:** GitHub Actions (`.github/workflows/ios.yml`, macos-26, `eas build --local`) → App Store Connect → TestFlight
- **Релизы:** в App Store 1.0.2; версия 1.0.3 — в TestFlight (сборки 28+); Android заморожен до готовности iOS

## Документация

- [AGENTS.md](AGENTS.md) — единая короткая точка входа для любого AI-агента
- [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md) — приоритет источников, Git,
  версии и release-контракт
- [STATUS.md](STATUS.md) — текущее состояние (снимок вверху), история решений
- [PROJECT_OPERATIONS.md](PROJECT_OPERATIONS.md) — источники истины, серверы, сборки, безопасное удаление и deploy-runbook
- [docs/BACKEND_REWRITE_PLAN.md](docs/BACKEND_REWRITE_PLAN.md) — свой сервер вместо Supabase: архитектура, этапы, откат
- [docs/ADMIN_PANEL.md](docs/ADMIN_PANEL.md) — веб-панель и админ внутри приложения
- [docs/SUPABASE_BEGET_MIGRATION.md](docs/SUPABASE_BEGET_MIGRATION.md) — история переезда с облака на Beget (архив)
- [docs/SIMPLE_FLOW.md](docs/SIMPLE_FLOW.md) — текущая модель (classifieds: отклик + звонок/WhatsApp, без чата/lifecycle)
- [PROJECT_MAP.md](PROJECT_MAP.md) — legacy-концепт, не источник текущего поведения
- [DESIGN.md](DESIGN.md) — дизайн-система: токены, цвета, типографика
- [UI_PATTERNS.md](UI_PATTERNS.md) — кук-бук экранов (читать перед версткой)
- [docs/MOBILE_RELEASE_STRATEGY.md](docs/MOBILE_RELEASE_STRATEGY.md) — iOS-first,
  ранний Android preview и backend transition
- [CROSS_PLATFORM_RULES.md](CROSS_PLATFORM_RULES.md) — общий mobile-first
  контракт iOS/Android и supporting web
- [CATEGORIES_AND_PROFILES.md](CATEGORIES_AND_PROFILES.md) — таксономия, профили, схема БД
- [PRODUCT_BLINDSPOTS.md](PRODUCT_BLINDSPOTS.md) — риски и грабли (⚠️ частично под старую модель)
- [.claude/rules/](.claude/rules/) — детальные правила работы AI-агентов

## Структура

```
xtrud/
├── app/                     # Expo Router — экраны и роуты
│   ├── (auth)/              # auth-flow (phone, verify)
│   ├── (tabs)/              # основная навигация после логина
│   ├── _layout.tsx          # root layout
│   ├── +html.tsx            # web-only HTML shell с viewport+theme guard
│   └── index.tsx
├── src/
│   ├── features/            # фичи по доменам (auth/, master/, client/, …)
│   ├── components/          # переиспользуемые UI-компоненты
│   ├── lib/                 # tokens, supabase client, утилиты
│   ├── hooks/
│   └── types/               # типы БД (генерируются из Supabase)
├── supabase/
│   ├── migrations/          # SQL миграции БД
│   ├── seed/                # сидинг данных (категории и т.д.)
│   └── functions/           # Edge Functions
├── infra/supabase/          # Beget self-host contract без secrets/runtime data
├── assets/images/           # иконки, splash
├── app.json                 # Expo конфиг
├── babel.config.js          # NativeWind preset
├── metro.config.js          # NativeWind transform
├── tailwind.config.ts       # design tokens (sprint 1.2)
├── biome.json               # линтер/форматтер
└── package.json
```

## Setup

```bash
# 1. Node 20.19.4 (см. .nvmrc), затем точная установка из lock-файла:
nvm use
npm ci

# 2. Создать .env.local из шаблона и заполнить Supabase ключи:
cp .env.example .env.local
# Открыть .env.local и вписать EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY.

# 3. Запустить dev:
npm run start         # Expo dev server (mobile), выбрать платформу из терминала
npm run ios           # iOS Simulator (нужен Xcode)
npm run android       # Android Emulator (нужен Android Studio)

# ⚠️ WEB: `npm run web` (expo start --web) СЛОМАН в SDK 54 (import.meta → белый
# экран). Для web используй watch-сборку:
npm run web:dev       # expo export + патч + serve dist → http://localhost:8082 (F5 для обновления)
npm run web:build:preview     # локальный export с demo=true
npm run web:build:production  # production export с demo=false, без deploy
# Примечание: AI-агенты запускают web ТОЛЬКО через Claude Preview MCP
# (preview_start name "xtrud-web"), не через Bash — см. .claude/rules/preview-rules.md.

# Проверки:
npm run typecheck     # tsc --noEmit
npm run check         # biome check (lint + format)
npm run format        # biome format --write
npm run tokens:check  # global.css синхронизирован с design tokens
npm run quality:check # полный локальный gate без сети и deploy
npm run release:check # quality + npm advisory gate + production export
```

## Конфигурация Supabase

Текущий Cloud-проект: `wgeimsajvjkzrrnfrnkb`. Целевой backend — официальный
self-hosted Supabase на отдельном Beget VPS с собственным hostname
`https://api.xtrud.pro`. До production cutover Cloud остаётся source of truth.

URL и публикуемый ключ — в `.env.local` (gitignored), шаблон — `.env.example`.

Миграции: `supabase/migrations/`. Текущая цепочка не является полным снимком
production, поэтому `supabase db push` нельзя использовать для переноса. Порядок
backup/rehearsal/cutover — только по `docs/SUPABASE_BEGET_MIGRATION.md`.
