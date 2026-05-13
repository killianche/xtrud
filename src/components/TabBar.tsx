/*
 * Кастомный нижний таббар — современный дизайн в стиле cal.com.
 *
 * Активный таб: иконка strokeWidth 2.25 + semibold лейбл цвета ink.
 * Неактивный:   иконка strokeWidth 1.5  + regular  лейбл цвета muted (opacity 0.55).
 * iOS:          shadow без top-border (как в приложениях Apple/Linear/Craft).
 * Android/web:  0.5px hairline сверху.
 * Фон на web:   CSS-переменные, не hex — нет SSR color-scheme race.
 * Маршруты вне VISIBLE_TABS (href: null, detail-экраны) — не рендерятся.
 *
 * Иконки: читаем из options.tabBarIcon (сигнатура: { focused, color, size }).
 * Бейджи: читаем из options.tabBarBadge / options.tabBarBadgeStyle.
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
          backgroundColor: Platform.OS === "web" ? "rgb(var(--canvas))" : tc.canvas,
          // iOS: нет линии — её роль берёт shadow (как у Apple Settings, App Store).
          // Android/web: тонкая hairline.
          borderTopWidth: Platform.OS === "ios" ? 0 : 0.5,
          borderTopColor: Platform.OS === "web" ? "rgb(var(--hairline))" : tc.hairline,
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
        const { options } = descriptors[route.key];
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

        const activeColor = Platform.OS === "web" ? "rgb(var(--ink))" : tc.ink;
        // Неактивные иконки/лейблы — muted + opacity для "воздушности"
        const inactiveColor = Platform.OS === "web" ? "rgb(var(--muted))" : tc.muted;
        const iconColor = isFocused ? activeColor : inactiveColor;

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
              opacity: isFocused ? 1 : 0.55,
            }}
          >
            {/* Иконка — tabBarIcon из screen options; strokeWidth контролируется там же */}
            <View style={{ position: "relative" }}>
              {options.tabBarIcon?.({ focused: isFocused, color: iconColor, size: 24 })}

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

            {/* Лейбл — semibold для активного, regular для неактивного */}
            <AppText
              weight={isFocused ? "semibold" : "regular"}
              style={{ fontSize: 11, lineHeight: 14, color: iconColor }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
