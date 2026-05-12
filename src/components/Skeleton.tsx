// Skeleton — placeholder с shimmer-анимацией для первичной загрузки.
//
// Используется ВМЕСТО `<ActivityIndicator>` на list-экранах и detail-страницах
// при первой загрузке данных. ActivityIndicator оставляем для in-button submit
// и pull-to-refresh.
//
// Реализация: pulse-animation через react-native-reanimated (opacity 0.6 ↔ 1).
// Это легче и стабильнее чем gradient-shimmer и не требует expo-linear-gradient
// в зависимостях.

import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export interface SkeletonProps {
  /** Тип формы. text — прямоугольник, circle — круг, rect — произвольный. */
  variant?: "text" | "circle" | "rect";
  /** Ширина в px или строка ('100%'). По умолчанию 100% для text/rect, height для circle. */
  width?: number | string;
  /** Высота в px. По умолчанию 14 для text, width для circle, 80 для rect. */
  height?: number;
  /** Радиус скругления. По умолчанию: text — 4, circle — width/2, rect — 8. */
  radius?: number;
  /** Дополнительный className (NativeWind), напр. `mt-2`. */
  className?: string;
  /** Свой стиль. */
  style?: ViewStyle;
}

const DEFAULT_TEXT_HEIGHT = 14;
const DEFAULT_RECT_HEIGHT = 80;

export function Skeleton({
  variant = "text",
  width,
  height,
  radius,
  className,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const resolvedHeight = (() => {
    if (height !== undefined) return height;
    if (variant === "text") return DEFAULT_TEXT_HEIGHT;
    if (variant === "circle") return typeof width === "number" ? width : 40;
    return DEFAULT_RECT_HEIGHT;
  })();

  const resolvedWidth =
    width !== undefined ? width : variant === "circle" ? resolvedHeight : "100%";

  const resolvedRadius = (() => {
    if (radius !== undefined) return radius;
    if (variant === "circle") return Number(resolvedHeight) / 2;
    if (variant === "text") return 4;
    return 8;
  })();

  return (
    <Animated.View
      className={`bg-surface-2 ${className ?? ""}`}
      style={[
        {
          width: resolvedWidth as number | `${number}%`,
          height: resolvedHeight,
          borderRadius: resolvedRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ============================================================================
// Composable skeletons под типичные UI-блоки
// ============================================================================

/**
 * Skeleton-row под `<MasterCard>` / `<OrderRow>` / `<ChatRow>` — карточка с
 * аватаром слева и двумя строчками текста справа.
 */
export function CardRowSkeleton({ withAvatar = true }: { withAvatar?: boolean }) {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas p-4">
      {withAvatar && <Skeleton variant="circle" width={44} />}
      <View className="flex-1 gap-2">
        <Skeleton width="60%" />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

/**
 * Список из N CardRow-skeleton'ов с одинаковым гэпом.
 */
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-2">
      {Array.from({ length: count }).map((_, i) => (
        // Индекс позиции, не идентификатор данных — порядок фиксирован.
        // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
        <CardRowSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Skeleton под плитку категории (квадратная aspect-square с большим тайлом).
 */
export function TileSkeleton() {
  return <Skeleton variant="rect" height={undefined} className="aspect-square" radius={12} />;
}

/**
 * Skeleton под master-detail hero (большой круг + 2 строки).
 */
export function HeroSkeleton() {
  return (
    <View className="items-center gap-4 px-6 pt-4">
      <Skeleton variant="circle" width={96} />
      <Skeleton width={180} height={18} />
      <Skeleton width={120} height={12} />
    </View>
  );
}
