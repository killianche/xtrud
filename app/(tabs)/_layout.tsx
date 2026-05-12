import { Tabs } from "expo-router";
import { ClipboardList, Home, MessageCircle } from "lucide-react-native";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { unreadChatsCount, useMyChats } from "@/features/chat/use-my-chats";
import { useRealtimeMyChats } from "@/features/chat/use-realtime-my-chats";
import {
  useRealtimeMyResponses,
  useUnreadResponsesCount,
} from "@/features/orders/use-unread-responses";

function badgeLabel(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 99 ? "99+" : String(n);
}

export default function TabsLayout() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const isClientRole = (user?.active_role ?? "client") === "client";

  useRealtimeMyChats(userId);
  useRealtimeMyResponses(isClientRole ? userId : null);

  const { data: chats } = useMyChats(userId);
  const chatsBadge = badgeLabel(unreadChatsCount(chats, userId));

  const { data: unreadResponses = 0 } = useUnreadResponsesCount(isClientRole ? userId : null);
  const ordersBadge = badgeLabel(unreadResponses);

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
          tabBarBadge: ordersBadge,
          tabBarBadgeStyle: { backgroundColor: "#ef4444", color: "#ffffff" },
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
