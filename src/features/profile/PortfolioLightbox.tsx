/**
 * Full-screen lightbox для просмотра фото портфолио.
 *
 * Sprint 12.5 — добавлены жесты:
 *  - Pinch-to-zoom (1x–4x)
 *  - Pan (только когда zoomed > 1x)
 *  - Double-tap toggle 1x ↔ 2.5x
 *  - При смене index — zoom сбрасывается
 *
 * Старый UI:
 *  - Modal на чёрном фоне, contentFit="contain"
 *  - Стрелки prev/next (wrap-around), счётчик, X-кнопка
 *  - Caption снизу если есть
 */

import { Image } from "expo-image";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useEffect } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import type { PortfolioItem } from "@/features/profile/use-my-portfolio";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

interface PortfolioLightboxProps {
  items: PortfolioItem[];
  /** Индекс открытого фото; null = закрыт. */
  index: number | null;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export function PortfolioLightbox({
  items,
  index,
  onClose,
  onChangeIndex,
}: PortfolioLightboxProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const visible = index !== null && index >= 0 && index < items.length;
  const item = visible ? items[index as number] : null;

  const total = items.length;
  const canNav = total > 1;
  const goPrev = () => {
    if (index == null) return;
    onChangeIndex((index - 1 + total) % total);
  };
  const goNext = () => {
    if (index == null) return;
    onChangeIndex((index + 1) % total);
  };

  // Animated values для pinch + pan.
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const baseTranslateX = useSharedValue(0);
  const baseTranslateY = useSharedValue(0);

  // Сброс zoom + pan + swipe при смене index или закрытии.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index — намеренный trigger; shared values стабильны.
  useEffect(() => {
    scale.value = withTiming(1, { duration: 200 });
    baseScale.value = 1;
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    baseTranslateX.value = 0;
    baseTranslateY.value = 0;
    swipeX.value = 0;
  }, [index]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = baseScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      baseScale.value = scale.value;
      if (scale.value <= MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        baseTranslateX.value = 0;
        baseTranslateY.value = 0;
      }
    });

  // Swipe-translation для visual feedback при перелистывании (scale=1x).
  const swipeX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      if (scale.value > MIN_SCALE) {
        // Zoomed — двигаем картинку внутри.
        translateX.value = baseTranslateX.value + e.translationX;
        translateY.value = baseTranslateY.value + e.translationY;
      } else {
        // Scale=1 — горизонтальный swipe для prev/next с follow-finger feedback.
        swipeX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (scale.value > MIN_SCALE) {
        baseTranslateX.value = translateX.value;
        baseTranslateY.value = translateY.value;
        return;
      }
      const threshold = width * 0.18;
      if (e.translationX < -threshold && canNav) {
        swipeX.value = withTiming(-width, { duration: 180 }, () => {
          runOnJS(onChangeIndex)((index ?? 0) + 1 < total ? (index ?? 0) + 1 : 0);
          swipeX.value = 0;
        });
      } else if (e.translationX > threshold && canNav) {
        swipeX.value = withTiming(width, { duration: 180 }, () => {
          runOnJS(onChangeIndex)((index ?? 0) - 1 >= 0 ? (index ?? 0) - 1 : total - 1);
          swipeX.value = 0;
        });
      } else {
        swipeX.value = withTiming(0, { duration: 180 });
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        baseScale.value = MIN_SCALE;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        baseTranslateX.value = 0;
        baseTranslateY.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        baseScale.value = DOUBLE_TAP_SCALE;
      }
    });

  // Single tap — закрывает только при scale==1 (чтобы не мешать zoom-юзеру).
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) runOnJS(onClose)();
    });

  const composed = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + (scale.value <= MIN_SCALE ? swipeX.value : 0) },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {item && (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 bg-black">
            {/* Image with gestures */}
            <GestureDetector gesture={composed}>
              <Animated.View
                style={[
                  { width, height, alignItems: "center", justifyContent: "center" },
                  animatedStyle,
                ]}
              >
                <Image
                  source={{ uri: item.url }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="contain"
                  transition={150}
                />
              </Animated.View>
            </GestureDetector>

            {/* Top bar: counter + close */}
            <View
              className="absolute top-0 right-0 left-0 flex-row items-center justify-between px-4"
              style={{ paddingTop: insets.top + 8 }}
              pointerEvents="box-none"
            >
              <View className="rounded-full bg-black/40 px-3 py-1">
                <AppText weight="medium" className="text-caption text-on-dark">
                  {(index ?? 0) + 1} / {total}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={onClose}
                hitSlop={12}
                className="h-10 w-10 items-center justify-center rounded-full bg-black/40 active:opacity-70"
              >
                <X size={22} strokeWidth={2} color="#ffffff" />
              </Pressable>
            </View>

            {/* Prev / Next arrows */}
            {canNav && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Предыдущее фото"
                  onPress={goPrev}
                  hitSlop={12}
                  className="absolute top-1/2 left-3 h-11 w-11 items-center justify-center rounded-full bg-black/40 active:opacity-70"
                  style={{ transform: [{ translateY: -22 }] }}
                >
                  <ChevronLeft size={26} strokeWidth={2} color="#ffffff" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Следующее фото"
                  onPress={goNext}
                  hitSlop={12}
                  className="absolute top-1/2 right-3 h-11 w-11 items-center justify-center rounded-full bg-black/40 active:opacity-70"
                  style={{ transform: [{ translateY: -22 }] }}
                >
                  <ChevronRight size={26} strokeWidth={2} color="#ffffff" />
                </Pressable>
              </>
            )}

            {/* Caption */}
            {item.caption && (
              <View
                className="absolute right-0 bottom-0 left-0 bg-black/55 px-6 py-4"
                style={{ paddingBottom: insets.bottom + 16 }}
                pointerEvents="box-none"
              >
                <AppText className="text-body-sm text-on-dark">{item.caption}</AppText>
              </View>
            )}
          </View>
        </GestureHandlerRootView>
      )}
    </Modal>
  );
}
