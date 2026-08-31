import { Tabs } from "expo-router";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "expo-router/react-navigation";
import { ClipboardText, MagnifyingGlass, UserCircle } from "phosphor-react-native";
import type { ColorValue } from "react-native";
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

// Начиная с expo-router 57 `options.tabBarIcon` отдаёт `color` как `ColorValue`
// (`string | OpaqueColorValue`), а не `string`
// (node_modules/expo-router/build/react-navigation/bottom-tabs/types.d.ts).
// Иконки — SVG (react-native-svg / Phosphor), их prop `color` принимает только
// строку. Единственный источник значения — наш собственный `TabBar.tsx`, он
// подставляет токен из `useThemeColors` (`Record<token, string>`); PlatformColor
// и DynamicColorIOS в проекте не используются, поэтому строка приходит всегда.
// `undefined` в невозможной ветке отдаёт компоненту его собственный цвет по
// умолчанию — это безопаснее, чем приводить непрозрачное значение к строке.
function iconColor(color: ColorValue): string | undefined {
  return typeof color === "string" ? color : undefined;
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

  // «Мои задания» (orders) — бейдж только у клиента (непрочитанные отклики на
  // его заказы). У мастера «Мои задания» — список собственных откликов, там
  // непрочитанного не бывает.
  const ordersBadge = isClientRole ? badgeLabel(unreadResponses) : undefined;
  // «Найти задание» (find) — бейдж только у мастера (непрочитанные заявки в
  // ленте по его категориям). Перенесён сюда с мёртвого редиректящего таба
  // orders (2026-08-30): раньше висел там, хотя мастер видел заявки не на
  // «Заказах», а в поиске.
  const findBadge = isMasterRole ? badgeLabel(unreadFeed) : undefined;

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
            tabBarIcon: ({ color }) => <XtrudLogo size={24} color={iconColor(color)} />,
          }}
        />
        {/* Tabs contain only root lists. Full-screen forms, pickers and detail
            routes live in `app/(details)` so the root native Stack preserves
            the real caller and provides the standard iOS edge-swipe. */}
        {/* «Найти задание» — только у мастера (клиент ничего не ищет и не
            откликается, у него — href: null = вкладка скрыта). До 2026-08-30
            жил как кастомный псевдо-таб «Смотреть заказы» в центре TabBar,
            физически под /orders/search; теперь настоящий Tabs.Screen /find. */}
        <Tabs.Screen
          name="find"
          options={{
            title: "Найти задание",
            href: isMasterRole ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <MagnifyingGlass
                color={iconColor(color)}
                size={26}
                weight={focused ? "fill" : "bold"}
              />
            ),
            tabBarBadge: findBadge,
            tabBarBadgeStyle: badgeStyle,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Сбрасываем стек find/ на корень — тот же паттерн, что у orders/cases.
              e.preventDefault();
              navigation.navigate("find", { screen: "index" } as never);
            },
          })}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Мои задания",
            tabBarIcon: ({ color, focused }) => (
              <ClipboardText
                color={iconColor(color)}
                size={26}
                weight={focused ? "fill" : "bold"}
              />
            ),
            tabBarBadge: ordersBadge,
            tabBarBadgeStyle: badgeStyle,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Сбрасываем стек orders/ на корень. Без этого тап «Мои задания»
              // на вложенном экране оставлял текущий экран открытым.
              e.preventDefault();
              navigation.navigate("orders", { screen: "index" } as never);
            },
          })}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Профиль",
            tabBarIcon: ({ color, focused }) => (
              <UserCircle color={iconColor(color)} size={26} weight={focused ? "fill" : "bold"} />
            ),
          }}
        />
        {/* Detail routes live in the root native Stack (`app/(details)`), not
          as hidden Tabs screens. This preserves the exact caller and enables
          the standard iOS edge-swipe back gesture. */}
        {/* cases («Ваши работы») и favorites («Сохранённые мастера») —
            всегда href: null, ни у одной роли не показываются в нижнем меню
            (редизайн 2026-08-30: владелец назвал только 3-4 реальных таба,
            портфолио и закладки переехали строками в /profile). Экраны и
            маршруты остаются — Profile push'ит на них напрямую. */}
        <Tabs.Screen name="cases" options={{ href: null }} />
        <Tabs.Screen name="favorites" options={{ href: null }} />
      </Tabs>
    </NavThemeProvider>
  );
}
