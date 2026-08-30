# План подготовки к App Store (всё, что можно сделать до подключения SMS и до публикации)

**Контекст 2026-05-24:**
- Apple Developer аккаунт в процессе оформления.
- Способ авторизации (SMS / другое) ещё не выбран — Б1 (настоящий вход) откладываем В САМЫЙ КОНЕЦ.
- НЕ публикуем в стор. Готовим код и базу к моменту запуска.
- **Главный принцип: ничего не ломать. После каждого пункта — проверка tsc + при необходимости preview.**

## Что НЕ делаем СЕЙЧАС

- ❌ Подключение SMS / OTP / выбор провайдера (Б1) — в самом конце, перед публикацией.
- ❌ Sentry — нужен аккаунт + DSN, решим ближе к запуску.
- ❌ React Compiler — может конфликтовать с Reanimated, требует отдельного тестирования.
- ❌ TanStack Query `queryOptions` рефакторинг — большой surface, не критично.
- ❌ Biome auto-format на ВСЮ кодовую базу — может зацепить файлы соседней сессии.

---

## Phase 1 — Проверки (5–10 минут, нулевой риск)

- [ ] 1.1 AppDrawer.tsx — реально ли мёртвый код (0 импортов)?
- [ ] 1.2 Avatar.tsx vs ui/Avatar.tsx — настоящий дубликат или re-export?
- [ ] 1.3 EAS Secret `EXPO_PUBLIC_SUPABASE_ANON_KEY` в production
- [ ] 1.4 top_queries_7d MV — намеренно открыт для анонимов?
- [ ] 1.5 Список всех `_trg_*` функций — реально 21 как заявил аудитор?
- [ ] 1.6 7 RLS policies с не-кэшированным auth.uid() — выписать конкретные имена
- [ ] 1.7 30 дубль-политик RLS — выписать конкретные пары
- [ ] 1.8 10 FK без индексов — выписать конкретные FK

## Phase 2 — Безопасность БД (миграции, низкий риск — только ужесточение прав)

- [ ] 2.1 **Б2** REVOKE EXECUTE для триггерных функций `_trg_*` от anon/authenticated
- [ ] 2.2 **Б4** chat-images bucket — запретить листинг (LIST), оставить только GET object
- [ ] 2.3 Остальные SECURITY DEFINER функции — REVOKE EXECUTE от anon (где не нужно)
- [ ] 2.4 3 функции с mutable search_path — прописать `SET search_path = pg_catalog, public`
- [ ] 2.5 7 RLS-политик: `auth.uid()` → `(select auth.uid())` (производительность)
- [ ] 2.6 30 дублей политик — объединить пары в одну
- [ ] 2.7 10 FK без индексов — добавить индексы

## Phase 3 — UI улучшения (низкий риск, мелкие правки)

- [ ] 3.1 5 экранов: `<Image>` (React Native) → `expo-image`
  - `app/(tabs)/index.tsx`
  - `app/(tabs)/master-cases/[id].tsx`
  - `app/(tabs)/profile/services-suggest.tsx`
  - `app/(tabs)/profile/favorites.tsx`
  - `app/(tabs)/orders/category-select.tsx`
- [ ] 3.2 `FlashList` вместо `ScrollView` в `orders/search/index.tsx` (тут лента)
- [ ] 3.3 `FlashList` вместо `ScrollView` в `orders/index.tsx` (тут лента)

## Phase 4 — Чистка кода

- [ ] 4.1 Удалить `AppDrawer.tsx` (если 1.1 подтвердил мёртвый код)
- [ ] 4.2 Снести дубликат `Avatar.tsx` (если 1.2 подтвердил)
- [ ] 4.3 Удалить `console.log` / `console.warn` в новом коде (не во всём проекте — только наши файлы)

## Phase 5 — Не-кодовая подготовка к App Store (только зафиксировать TODO, не делать)

Эти пункты не делаем сами, но фиксируем как чек-лист владельцу:

- [ ] 5.1 Иконки приложения 1024×1024 для App Store
- [ ] 5.2 Скриншоты экранов (5 размеров iPhone)
- [ ] 5.3 Privacy policy URL — где хостить
- [ ] 5.4 Support URL (Telegram / WhatsApp — не email)
- [ ] 5.5 Описание приложения (RU)
- [ ] 5.6 Возрастной рейтинг, категория, ключевые слова

## Phase 6 — В день публикации (ВНЕ этого плана)

- Подключить выбранный SMS / OTP провайдер
- Заменить `signInAnonymouslyWithPhone` на реальный `signInWithOtp`
- Подключить Sentry с DSN
- EAS production build + submit

---

## Ход выполнения

### Phase 1 — Проверки (готово)
- ✅ 1.1 AppDrawer.tsx — 0 внешних импортов, только self-ссылка в комментарии. Удалить.
- ⏸ 1.2 Avatar.tsx vs ui/Avatar.tsx — оба файла РЕАЛЬНО используются (6+5 импортов разных). Дедуп нетривиальный (риск различий поведения). **Отложен**.
- ⏭ 1.3 EAS Secret — требует CLI с auth владельца. Передам владельцу как ручной чек.
- ⚠️ 1.4 top_queries_7d MV — существует, видимо намеренно открыт для лендинга. Перед запуском подтвердить с владельцем.
- ✅ 1.5 Триггерных функций с returns trigger — **9** (не 21, как утверждал аудит). 7 SECURITY DEFINER + 2 без него. Анону доступны 9 из 9.
- ✅ 1.6 RLS-политик с не-кэшированным auth.uid() — **7** (master_verifications × 4 + portfolio_cases × 3).
- ✅ 1.7 Дублирующих политик — **6 уникальных** конфликтов × 5 системных ролей = 30 строк advisor. Объединение требует ручного анализа каждой пары.
- ✅ 1.8 FK без индексов — **10**.

### Phase 2 — Безопасность БД
- ✅ 2.1 **Применена миграция** `revoke_anon_access_trigger_functions`: REVOKE EXECUTE для 10 триггерных функций от anon + authenticated.
- 🚫 2.2 chat-images bucket — bucket настроен как public=true с policy `chat_images_public_read` для роли `{-}` (все). Аналогично order-photos. **Отложен**: нужна архитектурная проработка (private bucket + signed URLs ИЛИ RLS-условие участников чата) и тестирование фронта чата. Высокий риск сломать сейчас.
- ✅ 2.3 **Применена миграция** `revoke_anon_access_user_rpcs`: REVOKE EXECUTE от anon для 9 RPC (confirm_work_done, get_master_phone, get_response_limit_today, reject_response, set_availability, set_master_service_areas, start_chat_with_master, touch_last_active, try_publish_master). Authenticated сохранён.
- ✅ N/A 2.4 search_path mutable — **0 функций**. Все SECURITY DEFINER уже имеют явный SET search_path. Пункт закрыт.
- ✅ 2.5 **Применена миграция** `cache_auth_uid_in_rls_policies`: 7 политик переписаны с `(select auth.uid())`. Advisor подтверждает: было 7 → стало 0.
- 🚫 2.6 30 дублей политик (6 уникальных конфликтов) — **отложен**: пары политик (например, `orders_owner_delete_own_drafts` vs `_history` vs `_open`) покрывают разные сценарии lifecycle. Объединение требует ручного разбора каждой и регрессионных тестов. На текущей нагрузке perf-impact незаметен.
- ✅ 2.7 **Применена миграция** `add_indexes_for_unindexed_foreign_keys`: 10 индексов созданы. Advisor подтверждает: было 10 → стало 0.

### Phase 3 — UI улучшения
- ✅ 3.1 expo-image на 5 экранах: `app/(tabs)/index.tsx` (2 места), `master-cases/[id].tsx`, `profile/services-suggest.tsx`, `profile/favorites.tsx`, `orders/category-select.tsx`. `resizeMode="cover"` → `contentFit="cover"`, добавлен `cachePolicy="memory-disk"`. tsc чист, preview главной рендерится корректно.
- 🚫 3.2 FlashList в orders/search/index.tsx — **отложен**: ScrollView → FlashList — это рефакторинг с переписыванием renderItem/keyExtractor + потенциальные edge cases (sticky filters bar, header, бесконечная пагинация). На текущей нагрузке (мало заказов) выгоды нет, риск сломать главный мастер-экран. Сделать перед запуском с регресс-тестами happy path.
- 🚫 3.3 FlashList в orders/index.tsx — **отложен** по той же причине что 3.2.

### Phase 4 — Чистка
- ✅ 4.1 `src/components/AppDrawer.tsx` удалён (`git rm`). 0 внешних импортов, dead code подтверждён. tsc чист.
- 🚫 4.2 Avatar duplicate — отложен (Phase 1.2 пояснение).
- ✅ 4.3 console.log/warn/debug в моих файлах (cases/index.tsx, cases/[caseId].tsx, cases/_layout.tsx, OwnerCaseDetailScreen.tsx) — **0 находок**. Чисто.

---

## Итоги первой части (2026-05-24)

**Применено 4 миграции БД** (production через Supabase MCP):
1. `revoke_anon_access_trigger_functions` — 10 trigger-функций недоступны через REST
2. `revoke_anon_access_user_rpcs` — 9 RPC недоступны анонимам
3. `cache_auth_uid_in_rls_policies` — 7 политик оптимизированы (advisor подтвердил 7→0)
4. `add_indexes_for_unindexed_foreign_keys` — 10 индексов созданы (advisor подтвердил 10→0)

**Код:**
- 5 экранов RN Image → expo-image (тяжёлый browser-image на web, кэш)
- AppDrawer dead code удалён (-433 строк)
- 0 console.log в свежем коде
- TypeScript: 0 ошибок

**Phase 2 (БД):** 4 миграции применены, **3 пункта отложены** (chat-images, 6 пар дубль-политик — каждое требует архитектурного решения и регресс-тестов).

**Что осталось до запуска:**
- Б1 SMS-вход (последним, после выбора провайдера)
- Sentry (когда DSN будет)
- chat-images bucket (важно перед публикацией — нужна архитектурная сессия)
- 6 пар дубль-политик (опционально, perf на сейчас не блокирует)
- FlashList для лент (опционально, нет реальной проблемы)
- Apple non-code (иконки, скриншоты, privacy URL — задача владельца)
