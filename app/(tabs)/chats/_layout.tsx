import { Slot, Stack, usePathname } from "expo-router";
import { Platform, useWindowDimensions, View } from "react-native";
import { ChatsListContent } from "@/features/chat/ChatsListContent";

export default function ChatsLayout() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const pathname = usePathname();

  // pathname вида "/chats/abc123" → selectedChatId = "abc123".
  // "/chats" → null (placeholder).
  const selectedChatId = extractChatId(pathname);

  if (isDesktopWeb) {
    return (
      <View className="flex-1 flex-row bg-canvas">
        <View className="border-hairline border-r bg-canvas" style={{ width: 360 }}>
          <ChatsListContent variant="sidebar" selectedChatId={selectedChatId} />
        </View>
        <View className="flex-1">
          <Slot />
        </View>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}

function extractChatId(pathname: string): string | null {
  const match = pathname.match(/^\/chats\/([^/]+)/);
  return match?.[1] ?? null;
}
