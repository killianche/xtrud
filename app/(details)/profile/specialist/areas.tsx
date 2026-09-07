/**
 * /profile/specialist/areas — где работаете. Существующий блок выбора
 * городов и районов внутри общего экрана.
 */

import { useRouter } from "expo-router";
import { View } from "react-native";
import { FormScreen } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { ServiceAreasSection } from "@/features/master-profile/ServiceAreasSection";

export default function SpecialistAreasScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  return (
    <FormScreen
      title="Где работаете?"
      subtitle="Клиенты видят это в профиле, а вы — задания рядом."
      onBack={() => router.back()}
    >
      <View className="px-4">{userId ? <ServiceAreasSection masterId={userId} /> : null}</View>
    </FormScreen>
  );
}
