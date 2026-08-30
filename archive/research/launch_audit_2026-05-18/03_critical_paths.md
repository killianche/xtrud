# Critical Path / E2E audit — 2026-05-18

**Метод:** static-аудит (preview tools заблокированы permission'ом). Все находки подтверждены через Read + Grep по коду и миграциям. Воспроизведение в браузере не проводилось.

---

## TL;DR

| Flow | Статус | Главный риск |
|---|---|---|
| 1. Регистрация клиента + первая заявка | ⚠️ | OTP — заглушка (любые 6 цифр). Push-уведомления мастерам при INSERT order **отсутствуют** (нет триггера). |
| 2. Регистрация мастера + onboarding профиля | ⚠️ | Service areas (`master_service_areas`) **не входят в onboarding** — выставляются только из `/profile/edit-master`. Прайс-лист (`services-suggest`) тоже вне визарда. Verification UI **не построен** (backend готов 0070, фронта нет). |
| 3. Мастер откликается на заявку | ✅ | Работает end-to-end: лимит 5/день, бейдж «Вы откликнулись», withdraw до accept. |
| 4. Клиент выбирает мастера + завершение работы | ✅ | Полный lifecycle (T3 → T8 → T5/T11) и «Прекратить сотрудничество» (T6t) реализованы. Auto-confirm cron живёт в 0075. |
| 5. Mutual reviews + рейтинг | ✅ | Обе стороны видят форму, trigger `recalc_master_rating` пересчитывает рейтинги в обе стороны (0016). Double-blind НЕ реализован (отзывы видны сразу). |

**Готовность happy paths к public launch: ~75-80%.** Lifecycle, отклики, отзывы — production-ready. Регистрация работает в dev-режиме (OTP-заглушка) и онбординг мастера фрагментирован: 4-шаговый визард не покрывает прайс-лист и зоны работы.

---

## Flow 1 — Регистрация клиента + первая заявка

**Статус:** ⚠️ работает с проблемами

**Звенья:**
- `app/(auth)/phone.tsx:44-54` — submit вызывает `useVerifyOtp` напрямую, минуя экран `/verify` (sprint 1 dev-mode).
- `src/features/auth/use-auth-mutations.ts:39-49` — `useVerifyOtp` вызывает `signInAnonymouslyWithPhone` без проверки OTP-кода.
- `src/lib/auth.ts` — для demo-номеров `+7 900 000-XX-XX` → email-логин `<digits>@xtrud-demo.local` с паролем `xtrud`; для прочих — анонимная сессия + UPDATE `users_private.phone`.
- AuthGate (не читал, но из STATUS.md): если `onboarding_completed_at IS NULL` → редирект на `/(onboarding)/role`.
- `app/(onboarding)/role.tsx:71-76` — для клиента вызывает `useCompleteOnboarding` → SET `is_master=false`, `active_role='client'`, `onboarding_completed_at=now()`. Дальше прямой переход на `/(tabs)`.
- `app/(tabs)/orders/new.tsx:108-141` — single-screen форма, поддерживает JIT-signup (анон публикует → bottom-sheet sign-up → publish). Persisted draft в Zustand (`order-draft-store`).
- `src/features/orders/use-create-order.ts:33-50` — простой `supabase.from("orders").insert(...)` с `status='open'`. RLS `orders_insert_own` проверяет `auth.uid() = client_id`.
- Success screen: `app/(tabs)/orders/new.tsx:151-193`.

**Найденные проблемы:**

1. **🔴 Нет push мастерам при создании order.** В `supabase/migrations/0018_push_triggers.sql` — только 3 push-trigger'а: `notify_new_message`, `notify_new_response` (к клиенту), `notify_order_accepted` (к picked-master). Триггер `AFTER INSERT ON public.orders` с рассылкой в master_categories отсутствует — grep подтверждает. Симптом: клиент создал заказ, мастера ничего не получают; находят его только сами через `/orders/search` (polling). Это блокер обещания success-экрана: «Мастера получат уведомление и пришлют отклики».
2. **🟡 OTP — заглушка.** Любые 6 цифр / любой номер → анонимная сессия. Sprint 1 решение, отмечено в коде. Перед public launch требуется заменить на supabase.auth.signInWithOtp + verifyOtp.
3. **🟡 Phone-provider в Supabase Auth выключен** — demo-аккаунты идут через email-fallback. Для не-demo пользователей session анонимная, что ломает RLS на `auth.uid()`-based политиках. Не блокер для demo, блокер для prod.
4. **🟡 Success-экран говорит «15-60 минут».** Если push нет (см. #1) и мастер не зайдёт в /orders/search — этот SLA нереалистичен.

**Симптом для пользователя:**

Клиент создаёт заявку, видит «Заявка опубликована». Возвращается через 30 минут — 0 откликов. Никто не уведомил мастеров. Уверенность в платформе падает после первого же заказа.

---

## Flow 2 — Регистрация мастера + onboarding профиля

**Статус:** ⚠️ работает с большими пробелами

**Звенья (текущий онбординг):**
- `app/(auth)/phone.tsx` → `app/(onboarding)/role.tsx`.
- `app/(onboarding)/role.tsx:62-69` — выбор «Я мастер» → push на `/master-categories?mode=onboarding`.
- `app/(onboarding)/master-categories.tsx:81-96` — multi-select до 5 L2 → RPC `set_master_categories` → push на `/master-photo`.
- `app/(onboarding)/master-photo.tsx:30-34` — опциональный аватар → `useUpdateMyAvatar` → push на `/master-profile`.
- `app/(onboarding)/master-profile.tsx:47-56` — имя/город/район/bio/опыт/инструменты/WhatsApp → RPC `complete_master_onboarding` (миграция 0067) → UPDATE `whatsapp_*` → invalidate userRecord → AuthGate видит `onboarding_completed_at != null` → редирект в `/(tabs)`.

**Найденные проблемы:**

1. **🔴 Service areas (зоны работы) не входят в onboarding.** Хук `useSetMasterServiceAreas` существует и используется **только в `app/(tabs)/profile/edit-master.tsx:191`** (`<ServiceAreasSection>`). После онбординга мастер автоматически попадает в feed мастеров **без указания, в каких городах/районах работает** — `master_service_areas` пустая. Влияние: location-based фильтры в `/orders/search` и `useMastersByL2` отрабатывают на пустом множестве, мастер не виден клиентам по location.
2. **🔴 Прайс-лист (services-suggest) не входит в onboarding.** Экран `app/(tabs)/profile/services-suggest.tsx` (P0 фича, миграция 0080) доступен только из `/profile`. После онбординга мастер без прайс-листа → на `/master/[id]` пустая секция «Услуги», карточки в каталоге — без цен.
3. **🔴 Master verification frontend отсутствует.** Из STATUS.md (2026-05-15): «backend готов (миграция 0070, table `master_verifications`, RLS, private bucket), frontend — следующая сессия». `find app/ -name "*verifi*"` → пусто. `find src/ -name "*verification*"` → пусто. Хук `useMyVerification` не создан, badge «Паспорт подтверждён» нет, экран `/profile/verification` не построен. Это «оранжевый» pre-launch блокер для ингушского рынка где «паспорт подтверждён» = ключевой trust-фактор.
4. **🟡 Master onboarding не имеет sticky прогресс-индикатора между шагами.** `OnboardingProgress step=2/3/4 total=4` есть, но шаги 5+ (services, areas, verification) отсутствуют. Пользователь не знает, что профиль не готов.
5. **🟢 4 шага визарда (role → categories → photo → profile) работают корректно** — backend RPC `complete_master_onboarding` (0067) атомарно UPDATE users + UPSERT master_profiles с status='pending'.

**Симптом для пользователя:**

Мастер прошёл регистрацию → попал на главную мастера → не понимает что делать дальше. Каталог не показывает его (нет цен + нет городов). Заявки в `/orders/search` фильтруются по `master_categories` (хорошо), но без `master_service_areas` он либо видит всё (плохо для воронки), либо ничего (плохо для seed-набора).

---

## Flow 3 — Мастер откликается на заявку

**Статус:** ✅ работает (минор-замечания)

**Звенья:**
- `app/(tabs)/orders/search/index.tsx:71-79` — defaults фильтров из `useMyMasterCategories` (мастер сразу видит релевант).
- `useAllOpenOrders` — пагинированный feed открытых заявок.
- `app/(tabs)/orders/search/index.tsx:98-100` — собирает Set non-withdrawn responses → `respondedOrderIds` → `<OrderRow alreadyResponded>` рисует accent-soft бейдж «Вы откликнулись».
- Тап на заказ → `/orders/[id]` → `MasterResponseSection` (`app/(tabs)/orders/[id].tsx:1078`).
- `app/(tabs)/orders/[id].tsx:1127-1141` — submit формы (priceKind/value/leadTime/message) → `useSubmitResponse` (`src/features/orders/use-order-responses.ts:75-100`) → INSERT `order_responses`.
- Триггер `0018: order_responses_notify_owner` → push клиенту «Новый отклик на заказ».
- Daily limit (5/день): `src/features/orders/use-response-limit.ts` через RPC `get_response_limit_today` (миграция 0059); UI блокирует submit + показывает «Лимит исчерпан».
- T15 withdraw: `app/(tabs)/orders/[id].tsx:1212-1224` — кнопка «Отозвать отклик» доступна когда `orderStatus='open'` AND status IN (`sent`, `viewed`). RPC `withdraw_response` (миграция 0074 lifecycle).

**Найденные проблемы:**

1. **🟡 Mark-viewed RPC дёргается клиентом, не мастером.** `useMarkResponsesViewed` срабатывает только в `useEffect` когда `isOwner && id`. Значит response `sent → viewed` происходит когда клиент открыл `/orders/[id]`. Мастер не видит transition «прочитано», только «принято/отклонено». Это OK для текущего UX, но `viewed` enum-значение фактически синонимично `sent` для мастера.
2. **🟡 priceKind default — `negotiable`.** Минимальная валидация: `priceValue` может быть NULL даже для `fixed`/`from`/`up_to` (форма позволяет submit пустого значения с `priceKind='fixed'` если schema не блокирует). Поверхностный просмотр zod-схемы `responseSchema` (строки 73-78) показывает `priceValue: z.number().int().min(0).nullable()` — нет рефинмента «если kind != negotiable, value required». Risk: мастер шлёт «fixed без цены».
3. **🟢 Withdraw flow** реализован с confirm-modal + push клиенту.

**Симптом для пользователя:**

Мастер заходит в `/orders/search`, видит фильтры по своим категориям, отклики и бейдж «Вы откликнулись». Жмёт «Отправить отклик», получает SUCCESS. Push клиенту уходит. Лимит 5 в день — UI его честно сообщает.

---

## Flow 4 — Клиент выбирает мастера + завершение работы

**Статус:** ✅ работает

**Звенья:**
- Клиент → `/orders/[id]` → `ClientResponsesSection` (`app/(tabs)/orders/[id].tsx:534+`).
- Тап «Принять» → `useAcceptResponse` (`src/features/orders/use-accept-response.ts`) → RPC `accept_response` (миграция 0010 + 0011).
- RPC атомарно: response→accepted, остальные→rejected, order→in_progress, picked_master_id=...; INSERT chat (idempotent ON CONFLICT). Триггер `orders_notify_picked_master` (0018) — push «Вас выбрали 🎉».
- Также есть «Написать» (`startChat`) — RPC `start_chat_with_master` (создаёт чат **до** accept).
- Master → `CompletionSection` (1475+): primary CTA «Работа выполнена» → `useMarkOrderDone` → RPC `mark_order_done` (0074, lifecycle T8) → `in_progress → awaiting_confirmation`, push клиенту.
- Client → primary CTA «Подтвердить выполнение» → `useConfirmCompletion` → RPC `confirm_completion` (T4/T5) → `→ completed`, push мастеру.
- Auto-confirm: cron `nightly_auto_confirm_completions` (миграция 0075) 04:00 UTC, 72ч таймаут (T11).
- Stale cancel: cron `nightly_cancel_stale_in_progress` 05:00 UTC, 30 дней без активности (T13).
- «Прекратить сотрудничество»: `useTerminateCooperation` → RPC `terminate_cooperation` (миграция 0077, SECURITY DEFINER после fix 0081). Обе стороны могут.
- Reopen (T9): `ReopenSection` (1672+) виден клиенту в 7-дневном окне после cancelled/expired.

**Найденные проблемы:**

1. **🟡 Push на T8 (`mark_order_done`) идёт изнутри RPC.** Это работает только потому что RPC `SECURITY DEFINER` после миграции 0081. Если RLS-конфигурация на `notify_user` изменится — push молча отвалятся (RAISE WARNING, не EXCEPTION в `notify_user`). Покрытия в тесте нет.
2. **🟡 OutcomeTrackingModal** (`features/orders/OutcomeTrackingModal.tsx`) — старый offline-completion flow. Параллельно живёт с T8/T4 lifecycle. Может конфликтовать UX'ом: модалка спрашивает «закрылось ли вне платформы?», а у мастера уже есть кнопка «Работа выполнена». Risk: дублирующиеся flow для closing order.
3. **🟢 cancel_reason='cooperation_ended_by_client/master'** через RPC 0077 — корректный path, не сваливается в общий «cancel». В чате видно «Заказ закрыт».
4. **🟢 Audit log** (`order_status_log`, миграция 0073) пишется триггером — каждый transition виден саппорту.

**Симптом для пользователя:**

Клиент принимает мастера → попадает на «Ваш мастер» (зелёная карточка), может писать в чат, может «Подтвердить выполнение» прямо сразу или ждать когда мастер отметит. Мастер видит «Работа выполнена», подтверждение, либо ждёт 72ч до auto-close. Если работа сорвалась — обе стороны жмут «Прекратить сотрудничество». В 7-дневном окне после cancellation клиент видит «Возобновить заказ».

---

## Flow 5 — Mutual reviews + рейтинг

**Статус:** ✅ работает

**Звенья:**
- После `order.status='completed'`:
  - Client → `ClientReviewSection` (`app/(tabs)/orders/[id].tsx:1740+`) → submit rating (1-5) + text → `useSubmitReview` (`src/features/reviews/use-reviews.ts:44+`) с `direction='client_to_master'`.
  - Master → `MasterReviewSection` (`app/(tabs)/orders/[id].tsx:1873+`) с `direction='master_to_client'`.
- INSERT в `reviews` → AFTER INSERT trigger `recalc_master_rating` (`supabase/migrations/0016`).
- Trigger разветвляет: `direction='client_to_master'` → UPDATE `master_profiles.rating_overall_avg/count`; `direction='master_to_client'` → UPDATE `users.rating_as_client_avg/count`.
- Display: `app/(tabs)/master/[id].tsx:98,563` — `useReviewsForTarget(masterId, 'client_to_master')` → `<ReviewsSection>`.
- `app/(tabs)/client/[id].tsx:35,140` — `useReviewsForTarget(clientId, 'master_to_client')` → `<ReviewsSection>`.
- Из `/profile/index.tsx` — CTA «Как меня видят» (добавлено 2026-05-16) → переход на свой публичный профиль с отзывами.

**Найденные проблемы:**

1. **🟡 Double-blind не реализован.** Lifecycle.md §6 говорит «никто не видит чужой отзыв до момента (a) сам отправил отзыв ИЛИ (b) окно 14d закрылось». Текущее: SELECT в `useReviewsForTarget` без проверки `visible_to_other_side`. Risk на малом ингушском рынке: ответки. Backend invariant из lifecycle.md §1.5 не выполнен.
2. **🟡 Окно отзыва не enforced.** RLS / trigger / cron `nightly_close_review_windows` (упомянут в lifecycle.md §5.1) — НЕ существует в `supabase/migrations/`. После `completed` отзыв технически можно оставить когда угодно. Нет таблицы `reviews_closed_at`.
3. **🟢 Trigger `recalc_master_rating`** работает в обе стороны (0016). Рейтинги пересчитываются автоматически.
4. **🟢 ReviewsSection** показывает корректно, c автором, рейтингом, текстом, infinite scroll.

**Симптом для пользователя:**

Обе стороны после `completed` видят форму отзыва. Submit → отзыв сразу появляется на публичной странице другой стороны. Рейтинг агрегатов обновляется. Без double-blind — мастер может видеть низкий отзыв клиента и ответить ему ещё ниже, до того как клиент написал свой.

---

## 🔴 Топ-блокеры по flow (приоритет для launch)

1. **Flow 1 — Нет push-trigger'а на INSERT orders.** Файл `supabase/migrations/0018_push_triggers.sql` имеет 3 trigger'а (messages, responses, order_accepted), но НЕ имеет AFTER INSERT ON `public.orders` с рассылкой по `master_categories` LEFT JOIN `master_service_areas`. Fix: новая миграция `0083_notify_masters_on_new_order.sql` с trigger function, шлющей push всем мастерам у кого `l2_id` совпадает И `city_id` совпадает (или `city_id IS NULL` для «вся Ингушетия»). Без этого launch обманывает обещание «Мастера получат уведомление».
2. **Flow 2 — Service areas вне onboarding.** Добавить шаг `/(onboarding)/master-areas` между `master-photo` и `master-profile`, использовать `useSetMasterServiceAreas`. Без него мастер невидим клиентам.
3. **Flow 2 — Prices (services-suggest) вне onboarding.** Тот же fix: добавить шаг визарда или явный nudge на главной мастера «Добавьте прайс-лист — без него карточка без цен» (deep-link на `/profile/services-suggest`).
4. **Flow 2 — Verification frontend отсутствует.** Backend готов (0070, RLS, bucket); фронт — `useMyVerification` hook + `/profile/verification` экран + badge + nudge. Это P1 для launch в Ингушетии (trust).
5. **Flow 5 — Double-blind reviews не реализован.** Sprint TBD в lifecycle.md §6. Risk: ответки в малом регионе.
6. **Flow 1 — OTP-заглушка перед prod.** Замена `useVerifyOtp` на `supabase.auth.signInWithOtp` + `verifyOtp`. Включение Phone-provider в Supabase Auth Dashboard. Подключение реального SMS-провайдера (МТС Exolve упомянут в STATUS.md AI_MODERN_TECH).

## Доп. находки (не блокеры, но в beta-list)

- **OutcomeTrackingModal vs lifecycle T4/T8** — дубль flow закрытия заказа, нужен audit пользовательского сценария.
- **Окно отзыва 14d не enforced** — нужен cron `nightly_close_review_windows` или RLS-проверка `created_at > order.completed_at + interval '14 days'` → reject INSERT.
- **`viewed` status responses** — обновляется только при заходе клиента в `/orders/[id]`. Если клиент открывает order_responses через `/orders` list — не отмечается. Минор.

---

## Оценка готовности happy paths к public launch

**~75-80%** — ядро (lifecycle + отклики + отзывы) production-ready, но критичные «обвязки» (push матчинг, полнота master-onboarding, verification UI) отсутствуют. До public launch требуется:

- ✅ Lifecycle backend (готов)
- ✅ Lifecycle frontend (готов)
- ✅ Reviews mutual (готов)
- ⚠️ Push на новый заказ (P0 — missing trigger)
- ⚠️ Service areas в onboarding (P0)
- ⚠️ Prices в onboarding или strong nudge (P0)
- ⚠️ Verification UI (P1)
- ⚠️ Real OTP (P0 для не-demo)
- ⚠️ Double-blind reviews (P1)

Все 5 flow технически проходимы в **demo-mode** (через `+7 900 000-00-01..03` + любой OTP). Для **public launch** нужно закрыть 4 P0-блокера выше.
