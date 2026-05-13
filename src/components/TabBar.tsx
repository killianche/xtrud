/*
 * Кастомный нижний таббар — современный дизайн в стиле cal.com / TaskRabbit.
 *
 * Активный таб: цвет `ink` + semibold лейбл + strokeWidth 2.25 у иконки.
 * Неактивный:   цвет `muted` + regular лейбл + strokeWidth 1.5 у иконки.
 *
 * Различие активного/неактивного — ЦВЕТОМ, не opacity. Opacity на dark-теме
 * визуально неотличим от полупрозрачного белого; цвет ink↔muted работает в обеих темах.
 *
 * iOS:           shadow без top-border (Apple/Linear/Craft паттерн).
 * Android/web:   0.5px hairline сверху.
 *
 * Цвета через `useThemeColors` единообразно на всех платформах — без web/native fork.
 * Маршруты вне VISIBLE_TABS (href: null, detail-экраны) — не рендерятся.
 *
 * Иконки: читаем из options.tabBarIcon, цвет приходит из props.
 * Бейджи: из options.tabBarBadge / options.tabBarBadgeStyle.
 */

import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

/** Видимые маршруты. Прочие (detail-экраны) передаются с href: null и пропускаются. */
const VISIBLE_TABS = new Set(["index", "orders", "chats"]);

/** Высота видимой части таббара — без safe area. */
const TAB_HEIGHT = 56;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["canvas", "hairline", "ink", "muted"]);

  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.has(r.name));

  return (
    <View
      style={[
        {
          height: TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          flexDirection: "row",
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
      {visibleRoutes.map((route) => {
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
        const badgeBg = bsRaw?.backgroundColor ?? "#ef4444";
        const badgeTextColor = bsRaw?.color ?? "#ffffff";

        // Активный/неактивный — РАЗНЫЙ ЦВЕТ, не opacity.
        const tabColor = isFocused ? tc.ink : tc.muted;

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

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              paddingTop: 6,
            }}
          >
            {/* Иконка — tabBarIcon из screen options */}
            <View style={{ position: "relative" }}>
              {options.tabBarIcon?.({ focused: isFocused, color: tabColor, size: 24 })}

              {/* Бейдж поверх иконки */}
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

            {/* Лейбл — semibold + ink для активного, regular + muted для неактивного. */}
            <AppText
              weight={isFocused ? "semibold" : "regular"}
              style={{ fontSize: 11, lineHeight: 14, color: tabColor }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
