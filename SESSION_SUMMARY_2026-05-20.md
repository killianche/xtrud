# Session summary — 2026-05-20

## TL;DR

Закрыто 14 из 16 задач очереди фидбэка пользователя перед демо: исправлен submit мастер-онбординга, добавлен escape-hatch, убраны 6 нарушений `design-quality.md` (subtitle под H1 + inline hex), реорганизован порядок шагов master-онбординга (фото last), добавлен phone-auth feedback overlay, поднято системное правило `design-enforcement.md`. Завершён RPI Research+Plan для master-passport-verification — готов к `/rpi:implement`.

## Закрытые задачи (16/16, нумерация очереди)

1. **#1 Прочитал docs/VERIFICATION.md** — backend верификации полностью готов (миграция 0070, RLS, Storage, триггеры).
2. **#2 Написал rpi/master-passport-verification/REQUEST.md** — 280 строк, самодостаточный feature-спек с 6 open questions.
3. **#3 Запустил /rpi:research** — все 5 фаз. CTO verdict: **GO, High confidence**. Артефакт: [rpi/master-passport-verification/research/RESEARCH.md](rpi/master-passport-verification/research/RESEARCH.md).
4. **#4 Выдал мастер-аккаунт** — `+7 900 000-00-03` (Руслан Хамхоев) для тестирования.
5. **#5 Лаг при заходе на /profile** — [profile/index.tsx](app/(tabs)/profile/index.tsx) теперь читает `status` из `useAuthSession()`, при `loading` показывает spinner вместо flash GuestProfileScreen.
6. **#6 Phone-auth feedback overlay** — [phone.tsx](app/(auth)/phone.tsx) показывает 700мс overlay «Подтверждаю ваш номер +7…» до redirect (раньше юзер не видел что вход произошёл). Bonus: убран subtitle под H1, inline `color="#fff"` → токен.
7. **#7 «Завершить» в master-onboarding молчал** — [master-profile.tsx](app/(onboarding)/master-profile.tsx): `disabled={!cities}` → `disabled={citiesLoading}`; silent `catch (_e) {}` → `Alert.alert` + `console.error`; scrollToTop при validation-fail.
8. **#8 Escape-hatch для онбординга** — новый hook [`useExitOnboarding`](src/features/auth/use-exit-onboarding.ts) (confirmAsync → signOut → redirect /auth/phone). `OnboardingProgress` принимает `onCancel` prop с правой ghost-кнопкой «Отмена». Подключено в 5 онбординг-экранах.
9. **#9 Subtitle под H1 на 6 экранах** — убран в `role.tsx`, `client-name.tsx`, `master-categories.tsx`, `master-photo.tsx`, `master-profile.tsx`, `phone.tsx`. На master-categories субтайтл «Выберите до 5 категорий» заменён динамическим счётчиком «Выбрано N из 5» под поиском.
10. **#10 Красные линии в progress-bar** — **не баг**, это были freehand-аннотации пользователя на скриншотах. Преview screenshots после фиксов подтвердили чистый прогресс-бар.
11. **#11 Reorder шагов master-онбординга** — Path B с миграцией БД. Новый порядок: role → master-profile (1/3, имя/опыт/whatsapp) → master-categories (2/3) → master-photo (3/3, финализация). Миграция 0095 + новый RPC `finalize_master_onboarding()` + `useFinalizeMasterOnboarding` hook + перепис `useSubmitMasterProfile` (теперь сохраняет данные через client+RLS, не финализирует).
12. **#12 Прогресс-бар master-онбординга — 3 шага вместо 4** — role не считается в visualisation (это выбор роли, не часть мастер-визарда).
13. **#13 Имя клиента vs мастера** — архитектурно одно имя на user (users.first_name/last_name, строка 1405 database.ts). Уже соответствовало user-preference.
14. **#14 Отдельный отображаемый WhatsApp** — уже работало в форме (checkbox «Совпадает с основным» → conditional TextInput). Bonus: inline hex `color="#ffffff"` (строка 177 MasterProfileFormBody.tsx) → `useThemeColor("on-primary")`.
15. **#15 ENFORCEMENT дизайн-правил** — новый файл [.claude/rules/design-enforcement.md](.claude/rules/design-enforcement.md) (приоритет 0): 8 grep-чеков, обязательный preview-screenshot, Lazyweb-чек, чёрный список фраз. CLAUDE.md дополнен новым критическим блоком.
16. **#16 /rpi:plan для verification** — 4 файла в [rpi/master-passport-verification/plan/](rpi/master-passport-verification/plan/): pm.md (9 user stories), ux.md (5 Lazyweb queries + 7 screen specs + 54-line copy table), eng.md (4 hook contracts + PII checklist), PLAN.md (3 фазы ~6h + validation gates).

## Новые правила и решения

- **`.claude/rules/design-enforcement.md`** — приоритет 0 правил. Why: user обнаружил 3+ одновременных нарушения design-quality.md и сказал «легко относишься к дизайну». Правила были, но не enforce'ились. How to apply: каждая правка `app/**/*.tsx`, `src/components/**/*.tsx`, `src/features/**/*.tsx` → 8 grep-чеков + preview screenshot + Lazyweb-чек.
- **CLAUDE.md** — новый блок «🚨 КРИТИЧЕСКОЕ ПРАВИЛО: ENFORCEMENT ДИЗАЙН-ПРАВИЛ» со ссылкой на design-enforcement.md.
- **Reorder master-онбординга** — фото в конце (как Profi.ru/YouDo), имя первым. Why: user-фидбек «фотографии лучше ставить в конце». How to apply: новый flow задействован, при следующих изменениях помнить что финализация = master-photo.tsx → finalize_master_onboarding RPC.

## Новые компоненты / паттерны

- **`<OnboardingProgress onCancel?>`** ([src/components/OnboardingProgress.tsx](src/components/OnboardingProgress.tsx)) — теперь принимает опциональный `onCancel` prop для escape-hatch. Использовать при ЛЮБОМ онбординг-экране.
- **`useExitOnboarding()`** ([src/features/auth/use-exit-onboarding.ts](src/features/auth/use-exit-onboarding.ts)) — confirm + signOut + redirect /auth/phone. Использовать **только** в `app/(onboarding)/*.tsx`.
- **`useSubmitMasterProfile()`** (переписан) — теперь сохраняет users + master_profiles через client+RLS, **БЕЗ финализации**. Раньше вызывал complete_master_onboarding RPC который атомарно ставил onboarding_completed_at=now(). Использовать на любом шаге кроме последнего.
- **`useFinalizeMasterOnboarding(userId)`** ([src/features/auth/use-finalize-master-onboarding.ts](src/features/auth/use-finalize-master-onboarding.ts)) — вызов RPC `finalize_master_onboarding()` (миграция 0095). Использовать ТОЛЬКО на последнем шаге wizard (master-photo.tsx).

## Anti-patterns обнаруженные в сессии

- **Subtitle под H1 (правило §G)** — найден на 6 онбординг-экранах. Anti-pattern: писать «помогающий» текст под title в `text-body-md text-body`. Как правильно: переписать title так чтобы он сам себя объяснял, либо помогающий текст ставить в body (под полями формы), не сразу под H1.
- **Silent `catch (_e) {}`** — найден в master-profile.tsx. Anti-pattern: молча проглатывать ошибки без обратной связи UI. Как правильно: `Alert.alert(<message>, <e.message>)` + `console.error` + при possibility scrollToError.
- **`disabled={!cities}` где cities может быть undefined пока loading** — Anti-pattern: «truthy check» на data из react-query вместо `isLoading`. Как правильно: `disabled={citiesLoading}` или separate `isReady` boolean.
- **`if (!userId)` без проверки `status === "loading"`** — Anti-pattern: рендерить guest-state пока useAuthSession ещё инициализируется. Как правильно: сначала `if (status === "loading") return spinner;`, потом `if (!userId) return guest;`.
- **Mutating RPC параметры в client-flow** — Anti-pattern: финализирующий атомарный RPC в середине multi-step wizard. Как правильно: split на (a) save без флагов + (b) finalize-only RPC в конце.
- **Inline hex `color="#fff"` / `color="#374151"`** — Anti-pattern: hardcode цвет вместо токена. Как правильно: `useThemeColors(["on-primary", "muted-soft"])` + `tc["on-primary"]`.
- **Пропущенный визуальный feedback после async action** — Anti-pattern: instant redirect после sign-in без визуального подтверждения. Как правильно: 500-800мс overlay с описанием действия.

## RPI Master Passport Verification — готовность к implement

- ✅ **Research** — GO verdict, High confidence. [research/RESEARCH.md](rpi/master-passport-verification/research/RESEARCH.md).
- ✅ **Plan** — 4 файла: pm.md, ux.md, eng.md, PLAN.md в [rpi/master-passport-verification/plan/](rpi/master-passport-verification/plan/).
- ✅ **Conditions confirmed (6 из 6 от user):** Storage cleanup on withdraw IN, "Подробнее" reuses route, 60-min cooldown, widened SLA copy, Lazyweb-first mandatory, EXIF empirical test in Phase 1.
- 🚧 **Next step:** `/rpi:implement master-passport-verification` — 3 фазы, ~6h focused.

## Открытые вопросы / TODO

- **EXIF empirical test** — будет проведён в Phase 1 implementation. Если JPEG re-encode не стрипит → P1 follow-up + accept residual risk на launch.
- **Admin moderation queue UI** — out of scope этой RPI. Manual moderation через Supabase Dashboard на launch. Telegram webhook от DB trigger — P1 follow-up.
- **Lazyweb queries** — 5 запросов перед Phase 2 implement, см. [ux.md §2](rpi/master-passport-verification/plan/ux.md).

## Релевантные миграции этой сессии

- **0095_finalize_master_onboarding** — новый RPC для финализации master-онбординга. Применён к prod (Supabase project `wgeimsajvjkzrrnfrnkb`).

## Файлы изменённые (полный список)

### Новые файлы

- [supabase/migrations/0095_finalize_master_onboarding.sql](supabase/migrations/0095_finalize_master_onboarding.sql)
- [src/features/auth/use-exit-onboarding.ts](src/features/auth/use-exit-onboarding.ts)
- [src/features/auth/use-finalize-master-onboarding.ts](src/features/auth/use-finalize-master-onboarding.ts)
- [.claude/rules/design-enforcement.md](.claude/rules/design-enforcement.md)
- [rpi/master-passport-verification/REQUEST.md](rpi/master-passport-verification/REQUEST.md)
- [rpi/master-passport-verification/research/RESEARCH.md](rpi/master-passport-verification/research/RESEARCH.md)
- [rpi/master-passport-verification/plan/pm.md](rpi/master-passport-verification/plan/pm.md)
- [rpi/master-passport-verification/plan/ux.md](rpi/master-passport-verification/plan/ux.md)
- [rpi/master-passport-verification/plan/eng.md](rpi/master-passport-verification/plan/eng.md)
- [rpi/master-passport-verification/plan/PLAN.md](rpi/master-passport-verification/plan/PLAN.md)
- SESSION_SUMMARY_2026-05-20.md (этот файл)

### Изменённые файлы

- [CLAUDE.md](CLAUDE.md) — новый блок enforcement.
- [STATUS.md](STATUS.md) — секция «Текущее состояние (2026-05-20)».
- [src/types/database.ts](src/types/database.ts) — regenerated (finalize_master_onboarding в Functions).
- [app/_layout.tsx](app/_layout.tsx) — не трогал, но AuthGate осведомлён о новом flow (`onboarding_completed_at` всё ещё единственный гард).
- [app/(auth)/phone.tsx](app/(auth)/phone.tsx) — feedback overlay + subtitle removed + inline hex → tokens.
- [app/(tabs)/profile/index.tsx](app/(tabs)/profile/index.tsx) — `authStatus === "loading"` гард.
- [app/(onboarding)/role.tsx](app/(onboarding)/role.tsx) — subtitle removed, inline hex → tokens, redirect master → master-profile (вместо master-categories), top-right «Отмена».
- [app/(onboarding)/client-name.tsx](app/(onboarding)/client-name.tsx) — subtitle removed, top-right «Отмена».
- [app/(onboarding)/master-profile.tsx](app/(onboarding)/master-profile.tsx) — теперь шаг 1/3 (не 3/3), title «Расскажите о себе» (не «Последний шаг»), CTA «Продолжить» (не «Завершить»), submit сохраняет данные и push на master-categories.
- [app/(onboarding)/master-categories.tsx](app/(onboarding)/master-categories.tsx) — step 1/3 → 2/3, subtitle removed, onCancel exitOnboarding.
- [app/(onboarding)/master-photo.tsx](app/(onboarding)/master-photo.tsx) — теперь шаг 3/3 (не 2/3), вызывает finalize_master_onboarding RPC.
- [src/components/OnboardingProgress.tsx](src/components/OnboardingProgress.tsx) — принимает onCancel prop.
- [src/features/auth/use-submit-master-profile.ts](src/features/auth/use-submit-master-profile.ts) — переписан: UPDATE users + UPSERT master_profiles через client+RLS вместо RPC; БЕЗ финализации.
- [src/features/master-profile/MasterProfileFormBody.tsx](src/features/master-profile/MasterProfileFormBody.tsx) — inline hex `#ffffff` → `useThemeColor("on-primary")`.

---

## Дополнение (2026-05-20, вечер) — переход на classifieds-модель

### Контекст

По решению user: xtrud упрощается до «доска объявлений» — без in-app чата, без accept-master, без lifecycle подтверждения работы. Клиент видит отклики мастеров и звонит/пишет в WhatsApp напрямую. Backend (RPC, миграции, таблицы chats/messages/notifications) НЕ трогается — откат через `git revert`.

### Удалено целиком

- `app/(tabs)/chats/` (3 файла) — экран чатов.
- `src/features/chat/` (10 файлов) — hooks, helpers, тесты.
- `app/(tabs)/notifications/` — Notification Center.

### Изменено

- **app/(tabs)/orders/[id].tsx** — самая большая правка. Удалены:
  - Импорты `useMyChats`, `useStartChatWithMaster`, `useAcceptResponse`, `useCompleteOrder`, `useConfirmCompletion`, `useMarkOrderDone`, `useReopenOrder`, `useTerminateCooperation`, `useMyReviewForOrder`, `useSubmitReview`, `OutcomeTrackingModal`.
  - Секции `CompletionSection`, `ReopenSection`, `ClientReviewSection`, `MasterReviewSection`, `OutcomeTrackingModal` (~620 строк).
  - В `ClientResponsesSection`: убрана модель «выбранный мастер» (variant=picked) и chat-кнопки. Карточка отклика теперь содержит 3 прямые контакт-кнопки: **«Позвонить»** (Phone) → `tel:`, **«WhatsApp»** (WhatsappLogo) → `wa.me/`, **«Профиль»** (CaretRight) → `/master/[id]`. Phone грузится через `useMasterPhone` (RPC `get_master_phone`), WhatsApp — через `useMasterPublicProfile` + `resolveWhatsappDigits`.
  - Reject (скрыть отклик) сохранён — это локальное действие клиента.
- **app/(tabs)/master/[id].tsx**:
  - Удалена fallback-логика «Написать в xtrud» (`handleContact` → `/orders/new?master_id=…`). Теперь если phone null — кнопка «Позвонить» неактивна.
  - Из action-menu (⋮) удалён пункт «Этот мастер выполнил мне работу» (`ConfirmWorkSheet`). Остался только «Пожаловаться».
- **app/(tabs)/profile/index.tsx**:
  - Удалена плитка «Чаты» из client-stats trio. Теперь 2 плитки: Заказы + Отзывы.
- **src/features/orders/use-order-responses.ts**:
  - Добавлен doc-комментарий: explanation classifieds-модели и почему phone через RPC, а whatsapp через отдельный hook (RLS).

### Решения и rationale

- **Phone через RPC, не через join.** `auth.users.phone` недоступен через RLS-join. Используем `get_master_phone` (миграция 0040) точечно в каждой карточке отклика. Кэш `useQuery` (`stale 5min`) делает повторные обращения дешёвыми.
- **Кнопки в карточке отклика — pill-shape**, чтобы единым стилем с master-page Phone/WhatsApp. Иконки + лейбл рядом (`Phone + "Позвонить"`).
- **Не удаляли «бэк» (RPC accept_response, completion, etc.)** — backend остаётся работоспособным, восстановление UI = `git revert` на эти 3 файла + воссоздание `chats/` + `features/chat/`.
- **Lifecycle статусы остаются в БД** (`in_progress`, `awaiting_confirmation`, `completed`, `disputed`, `cancelled`) — но новых переходов через UI не происходит. Уже существующие заказы с этими статусами просто показываются с status badge.

### Что НЕ тронуто (намеренно — другой агент)

- TabBar, `(tabs)/_layout.tsx`, `cases.tsx`, `MasterDashboardOrders.tsx`, `(tabs)/index.tsx`, `MasterRecentEvents.tsx`. После моего удаления `@/features/chat/*` TS-ошибки в `_layout.tsx` ожидаемы — это другой агент закроет.

### Anti-patterns / уроки

- **PostgREST join к таблице, FK которой ссылается на чужой parent.** Пробовал `master_profile:master_profiles!order_responses_master_id_fkey(...)` — FK у `order_responses.master_id` это `users.id`, к `master_profiles` оно не указывает напрямую. Решение: 2 отдельных hooks в карточке (`useMasterPhone` + `useMasterPublicProfile`).

### Open TODOs для других агентов

- `_layout.tsx`: убрать импорты `useMyChats`, `useRealtimeMyChats`, chats-tab + chats-badge.
- `MasterRecentEvents.tsx`: deep-link на `/(tabs)/chats/${chatId}` и `/(tabs)/notifications` ведёт в несуществующие routes. Заменить или отключить чат/notification deep-link.
