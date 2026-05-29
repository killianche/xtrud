# xtrud

Маркетплейс услуг (мастера ↔ клиенты) для Республики Ингушетия. Web-сайт + iOS + Android в одной кодовой базе.

## Стек

- **Frontend:** Expo SDK 54 + Expo Router v6 — единая кодовая база для web / iOS / Android
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Стили:** NativeWind v4 (Tailwind для RN+web), тёмная тема через class strategy
- **State:** Zustand (клиент) + TanStack Query (сервер)
- **Формы:** React Hook Form + Zod
- **Шрифт:** системный (SF Pro / Segoe / Roboto) — Geist/Inter убраны 2026-05-23
- **Иконки:** Phosphor (`phosphor-react-native`); Lucide — legacy, в новом коде не использовать
- **Отслеживание сбоев:** Sentry (`src/lib/sentry.ts`, активен при `EXPO_PUBLIC_SENTRY_DSN`)
- **Lint/format:** Biome 2.x
- **Деплой:** web → `bash deploy/web.sh` (сборка `scripts/build-web-local.mjs` → VPS, https://xtrud.alanbani.ru/). Mobile (EAS Build) — позже.

## Документация

- [CLAUDE.md](CLAUDE.md) — точка входа для AI-агентов: контекст, правила инфры и **«🧭 Актуальная модель продукта»** (что есть / чего нет)
- [STATUS.md](STATUS.md) — текущее состояние (снимок вверху), история решений
- [docs/SIMPLE_FLOW.md](docs/SIMPLE_FLOW.md) — текущая модель (classifieds: отклик + звонок/WhatsApp, без чата/lifecycle)
- [PROJECT_MAP.md](PROJECT_MAP.md) — функциональная карта (⚠️ концепт-видение, часть удалена — см. CLAUDE.md)
- [DESIGN.md](DESIGN.md) — дизайн-система: токены, цвета, типографика
- [UI_PATTERNS.md](UI_PATTERNS.md) — кук-бук экранов (читать перед версткой)
- [CROSS_PLATFORM_RULES.md](CROSS_PLATFORM_RULES.md) — правила одинакового UI на iOS/Android/web
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
# 1. Установить зависимости (если ещё не):
npm install

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
npm run web:build     # одноразовая prod-сборка в dist/
# Примечание: AI-агенты запускают web ТОЛЬКО через Claude Preview MCP
# (preview_start name "xtrud-web"), не через Bash — см. .claude/rules/preview-rules.md.

# Проверки:
npm run typecheck     # tsc --noEmit
npm run check         # biome check (lint + format)
npm run format        # biome format --write
```

## Конфигурация Supabase

Проект Supabase: `wgeimsajvjkzrrnfrnkb` (eu-central-1, Free tier).

URL и публикуемый ключ — в `.env.local` (gitignored), шаблон — `.env.example`.

Миграции: `supabase/migrations/`. Применять через Supabase MCP или `supabase db push` (если установлен CLI).
