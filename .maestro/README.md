# Maestro E2E smoke-tests

UI-уровневая страховка от регрессий для критического happy-path:
**телефон → OTP → выбор роли → создание заказа**.

## Зачем

Vitest покрывает чистую логику (sort, pluralize, outcome-store), но регрессии
в навигации Expo Router / RHF-формах / Supabase mutations он не ловит. Maestro
прогоняет приложение как пользователь — на симуляторе iOS / эмуляторе Android
/ реальном устройстве — и валит, если happy path сломан.

## Установка Maestro CLI

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version  # 1.40+
```

## Подготовка окружения

Maestro **не запускает приложение сам** — нужен уже установленный билд на
iOS Simulator или Android Emulator (или реальный девайс по USB).

### iOS Simulator

```bash
# Скомпилировать dev-билд (один раз)
npx expo run:ios

# Запустить симулятор и проверить, что bundle загружается
open -a Simulator
```

### Android Emulator

```bash
npx expo run:android
```

Maestro сам найдёт первое подключённое устройство. Если устройств несколько —
`maestro --device <udid> test ...`.

## Запуск smoke-теста

Полный happy-path:

```bash
maestro test .maestro/smoke.yaml
```

Отдельные сегменты (после ручного выхода из аккаунта / смены состояния):

```bash
maestro test .maestro/flows/01-auth.yaml
maestro test .maestro/flows/02-onboarding-client.yaml
maestro test .maestro/flows/03-create-order.yaml
```

## Переопределение тестовых данных

Дефолты лежат в `.maestro/config.yaml` и `smoke.yaml`. Когда сиды БД отличаются
(другие категории/города), переопредели через `--env`:

```bash
maestro test \
  --env TEST_CATEGORY="Электрика" \
  --env TEST_CITY="Магас" \
  --env TEST_PHONE="+7 999 888-77-66" \
  --env TEST_OTP="654321" \
  .maestro/smoke.yaml
```

## Зависимости от состояния бэкенда

1. **OTP**: на момент Sprint 7 в auth-mutations стоит заглушка — любой 6-значный
   код принимается. Когда Sprint 2 (real SMS) включит реальный провайдер, нужно
   будет добавить **whitelisted test phone** в Supabase Auth (`+7 999 111-22-33`)
   и зашить фиксированный код через "Test OTP" фичу Supabase. До этого момента
   тест работает только с симуляцией.

2. **Seed данных**: `TEST_CATEGORY="Сантехника"` и `TEST_CITY="Назрань"` —
   подобраны под `supabase/seed.sql`. Если переинициализировал БД с другим
   seed — переопредели env (см. выше).

3. **Чистое состояние**: `launchApp` стартует с `clearState: true` и
   `clearKeychain: true`, поэтому каждый запуск создаёт **нового** пользователя
   на тестовом номере. Это означает, что в БД накапливаются записи — раз в N
   запусков рекомендуется чистить таблицу `users` для тестового phone:
   ```sql
   delete from auth.users where phone = '+79991112233';
   ```

## CI

E2E **не включён в `.github/workflows/ci.yml`** — для прогона нужен macOS
runner с iOS Simulator (≈8x дороже стандартного Linux) либо отдельный
Android Emulator runner. Рассматриваем после выхода из MVP, когда стабильность
flow подтвердится локально.

Локально пускаем перед каждым релизом dev-билда и после крупных правок навигации
или auth.

## Ограничения текущего покрытия

Покрыт **один** сценарий — клиент создаёт заказ. Не покрыто (бэклог):

- Мастер: онбординг (роль → выбор категорий → профиль) + отклик на заказ
- Чат: открытие диалога, отправка сообщения
- Завершение заказа: отзыв + 5 звёзд
- Push-уведомления (вне Maestro — нужен отдельный stub)

Покрытие расширяем по мере того, как фичи становятся production-stable.
