import { ChatCircle } from "phosphor-react-native";
import { Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { ChatsListContent } from "@/features/chat/ChatsListContent";

export default function ChatsListScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  // На desktop web список живёт в sidebar (см. chats/_layout.tsx).
  // На /chats без выбранного thread показываем placeholder в main pane.
  if (isDesktopWeb) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <EmptyState
          icon={ChatCircle}
          emoji="💬"
          title="Выберите чат"
          hint="Выберите диалог слева, чтобы продолжить общение."
        />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ChatsListContent variant="page" />
    </View>
  );
}
