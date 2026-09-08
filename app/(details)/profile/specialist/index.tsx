/**
 * /profile/specialist — «Я специалист» из аккаунта. Тело —
 * `SpecialistHubBody`, оно же во вкладке «Специалисты» → «Я специалист».
 */

import { Redirect, useRouter } from "expo-router";
import { FormScreen } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { SpecialistHubBody } from "@/features/specialist/SpecialistHubBody";
import { useMySpecialistProfile } from "@/features/specialist/use-specialist";

export default function SpecialistHubScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const profile = useMySpecialistProfile(userId);

  if (!userId) return <Redirect href="/(auth)/phone" />;
  if (profile.isFetched && profile.data === null) return <Redirect href="/(tabs)/profile" />;

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
