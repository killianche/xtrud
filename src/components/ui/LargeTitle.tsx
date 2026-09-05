/**
 * Заголовок экрана в стиле системных приложений iOS 26.
 *
 * DECISION владельца 2026-09-06: «Заголовок и кнопка выглядят нестандартно.
 * Нужно в стиле последнего iOS: размер, шрифт — и везде одинаково: Задания,
 * Специалисты, Мои задания». И раньше: «отступ сверху от чёлки — обязательно,
 * на всём приложении, чтобы такого больше не было».
 *
 * Как устроено у Apple и здесь:
 *   1. Закреплённая строка навигации (44 pt) под безопасной областью. В ней
 *      «назад», компактный заголовок 17/semibold и действия справа.
 *   2. Крупный заголовок 34/bold живёт В СОДЕРЖИМОМ и уезжает вверх при
 *      прокрутке; в этот момент компактный заголовок проявляется в строке.
 *   3. Строка навигации — в материале Liquid Glass: содержимое проезжает под
 *      ней. Без стекла (iOS до 26) — обычная поверхность с волосяной линией.
 *   4. Под строкой навигации может стоять панель — поиск или фильтры. Она
 *      закреплена вместе со строкой.
 *
 * Три части и один хук:
 *   - useLargeTitle()      — прокрутка, прозрачность компактного заголовка,
 *                            измеренная высота закреплённой шапки;
 *   - <LargeTitleBar>      — закреплённая шапка (absolute, поверх списка);
 *   - <LargeTitleBlock>    — крупный заголовок для начала списка.
 *
 * Экран собирает их сам, потому что списки бывают разные (FlashList,
 * ScrollView, Animated.ScrollView). Пример — app/(tabs)/specialists.tsx.
 */

import { CaretLeft } from "phosphor-react-native";
import { type ReactNode, useRef, useState } from "react";
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { GlassSurface, LIQUID_GLASS } from "./GlassSurface";

/** Высота строки навигации — системные 44 pt. */
export const NAV_ROW_HEIGHT = 44;

/** На этом отрезке прокрутки крупный заголовок уходит под шапку и в строке
 *  проявляется компактный. Подобрано под 34/41 + отступы блока. */
const TITLE_FADE_FROM = 24;
const TITLE_FADE_TO = 60;

export interface LargeTitleAction {
  /** Подпись; для кнопки-иконки не показывается, но нужна VoiceOver. */
  label: string;
  Icon?: IconComponent;
  onPress: () => void;
  /** Фильтр применён и т.п. — кнопка подсвечивается акцентом. */
  active?: boolean;
  /** Показать только иконку в круге (как «⋯» и «+» у Apple). */
  iconOnly?: boolean;
}

export function useLargeTitle(initialBarHeight = NAV_ROW_HEIGHT) {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [barHeight, setBarHeight] = useState(initialBarHeight);
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [TITLE_FADE_FROM, TITLE_FADE_TO],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const onScroll = Animated.event<NativeSyntheticEvent<NativeScrollEvent>>(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  );
  return {
    scrollY,
    onScroll,
    compactTitleOpacity,
    /** Высота закреплённой шапки без безопасной области — измеряется. */
    barHeight,
    setBarHeight,
    /** Отступ сверху для содержимого списка: безопасная область + шапка. */
    contentTop: insets.top + barHeight,
    insets,
  };
}

export interface LargeTitleBarProps {
  title: string;
  /** Прозрачность компактного заголовка — из useLargeTitle(). */
  compactTitleOpacity: Animated.AnimatedInterpolation<number>;
  onLayoutHeight: (height: number) => void;
  onBack?: () => void;
  actions?: LargeTitleAction[];
  /** Панель под строкой навигации: поиск, фильтры. Закреплена вместе с ней. */
  below?: ReactNode;
  /** Компактный заголовок виден всегда, без проявления. Нужно там, где
   *  крупного заголовка в содержимом нет (экран с заданным фильтром). */
  alwaysCompact?: boolean;
}

export function LargeTitleBar({
  title,
  compactTitleOpacity,
  onLayoutHeight,
  onBack,
  actions = [],
  below,
  alwaysCompact = false,
}: LargeTitleBarProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "accent", "on-accent"]);

  return (
    <GlassSurface
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        paddingTop: insets.top,
      }}
      fallbackClassName="bg-canvas"
    >
      <View onLayout={(e) => onLayoutHeight(Math.round(e.nativeEvent.layout.height))}>
        <View className="flex-row items-center px-2" style={{ height: NAV_ROW_HEIGHT }}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              onPress={onBack}
              hitSlop={6}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
            >
              <CaretLeft size={22} weight="bold" color={tc.ink} />
            </Pressable>
          ) : (
            <View className="w-2" />
          )}

          <Animated.View
            className="min-w-0 flex-1"
            style={{ opacity: alwaysCompact ? 1 : compactTitleOpacity }}
          >
            <AppText
              weight="semibold"
              className={`text-ios-title text-ink ${onBack ? "text-center" : "px-2"}`}
              numberOfLines={1}
            >
              {title}
            </AppText>
          </Animated.View>

          <View className="flex-row items-center gap-1">
            {actions.map((action) =>
              action.iconOnly && action.Icon ? (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={action.onPress}
                  hitSlop={6}
                  className={`h-11 w-11 items-center justify-center rounded-full active:opacity-60 ${
                    action.active ? "bg-accent" : ""
                  }`}
                >
                  <action.Icon
                    size={22}
                    weight="bold"
                    color={action.active ? tc["on-accent"] : tc.accent}
                  />
                </Pressable>
              ) : (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={action.onPress}
                  hitSlop={6}
                  className="min-h-11 flex-row items-center gap-1.5 px-2 active:opacity-60"
                >
                  {action.Icon ? <action.Icon size={20} weight="bold" color={tc.accent} /> : null}
                  <AppText
                    weight={action.active ? "semibold" : "medium"}
                    className="text-ios-title text-accent"
                  >
                    {action.label}
                  </AppText>
                </Pressable>
              ),
            )}
            {actions.length === 0 && onBack ? <View className="w-11" /> : null}
          </View>
        </View>

        {below}
        {LIQUID_GLASS ? null : <View className="h-px bg-hairline" />}
      </View>
    </GlassSurface>
  );
}

export interface LargeTitleBlockProps {
  title: string;
  subtitle?: string | null;
}

/** Крупный заголовок в начале списка. Уезжает вместе с содержимым. */
export function LargeTitleBlock({ title, subtitle }: LargeTitleBlockProps) {
  return (
    <View className="px-5 pt-2 pb-4">
      <AppText weight="bold" className="text-ios-large-title text-ink">
        {title}
      </AppText>
      {subtitle ? <AppText className="mt-1 text-body-md text-mute">{subtitle}</AppText> : null}
    </View>
  );
}
