import { Tabs } from "expo-router";
import { ClipboardList, Home, MessageCircle } from "lucide-react-native";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { unreadChatsCount, useMyChats } from "@/features/chat/use-my-chats";
import { useRealtimeMyChats } from "@/features/chat/use-realtime-my-chats";

export default function TabsLayout() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  useRealtimeMyChats(userId);
  const { data: chats } = useMyChats(userId);
  const unread = unreadChatsCount(chats, userId);
  const chatsBadge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Заказы",
          tabBarIcon: ({ color, size }) => (
            <ClipboardList color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Чаты",
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} strokeWidth={1.75} />
          ),
          tabBarBadge: chatsBadge,
          tabBarBadgeStyle: { backgroundColor: "#ef4444", color: "#ffffff" },
        }}
      />
      {/* Detail-экраны — НЕ показываем в нижней панели табов. */}
      <Tabs.Screen name="category/[id]" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="master/[id]" options={{ href: null }} />
      <Tabs.Screen name="client/[id]" options={{ href: null }} />
    </Tabs>
  );
}
