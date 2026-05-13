/*
 * TabBar v3 — нижний таб-бар с центральной CTA «Создать заказ».
 *
 * Паттерн: Яндекс.Услуги / Profi.ru / Canva / Avito — 4 таба + центральная
 * круглая FAB-кнопка primary action поднятая над линией навбара.
 *
 * Структура:
 *   [Главная] [Заказы]  ⊕  [Чаты] [Профиль]
 *                   ↑
 *           Создать заказ (router.push('/orders/new'))
 *
 * Активный таб: ink + semibold + filled icon (stroke 2.25).
 * Неактивный:    mute + regular + outline icon (stroke 1.5).
 * Центральная CTA — bg-primary, всегда яркая (это primary action, не таб).
 *
 * Lazyweb: посмотрел Canva, Adobe, Duckbill, TaskRabbit — паттерн 5-elements
 * (2L + FAB + 2R) с приподнятой центральной кнопкой — самый частый для
 * marketplace/productivity-приложений.
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

// Порядок таб-роутов в навбаре. Центральная CTA вставляется между orders и chats.
const TAB_ORDER = ["index", "orders", "chats", "profile"] as const;
const TAB_HEIGHT = 60;
const FAB_SIZE = 56;
const isWeb = Platform.OS === "web";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["canvas", "hairline", "ink", "mute", "primary", "on-primary"]);

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
      if (!isFocused && !event.defaultPrevented) {
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
          gap: 3,
          paddingTop: 6,
        }}
      >
        <View style={{ position: "relative" }}>
          {options.tabBarIcon?.({ focused: isFocused, color: iconColor, size: 24 })}

          {badge !== undefined && badge !== null && (
            <View
              style={{
                position: "absolute",
                top: -3,
                right: -9,
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

        <AppText
          weight={isFocused ? "semibold" : "regular"}
          className={isWeb ? (isFocused ? "text-ink" : "text-mute") : undefined}
          style={
            isWeb
              ? { fontSize: 11, lineHeight: 14 }
              : { fontSize: 11, lineHeight: 14, color: tabColorHex }
          }
        >
          {label}
        </AppText>
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

      {/* Центральная CTA — slot шириной обычного таба, FAB visually поднят. */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 0,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Создать заказ"
          onPress={() => router.push("/orders/new" as never)}
          // bg-primary + text-on-primary через NativeWind className —
          // inline style с CSS-var в RNW не резолвится (design-quality #2).
          className="bg-primary text-on-primary items-center justify-center active:opacity-85"
          style={[
            {
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              marginTop: -16, // приподнят над линией навбара
            },
            Platform.OS === "ios" && {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 12,
            },
            Platform.OS === "android" && { elevation: 6 },
            isWeb && {
              boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
            },
          ]}
        >
          <Plus
            size={28}
            strokeWidth={2.25}
            color={isWeb ? "currentColor" : tc["on-primary"]}
          />
        </Pressable>
      </View>

      {/* Правая часть. */}
      {rightRoutes.map(renderTab)}
    </View>
  );
}
