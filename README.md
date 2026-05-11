# xtrud

Web-сайт + iOS + Android приложение «2 в 1» в одной кодовой базе.

## Стек

- **Frontend:** Expo (React Native) + Expo Router — единая кодовая база для web / iOS / Android
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions)
- **Стили:** NativeWind (Tailwind для RN+web)
- **State:** Zustand + TanStack Query
- **Формы:** React Hook Form + Zod
- **Деплой:** EAS (mobile) + Vercel/Cloudflare Pages (web)

## Документация

- [CLAUDE.md](CLAUDE.md) — точка входа для AI-агентов, контекст проекта, правила инфры
- [STATUS.md](STATUS.md) — текущее состояние, очередь задач, история решений
- [.claude/rules/](.claude/rules/) — детальные правила работы

## Setup

Пока что только подготовительная фаза. Expo-скелет ещё не создан.

После создания скелета:

```bash
cp .env.example .env.local
# заполнить EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY значениями из дашборда Supabase
npm install
npx expo start
```
