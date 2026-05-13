/*
 * TabBar v2 — нижний таб-бар (Vercel DESIGN.md).
 *
 * Активный таб: ink + semibold.
 * Неактивный:    mute + regular.
 * Различие — ЦВЕТ, не opacity (opacity на dark не работает визуально).
 *
 * iOS:    shadow без top-border (Apple/Linear паттерн).
 * Android/web:  0.5px hairline сверху.
 *
 * Видимые таб-маршруты: index / orders / chats. Остальные (href:null) пропускаются.
 *
 * Цвета:
 *  - На web color иконок через **className="text-ink"/"text-mute"** + currentColor
 *    в SVG. CSS-переменные --ink/--mute уже резолвятся правильно через html.dark
 *    класс (inline theme-guard в +html.tsx). Это обходит JS-резолв-баг с useThemeColor.
 *  - На native — hex из useThemeColors (RN Appearance резолвится корректно).
 *
 * Бейджи: из options.tabBarBadge / options.tabBarBadgeStyle.
 */

import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

const VISIBLE_TABS = new Set(["index", "orders", "chats"]);
const TAB_HEIGHT = 56;
const isWeb = Platform.OS === "web";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // На native canvas/hairline через hex для inline style. На web — Tailwind решает.
  const tc = useThemeColors(["canvas", "hairline", "ink", "mute"]);

  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.has(r.name));

  return (
    <View
      // bg-canvas + border-hairline через Tailwind (web), inline style на native.
      className={isWeb ? "flex-row bg-canvas border-t border-hairline" : undefined}
      style={[
        {
          height: TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          flexDirection: "row",
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
        const badgeBg = bsRaw?.backgroundColor ?? "#ee0000"; // Vercel error
        const badgeTextColor = bsRaw?.color ?? "#ffffff";

        // Web: цвет через CSS class (currentColor наследуется в SVG icon).
        // Native: hex из useThemeColors.
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
            // На web className устанавливает CSS color для currentColor наследования.
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
      })}
    </View>
  );
}
