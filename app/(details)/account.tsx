/**
 * /account — экран профиля переходом (из уведомлений, настроек и т.п.).
 * То же содержимое, что во вкладке «Профиль» (AccountBody); этот маршрут
 * оставлен для старых ссылок и «назад» из вложенных экранов.
 */

import { Redirect, useRouter } from "expo-router";
import { FormScreen } from "@/components/ui";
import { AccountBody } from "@/features/account/AccountBody";
import { useAuthSession } from "@/features/auth/use-auth-session";

export default function AccountScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  if (!userId) return <Redirect href="/(auth)/phone" />;
  return (
    <FormScreen title="Профиль" onBack={() => router.back()}>
      <AccountBody userId={userId} />
    </FormScreen>
  );
}
