/**
 * /profile/specialist — «Я специалист» из аккаунта. Тело —
 * `SpecialistHubBody`, оно же во вкладке «Специалисты» → «Я специалист».
 *
 * Профиль специалиста есть у каждого (0186). Раньше при его отсутствии экран
 * уводил на /(tabs)/profile — и хаб не успевал создать профиль сам.
 */

import { Redirect, useRouter } from "expo-router";
import { FormScreen } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { SpecialistHubBody } from "@/features/specialist/SpecialistHubBody";

export default function SpecialistHubScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  if (!userId) return <Redirect href="/(auth)/phone" />;

  return (
    <FormScreen
      title="Я специалист"
      subtitle="Категории, о себе, фото работ, контакты"
      onBack={() => router.back()}
    >
      <SpecialistHubBody userId={userId} />
    </FormScreen>
  );
}
