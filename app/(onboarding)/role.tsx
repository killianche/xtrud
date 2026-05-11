// Stub для sprint 2.1 — реальный UI выбора роли в sprint 2.2.
import { ActivityIndicator, View } from "react-native";
import { AppText } from "@/components/AppText";

export default function RoleScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <ActivityIndicator />
      <AppText className="mt-4 text-body-md text-muted">Загружаем выбор роли…</AppText>
    </View>
  );
}
