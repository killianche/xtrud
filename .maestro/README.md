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

## Запуск smoke-тестов

**Client happy-path** (телефон → клиент → создать заказ):

```bash
maestro test .maestro/smoke.yaml
```

**Master happy-path** (телефон → мастер → профиль → feed заказов):

```bash
maestro test .maestro/master-smoke.yaml
```

**Chat happy-path** (открыть существующий чат → отправить сообщение). ⚠️ Требует
seed на dev-БД:

```bash
# 1. Заполняем dev-БД фикстурой (создаёт client+master+order+chat+message).
psql "$DATABASE_URL" -f supabase/seed-test/chat-fixture.sql

# 2. Прогоняем smoke.
maestro test .maestro/chat-smoke.yaml
```

**Review happy-path** (открыть completed-заказ → 5★ → отзыв). Тот же fixture,
дополнительно создаёт completed order id=6666…:

```bash
psql "$DATABASE_URL" -f supabase/seed-test/chat-fixture.sql
maestro test .maestro/review-smoke.yaml
```

`DATABASE_URL` — connection string на dev/local Supabase. **Никогда** не
запускай fixture на проде: он инсертит фейковых юзеров напрямую в `auth.users`.

Отдельные сегменты (после ручного выхода из аккаунта / смены состояния):

```bash
# Общий префикс — auth.
maestro test .maestro/flows/01-auth.yaml

# Client ветка.
maestro test .maestro/flows/02-onboarding-client.yaml
maestro test .maestro/flows/03-create-order.yaml

# Master ветка.
maestro test .maestro/flows/04-onboarding-master.yaml
maestro test .maestro/flows/05-master-feed.yaml

# Chat ветка — после fixture.
maestro test .maestro/flows/06-chat.yaml

# Review ветка — после fixture (тот же скрипт, completed-order 6666…).
maestro test .maestro/flows/07-review.yaml
```

⚠️ В `master-smoke.yaml` используется **другой тестовый номер**
(`+7 999 222-33-44`), чтобы master и client регистрировались как разные
пользователи и не конфликтовали в БД при прогоне обоих сценариев подряд.

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

Покрыто:

- **Client happy-path**: телефон → OTP → роль клиента → создание заказа
- **Master happy-path**: телефон → OTP → роль мастера → профиль → просмотр feed (3 таба)
- **Chat happy-path**: вход в существующий чат → отправка сообщения (требует fixture)
- **Review happy-path**: открыть completed-заказ → 5★ → текст → submit → assert «Ваш отзыв» (требует fixture)

Не покрыто (бэклог):

- **Отправка отклика мастером** — требует сидов с заказом от другого клиента
- **Realtime получение сообщения** в чате — нужен второй симулятор / реальное устройство
- **Полный E2E lifecycle** в одном прогоне (создание → отклик → accept → chat → complete → review) — сейчас покрыто 4 отдельными flow
- **Push-уведомления** (вне Maestro — нужен отдельный stub)
- **Master review клиента** — обратное направление, симметрично review smoke
- **Категории мастера** (master-categories.tsx — отдельный экран, не часть онбординг-визарда)

Покрытие расширяем по мере того, как фичи становятся production-stable.
