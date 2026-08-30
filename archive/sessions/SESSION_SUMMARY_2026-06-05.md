# Session summary — 2026-06-05

## TL;DR
SMS-вход заменён на **телефон/почта + пароль** (SMS оказался платным: SMS.ru берёт 2000–2550 ₽/мес за каждое буквенное имя отправителя). Регистрация = телефон + почта + пароль; вход = почта **или** телефон + пароль; сброс пароля — по почте. Прежнее жёсткое правило «email никогда» владелец осознанно отменил. Всё проверено вживую в браузере (регистрация → авто-вход, вход по телефону и по почте, отправка письма сброса).

## Закрытые задачи
1. **Замена SMS на пароль+почта** (#48) — полный цикл: логика, серверная функция, RPC, 4 экрана, проверка.

## Что и где
- **`src/features/auth/validation.ts`** — схемы `loginFormSchema` / `registerFormSchema` / `forgotPasswordSchema`, хелпер `looksLikeEmail`.
- **`src/lib/auth.ts`** — `registerWithCredentials` (через серверную функцию), `loginWithCredentials` (почта/телефон → RPC → signInWithPassword), `requestPasswordReset`, `updatePassword`. SMS-функции `sendOtpToPhone`/`verifyOtpCode` оставлены дормантом.
- **`src/features/auth/use-auth-mutations.ts`** — хуки `useRegister`/`useLogin`/`useRequestReset`/`useUpdatePassword` (+ старые `useSendOtp`/`useVerifyOtp` дормант).
- **RPC `resolve_login_email(p_login)`** (миграция) — почта as-is; телефон → email по `users_private.phone`. Типы БД перегенерированы (`src/types/database.ts`).
- **Серверная функция `supabase/functions/register-user/index.ts`** (deployed, verify_jwt=false) — admin `createUser` с `email_confirm:true` → создаёт сразу подтверждённого пользователя (минуя «Confirm email» в дашборде) + сохраняет телефон. Отвечает всегда 200 `{ok|error}`.
- **Экраны** (через роль `xtrud-designer`, обе темы, 8 grep-чеков чистые):
  - `app/(auth)/phone.tsx` — переделан в экран **входа** (поле «почта или телефон» + пароль с глазком + «Забыли пароль?» + «Зарегистрироваться»). Route не менялся — на него ведут 10 ссылок по проекту.
  - `app/(auth)/register.tsx` — **новый**: телефон (с выбором страны) + почта + пароль + согласие с условиями.
  - `app/(auth)/forgot-password.tsx` — **новый**: почта → success-state «письмо отправлено».
  - `app/reset-password.tsx` — **новый** top-level route: новый пароль по ссылке из письма; обрабатывает recovery-сессию + состояние «ссылка недействительна».
- **`app/_layout.tsx`** — `/reset-password` добавлен в allowlist маршрутизации (чтобы recovery-сессия не выбрасывала со страницы).
- **`tsconfig.json`** — `exclude: ["node_modules", "supabase/functions"]` (Deno-функции не должны попадать в проверку приложения — убрало шум от `send-sms`/`register-user`).

## Новые правила и решения
- **CLAUDE.md инфра-правило №6 переписано** — «email никогда» → «телефон + почта + пароль». Разворот осознанный, по решению владельца 2026-06-05.
- **Auth-идентичность = настоящая почта** (нужно для `resetPasswordForEmail`); телефон вторичен, хранится в `users_private.phone`, сопоставляется через RPC. Trade-off приватности (перебор почты по номеру через RPC) принят для v1.
- **Регистрация через серверную функцию**, а не клиентский signUp — чтобы не требовать ручного выключения «Confirm email» в дашборде и чтобы вход работал сразу.

## Anti-patterns / подводные камни
- **Встроенная почта Supabase ограничена ~2 письма/час** — для прода обязателен внешний SMTP (Resend/SendGrid/SES в Supabase → Auth → SMTP), иначе письма сброса пароля массово не дойдут. На тесте «Забыли пароль» упёрся в `email rate limit exceeded` — это лимит сервиса, не баг кода.
- **`@example.com` Supabase отвергает** как недоставляемый домен — для тестов брать реальные домены.
- В превью RN-web Pressable надёжно «нажимается» только полной последовательностью pointer-событий на верхнем элементе (`elementFromPoint`), а не просто `click`.

## Открытые вопросы / TODO
- Подключить внешний SMTP в Supabase для писем сброса пароля (для прода).
- Deep-link `/reset-password` на мобильных (сейчас сброс отлажен на вебе; на iOS/Android нужен universal link на экран сброса — проверить при сборке приложения).
- Перед публичным запуском выключить demo-вход (`EXPO_PUBLIC_ENABLE_DEMO`).
