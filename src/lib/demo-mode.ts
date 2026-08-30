/**
 * Demo-mode флаг — управляет видимостью demo-аккаунтов (P0-09 launch-readiness).
 *
 * Зачем: в БД сейчас 30 demo-аккаунтов (Алина, Магомед, Адам и т.п. — это
 * `users.is_demo=true`). В **dev** мы хотим их видеть (тестирование).
 * В **prod** реальные клиенты не должны видеть эти аккаунты в каталоге,
 * top-masters carousel и orders feed.
 *
 * Управление: env var `EXPO_PUBLIC_DEMO_MODE`.
 *   - `"true"` или unset → demo показываются (default для dev).
 *   - `"false"` → demo скрыты (production submit-сборка).
 *
 * Чтобы переключить для prod: в `eas.json → build.production.env` поставить
 * `"EXPO_PUBLIC_DEMO_MODE": "false"`. Локально для preview через
 * `.env.local` (`EXPO_PUBLIC_DEMO_MODE=false`) — проверка prod-видимости.
 *
 * Применение в hooks: импортировать `shouldHideDemo()` и filter'ить результат
 * после fetch на клиенте. Server-side это нельзя сделать через .neq() в
 * embedded-select (master_categories embedded users), пришлось бы переписывать
 * запросы — клиентский filter проще и достаточно для UX.
 */

/** true когда демо-аккаунты нужно скрыть (production submit-сборка). */
export function shouldHideDemo(): boolean {
  // `process.env.EXPO_PUBLIC_DEMO_MODE` — статически inlin'ится Metro при сборке.
  return process.env.EXPO_PUBLIC_DEMO_MODE === "false";
}
