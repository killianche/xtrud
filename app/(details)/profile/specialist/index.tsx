/**
 * /profile/specialist — редирект-страховка для старых диплинков.
 *
 * Слияние 2026-10-23 (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md): настройки
 * специалиста переехали в `AccountBody` — вкладка /(tabs)/profile сразу и
 * есть профиль специалиста, отдельного экрана-хаба больше нет. Маршрут
 * остаётся редиректом, потому что уже отправленные push-уведомления
 * `master_hidden`/`master_shown` могли сослаться на этот путь; новые
 * уведомления ведут на /(tabs)/profile напрямую (notification-target.ts).
 */

import { Redirect } from "expo-router";
import { useAuthSession } from "@/features/auth/use-auth-session";

export default function SpecialistHubRedirect() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  if (!userId) return <Redirect href="/(auth)/phone" />;
  return <Redirect href="/(tabs)/profile" />;
}
