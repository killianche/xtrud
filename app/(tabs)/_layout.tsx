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
  // Роли больше нет (DECISION владельца 2026-09-01): счётчики считаются для
  // всех, потому что один и тот же человек и выкладывает задания, и
  // откликается на чужие. Раньше каждый счётчик был привязан к режиму, и
  // человек в «режиме мастера» не видел, что на его собственное задание
  // пришёл отклик.
  //
  // Цена названа честно: два запроса и две realtime-подписки на каждого
  // вошедшего вместо одной. Это плата за то, что человек больше не пропускает
  // половину того, что с ним происходит.

  // Отмечаем онлайн-активность (рейтинг мастеров, Этап 2). Троттл внутри хука.
  useTouchLastActive(!!userId);

  useRealtimeMyResponses(userId ?? null);

  // Непрочитанные отклики на мои задания.
  const { data: unreadResponses = 0 } = useUnreadResponsesCount(userId ?? null);

  // Непрочитанные задания в ленте по моим категориям, если они заданы.
  const { data: myCats } = useMyMasterCategories(userId);
  const masterL2Ids = myCats?.map((c) => c.l2_id) ?? [];
  const lastSeenFeedAt = user?.last_seen_feed_at ?? null;
  useRealtimeFeed({
    userId: userId ?? null,
    l2Ids: masterL2Ids,
  });
  const { data: unreadFeed = 0 } = useUnreadFeedCount({
    userId: userId ?? null,
    l2Ids: masterL2Ids,
    lastSeenAt: lastSeenFeedAt,
  });

  const ordersBadge = badgeLabel(unreadResponses);
  const findBadge = badgeLabel(unreadFeed);

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
            // Вкладка видна всем: откликнуться может любой аккаунт.
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
            // Не в нижнем меню: вход через аватар в правом верхнем углу главной.
            href: null,
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
