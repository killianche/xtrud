# xtrud

Маркетплейс услуг (мастера ↔ клиенты) для Республики Ингушетия. Web-сайт + iOS + Android в одной кодовой базе.

## Стек

- **Frontend:** Expo SDK 54 + Expo Router v6 — единая кодовая база для web / iOS / Android
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Стили:** NativeWind v4 (Tailwind для RN+web), тёмная тема через class strategy
- **State:** Zustand (клиент) + TanStack Query (сервер)
- **Формы:** React Hook Form + Zod
- **Шрифт:** Inter (через `@expo-google-fonts/inter`)
- **Иконки:** lucide-react-native
- **Lint/format:** Biome 2.x
- **Деплой:** EAS Build (mobile), Vercel/Cloudflare Pages (web)

## Документация

- [CLAUDE.md](CLAUDE.md) — точка входа для AI-агентов, контекст проекта, правила инфры
- [STATUS.md](STATUS.md) — текущее состояние, очередь задач, история решений
- [PROJECT_MAP.md](PROJECT_MAP.md) — функциональная карта продукта
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — токены, компоненты, темы
- [CROSS_PLATFORM_RULES.md](CROSS_PLATFORM_RULES.md) — правила одинакового UI на iOS/Android/web
- [CATEGORIES_AND_PROFILES.md](CATEGORIES_AND_PROFILES.md) — таксономия, профили, схема БД
- [AUDIT.md](AUDIT.md) и [PRODUCT_BLINDSPOTS.md](PRODUCT_BLINDSPOTS.md) — риски и грабли
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
npm run start         # Expo dev server, выбрать платформу из терминала
npm run ios           # iOS Simulator (нужен Xcode)
npm run android       # Android Emulator (нужен Android Studio)
npm run web           # http://localhost:8081

# Проверки:
npm run typecheck     # tsc --noEmit
npm run check         # biome check (lint + format)
npm run format        # biome format --write
```

## Конфигурация Supabase

Проект Supabase: `wgeimsajvjkzrrnfrnkb` (eu-central-1, Free tier).

URL и публикуемый ключ — в `.env.local` (gitignored), шаблон — `.env.example`.

Миграции: `supabase/migrations/`. Применять через Supabase MCP или `supabase db push` (если установлен CLI).
