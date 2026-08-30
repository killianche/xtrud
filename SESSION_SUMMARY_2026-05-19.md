# Session summary — 2026-05-19

## TL;DR

**Часть 1 (функциональные задачи):** 8 из 15 пунктов AUDIT_LAUNCH_FUNCTIONAL (3 false-positive + 5 реально, миграции 0088→0091).

**Часть 2 (App Store обвязка):** 6 пунктов — checkbox согласия, iOS purpose-strings, store metadata, landing-page для xtrud.ru, checklist для Data Safety / Privacy Labels / IARC / screenshots.

**Часть 3 (отложено):** UI верификации паспорта, ответ мастера на отзыв, бригады, видео-визитка, рейтинг по dimensions, шаблоны, бейдж <30мин — по решению пользователя «не делаем сейчас».

## Закрытые задачи (нумерованный список)

1. **Форма написания отзыва** — `[id].tsx:1751-1969`, уже была реализована. False-positive аудита.
2. **RPC `delete_my_account()` + UI 2-step bottom-sheet** — миграция `0088_delete_my_account.sql`, hook `src/features/auth/use-delete-account.ts`, UI в `app/(tabs)/profile/settings.tsx` (новый компонент `DeleteAccountSheet` внизу файла).
3. **Жалоба на мастера (Report)** — `ReportModal` через `DotsThreeVertical` action menu в `app/(tabs)/master/[id].tsx:614-657`. False-positive аудита.
4. **Privacy Policy + Terms of Service** — shared `src/features/legal/LegalScreen.tsx` + `app/legal/privacy.tsx` (8 секций 152-ФЗ template) + `app/legal/terms.tsx` (10 секций UGC marketplace). AuthGate в `app/_layout.tsx` пропускает `inLegal` без auth. Ссылки в settings + на `/auth/phone`.
5. **Избранные мастера** — миграция `0089_user_favorites.sql` (таблица + RLS + CASCADE), hook `src/features/favorites/use-favorites.ts`, сердечко в hero `app/(tabs)/master/[id].tsx`, экран `app/(tabs)/profile/favorites.tsx`, ссылка из `/profile`.
6. **`/orders` 3 таба** — `app/(tabs)/orders/index.tsx` переписан с TabsBar (Активные/Завершённые/Черновики). `src/lib/order-draft-store.ts` обёрнут в Zustand `persist` через `src/lib/storage.ts` (web → localStorage, native → SecureStore). Helper `hasDraftContent`.
8. **Push trigger на новые заказы** — миграция `0090_notify_masters_on_new_order.sql`. AFTER INSERT ON orders → `notify_user` всем матчащим мастерам (категория + локация-city ИЛИ нет service_areas).
10. **Окно отзыва 14 дней** — миграция `0091_review_window_14d.sql` (RLS extended `completed_at + 14d > now()`). UI: `isReviewWindowClosed(completedAt)` helper в `[id].tsx`, ClientReviewSection/MasterReviewSection скрывают форму после окна.

## Часть 2 — App Store / Google Play обвязка

11. **Active opt-in checkbox** на `/auth/phone` — disclaimer-текст заменён на checkbox + Submit disabled пока не отмечен. 152-ФЗ + Apple 5.1.1 compliance.
12. **iOS purpose-strings** в `app.json`: `NSLocationWhenInUseUsageDescription` (геолокация), `NSPhotoLibraryAddUsageDescription` (сохранение из чата), `ITSAppUsesNonExemptEncryption: false` (пропускает encryption-Q при каждом submit).
13. **Android target API** — проверено: Expo SDK 54 → targetSdkVersion=35 → превышает Google Play 2026 требование (API 34). Без правок.
14. **`STORE_METADATA.md`** — name «xtrud — мастера Ингушетии» (26), subtitle «Ремонт, ремесло, услуги», description (≈3500 chars), keywords (99 chars), short description (76), App Store + Google Play metadata.
15. **`landing/`** — vanilla HTML+CSS лендинг для xtrud.ru (index/support/privacy/terms + _redirects + README). Готово к drag-and-drop в Cloudflare Pages.
16. **`LAUNCH_CHECKLIST_STORES.md`** — готовые ответы на Apple Privacy Nutrition Labels (Data Linked to User × 7), Google Play Data Safety (Encryption: Yes, Deletion in app: Yes), IARC age rating questionnaire (ожидаем 17+), screenshots spec (6 экранов × iOS/Android + Feature Graphic), submit checklist для обеих платформ + Build Notes для review team.

## Отложено по решению пользователя (не делаем)

| # | Задача |
|---|---|
| 7 | UI верификации паспорта |
| 9 | Ответ мастера на отзыв |
| 11 | Бригады / `team_size` UI |
| 12 | Видео-визитка |
| 13 | Рейтинг по dimensions |
| 14 | Шаблоны быстрых ответов |
| 15 | Бейдж «быстрый ответ <30 мин» |

## Прежняя секция (для истории):

| # | Задача | Оценка |
|---|---|---|
| 7 | UI верификации паспорта (`/profile/verification` + хуки + badge) | 2д |
| 9 | Ответ мастера на отзыв | 0.5д |
| 11 | Бригады / `team_size` UI | 1д |
| 12 | Видео-визитка (Storage bucket + RLS + recording UI) | 1.5д |
| 13 | Рейтинг по dimensions | 2д |
| 14 | Шаблоны быстрых ответов | 0.5д |
| 15 | Бейдж «быстрый ответ <30 мин» | 0.5д |

## Новые правила и решения

- **Перед написанием кода для «🔴 блокера» из аудита — grep verify**. Sub-agent в Explore-режиме видит импорт hook'а и заявляет «UI отсутствует», но может не дочитать секцию ниже. Tactic: `grep -n "ComponentX\|hook_name" app/` перед погружением. Сэкономило часы на задачах #1, #3.
- **Soft-delete вместо hard-delete auth.users.** Apple/Google НЕ требуют удаления из auth.users (нет admin permissions в обычной RPC) — допустима анонимизация PII. Подход в 0088: `users.status='deleted'` + `phone=NULL` + cancel активных заказов с reason `account_deleted_by_{master|client}`. Reviews/messages остаются как «Удалённый пользователь».
- **Legal routes — отдельная группа `app/legal/`**, allowlist в AuthGate (`inLegal` пропускается во всех ветках). Apple reviewer должен открывать Privacy/Terms без логина. Не использовать `(legal)` group prefix — UI/SEO-friendly без скобок.
- **Persist draft store через Zustand `persist`** + `src/lib/storage.ts` adapter (web→localStorage, native→SecureStore). Не использовать AsyncStorage напрямую — у проекта уже есть storage.ts.

## Новые компоненты / паттерны

- `src/features/legal/LegalScreen.tsx` — shared shell для legal-документов. Props: `title`, `effectiveAt`, `intro`, `sections[]`, `contactLine`. Использовать для любых long-text юридических экранов.
- `src/features/auth/use-delete-account.ts` — mutation `useDeleteMyAccount()`. После RPC автоматически делает `signOut()`. Идемпотентен (already_deleted).
- `src/features/favorites/use-favorites.ts` — `useMyFavorites/useIsFavorite/useToggleFavorite`. Optimistic update + idempotent INSERT на 23505 (unique_violation = уже в избранном).
- `DeleteAccountSheet` (внутри `app/(tabs)/profile/settings.tsx`) — паттерн 2-step bottom-sheet с подтверждением «УДАЛИТЬ». Использовать для irreversible destructive actions.
- `TabsBar` (внутри `app/(tabs)/orders/index.tsx`) — segmented control с underline на активном, mono counter под labels. Когда нужно отделить tabs от ScrollView (sticky header) — переиспользовать паттерн.
- `isReviewWindowClosed(completedAt)` helper в `app/(tabs)/orders/[id].tsx` — проверка 14-дневного окна. Можно вынести в `src/lib/lifecycle.ts` если потребуется в других местах.

## Anti-patterns обнаруженные в сессии

- **«Аудит говорит UI нет» без grep verification** — приводит к двойной работе. См. правило выше.
- **Supabase `select` с `!fk_name` для join к таблице с FK на другой ключ** — `master_profiles!master_profiles_user_id_fkey` НЕ работает в join из `user_favorites`, потому что FK не на user_favorites. Лучше: 2-3 раздельных select + Map-склейка на клиенте (см. `useMyFavorites`).

## Известные проблемы

- **Конфликт номеров миграций** в `supabase/migrations/`:
  - `0088_delete_my_account.sql` (мой) + `0088_popular_queries_fallback.sql` (параллельная сессия)
  - `0089_user_favorites.sql` + `0089_orders_description_optional.sql`
  - `0090_notify_masters_on_new_order.sql` + `0090_orders_description_nullable.sql`
  - `0091_review_window_14d.sql` (только моя)

  В БД `supabase_migrations.schema_migrations` имена уникальны (все 7 применены). Конфликта в истории нет. Но при `supabase db reset` lex-порядок применения same-prefix не детерминирован.

  **Fix следующей сессии:** переименовать мои в `0092_delete_my_account.sql`, `0093_user_favorites.sql`, `0094_notify_masters_on_new_order.sql`, `0095_review_window_14d.sql`. В БД история остаётся под старыми именами, файлы в репо — под новыми (это допустимо, supabase сравнивает по имени и пропускает уже применённые).

## Открытые вопросы / TODO

- **Тексты PP/ToS** — template-уровень, юрист должен утвердить перед публичной App Store submission. ИП/ООО реквизиты подставить в раздел 1.
- **152-ФЗ уведомление в РКН** — внешний процесс, юрист должен подать.
- **Storage cleanup для удалённых аккаунтов** — после `delete_my_account()` аватары/портфолио-фото остаются в Storage. Нужен cron-job (Storage admin API недоступен из RPC). Не P0 для запуска.
- **Real OTP** (P0-01/02/03 из инфра-аудита) — не сделано в этой сессии, остаётся блокером.
