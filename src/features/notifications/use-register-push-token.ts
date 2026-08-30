// Push-уведомления ОТКЛЮЧЕНЫ для v1 (2026-06-07) — этот файл сделан заглушкой.
//
// Почему: пакет `expo-notifications` автоматически добавляет в iOS-сборку
// разрешение `aps-environment`, а provisioning profile (создаётся по
// App Store Connect API-ключу) его не содержит — для push нужен APNs-ключ Apple,
// а он требует интерактивного входа по паролю Apple (через API-ключ нельзя).
// Чтобы выложить первую версию в App Store без push, пакет expo-notifications
// удалён из зависимостей, а этот хук превращён в no-op. Экспортируемый API
// сохранён — потребители (`app/_layout.tsx`, `src/lib/auth.ts`) не меняются.
//
// КАК ВЕРНУТЬ PUSH В ОБНОВЛЕНИИ:
//   1. `npm i expo-notifications@~0.32.17`
//   2. вернуть плагин `["expo-notifications", { "color": "#2563eb" }]` в app.json → plugins
//   3. создать APNs-ключ Apple (.p8) на developer.apple.com → Keys (с галкой APNs)
//      и добавить его в EAS (`eas credentials` → iOS → Push Notifications)
//   4. восстановить полную реализацию этого файла из git (коммит до 2026-06-07).

/**
 * No-op: регистрация push-токена отключена в v1 (expo-notifications удалён).
 * Сигнатура сохранена, чтобы вызов в app/_layout.tsx не менялся.
 */
export function useRegisterPushToken(_userId: string | null | undefined): void {
  // push отключён в v1 — ничего не делаем
}

/**
 * No-op: снятие push-токена при выходе. Сигнатура сохранена для src/lib/auth.ts.
 */
export async function unregisterCurrentPushToken(): Promise<void> {
  // push отключён в v1 — ничего не делаем
}
