/*
 * TabBar v5 — нижний таб-бар, только настоящие табы (редизайн 2026-08-30).
 *
 * Структура:
 *   Мастер: [Главная] [Найти задание] [Мои задания] [Профиль]
 *   Клиент: [Главная] [Мои задания] [Профиль]
 *
 * История: v4 держал 4 настоящих таба + 1 кастомный псевдо-таб-Pressable в
 * центре («Смотреть заказы» у мастера, «Закладки» у клиента) — тот
 * рисовался вручную, не был реальным Tabs.Screen, и требовал ручного mutex
 * (isSearchActive/isFavoritesActive), чтобы «Заказы» не подсвечивались
 * одновременно с ним. Владелец 2026-08-30: «Найти задание» становится
 * настоящим 4-м табом мастера (маршрут /find, бывший /orders/search),
 * псевдо-таб убран целиком. «Ваши работы» (портфолио) и «Закладки»
 * (сохранённые мастера) переехали строками в /profile — у обеих ролей
 * остаётся ровно по 3-4 реальных таба, без ручных подсветок.
 *
 * Активный таб: accent (Vercel blue #0070f3) + filled icon (Phosphor weight="fill")
 *                + pill-подложка bg-accent-soft (мягко-синий) под иконкой.
 * Неактивный:    mute + bold outline (Phosphor weight="bold").
 *
 * Icon set: Phosphor — filled/outline разница active-state (паттерн
 * Instagram/Threads/X/Linear). Pill даёт chip-style focus-индикатор как в
 * Material 3.
 *
 * Иконки задаются в `app/(tabs)/_layout.tsx` через `options.tabBarIcon` —
 * этот файл только рендерит то, что уже посчитано состоянием.
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { usePathname } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { triggerTabScrollReset } from "@/lib/tab-scroll-reset";
import { shouldHideTabBarForPath } from "@/lib/tabbar-route-policy";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useThemeColors } from "@/lib/use-theme-color";

// Порядок реальных таб-роутов в навбаре. `cases` и `favorites` в этот список
// намеренно не входят — они всегда `href: null` (см. `(tabs)/_layout.tsx`) и
// открываются строками из /profile, а не из нижнего меню.
const MASTER_TAB_ORDER = ["index", "find", "orders", "profile"] as const;
const CLIENT_TAB_ORDER = ["index", "orders", "profile"] as const;
const TAB_HEIGHT = 52; // icon-only — ужали с 60 (был запас под текст-лейбл)
const isWeb = Platform.OS === "web";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const tc = useThemeColors([
    "accent",
    "accent-soft",
    "canvas",
    "canvas-soft-2",
    "hairline",
    "ink",
    "mute",
  ]);
  const tabBarHidden = useTabBarVisibility((s) => s.hidden);

  const { session } = useAuthSession();
  const { data: user } = useUserRecord(session?.user?.id);
  const isMasterRole = user?.active_role === "master";

  // Route policy is the source of truth: only actual tab roots show the bar.
  // The legacy owner flag remains as an additional lock during transitions.
  if (tabBarHidden || shouldHideTabBarForPath(pathname)) return null;

  const order = isMasterRole ? MASTER_TAB_ORDER : CLIENT_TAB_ORDER;
  const visibleRoutes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const renderTab = (route: (typeof state.routes)[number]) => {
    const descriptor = descriptors[route.key];
    if (!descriptor) return null;
    const { options } = descriptor;
    const globalIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === globalIndex;

    const label = typeof options.title === "string" ? options.title : route.name;
    const badge = options.tabBarBadge;
    const bsRaw = options.tabBarBadgeStyle as
      | { backgroundColor?: string; color?: string }
      | null
      | undefined;
    const badgeBg = bsRaw?.backgroundColor ?? "#ee0000";
    const badgeTextColor = bsRaw?.color ?? "#ffffff";

    const tabColorHex = isFocused ? tc.accent : tc.mute;
    const iconColor = isWeb ? "currentColor" : tabColorHex;

    const onPress = () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (event.defaultPrevented) return;
      if (isFocused) {
        // Стандартный mobile-pattern: тап на активный таб → scroll to top.
        triggerTabScrollReset(route.name);
      } else {
        navigation.navigate(route.name as never);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        className={isWeb ? (isFocused ? "text-accent" : "text-mute") : undefined}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "relative",
            paddingHorizontal: 14,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: isFocused ? tc["accent-soft"] : "transparent",
          }}
          className={isWeb ? (isFocused ? "bg-accent-soft" : undefined) : undefined}
        >
          {options.tabBarIcon?.({ focused: isFocused, color: iconColor, size: 26 })}

          {badge !== undefined && badge !== null && (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -10,
                backgroundColor: badgeBg,
                borderRadius: 8,
                minWidth: 18,
                height: 18,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 4,
              }}
            >
              <AppText
                weight="semibold"
                style={{ color: badgeTextColor, fontSize: 12, lineHeight: 14 }}
              >
                {String(badge)}
              </AppText>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View
      className={isWeb ? "flex-row bg-canvas border-t border-hairline" : undefined}
      style={[
        {
          height: TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          flexDirection: "row",
          overflow: "visible",
        },
        !isWeb && {
          backgroundColor: tc.canvas,
          borderTopWidth: Platform.OS === "ios" ? 0 : 0.5,
          borderTopColor: tc.hairline,
        },
        Platform.OS === "ios" && {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        Platform.OS === "android" && { elevation: 8 },
      ]}
    >
      {visibleRoutes.map(renderTab)}
    </View>
  );
}
