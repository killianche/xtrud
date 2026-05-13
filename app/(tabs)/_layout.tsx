import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import { Slot, Tabs } from "expo-router";
import { ClipboardList, Home, MessageCircle } from "lucide-react-native";
import { Platform, useWindowDimensions } from "react-native";
import { TabBar } from "@/components/TabBar";
import { WebShell } from "@/components/WebShell";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { unreadChatsCount, useMyChats } from "@/features/chat/use-my-chats";
import { useRealtimeMyChats } from "@/features/chat/use-realtime-my-chats";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useRealtimeFeed, useUnreadFeedCount } from "@/features/orders/use-unread-feed";
import {
  useRealtimeMyResponses,
  useUnreadResponsesCount,
} from "@/features/orders/use-unread-responses";
import { useThemeColors } from "@/lib/use-theme-color";

function badgeLabel(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 99 ? "99+" : String(n);
}

export default function TabsLayout() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const isClientRole = (user?.active_role ?? "client") === "client";
  const isMasterRole = !isClientRole;

  useRealtimeMyChats(userId);
  useRealtimeMyResponses(isClientRole ? userId : null);

  const { data: chats } = useMyChats(userId);
  const chatsBadge = badgeLabel(unreadChatsCount(chats, userId));

  // Client-side: unread responses on my orders.
  const { data: unreadResponses = 0 } = useUnreadResponsesCount(isClientRole ? userId : null);

  // Master-side: unread feed orders by my L2 categories since last_seen_feed_at.
  const { data: myCats } = useMyMasterCategories(isMasterRole ? userId : undefined);
  const masterL2Ids = myCats?.map((c) => c.l2_id) ?? [];
  const lastSeenFeedAt = user?.last_seen_feed_at ?? null;
  useRealtimeFeed({
    userId: isMasterRole ? userId : null,
    l2Ids: masterL2Ids,
  });
  const { data: unreadFeed = 0 } = useUnreadFeedCount({
    userId: isMasterRole ? userId : null,
    l2Ids: masterL2Ids,
    lastSeenAt: lastSeenFeedAt,
  });

  const ordersBadge = badgeLabel(isClientRole ? unreadResponses : unreadFeed);

  const tc = useThemeColors(["error", "canvas", "hairline", "ink"]);
  // Бейдж всегда на цветном фоне → текст фиксировано белый в обоих режимах.
  const badgeStyle = { backgroundColor: tc.error, color: "#fff" };

  const { colorScheme } = useColorScheme();
  const baseNavTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    colors: {
      ...baseNavTheme.colors,
      background: tc.canvas,
      card: tc.canvas,
      border: tc.hairline,
      text: tc.ink,
      primary: tc.ink,
    },
  };

  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  if (isDesktopWeb) {
    return (
      <WebShell chatsBadge={chatsBadge} ordersBadge={ordersBadge}>
        <Slot />
      </WebShell>
    );
  }

  return (
    <NavThemeProvider value={navTheme}>
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={24} strokeWidth={focused ? 2.25 : 1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Заказы",
          tabBarIcon: ({ color, focused }) => (
            <ClipboardList color={color} size={24} strokeWidth={focused ? 2.25 : 1.5} />
          ),
          tabBarBadge: ordersBadge,
          tabBarBadgeStyle: badgeStyle,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Чаты",
          tabBarIcon: ({ color, focused }) => (
            <MessageCircle color={color} size={24} strokeWidth={focused ? 2.25 : 1.5} />
          ),
          tabBarBadge: chatsBadge,
          tabBarBadgeStyle: badgeStyle,
        }}
      />
      {/* Detail-экраны — НЕ показываем в нижней панели табов. */}
      <Tabs.Screen name="category/[id]" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="master/[id]" options={{ href: null }} />
      <Tabs.Screen name="client/[id]" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
    </NavThemeProvider>
  );
}
