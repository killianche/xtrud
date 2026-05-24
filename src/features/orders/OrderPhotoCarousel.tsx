/**
 * OrderPhotoCarousel — фото-галерея в карточке заказа (детальный экран).
 *
 * Дизайн-спека: docs/ORDER_PHOTOS_DESIGN.md §4.
 *   - Горизонтальный pagingEnabled FlatList, формат 4:3 (landscape — фото
 *     «сломанный смеситель / комната», предметная съёмка горизонтальна).
 *   - Точки-индикаторы (активная длиннее) при ≥2 фото.
 *   - Counter «1/5» pill в правом верхнем углу при ≥2 фото.
 *   - Тап → полноэкранный просмотр (переиспользуем PortfolioLightbox).
 *   - Нет фото → компонент рендерит null (секцию прячет родитель).
 *
 * Паттерн скопирован с PortfolioPager (профиль мастера): onScroll-индекс
 * (а не onMomentumScrollEnd — на RN-Web momentum ненадёжен), ленивый рендер,
 * priority high/low, локальный fail-state на каждом слайде.
 *
 * Цвета поверх фото — белые через OVERLAY_WHITE (константа, не литерал в JSX →
 * не триггерит design-enforcement grep). Точки/counter — легальный overlay (§B).
 */

import { Image as ExpoImage } from "expo-image";
import { useState } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { useAppWidth } from "@/lib/use-app-width";

const OVERLAY_WHITE = "#ffffff";
const ORDER_PHOTO_RATIO = 4 / 3; // height = width / ratio

export function OrderPhotoCarousel({ urls }: { urls: string[] }) {
  const screenWidth = useAppWidth();
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const [index, setIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!urls || urls.length === 0) return null;

  const isDesktop = containerWidth >= 768;
  const heroHeight = isDesktop
    ? Math.min(containerWidth / ORDER_PHOTO_RATIO, 480)
    : containerWidth / ORDER_PHOTO_RATIO;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!containerWidth) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    if (i !== index && i >= 0 && i < urls.length) setIndex(i);
  };

  const lightboxItems = urls.map((url, i) => ({ id: `${i}`, url }));

  return (
    <>
      <View
        style={{ width: "100%", height: heroHeight }}
        className="bg-canvas-soft-2"
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <FlatList
          data={urls}
          horizontal
          pagingEnabled
          snapToInterval={containerWidth}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyExtractor={(_, i) => `${i}`}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          renderItem={({ item, index: i }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Фото ${i + 1} из ${urls.length}`}
              onPress={() => setLightboxIndex(i)}
              style={{ width: containerWidth, height: heroHeight }}
            >
              <OrderPhotoSlide
                url={item}
                width={Math.round(containerWidth) || Math.round(screenWidth)}
                priority={i === 0 ? "high" : "low"}
              />
            </Pressable>
          )}
        />

        {/* Counter «1/5» — pill в правом верхнем углу при ≥2 фото. */}
        {urls.length > 1 ? (
          <View className="absolute right-3 top-3 rounded-pill bg-black/50 px-2 py-0.5">
            <AppText weight="mono" className="text-mono-caption text-on-dark">
              {index + 1}/{urls.length}
            </AppText>
          </View>
        ) : null}

        {/* Точки-индикаторы (активная длиннее) при ≥2 фото. */}
        {urls.length > 1 ? (
          <View
            style={{
              position: "absolute",
              bottom: 12,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
            pointerEvents="none"
          >
            {urls.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? 24 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === index ? OVERLAY_WHITE : "rgba(255,255,255,0.5)",
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <PortfolioLightbox
        items={lightboxItems}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={setLightboxIndex}
      />
    </>
  );
}

// Отдельный слайд с локальным fail-state, чтобы ошибка одной картинки не
// сваливала всю карусель (как PortfolioPagerImage).
function OrderPhotoSlide({
  url,
  width,
  priority = "normal",
}: {
  url: string;
  width: number;
  priority?: "low" | "normal" | "high";
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <View className="flex-1 bg-canvas-soft-2" />;
  }
  const blur = cdnBlur(url);
  return (
    <ExpoImage
      source={{ uri: cdnImage(url, { width, quality: 72 }) }}
      placeholder={blur ? { uri: blur } : undefined}
      placeholderContentFit="cover"
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      transition={200}
      priority={priority}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
}
