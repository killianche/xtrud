---
name: Технический стек проекта xtrud
description: Expo SDK 52+ universal app (iOS/Android/web одна кодовая база) + Supabase backend
type: project
---

Пользователь выбрал стек для маркетплейса xtrud (предположительно, может меняться):

**Frontend:** Expo SDK 52+ universal app — один React-проект на iOS, Android и web.
- Роутинг: Expo Router v4 (file-based, SSR/static для SEO)
- Язык: TypeScript strict
- Стили: NativeWind (Tailwind для RN+web). Альтернатива на столе: Tamagui.
- Темы: системная + ручной свитчер через `useColorScheme` + Tailwind `dark:`
- State клиент: Zustand
- State сервер: TanStack Query
- Формы: React Hook Form + Zod
- Анимации: Reanimated 3
- Иконки: lucide-react-native
- Линт: Biome (или ESLint+Prettier)

**Backend:** Supabase
- SDK: `@supabase/supabase-js` + `@supabase/ssr`
- Миграции в `supabase/migrations/`, edge functions в `supabase/functions/`
- Типы БД генерируются в `types/database.ts`

**Тесты:** Vitest unit + Maestro E2E mobile + Playwright E2E web (не с первого дня).

**CI/CD:** GitHub Actions; EAS Build + Submit для mobile; Vercel или Cloudflare Pages для web.

**Структура** (предположительная):
```
xtrud/
├── app/                  # Expo Router — экраны
│   ├── (auth)/
│   ├── (tabs)/
│   └── _layout.tsx
├── components/
├── lib/supabase.ts
├── hooks/
├── types/database.ts
├── supabase/migrations/
├── supabase/functions/
└── assets/
```

**Известная проблема пользователя:** в прошлом проекте при сборке web+mobile из одной кодовой базы дизайн на iOS получался очень мелким и нерабочим. Это типичная проблема react-native-web → mobile (density/scaling/safe-areas). Решение собирается в отдельном документе CROSS_PLATFORM_RULES.md.

**Why:** Минимум кода, одна команда поддерживает все 3 платформы. EAS позволяет не иметь Mac для каждого билда.

**How to apply:** При обсуждении любых UI/UX решений учитывать, что компонент должен работать одинаково на iOS, Android и в браузере. Стили — всегда через NativeWind tokens, никаких raw RN StyleSheet с pixel-значениями без обоснования.
