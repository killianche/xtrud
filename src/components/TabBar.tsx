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
 * Активный таб: accent (Vercel blue #0070f3) + filled icon (Phosphor weight="fill")
 *                + pill-подложка bg-accent-soft (мягко-синий) под иконкой.
 *                По прямой просьбе владельца 2026-05-27 (вечер) вернули синюю
 *                подсветку — даёт явный визуальный фокус на активном табе.
 * Неактивный:    mute + bold outline (Phosphor weight="bold").
 *
 * Icon set: Phosphor (2026-05-15) — заменил Lucide для большего «modern app»
 * feel + явная fill/outline разница active-state (паттерн Instagram/Threads/X
 * /Linear). Pill даёт chip-style focus-индикатор как в Material 3.
 *
 * Таб «Создать» — обычный неактивный таб, тап → router.push('/orders/new').
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { usePathname, useRouter } from "expo-router";
import { BookmarkSimple, MagnifyingGlass } from "phosphor-react-native";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { triggerTabScrollReset } from "@/lib/tab-scroll-reset";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useThemeColors } from "@/lib/use-theme-color";

// Порядок таб-роутов в навбаре. В центр между left/right вставляется
// синтетический таб «Смотреть заказы» (не expo-router screen, просто Pressable
// → /orders/search). Вкладка `cases` («Кейсы») показывается ТОЛЬКО мастеру
// (фильтр isMasterRole в rightRoutes), у клиента её нет.
const TAB_ORDER = ["index", "orders", "cases", "profile"] as const;
const TAB_HEIGHT = 52; // icon-only — ужали с 60 (был запас под текст-лейбл)
const isWeb = Platform.OS === "web";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  // N2: кнопка «+ Создать заказ» — только для клиента. Мастер не создаёт
  // заказы, ему нужны другие действия (поиск заявок). Скрываем «+» когда
  // active_role='master'. Анонимы (нет user) — показываем «+» по умолчанию
  // (анон создаёт заказ через JIT-signup).
  const { session } = useAuthSession();
  const { data: user } = useUserRecord(session?.user?.id);
  const isMasterRole = user?.active_role === "master";

  // Подсветка средней «Поиск заказов» псевдо-таба для мастера: когда
  // активный URL начинается с `/orders/search` (страница + её /filters
  // подэкран), эта кнопка выглядит focused — ink цвет + stroke 2.25, как
  // у настоящих табов. До этого фикса (2026-05-15) кнопка всегда была
  // mute → user не понимал, что это сейчас активный экран.
  const isSearchActive = pathname.startsWith("/orders/search");
  // Аналогично для клиентского варианта центра — «Закладки» (избранные мастера).
  // Активна на любой подстранице /favorites (сейчас просто index, но
  // оставляю startsWith на будущее).
  const isFavoritesActive = pathname.startsWith("/favorites");

  // Скрыт глобальным флагом (используется на full-screen wizard'ах вроде
  // orders/new — там TabBar отвлекает от формы).
  if (tabBarHidden) return null;

  // Берём роуты в нужном порядке, отфильтрованные по существованию.
  const orderedRoutes = TAB_ORDER.map((name) => state.routes.find((r) => r.name === name)).filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );

  // Левая часть: index + orders. Правая: chats + profile.
  // Для мастера orders-таб скрыт — заявки переехали на главную (под
  // «Готовы работать?»), второй таб дублировал бы тот же контент. См.
  // фидбэк user 2026-05-15. Клиент видит «Мои заказы» как обычно.
  const leftRoutes = orderedRoutes.filter(
    (r) => r.name === "index" || (r.name === "orders" && !isMasterRole),
  );
  // Правая часть: «Кейсы» (только мастер — его портфолио работ) + «Профиль».
  // У клиента вкладки «Кейсы» нет. Восстановлено 2026-05-22 (фидбэк user:
  // «в нижнем меню у мастера должна быть кнопка Кейсы / Ваши работы»).
  const rightRoutes = orderedRoutes.filter(
    (r) => (r.name === "cases" && isMasterRole) || r.name === "profile",
  );

  const renderTab = (route: (typeof state.routes)[number]) => {
    const descriptor = descriptors[route.key];
    if (!descriptor) return null;
    const { options } = descriptor;
    const globalIndex = state.routes.findIndex((r) => r.key === route.key);
    let isFocused = state.index === globalIndex;

    // Взаимоисключение: когда мастер на /orders/search, expo-router считает
    // активным таб `orders` (т.к. /orders/search живёт под `orders` родителем).
    // Но визуально активна средняя «лупа» — поэтому таб «Заказы» в этом случае
    // НЕ должен подсвечиваться, иначе обе кнопки горят одновременно.
    if (route.name === "orders" && isSearchActive) {
      isFocused = false;
    }

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

      {/* Центральный псевдо-таб — РАЗНЫЙ для мастера и клиента:
            • МАСТЕР: «🔍 Смотреть заказы» → /orders/search (лента открытых
              заказов сайта). Mutex с табом «Заказы»: когда активен
              /orders/search, expo-router считает фокус на родителе `orders` —
              «Заказы» в этом случае не подсвечивается (см. isSearchActive).
            • КЛИЕНТ: «🔖 Закладки» → /favorites (сохранённые мастера).
              Фидбэк владельца 2026-05-27: клиенту лента чужих заказов не
              нужна на видном месте, а быстрый доступ к избранным мастерам —
              нужен. */}
      {isMasterRole ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Смотреть заказы"
          accessibilityState={{ selected: isSearchActive }}
          onPress={() => router.push("/orders/search" as never)}
          className={isWeb ? (isSearchActive ? "text-accent" : "text-mute") : undefined}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: isSearchActive ? tc["accent-soft"] : "transparent",
            }}
            className={isWeb ? (isSearchActive ? "bg-accent-soft" : undefined) : undefined}
          >
            <MagnifyingGlass
              size={26}
              weight={isSearchActive ? "fill" : "bold"}
              color={isWeb ? "currentColor" : isSearchActive ? tc.accent : tc.mute}
            />
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закладки"
          accessibilityState={{ selected: isFavoritesActive }}
          onPress={() => router.push("/favorites" as never)}
          className={isWeb ? (isFavoritesActive ? "text-accent" : "text-mute") : undefined}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: isFavoritesActive ? tc["accent-soft"] : "transparent",
            }}
            className={isWeb ? (isFavoritesActive ? "bg-accent-soft" : undefined) : undefined}
          >
            <BookmarkSimple
              size={26}
              weight={isFavoritesActive ? "fill" : "bold"}
              color={isWeb ? "currentColor" : isFavoritesActive ? tc.accent : tc.mute}
            />
          </View>
        </Pressable>
      )}

      {/* Правая часть. */}
      {rightRoutes.map(renderTab)}
    </View>
  );
}
