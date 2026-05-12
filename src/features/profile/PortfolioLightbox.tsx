/**
 * Full-screen lightbox для просмотра фото портфолио.
 *
 * Sprint 12.1 MVP:
 *  - Modal с чёрным фоном (75% opacity → черный)
 *  - Фото `contentFit="contain"` — целиком видно
 *  - Стрелки prev/next (тап-кнопки), wrap-around
 *  - Кнопка X в правом верхнем углу + tap по фону закрывает
 *  - Caption снизу, если есть
 *  - Счётчик «n / total»
 *
 * Pinch-to-zoom и swipe-жесты — отложил в sprint 13+, нужно
 * react-native-gesture-handler + reanimated worklet.
 */

import { Image } from "expo-image";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import type { PortfolioItem } from "@/features/profile/use-my-portfolio";

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {item && (
        <View className="flex-1 bg-black">
          {/* Tap-out overlay */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть просмотр"
            onPress={onClose}
            style={{ position: "absolute", inset: 0 }}
          />

          {/* Image */}
          <View pointerEvents="none" className="flex-1 items-center justify-center">
            <Image
              source={{ uri: item.url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
              transition={150}
            />
          </View>

          {/* Top bar: counter + close */}
          <View
            className="absolute top-0 right-0 left-0 flex-row items-center justify-between px-4"
            style={{ paddingTop: insets.top + 8 }}
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
            >
              <AppText className="text-body-sm text-on-dark">{item.caption}</AppText>
            </View>
          )}
        </View>
      )}
    </Modal>
  );
}
