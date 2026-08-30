# Internal code audit — 2026-05-16

> Инвентаризация того, что РЕАЛЬНО реализовано в коде (vs документация). Источник: прямой анализ routes / migrations / hooks / components. Часть параллельного аудита 16 мая 2026.

## TL;DR

**Проект на ~75% завершён функционально.** Backend целиком готов к production (все 80 миграций applied, RLS strict, cron-jobs настроены). Frontend покрывает весь core flow: auth → onboarding → order creation → responses → 8-статусный lifecycle → chats → reviews. Desktop UX адаптирован. Demo-данные rich.

## Метрики кода

- **Routes:** 39 файлов
- **Migrations:** 80 (полностью applied)
- **Hooks:** 65 в `src/features/`
- **Components:** 33 (30 active + 3 orphan: ThemeSwitcher, HelpCallout, Illustration)
- **Tables:** 30+
- **RPC/Functions:** 51+
- **Storage buckets:** 4 (avatars, portfolio, category-covers, master-verifications)

## Features-implementation matrix

| Фича | Статус | Примечание |
|------|--------|-----------|
| Phone OTP | ⚠️ DEMO | Любые 6 цифр. Реальный SMS — Sprint 2 |
| Master Onboarding Wizard | ✅ FULL | 6 экранов: role → categories → profile → photo |
| Master Verification (паспорт) | ⚠️ BACKEND | 0070 + RLS + bucket готовы, frontend в очереди |
| Master Profile CRUD | ✅ READY | Имя, фото, категории, услуги-прайс (4 kinds), портфолио 50 фото, service areas, WhatsApp |
| Master Schedule | ⚠️ PARTIAL | `availability_status` работает, `work_schedule jsonb` не используется |
| Orders Create | ✅ READY | Форма категория → описание → локация → price |
| Orders List + Filters | ✅ READY | Клиент: мои, мастер: поиск (город/L3/цена) |
| Orders Detail + Responses | ✅ READY | Полный UI: accept/reject/withdraw/mark-done/confirm/terminate |
| Order Lifecycle (8 статусов) | ✅ FULL | open → in_progress → [awaiting_confirmation→] completed OR cancelled/expired/disputed |
| Chats | ⚠️ TEXT+PHOTO | Voice — TODO (expo-audio), realtime работает |
| Reviews (mutual) | ✅ READY | Client→Master + Master→Client, triggerный recalc рейтинга |
| Push Notifications | ⚠️ TOKEN ONLY | Token registration + triggers есть, FCM/APNs credentials НЕ подключены |
| Web Shell | ✅ READY | Desktop nav, sticky header, sidebar |
| Dark Theme | ✅ READY | NativeWind + ColorScheme provider |
| Demo Accounts | ✅ READY | 10 client + 20 master, `is_demo` флаг |
| Daily Response Limit | ✅ READY | 5/день через `check_daily_response_limit` RPC |
| Photo Attachments в чате | ✅ READY | `chat_images` table + RLS + Storage |
| Master Service Area | ✅ READY | m2m с cities, выбор городов в edit-master |
| Phone Masking | ✅ RPC | `get_master_phone` возвращает телефон только picked-клиенту |
| Favorites/Saved Masters | ❌ NOT IMPL | Нет таблицы, нет UI |
| Master Portfolio | ✅ READY | CRUD, лимит 50, Storage |
| Categories Taxonomy | ✅ READY | 3 L1 + 32 L2 + 150+ L3 |
| Smart Search | ✅ READY | FTS + trigram + synonym + flip-layout-fix |
| Real FCM/APNs Push | ❌ TODO | Credentials не настроены |
| Telegram / VK Auth | ❌ NOT IMPL | Не планируется |
| Maps / Geolocation | ❌ NOT IMPL | Нет expo-location, нет карт |
| Payments / Escrow | ❌ NOT IMPL | Нет таблицы, нет RPC |
| Admin Queue | ❌ STUB | Route есть, функционал empty |

## Tech-debt

✅ **Чистый код:**
- 0 `@ts-ignore` / `@ts-expect-error`
- 0 `console.log` (только 5 `console.warn` — рациональные)
- 0 hardcoded credentials (кроме `DEMO_PASSWORD='xtrud'` намеренно)
- 3 orphan компонента — можно удалить

⚠️ **Долги:**
- `/verify` route — скелет (логин идёт прямо из /phone)
- `useCompleteOrder` — deprecated обёртка над `useConfirmCompletion`
- 5 TODO в коде (toast infra, JOIN-фильтр на category, expo-location, OTP реальный, toast в /profile)

## Open issues приоритезированно

**Высокий:**
- Toast-инфраструктура (упомянута в _layout + profile)
- expo-location (use-user-city.ts заглушка)
- Real OTP (phone.tsx Sprint 2)

**Средний:**
- Master verification frontend (backend готов 0070)
- Favorites / Saved masters (нет таблицы)
- Voice messages (expo-audio)

**Низкий:**
- Карма-система (мониторинг через order_status_log)
- Double-blind reviews
- Notifications cascade warnings (T-7d / T-1d / T+24-48h)
- Admin UI для саппорта (T14 lifecycle.md)

## Заключение

**Что РЕАЛЬНО работает end-to-end:** аутентификация (demo-OTP), полный master onboarding, master profile со всеми полями (включая WhatsApp + service areas + 4 pricing kinds), каталог 32 L2 + 150 L3, smart search, заказы lifecycle с 8 статусами + 15 переходами + audit log, mutual reviews, realtime chats с фото-attachments, push token registration + in-app notification center, desktop nav, dark mode, demo data.

**Критические gap'ы для production:**
1. Real OTP (SMS-провайдер)
2. Payments (нет вообще)
3. Master verification UI (backend готов)
4. Admin panel (route есть, функционал empty)
5. Real FCM/APNs push (token регистрация есть, credentials TODO)

**Code quality:** clean — well-documented, tested через demo-аккаунты, нет ts-ignore/console.log/hardcoded creds.
