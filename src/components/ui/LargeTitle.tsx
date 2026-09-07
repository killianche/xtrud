/**
 * Заголовок экрана в стиле системных приложений iOS 26.
 *
 * DECISION владельца 2026-09-07: «откуда взялась белая плашка сверху с
 * кнопкой назад? Сделать как у Apple в iOS 26 Liquid Glass». У Apple в
 * iOS 26 строка навигации в покое НЕ имеет фона: содержимое доходит до
 * верха, «назад» и действия — отдельные круглые стеклянные кнопки. Фон в
 * материале появляется только когда содержимое уезжает под строку —
 * вместе с компактным заголовком.
 *
 * Как устроено здесь:
 *   1. Круглые кнопки 44 pt (стекло; без стекла — поверхность с волосяной
 *      границей) стоят поверх содержимого всегда.
 *   2. Крупный заголовок 34/bold живёт В СОДЕРЖИМОМ (LargeTitleBlock) и
 *      уезжает вверх при прокрутке.
 *   3. По мере прокрутки проявляется стеклянная полоса с компактным
 *      заголовком 17/semibold — та же прозрачность, что у заголовка.
 *   4. Отступ от чёлки — обязателен на всём приложении.
 *
 * Экран собирает части сам (FlashList/ScrollView разные):
 *   useLargeTitle() → <LargeTitleBar/> поверх списка + <LargeTitleBlock/> в
 *   начале списка. Пример — src/features/master-view/SpecialistsListScreen.tsx.
 */

import { CaretLeft } from "phosphor-react-native";
import { type ReactNode, useCallback, useRef, useState } from "react";
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
import { type SFSymbol, SystemIcon } from "./SystemIcon";

/** Высота строки навигации — системные 44 pt. */
export const NAV_ROW_HEIGHT = 44;
/** Круглая кнопка строки навигации. */
export const NAV_BUTTON_SIZE = 44;

/** На этом отрезке прокрутки крупный заголовок уходит под строку и в ней
 *  проявляется компактный вместе с фоном. Подобрано под 34/41 + отступы. */
const TITLE_FADE_FROM = 24;
const TITLE_FADE_TO = 60;

export interface LargeTitleAction {
  /** Подпись; для кнопки-иконки не показывается, но нужна VoiceOver. */
  label: string;
  Icon?: IconComponent;
  /** Системный символ для iOS; Icon — запасной. */
  sf?: SFSymbol;
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
  // Обычная функция, а не Animated.event с native driver: FlashList зовёт
  // onScroll как функцию, а Animated.event с useNativeDriver возвращает
  // объект — на первом же скролле ленты приложение падало
  // («undefined is not a function» в client_errors, 2026-09-07).
  // Прозрачность заголовка считается на JS — при scrollEventThrottle 16 этого
  // достаточно для плавного проявления.
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.setValue(event.nativeEvent.contentOffset.y);
    },
    [scrollY],
  );
  return {
    scrollY,
    onScroll,
    compactTitleOpacity,
    /** Высота закреплённой строки без безопасной области — измеряется. */
    barHeight,
    setBarHeight,
    /** Отступ сверху для содержимого списка: безопасная область + строка. */
    contentTop: insets.top + barHeight,
    insets,
  };
}

/** Круглая кнопка строки навигации: стекло на iOS 26, иначе поверхность. */
export function NavCircleButton({
  label,
  onPress,
  children,
  active = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className="active:opacity-60"
    >
      <GlassSurface
        fallbackClassName={active ? "bg-accent" : "border border-hairline bg-canvas"}
        style={{
          width: NAV_BUTTON_SIZE,
          height: NAV_BUTTON_SIZE,
          borderRadius: NAV_BUTTON_SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {children}
      </GlassSurface>
    </Pressable>
  );
}

export interface LargeTitleBarProps {
  title: string;
  /** Прозрачность компактного заголовка и фона — из useLargeTitle(). */
  compactTitleOpacity: Animated.AnimatedInterpolation<number>;
  onLayoutHeight: (height: number) => void;
  onBack?: () => void;
  actions?: LargeTitleAction[];
  /** Панель под строкой навигации (поиск, фильтры), закреплена вместе с ней. */
  below?: ReactNode;
  /** Компактный заголовок и фон видны всегда (экран без крупного заголовка). */
  alwaysCompact?: boolean;
  /**
   * Резервировать ли строку 44 pt под кнопки в покое. По умолчанию — только
   * если есть «назад», действия или панель под строкой. На корне вкладки без
   * кнопок крупный заголовок начинается сразу под безопасной областью
   * (DECISION владельца 2026-09-07: «почему пустое место над заголовком»);
   * компактная полоса появляется поверх содержимого только при прокрутке.
   */
  compactRow?: boolean;
}

export function LargeTitleBar({
  title,
  compactTitleOpacity,
  onLayoutHeight,
  onBack,
  actions = [],
  below,
  alwaysCompact = false,
  compactRow,
}: LargeTitleBarProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "accent", "on-accent"]);
  const barOpacity = alwaysCompact ? 1 : compactTitleOpacity;
  const hasRow = compactRow ?? (!!onBack || actions.length > 0 || !!below || alwaysCompact);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}
    >
      {/* Фон строки — только когда содержимое уехало под неё. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          ...(hasRow ? { bottom: 0 } : { height: insets.top + NAV_ROW_HEIGHT }),
          opacity: barOpacity,
        }}
      >
        <GlassSurface style={{ flex: 1 }} fallbackClassName="bg-canvas">
          <View className="flex-1" />
          {LIQUID_GLASS ? null : <View className="h-px bg-hairline" />}
        </GlassSurface>
      </Animated.View>

      {hasRow ? null : (
        // Строки в покое нет: полоса с компактным заголовком живёт поверх
        // содержимого и видна только при прокрутке.
        <Animated.View
          pointerEvents="none"
          style={{
            height: insets.top + NAV_ROW_HEIGHT,
            justifyContent: "flex-end",
            opacity: barOpacity,
          }}
        >
          <View className="justify-center" style={{ height: NAV_ROW_HEIGHT }}>
            <AppText
              weight="semibold"
              className="text-center text-ios-title text-ink"
              numberOfLines={1}
            >
              {title}
            </AppText>
          </View>
        </Animated.View>
      )}
      <View
        pointerEvents="box-none"
        style={{
          paddingTop: hasRow ? insets.top : 0,
          position: hasRow ? "relative" : "absolute",
          top: 0,
          left: 0,
          right: 0,
        }}
        onLayout={(e) =>
          onLayoutHeight(hasRow ? Math.round(e.nativeEvent.layout.height - insets.top) : 0)
        }
      >
        {hasRow ? (
          <View
            pointerEvents="box-none"
            className="flex-row items-center px-3"
            style={{ height: NAV_ROW_HEIGHT }}
          >
            {onBack ? (
              <NavCircleButton label="Назад" onPress={onBack}>
                <SystemIcon
                  sf="chevron.left"
                  fallback={CaretLeft}
                  size={20}
                  weight="semibold"
                  color={tc.ink}
                />
              </NavCircleButton>
            ) : (
              <View style={{ width: NAV_BUTTON_SIZE }} />
            )}

            <Animated.View
              pointerEvents="none"
              className="min-w-0 flex-1"
              style={{ opacity: barOpacity }}
            >
              <AppText
                weight="semibold"
                className="text-center text-ios-title text-ink"
                numberOfLines={1}
              >
                {title}
              </AppText>
            </Animated.View>

            <View className="flex-row items-center gap-2" style={{ minWidth: NAV_BUTTON_SIZE }}>
              {actions.map((action) =>
                action.iconOnly && (action.Icon || action.sf) ? (
                  <NavCircleButton
                    key={action.label}
                    label={action.label}
                    onPress={action.onPress}
                    active={action.active}
                  >
                    {action.sf && action.Icon ? (
                      <SystemIcon
                        sf={action.sf}
                        fallback={action.Icon}
                        size={20}
                        weight="semibold"
                        color={action.active ? tc["on-accent"] : tc.ink}
                      />
                    ) : action.Icon ? (
                      <action.Icon
                        size={20}
                        weight="bold"
                        color={action.active ? tc["on-accent"] : tc.ink}
                      />
                    ) : null}
                  </NavCircleButton>
                ) : (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    onPress={action.onPress}
                    hitSlop={6}
                    className="active:opacity-60"
                  >
                    <GlassSurface
                      fallbackClassName="border border-hairline bg-canvas"
                      style={{
                        height: NAV_BUTTON_SIZE,
                        borderRadius: NAV_BUTTON_SIZE / 2,
                        paddingHorizontal: 16,
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      <AppText
                        weight={action.active ? "semibold" : "regular"}
                        className="text-ios-body text-accent"
                      >
                        {action.label}
                      </AppText>
                    </GlassSurface>
                  </Pressable>
                ),
              )}
            </View>
          </View>
        ) : null}

        {below}
      </View>
    </View>
  );
}

export interface LargeTitleBlockProps {
  title: string;
  subtitle?: string | null;
}

/** Крупный заголовок в начале списка. Уезжает вместе с содержимым. */
export function LargeTitleBlock({ title, subtitle }: LargeTitleBlockProps) {
  return (
    <View className="px-5 pt-3 pb-4">
      <AppText weight="bold" className="text-ios-large-title text-ink">
        {title}
      </AppText>
      {subtitle ? (
        <AppText className="mt-1 text-ios-subheadline text-mute">{subtitle}</AppText>
      ) : null}
    </View>
  );
}
