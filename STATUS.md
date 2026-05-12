# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

---

## Текущее состояние

**Sprint 8 в работе.** Закрыты 8.1–8.4 — фото-инфра, аватары/портфолио, публичная страница мастера, двунаправленный рейтинг. Полный цикл reputation: клиент оценивает мастера (`rating_overall_avg` в master_profiles), мастер оценивает клиента (`rating_as_client_avg` в users) — оба пересчитываются одним trigger'ом по `direction`. В UI: в шапке заказа теперь Avatar + рейтинг клиента (видно мастерам), а под секцией «Заказ выполнен» появляется форма «Оцените клиента» для picked_master.

**База:** 16 миграций, 14 таблиц с RLS + 2 Storage bucket, 4 RPC, 8 trigger functions, 17 enums.

**Дальше в sprint 8:** 8.5 (order edit) → 8.6 (Expo Push) → 8.7 (фото категорий) → 8.8 (EAS dev-build).

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

### Sprint 8 (photo infra + master profile public view + dual reviews)
- [x] **2026-05-12** — **8.4** Двунаправленный рейтинг master↔client (commit pending): migration 0016 — `recalc_master_rating` trigger function переписана с IF v_direction = 'client_to_master' / 'master_to_client'. Теперь обе стороны автоматически пересчитываются (master_profiles или users.rating_as_client_*). UI: новая `MasterReviewSection` — клон ClientReviewSection с direction='master_to_client' и текстами «Оцените клиента» / «Каким был клиент? Корректно ли описал задачу, оплатил вовремя?». Отображается под CompletionSection при `!isOwner && isMasterRole && status='completed' && picked_master_id===userId`. `OrderDetail` тип расширен — `client` JOIN теперь включает `avatar_url`, `rating_as_client_avg`, `rating_as_client_count`. В OrderInfoBlock пере-сделан блок «Заказчик» — теперь Avatar (sm) + имя + Star-рейтинг (если есть отзывы). Мастер до отклика видит репутацию клиента, как у Profi.
- [x] **2026-05-12** — **8.3** Master public view `/master/[id]` (commit `0916da1`): новый экран `app/(tabs)/master/[id].tsx` (скрыт из таб-бара через `href:null`). Структура Profi/Thumbtack-style: hero (Avatar xl + имя + Role pill + Активен-badge + рейтинг с count + город) → stats chips (опыт, радиус, инструмент, транспорт) → bio → categories chips → portfolio grid (reuse `PortfolioGrid` без onDelete) → reviews list (Avatar sm автора, ★★★★★ строка + l2 категория, дата, текст). `src/features/master-view/use-master-public.ts`: `useMasterPublicProfile` (3 запроса users+master_profiles+cities), `useMasterCategoriesPublic` (JOIN на L2), `useReviewsForTarget(targetId, direction)` (JOIN author + l2, status='visible', desc 50). Корректные ru-склонения для отзывов/заказов/лет. Интеграция тапов: имя мастера в `ClientResponseRow` → push `/master/{master_id}`, шапка чата (если собеседник-мастер) → `/master/{chat.master_id}`. Линки accent-цветом для discoverability.
- [x] **2026-05-12** — **8.2** Avatar + portfolio_items + /profile экран (commit `a757cf7`): migration 0015 — `portfolio_items` (id, master_id, url, storage_path, width, height, caption, sort_order, created_at, updated_at) с RLS (read public, owner-only writes) + trigger `check_portfolio_items_limit` (≤12) + индекс `(master_id, sort_order, created_at)`. Также length-CHECK на `users.avatar_url` (≤500, поле было в 0001). `src/features/profile/`: `use-my-portfolio` (read/add/delete + storage cleanup), `use-update-my-avatar` (full pipeline pick→upload→UPDATE→invalidate userRecord), `PortfolioGrid` (3-col grid с onDelete/onOpen, expo-image transition 150ms). Новый экран `app/(tabs)/profile.tsx` (скрыт из таб-бара через `href:null`): hero c аватаром (xl, edit-overlay, «убрать фото»), имя + role-pill + рейтинг (Star если есть отзывы) + город; master-only — ссылка на категории + portfolio-section с counter `n/12` и Add CTA с loading-state; «Выйти» внизу с confirm-Alert. Шапка Главной: avatar-кнопка (md) вместо LogOut → переход на /profile. TS типы регенерированы (portfolio_items появилась). Advisor: 0 новых lints.
- [x] **2026-05-12** — **8.1** Photo infrastructure (commit `4e80f27`): migrations 0013 + 0014 — Storage buckets `avatars` (public, ≤2MB) и `portfolio` (public, ≤5MB) с RLS на `storage.objects`. Folder structure `{user_id}/...`. SELECT-policy узкий — листинг только своей папки (advisor lint 0025 `public_bucket_allows_listing` устранён). Чтение public-объектов идёт через прямой URL `/storage/v1/object/public/{bucket}/{path}`, RLS не вмешивается. `expo-image-picker` 17.0.11 поставлен, permissions в app.json (фото + камера, ru-копирайт). `src/lib/image-upload.ts`: AVATAR_PRESET 512px q0.82 jpeg / PORTFOLIO_PRESET 1600px q0.85 jpeg, `pickImage(aspect, title)` единая точка с Alert-actionsheet «Камера / Галерея / Отмена», `resizeImage` через ImageManipulator, `uploadImage` через ArrayBuffer (fetch().arrayBuffer()) — RN-safe против FormData bugs. Public URL отдаётся с `?v=<timestamp>` cache-bust. `useUploadAvatar(userId)` / `useUploadPortfolioImage(userId)` mutations — pick+resize+upload, БЕЗ обновления доменных таблиц (это уйдёт в 8.2). `Avatar` компонент: 5 размеров xs/sm/md/lg/xl, expo-image с transition 150ms, инициалы-fallback с детерминированной 8-цветовой пастельной палитрой (slate-800 текст, AA-контраст).

### Sprint 7 (chat + reviews + completion = E2E lifecycle)
- [x] **2026-05-12** — **7.1** Migration 0011 chats + messages (commit `ebc4989`): tables `chats` (UNIQUE order_id, client_id + master_id) и `messages` (chat_id FK, sender_id, text 1-4000). 4 indexes. RLS: только участники. Trigger update_chat_last_message при INSERT message. **Расширен accept_response RPC** — теперь INSERT в chats ON CONFLICT DO NOTHING. ALTER PUBLICATION supabase_realtime — подписка на messages и chats для live-обновлений.
- [x] **2026-05-12** — **7.2** Chat UI + Realtime (commit `5450e31`): hooks `useMyChats` (JOIN orders + users партнёр), `useChatMessages` + `useRealtimeChatMessages` (Supabase Realtime channel `chat:{id}` с postgres_changes INSERT, setQueryData с dedup), `useSendMessage`. Screens: `chats/index.tsx` (список с аватаром-инициалом + последняя активность), `chats/[id].tsx` (thread с MessageBubble, автоскролл, KeyboardAvoidingView, Send button с conditional disable). Bottom-tab «Чаты» добавлен.
- [x] **2026-05-12** — **7.3** Reviews + order completion (commit `3c431e1`): migration 0012 — reviews table (UNIQUE order+author, rating 1-5 CHECK, status enum), trigger `recalc_master_rating` авто-обновляет `master_profiles.rating_overall_avg/count` после INSERT/UPDATE/DELETE отзыва. Новая policy `orders_picked_master_can_complete` (picked_master может сменить `in_progress`→`completed`). UI: CompletionSection (success-button «Работа выполнена» обеим сторонам), ClientReviewSection (5 интерактивных звёзд + multiline text, после submit — read-only display).

### Sprint 6 (accept-loop + master 3-tab orders)
- [x] **2026-05-12** — **6.1+6.2** accept_response RPC + UI (commit `3b639f2`): migration 0010 — RPC `accept_response(p_response_id)` SECURITY INVOKER. Атомарно UPDATE'ит выбранный response=accepted, остальные sent/viewed=rejected, order=in_progress+picked_master_id. Проверки: auth.uid()=order.client_id, status='open'. Advisor 0 lints. UI: `useAcceptResponse` mutation + `ClientResponsesSection` с условной кнопкой «Принять отклик» (если order.status=open и response.status=sent), success-border для picked мастера, info-banner если другой выбран. MasterResponseSection теперь знает picked_master_id и orderStatus: показывает «Клиент выбрал вас 🎉» (success вариант) или «Клиент уже выбрал мастера» (read-only).
- [x] **2026-05-12** — **6.3** Master 3-tab orders (commit `326a0c2`): pill-табы (как RoleSwitcher pattern) с count-бейджами. Tabs «Новые», «Я откликнулся», «Меня выбрали». Новые hooks: `useMyResponses` (JOIN orders+L2+city за один запрос), `useOrdersAssignedToMe` (orders WHERE picked_master_id=me). Фильтрация «Новые»=feed-кроме-orderIds-где-я-откликнулся (client-side через Set). Каждый таб: NewOrdersTab/RespondedTab/AssignedTab с EmptyCard переиспользуемым компонентом. SafetyBanner отображается над контентом всех табов.

### Sprint 5 (orders + responses, E2E маркетплейса)
- [x] **2026-05-12** — **5.1** Migration 0009 orders + order_responses (commit `3859a6c`): 2 таблицы + 6 enums (urgency, budget_mode, executor_type, contact_mode, order_status, response_status). orders: title (5-120) + description (10-2000) с length CHECK, budget_min/max + budget_mode, picked_master_id paired with status constraint, responses_count cached + auto-increment trigger, expires_at +30 days. order_responses: UNIQUE(order_id, master_id), price_mode, message (10-1000), status enum. Trigger check_response_not_self (мастер не откликается на свой заказ) и update_order_responses_count. RLS: orders SELECT={open|in_progress|completed|own|picked}, owner-only INSERT/UPDATE/DELETE; responses SELECT=participants (master или client). Advisor 0 lints.
- [x] **2026-05-12** — **5.2** Client orders tab + create-order (commit `5ebc19c`): новая вкладка `ClipboardList`. Hooks: `useMyOrders` (JOIN на L2 и cities), `useCreateOrder` (insert). `OrderRow` компонент (tag-chip → title → meta с timeAgo и responsesLabel склонениями). `new.tsx` screen: категория pills, title, description multiline, city pills, district, urgency 4 pills, budget с 3 pills (exact/range/negotiable) и conditional min/max. FAB-style «Создать заказ» с safe-area.
- [x] **2026-05-12** — **5.3** Master orders feed (commit `6ca76ed`): `useMasterFeed({userId, l2Ids})` — WHERE status='open' AND l2_id IN master's categories AND client_id != userId. Master view в `/(tabs)/orders/index.tsx`: SafetyBanner + список или CTA «Сначала добавьте категории» если 0 L2 / empty state «Пока нет заявок».
- [x] **2026-05-12** — **5.4** Order detail + response flow (commit `ff0b969`): динамический роут `[id].tsx`. Hooks: `useOrderDetail` (JOIN L2+city+client), `useOrderResponses` (для owner), `useMyResponseForOrder` (для master), `useSubmitResponse`. Branching: OrderInfoBlock для всех + ClientResponsesSection для owner + MasterResponseSection для master (форма или статус существующего отклика). Intl.NumberFormat ru-RU для цен.

### Sprint 4 (master categories + master view)
- [x] **2026-05-11** — **4.1** Migration 0007 master_categories (commit `526bad4`): many-to-many master↔L2 таблица с pricing_mode enum, l3_ids text[], JSONB pricing/attributes, UNIQUE(master_id, l2_id). Triggers: updated_at + check_master_categories_limit (max 5 на мастера, RAISE EXCEPTION при превышении). RLS: read public, write owner-only. 4 индекса (master_id, l2_id, composite l2_id+rating DESC, GIN attributes). Advisor 0 lints.
- [x] **2026-05-11** — **4.2** Master categories selection (commit `8bb8d08`): migration 0008 — RPC `set_master_categories(text[])` SECURITY INVOKER для атомарной DELETE-not-in + INSERT-new синхронизации. Экран `/(onboarding)/master-categories.tsx` с многосекционным списком 26 visible L2, локальный Set<string> selected, disable остальных при достижении 5, sticky bottom CTA "Сохранить", router.back() после save. `useMyMasterCategories` (с JOIN на L2 в одном запросе) + `useSetMasterCategories` mutation.
- [x] **2026-05-11** — **4.3** Master home view + SafetyBanner (commit `37840c9`): branching контента главной по `active_role`. `MasterHomeContent` секции: SafetyBanner («Без аванса и эскроу») → «Ваши категории» (CTA-карточка если 0 / pill-чипы + edit-link если есть) → empty state «Заявок пока нет» с Inbox иконкой. `ClientHomeContent` извлечён как inner component, рендерит каталог как было. SafetyBanner — переиспользуемый компонент (ShieldAlert в warning-soft кружке).

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

## Что дальше (Sprint 8 — остаток)

1. (next) **8.5 Order edit для client'а** — UI редактирования заказа со `status='open'`. Поля: title, description, urgency, budget, district. После accept (status='in_progress') редактирование запрещено через RLS (orders_update_own работает только пока owner). Будет переиспользовать new.tsx форму через extraction в shared компонент.
3. **8.4 Master→client review** — расширить UI на `direction='master_to_client'`. Добавить `users.rating_avg numeric(2,1)` + trigger пересчёта. На странице клиента (отдельная задача) показывать его рейтинг.
4. **8.5 Order edit для client'а** — UI редактирования заказа со `status='open'`. Reuse new.tsx логику.
5. **8.6 Push-уведомления** — Expo Push для «новый отклик», «вас выбрали», «новое сообщение». DB trigger создаёт notifications row → edge function рассылает push.
6. **8.7 Атмосферные фото категорий** — `categories_l1.cover_image_url` (уже Sprint 8.1 загружаем фото в Storage, добавим в seed admin bucket).
7. **8.8 EAS Build setup** — eas.json для dev-build на iOS/Android.

## Backlog (Sprint 9+)

- **Real phone OTP / Telegram Login** — заблокировано выбором SMS-провайдера (Twilio/MessageBird/Smsc.ru) либо Telegram Login Widget (бесплатно). Уберёт advisor warnings про anonymous policies.
- **Outcome tracking modal** — «Беру заказ / Не договорились» через 7/14/30 дней (Яндекс паттерн).
- **Test runner** — Vitest unit + Maestro E2E.
- **Дашборд клиента** — публичная карточка клиента с рейтингом и историей отзывов (зависит от 8.4).

---

## Блокеры

- ⏳ **Anonymous Sign-Ins disabled в Supabase Dashboard** — критично для тестирования sprint 1.6 auth-flow. Включается одним тогглом, MCP не предоставляет (только UI).
- ⏳ **Реальный SMS-провайдер для OTP** — sprint 2, потребует регистрации и оплаты у Twilio/MessageBird/Smsc.ru. Альтернативы: Telegram Login Widget (бесплатно).

---

## История ключевых решений

### 2026-05-12 — Sprint 8.4: один trigger function для обеих направлений рейтинга
**Выбрано:** одна функция `recalc_master_rating` с условием `IF v_direction = 'client_to_master' THEN UPDATE master_profiles ELSIF 'master_to_client' THEN UPDATE users`.

**Альтернатива (отброшена):** отдельный trigger function `recalc_client_rating` для другого направления. Тогда `reviews_recalc` стал бы парой триггеров с условиями. Это размывает ответственность — пересчёт идёт по одной таблице `reviews`, branch по direction логически живёт в одном месте.

**Trade-off:** имя `recalc_master_rating` теперь technically inaccurate (тоже clients), но переименование сломало бы immutable migration history. Comment обновили.

### 2026-05-12 — Sprint 8.4: рейтинг клиента в шапке заказа (не отдельный экран)
**Выбрано:** показывать `rating_as_client_avg/count` маленьким Star-чипом рядом с именем клиента в OrderInfoBlock.

**Альтернатива (отброшена):** отдельная публичная страница `/client/[id]`. Профиль клиента — это не «выставка работ», как у мастера. Клиенту нет смысла иметь портфолио / категории / bio. Полезный сигнал — рейтинг + число завершённых заказов. Это укладывается в один inline-чип.

**Trade-off:** мастер не может тапнуть имя клиента и посмотреть его историю заказов. Если соберём фидбэк что нужно — добавим в Sprint 9.

### 2026-05-12 — Sprint 8.2: единый `users.avatar_url` (а не `master_profiles.avatar_url`)
**Выбрано:** аватар хранится в `public.users.avatar_url` — общее поле для клиентов и мастеров.

**Альтернатива (отброшена):** разделить — клиент в `users_private.avatar_url`, мастер в `master_profiles.avatar_url`. Это даёт два пути загрузки, две зоны RLS, дублирование Avatar-логики во всех местах где показывается участник (OrderRow, chat, response, master public view).

**Бонус:** колонка уже существовала в 0001 (создана изначально как nullable для future-use), просто не использовалась — теперь добавили length-CHECK и подключили в UI.

### 2026-05-12 — Sprint 8.2: portfolio лимит 12 через DB trigger
**Выбрано:** trigger `check_portfolio_items_limit` BEFORE INSERT RAISE при COUNT≥12.

**Альтернатива (отброшена):** только клиентская проверка перед mutate. Это легко обходится прямым PostgREST-запросом или race-condition с двумя устройствами.

**Trade-off:** trigger делает дополнительный SELECT на каждый INSERT. На 12-row scope это микросекунды, для лимита целостности приемлемо.

### 2026-05-12 — Sprint 8.2: /profile экран один для клиента и мастера
**Выбрано:** единый `app/(tabs)/profile.tsx` (скрытый из таб-бара через `href:null`) с условным рендером portfolio-секции по `user.is_master`.

**Альтернатива (отброшена):** два отдельных экрана `/client-profile` и `/master-profile`. Дублирование top-bar, avatar-секции, sign-out — без выигрыша. Условные секции дёшево и легко читать.

**Trade-off:** при смене active_role через RoleSwitcher экран не реагирует — мастер всегда видит portfolio-секцию (показывается по `is_master=true`, а не по active_role). Это правильно: portfolio — это атрибут мастер-стороны, который существует пока is_master.

### 2026-05-12 — Sprint 8.2: storage cleanup при удалении portfolio_item — best-effort
**Выбрано:** `useDeletePortfolioItem` делает DELETE из БД, потом `try/catch` storage.remove. Storage-ошибка не пропагируется наружу.

**Обоснование:** UI важнее всего показать «удалено». Если файл осиротеет в bucket — это проблема стоимости хранения, а не данных. Periodic cleanup job (sprint 9+) подберёт осиротевшие файлы по diff `storage.list` vs `portfolio_items.storage_path`.

### 2026-05-12 — Sprint 8.1: public-buckets без broad SELECT policy
**Выбрано:** для `avatars` и `portfolio` SELECT policy узкая — только своя папка. Чтение объектов клиентами идёт через прямой public URL `/storage/v1/object/public/{bucket}/{path}`, который обслуживается storage-сервисом БЕЗ обращения к RLS (так устроены public buckets в Supabase).

**Альтернатива (отброшена):** broad `USING (bucket_id = '...')` SELECT. Advisor lint 0025 `public_bucket_allows_listing` — даёт анонимам право листать всю папку bucket и читать любой объект по пути, что раскрывает user_id всех мастеров. Public bucket уже даёт чтение по URL без RLS — broad SELECT избыточен и опасен.

**Trade-off:** `supabase.storage.list()` для bucket-листинга работает только в собственной папке пользователя. Для admin-сценариев в будущем понадобится service_role.

### 2026-05-12 — Sprint 8.1: upload через ArrayBuffer, не FormData/Blob
**Выбрано:** `fetch(localUri).then(r => r.arrayBuffer())` → передача ArrayBuffer в `supabase.storage.upload`.

**Альтернатива (отброшена):** FormData с `{ uri, type, name }` либо `fetch().blob()`. В React Native эти подходы исторически глючат — blob иногда возвращает 0 байт, FormData кривит multipart boundary. Supabase-docs прямо рекомендуют ArrayBuffer для RN.

### 2026-05-12 — Sprint 8.1: client-side resize обязателен, не отложен на edge function
**Выбрано:** resize на клиенте через expo-image-manipulator до upload (avatar 512px q0.82 / portfolio 1600px q0.85 jpeg).

**Альтернатива (отброшена):** грузить оригинал → Supabase Image Transformations (pro feature) или edge function ресайз. Это (1) платная фича, (2) каждый просмотр триггерит transformation = доп стоимость, (3) клиентский upload оригинала 5MB+ съедает мобильный трафик на ~10× больше.

**Trade-off:** теряем доступ к оригиналу для будущих ремастеров. Считаю это приемлемым — портфолио-фото не печатают в типографии.

### 2026-05-12 — Sprint 7.1: чат автоматически создаётся в accept_response RPC
**Выбрано:** при принятии отклика мастера RPC сразу создаёт chats row (INSERT ON CONFLICT DO NOTHING). Не нужен отдельный шаг «начать чат».

**Обоснование:** двусторонний акт принятия = старт коммуникации. UX-логично сразу показать чат обоим. Альтернатива (создавать чат лениво при первом сообщении) добавляла бы пустые состояния и race conditions.

### 2026-05-12 — Sprint 7.2: Realtime подписка только на INSERT, не SELECT
**Выбрано:** подписка через `postgres_changes` event=INSERT с фильтром `chat_id=eq.X`, новые сообщения добавляются в TanStack Query cache через setQueryData с dedup по id.

**Альтернатива (отброшена):** перезагружать messages через `invalidateQueries` при каждом Realtime событии. Это вызывает full refetch — лишний трафик.

**Trade-off:** UPDATE/DELETE сообщений не покрываются. Для sprint 7 это OK (нет редактирования). Sprint 8+ добавим UPDATE подписку если понадобится edit/delete.

### 2026-05-12 — Sprint 7.3: master rating через DB trigger вместо edge function
**Выбрано:** `recalc_master_rating` trigger в plpgsql AFTER INSERT/UPDATE/DELETE на reviews. Пересчёт AVG/COUNT, UPDATE master_profiles.

**Альтернатива (отброшена):** Edge Function с подпиской на изменения reviews. Дороже (network roundtrip), не атомарно, требует логики retry.

**Bonus:** trigger корректно обрабатывает DELETE/UPDATE отзывов — рейтинг автоматически пересчитывается.

### 2026-05-12 — Sprint 7.3: master→client review отложен в sprint 8
**Выбрано:** В sprint 7 только direction='client_to_master'. Master-to-client поле есть в enum, но UI и flow не реализованы.

**Обоснование:** двунаправленный рейтинг (мастер тоже оценивает клиента) — отдельная UX-проблема: где master её оставляет, как клиент видит свою репутацию, нужно ли скрывать от других мастеров и т.д. Лучше сделать качественно в sprint 8 чем поспешно сейчас.

### 2026-05-12 — Sprint 6.1: accept_response — атомарное reject остальных откликов
**Выбрано:** при accept одного отклика, остальные открытые (status IN sent/viewed) автоматически становятся rejected внутри одного RPC.

**Альтернатива (отброшена):** оставить остальные в status='sent', никого не отклонять явно. Master тогда не понимает что произошло — заказ просто пропал из ленты «Новые», но статус его отклика остался «sent» (ввдящее в заблуждение).

**Обоснование:** explicit rejection даёт masterу понятную ux-обратную связь — он видит status «rejected» с надписью «Клиент выбрал другого мастера». Это вежливо и понятно. Аналогичный паттерн используют Profi.ru, Thumbtack.

### 2026-05-12 — Sprint 6.3: master 3-tab вместо top-tabs navigator
**Выбрано:** простые pill-табы внутри single screen с conditional rendering. State хранится в useState.

**Альтернатива (отброшена):** установка `@react-navigation/material-top-tabs` библиотеки. Это даёт swipe gestures и nicer transitions, но добавляет дополнительную зависимость, layout shim, отдельный navigator.

**Trade-off:** pill-табы не дают swipe — меньше нативно для mobile. Но для 3 коротких списков заказов swipe не критичен; пользователь жмёт pills. Если в sprint 7+ окажется, что swipe заметно влияет на UX — перейдём на material-top-tabs.

### 2026-05-12 — Sprint 5: orders без PostGIS/address_exact/attributes JSONB на старте
**Выбрано:** минимальные orders + order_responses таблицы без geo_point, address_exact, gender_filter, requires_tags, is_anonymous, attributes JSONB.

**Обоснование:** PostGIS требует extension setup + конвертация address→coords (Geocoding API, платный). attributes JSONB требует metadata table category_fields с UI рендерингом форм. Эти усложнения добавим в sprint 6+ когда базовый E2E цикл orders подтвердит свою ценность.

**Sprint 6+ план:** добавить эти поля как ALTER TABLE, без миграций существующих строк (новые поля nullable).

### 2026-05-12 — Sprint 5.3: master feed без city/radius фильтрации в первой итерации
**Выбрано:** match только по l2_id (категории), не по city + service_radius.

**Обоснование:** В Ингушетии 5 городов на радиусе ~50 км — большинство мастеров логично работают по всему региону. City-фильтр на 5 городах добавит UI complexity без значимой пользы. Когда расширимся в другие регионы — добавим.

### 2026-05-11 — Sprint 4: применены 3 UX-паттерна из Яндекс Исполнители
**Что взято:**
1. **SafetyBanner** — «Без аванса и эскроу. Не переходите в сторонние мессенджеры». Защита от типового фрода. AUDIT.md риск №1.
2. **Profile completion CTA** — карточка «Добавьте категории» с правой accent-кнопкой Plus, если master_categories пуста.
3. **3-таб структура orders** — Новые / Я откликнулся / Меня пригласили. Заложено в backlog sprint 5, реализуется когда будет orders table.

**Что НЕ взято:**
- Промо-карточки с яркими градиентами (Cal.com стиль монохром).
- Платный «безлимит откликов» 199₽/неделя — наш проект «бесплатно для всех» (memory/project_xtrud.md).
- «Подключить продвижение» CTA — у Яндекса платная подписка за топ выдачи, у нас другая модель.

**В backlog sprint 5+:**
- Outcome tracking modal после контакта (обязательная разметка беру/не_договорились).
- Daily response limits (как опция монетизации, если реклама не пойдёт — AUDIT.md риск №2).

### 2026-05-11 — Sprint 4.2: master_categories optional после wizard, а не обязательный шаг онбординга
**Выбрано:** master_profiles создаётся в wizard (sprint 3.3, RPC complete_master_onboarding), `onboarding_completed_at` ставится сразу. master_categories — пустые в первый момент, master сам добавляет через CTA «Добавьте категории» в master view.

**Альтернатива (отброшена):** включить категории в wizard как обязательный шаг 2/2. Усложняет flow, не позволяет master'у быстро попасть в приложение и посмотреть UI «как клиент».

**Trade-off:** мастер может оказаться в приложении без категорий → не получать заявки. Решено через явный CTA-баннер в master view, который объясняет необходимость категорий.

### 2026-05-11 — Sprint 4.2: RPC set_master_categories для diff-sync
**Выбрано:** атомарный RPC `set_master_categories(p_l2_ids text[])` — `DELETE WHERE l2_id != ALL(p_l2_ids)` + `INSERT ON CONFLICT DO NOTHING`.

**Обоснование:** UI-операция «сохранить выбор» концептуально — установка состояния (список категорий), не множество разрозненных insert/delete. Atomic transaction в плpgsql функции гарантирует консистентность даже при race condition. SECURITY INVOKER + проверка auth.uid() внутри — без нужды в DEFINER (RLS уже даёт права).

**Альтернатива (отброшена):** клиент делает DELETE all + INSERT new подряд. Не атомарно — если INSERT упадёт, у мастера 0 категорий и нужно восстанавливать вручную.

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
