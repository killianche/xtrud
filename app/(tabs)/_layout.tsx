import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import { Tabs } from "expo-router";
import { ClipboardText, ImageSquare, UserCircle } from "phosphor-react-native";
import { TabBar } from "@/components/TabBar";
import { XtrudLogo } from "@/components/XtrudLogo";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useTouchLastActive } from "@/features/auth/use-touch-last-active";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useRealtimeFeed, useUnreadFeedCount } from "@/features/orders/use-unread-feed";
import {
  useRealtimeMyResponses,
  useUnreadResponsesCount,
} from "@/features/orders/use-unread-responses";
import { useColorScheme } from "@/hooks/use-color-scheme";
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

  // Отмечаем онлайн-активность (рейтинг мастеров, Этап 2). Троттл внутри хука.
  useTouchLastActive(!!userId);

  useRealtimeMyResponses(isClientRole ? userId : null);

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

  // Десктопная WebShell-обёртка убрана 2026-05-21: сайт всегда в телефонном
  // виде (PhoneFrame + useAppWidth), даже на широком окне → всегда нижние табы.
  return (
    <NavThemeProvider value={navTheme}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="index"
          options={{
            title: "Главная",
            tabBarIcon: ({ color }) => <XtrudLogo size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Заказы",
            tabBarIcon: ({ color, focused }) => (
              <ClipboardText color={color} size={26} weight={focused ? "fill" : "bold"} />
            ),
            tabBarBadge: ordersBadge,
            tabBarBadgeStyle: badgeStyle,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Сбрасываем стек orders/ на корень. Без этого тап «Заказы»
              // на orders/category-select или orders/new оставлял текущий
              // экран открытым.
              e.preventDefault();
              navigation.navigate("orders", { screen: "index" } as never);
            },
          })}
        />
        <Tabs.Screen
          name="cases"
          options={{
            title: "Ваши работы",
            // Только для мастера. У клиента — href: null = вкладка скрыта.
            href: isMasterRole ? undefined : null,
            // Иконка картинки — вкладка показывает фото работ (фидбэк user 2026-05-20).
            tabBarIcon: ({ color, focused }) => (
              <ImageSquare color={color} size={26} weight={focused ? "fill" : "bold"} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Тап «Ваши работы» когда уже внутри /cases/[caseId] → сброс на
              // список работ (стандартный mobile-pattern). Без этого тап по
              // активной вкладке оставлял открытой детальную работу.
              e.preventDefault();
              navigation.navigate("cases", { screen: "index" } as never);
            },
          })}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Профиль",
            tabBarIcon: ({ color, focused }) => (
              <UserCircle color={color} size={26} weight={focused ? "fill" : "bold"} />
            ),
          }}
        />
        {/* Detail-экраны (одиночные файлы, прямые дети Tabs) — НЕ показываем в
          нижней панели. NB: только реальные прямые дети навигатора. Роуты
          внутри вложенных стеков/папок (orders/search, orders/my-responses —
          живут в стеке `orders/_layout`; admin/*, useful/* — в своих папках)
          сюда НЕ объявляются: для Tabs они не существуют как прямые дети, и
          объявление их через <Tabs.Screen> вызывало шторм предупреждений
          «No route named … exists in nested children» (аудит 2026-05-28).
          От нижней панели они и так скрыты — кастомный TabBar рендерит только
          TAB_ORDER (index/orders/cases/profile). */}
        <Tabs.Screen name="category/[id]" options={{ href: null }} />
        <Tabs.Screen name="master/[id]" options={{ href: null }} />
        <Tabs.Screen name="client/[id]" options={{ href: null }} />
        <Tabs.Screen name="admin/ratings" options={{ href: null }} />
        <Tabs.Screen name="admin/reports" options={{ href: null }} />
        <Tabs.Screen name="search" options={{ href: null }} />
        {/* favorites — отдельный root-таб (не подпункт профиля). Скрыт из
          автоматической нижней панели; кастомный TabBar рендерит для клиента
          центральную кнопку «закладки», которая push'ит сюда. См. шапку
          app/(tabs)/favorites/index.tsx о причине переноса. */}
        <Tabs.Screen name="favorites" options={{ href: null }} />
      </Tabs>
    </NavThemeProvider>
  );
}
