# Maestro smoke tests

Эти сценарии проверяют текущий iOS/Android device UI без изменения данных.
Они не создают заказы, не отправляют отклики, не редактируют профиль и не
опираются на удалённые chat/lifecycle/OTP-функции.

## Требования

- Maestro CLI установлен локально.
- На simulator/emulator или физическом устройстве установлена проверяемая
  сборка `com.xtrud.app`.
- Для authenticated smoke используется отдельный клиентский test/review account
  с завершённым onboarding.
- Credentials получены из password manager и существуют только в переменных
  процесса.

## Guest smoke

Проверяет первый запуск, главную, гостевой профиль и форму password-входа:

```bash
maestro test .maestro/smoke.yaml
```

## Authenticated read-only smoke

Проверяет email/phone + password, авторизованный профиль, главную и список
заказов клиента:

```bash
maestro test \
  --env E2E_LOGIN="$E2E_LOGIN" \
  --env E2E_PASSWORD="$E2E_PASSWORD" \
  .maestro/authenticated-smoke.yaml
```

Не передавайте credentials строковыми литералами в command history. Загружайте
их через утверждённый password-manager CLI или временную локальную сессию.
Значения и правила ротации описаны в `DEMO_ACCOUNTS.md` без раскрытия секретов.

## Что не покрывается

Мутационные product-сценарии — регистрация, создание/редактирование заказа,
отклик, жалоба, review и удаление аккаунта — проверяются отдельным ручным планом
на предназначенных синтетических данных. Старые сценарии чата, принятия мастера,
завершения сделки и OTP удалены: Git хранит их историю, но запускать их нельзя.

Android остаётся future release target. Успех одного и того же YAML на iOS не
заменяет отдельный Android manifest/permissions/build/device gate.
