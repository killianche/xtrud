/*
 * TabBar v4 — нижний таб-бар, 5 равноценных табов (без выделяющегося FAB).
 *
 * Структура:
 *   [Главная] [Заказы] [Создать] [Чаты] [Профиль]
 *
 * История: v3 был с круглым FAB primary в центре («приподнятая кнопка»).
 * Решение откатили (2026-05-14): FAB наезжал на sticky CTA на master detail
 * («Войти и написать»), и сама эстетика «жирного круга» противоречит Vercel-
 * минимализму. Сделали 5-й таб обычной иконкой Plus + подпись «Создать».
 *
 * Активный таб: ink + semibold + stroke 2.25.
 * Неактивный:    mute + regular + stroke 1.5.
 * Таб «Создать» — обычный неактивный таб, тап → router.push('/orders/new').
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { CirclePlus } from "lucide-react-native";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { triggerTabScrollReset } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";

// Порядок таб-роутов в навбаре. Между orders и chats — синтетический таб
// «Создать» (не expo-router screen, просто Pressable → /orders/new).
const TAB_ORDER = ["index", "orders", "chats", "profile"] as const;
const TAB_HEIGHT = 52; // icon-only — ужали с 60 (был запас под текст-лейбл)
const isWeb = Platform.OS === "web";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["canvas", "hairline", "ink", "mute"]);
  const tabBarHidden = useTabBarVisibility((s) => s.hidden);

  // Скрыт глобальным флагом (используется на full-screen wizard'ах вроде
  // orders/new — там TabBar отвлекает от формы).
  if (tabBarHidden) return null;

  // Берём роуты в нужном порядке, отфильтрованные по существованию.
  const orderedRoutes = TAB_ORDER.map((name) =>
    state.routes.find((r) => r.name === name),
  ).filter((r): r is NonNullable<typeof r> => Boolean(r));

  // Левая часть: index + orders. Правая: chats + profile.
  const leftRoutes = orderedRoutes.filter((r) => r.name === "index" || r.name === "orders");
  const rightRoutes = orderedRoutes.filter((r) => r.name === "chats" || r.name === "profile");

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

    const tabColorHex = isFocused ? tc.ink : tc.mute;
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
        className={isWeb ? (isFocused ? "text-ink" : "text-mute") : undefined}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ position: "relative" }}>
          {options.tabBarIcon?.({ focused: isFocused, color: iconColor, size: 28 })}

          {badge !== undefined && badge !== null && (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -10,
                backgroundColor: badgeBg,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 4,
              }}
            >
              <AppText
                weight="semibold"
                style={{ color: badgeTextColor, fontSize: 10, lineHeight: 14 }}
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
      // Контейнер overflow visible — FAB приподнят над линией навбара.
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
      {/* Левая часть. */}
      {leftRoutes.map(renderTab)}

      {/* Таб «Создать» — обычный неактивный таб (mute), не route. Только иконка. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Создать заказ"
        onPress={() => router.push("/orders/new" as never)}
        className={isWeb ? "text-mute" : undefined}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CirclePlus
          size={28}
          strokeWidth={1.75}
          color={isWeb ? "currentColor" : tc.mute}
        />
      </Pressable>

      {/* Правая часть. */}
      {rightRoutes.map(renderTab)}
    </View>
  );
}
