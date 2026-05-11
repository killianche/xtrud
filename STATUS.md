# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

---

## Текущее состояние

Инфраструктура развёрнута: GitHub-репо создан, Supabase-проект создан, env-файлы готовы, документация (правила, дизайн, project map) закоммичена. Готовы скаффолдить Expo-приложение. Ждём явного «старт».

---

## Инфра

| Ресурс | Значение |
|---|---|
| GitHub | https://github.com/killianche/xtrud (private, ssh, branch `main`) |
| Supabase project ref | `wgeimsajvjkzrrnfrnkb` |
| Supabase URL | https://wgeimsajvjkzrrnfrnkb.supabase.co |
| Supabase region | eu-central-1 (Frankfurt) |
| Supabase organization | Madinah_magazaurov |
| Supabase plan | Free (0$/мес) |
| Env-ключи | в `.env.local` (gitignored), шаблон в `.env.example` |

---

## Что готово

- [x] **2026-05-11** — [CLAUDE.md](CLAUDE.md) переработан (120 строк вместо 534)
- [x] **2026-05-11** — [.claude/rules/working-rules.md](.claude/rules/working-rules.md) — базовые правила работы AI с автозагрузкой
- [x] **2026-05-11** — выбран стек: Expo universal + Supabase
- [x] **2026-05-11** — `.gitignore` с покрытием Expo/RN/iOS/Android/Node/Next/secrets/memory
- [x] **2026-05-11** — Supabase-проект `xtrud` создан, ключи получены, записаны в `.env.local`
- [x] **2026-05-11** — git инициализирован, первый коммит сделан, репо запушен на GitHub
- [x] **2026-05-11** — закоммичены документы от параллельного агента: `PROJECT_MAP.md`, `DESIGN_SYSTEM.md`, `CROSS_PLATFORM_RULES.md`, `DESIGN_REFERENCE_CALCOM.md`

---

## В работе сейчас

Ничего активного. Готовы к старту кодинга.

---

## Что дальше (приоритет)

1. **Изучить `PROJECT_MAP.md` + `DESIGN_SYSTEM.md` + `CROSS_PLATFORM_RULES.md`** — понять, что зафиксировал второй агент, и сверить с нашими решениями (например, выбор стека). Если есть конфликты — обсудить с пользователем.
2. **Скаффолд Expo-приложения** — `npx create-expo-app@latest . --template`, выбрать blank-typescript, добавить Expo Router, NativeWind, `@supabase/supabase-js`
3. **Базовый Supabase-клиент** — `lib/supabase.ts` с использованием `EXPO_PUBLIC_*` переменных
4. **Базовая навигация + light/dark тема** — `useColorScheme` + Tailwind dark variants
5. **GitHub Actions** — workflow с typecheck + lint на каждый PR
6. **EAS-конфиг** — `eas.json` для будущих сборок iOS/Android
7. **Первые экраны по `PROJECT_MAP.md`** — после ревью документов второго агента

---

## Блокеры

- ⏳ **Свериться с документами второго агента** — могут быть конфликты с принятыми решениями (стек, дизайн). До этого не начинаем код.
- ⏳ **Дизайн от пользователя** — будет получен; пока есть `DESIGN_REFERENCE_CALCOM.md` как референс

---

## История ключевых решений

### 2026-05-11 — GitHub-репо: приватный

**Выбрано:** `killianche/xtrud` private.

**Обоснование:** на старте проекта нет смысла делать публичным; переключение private→public — одна команда `gh repo edit --visibility public --accept-visibility-change-consequences`. Обратный путь сложнее (форки/индексация уже могут существовать). Безопасный дефолт.

### 2026-05-11 — Supabase: регион eu-central-1, Free tier

**Выбрано:** Frankfurt, Free plan ($0/мес).

**Обоснование:** Frankfurt — географически близко к РФ/Европе, низкие задержки. Free tier даёт 500MB БД, 1GB Storage, 2GB трафика — хватит для MVP. Регион Supabase **нельзя сменить после создания** без миграции данных, поэтому решение зафиксировано осознанно.

### 2026-05-11 — Стек: Expo universal (web + iOS + Android в одной кодовой базе)

**Выбрано:** Expo SDK 52+ с Expo Router v4, NativeWind, Zustand, TanStack Query, React Hook Form + Zod, Supabase JS SDK, Reanimated 3.

**Деплой:** EAS Build/Submit для mobile, Vercel или Cloudflare Pages для web.

**Альтернативы рассмотрены:**
- **Monorepo Next.js + Expo раздельно** — отброшено: слишком много дублирующейся работы для маленькой команды; переключимся, если ТЗ покажет, что web — это контент-сайт с тяжёлым SEO/блогом
- **Flutter** — отброшено: другая экосистема, web-бандл тяжёлый, менее зрелая интеграция с Supabase
- **Чистый PWA** — отброшено: пользователь хочет нативные приложения в App Store + Play Store

**Условие пересмотра:** если документы второго агента или ТЗ покажут, что веб — это в основном маркетинговый сайт / контент с SEO-приоритетом, переходим на monorepo с Next.js.

### 2026-05-11 — Документация: разбита на короткий CLAUDE.md + детальные `.claude/rules/*.md`

**Выбрано:** короткая точка входа `CLAUDE.md` (~120 строк) + правила в `.claude/rules/working-rules.md` с `paths:` frontmatter для автозагрузки.

**Обоснование:** рекомендация best-practice репо — «keep CLAUDE.md under 200 lines for reliable adherence». Чем длиннее главный файл, тем хуже AI ему следует.
