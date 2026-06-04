# Настройка реального входа по SMS (SMS.ru) — что сделать в дашборде Supabase

> TL;DR: код приложения уже готов (реальный OTP-вход), edge-функция `send-sms`
> задеплоена. Осталось 4 шага в дашборде Supabase + 1 тест с реального телефона.
> **До завершения этих шагов веб НЕ деплоить** — вход реальных номеров сломается.

## Архитектура (как устроено)

1. Пользователь вводит номер → приложение зовёт `supabase.auth.signInWithOtp({ phone })`.
2. Supabase **сам генерирует код**, сохраняет, и зовёт наш **Send SMS Hook**.
3. Hook = edge-функция `send-sms` → отправляет код через **SMS.ru** на номер.
4. Пользователь вводит код → `supabase.auth.verifyOtp(...)` → **Supabase сам проверяет** код → вход.

Мы НЕ генерируем и НЕ проверяем код сами — это делает Supabase (безопасно).
Наш код только доставляет SMS. Файлы:
- Edge-функция: `supabase/functions/send-sms/index.ts` (задеплоена как `send-sms`).
- Фронт: `src/lib/auth.ts` (`sendOtpToPhone` / `verifyOtpCode`), экраны `app/(auth)/phone.tsx` → `verify.tsx`.

## Шаги в дашборде Supabase (проект xtrud, wgeimsajvjkzrrnfrnkb)

### Шаг 1. Включить вход по телефону
**Authentication → Sign In / Providers → Phone** → включить (Enable Phone provider).
SMS provider внутри можно оставить любой (Twilio) — он НЕ будет использоваться,
потому что мы переопределяем отправку через hook (шаг 3). Главное — phone-вход включён.

### Шаг 2. Положить секрет SMS.ru
**Edge Functions → (или Project Settings → Edge Functions) → Secrets** → добавить:
- `SMSRU_API_ID` = `<API-ключ из личного кабинета SMS.ru>`
  ⚠️ Ключ, который был в чате (6D8A…), рекомендуется СМЕНИТЬ в SMS.ru на новый
  (он засветился в переписке) и сюда вписать новый.
- (опц.) `SMSRU_FROM` = зарегистрированное имя отправителя, если оформишь в SMS.ru.

### Шаг 3. Подключить Send SMS Hook
**Authentication → Hooks (Auth Hooks) → Send SMS hook** → Enable → тип **HTTPS**:
- URI: `https://wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/send-sms`
- Дашборд сгенерирует **Secret** (формат `v1,whsec_...`) — скопируй его.
- Вернись в **Edge Functions → Secrets** и добавь:
  - `SEND_SMS_HOOK_SECRET` = `<этот v1,whsec_... секрет>`

### Шаг 4. Тестовый номер для ревью Apple (без реального SMS)
**Authentication → Sign In / Providers → Phone → Test OTP** (или поле «Test phone numbers»):
- Добавь: `+79000000001` → код `123456`
Этот номер при входе НЕ вызывает SMS — Supabase сразу принимает фикс-код.
Его и укажем ревьюеру Apple (см. `APP_STORE_LISTING.md` §5).

## Шаг 5. Тест с реального телефона
1. Открой приложение (web/preview), введи СВОЙ реальный номер.
2. Должна прийти SMS с кодом «Kod dlya vhoda v xtrud: XXXX».
3. Введи код → вход.
Если SMS не пришла — смотри логи: **Edge Functions → send-sms → Logs** (там
ошибка от SMS.ru: нет баланса / номер не одобрен / неверный ключ и т.п.).

## После успешного теста
- Сообщи агенту «SMS работает» → он задеплоит веб (`deploy/web.sh`).
- В iOS/Android сборку demo-флаг НЕ попадает — там сразу реальный OTP.

## Частые проблемы
- **«Invalid signature» в логах** → не совпадает `SEND_SMS_HOOK_SECRET` (шаг 3).
- **«SMS.ru: ...» ошибка** → проблема на стороне SMS.ru (баланс/ключ/модерация).
- **Код не проверяется** → phone-провайдер не включён (шаг 1).
- **Demo-номера (+79000…)** на web/preview работают по email/паролю (флаг demo),
  реальные — по SMS. На проде iOS/Android — все по SMS.

## История
- 2026-06-04 — реализован реальный SMS-вход. Edge `send-sms` задеплоена,
  фронт переключён на signInWithOtp/verifyOtp, demo-ветка сохранена за флагом.
  Ждёт настройки дашборда (шаги 1-4) + теста (шаг 5) перед web-деплоем.
