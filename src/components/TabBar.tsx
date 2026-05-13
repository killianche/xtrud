/*
 * Кастомный нижний таббар — современный дизайн в стиле cal.com.
 *
 * Активный таб: иконка strokeWidth 2.25 + semibold лейбл, opacity 1.
 * Неактивный:   иконка strokeWidth 1.5  + regular  лейбл, opacity 0.55.
 * iOS:          shadow без top-border (как в приложениях Apple/Linear/Craft).
 * Android/web:  0.5px hairline сверху.
 * Фон на web:   CSS-переменные, не hex — нет SSR color-scheme race.
 * Маршруты вне VISIBLE_TABS (href: null, detail-экраны) — не рендерятся.
 *
 * Цвета иконок и текста:
 *   Web:    className="text-ink" + color="currentColor" — CSS-переменная, мгновенно
 *           реагирует на dark-класс без ожидания JS colorScheme.
 *   Native: useThemeColors hex — через NativeWind colorScheme (надёжен на устройстве).
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

const isWeb = Platform.OS === "web";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // На native canvas/hairline через hex нужны для фона и границы.
  // ink нужен только на native для цвета иконок; на web используем currentColor.
  const tc = useThemeColors(["canvas", "hairline", "ink"]);

  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.has(r.name));

  return (
    <View
      style={[
        {
          height: TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          flexDirection: "row",
          // Web: CSS-переменная обходит JS colorScheme race.
          // Native: resolved hex из useThemeColors.
          backgroundColor: isWeb ? "rgb(var(--canvas))" : tc.canvas,
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

        // Web:    "currentColor" → SVG наследует CSS color от родительского View.
        //         Родитель получает цвет через className="text-ink".
        // Native: resolved hex — useThemeColors всегда синхронен на устройстве.
        const iconColor = isWeb ? "currentColor" : tc.ink;

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
            // Web: text-ink ставит CSS color = rgb(var(--ink)), корректный в dark/light.
            // SVG с currentColor и AppText без явного color наследуют это значение.
            // Native: className игнорируется — цвет задаётся через iconColor ниже.
            className={isWeb ? "text-ink" : undefined}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              paddingTop: 6,
              // Неактивный таб: приглушаем через opacity (работает на всех платформах).
              opacity: isFocused ? 1 : 0.55,
            }}
          >
            {/* Иконка — tabBarIcon из screen options */}
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

            {/* Лейбл — semibold для активного, regular для неактивного.
                Web: color не задаётся явно — наследуется от родительского className="text-ink".
                Native: явный цвет через style.color = tc.ink. */}
            <AppText
              weight={isFocused ? "semibold" : "regular"}
              style={
                isWeb
                  ? { fontSize: 11, lineHeight: 14 }
                  : { fontSize: 11, lineHeight: 14, color: tc.ink }
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
