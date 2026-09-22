/**
 * PromoBannerCarousel — рекламный слот на Главной.
 *
 * Баннеры — фото рекламодателей 16:9 из таблицы promo_banners (0206), их
 * загружает и включает владелец в веб-админке. Нет ни одного включённого —
 * блок не показывается: пустой рекламный слот и заглушки не нужны
 * (DECISION владельца 2026-09-22: «баннер с кроссовками отключить, потом
 * скину свои»). Пока грузится или сеть упала — тоже ничего: реклама не
 * повод держать скелетон на Главной.
 *
 * Честность (design-quality §5): блок называется «Реклама», и на каждом
 * баннере та же метка — чтобы рекламу не путали с нашим содержимым.
 * Тап открывает ссылку рекламодателя; без ссылки баннер не кнопка.
 */

import { Image as ExpoImage } from "expo-image";
import { useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { cdnImage } from "@/lib/image-cdn";
import { openExternalUrl } from "@/lib/open-link";
import { useAppWidth } from "@/lib/use-app-width";
import { type PromoBanner, usePromoBanners } from "./use-promo-banners";

const SIDE_INSET = 20;
const CARD_GAP = 12;

export function PromoBannerCarousel() {
  const { data: banners } = usePromoBanners();
  const viewportWidth = useAppWidth();
  const [activeIndex, setActiveIndex] = useState(0);

  if (!banners || banners.length === 0) return null;

  // Один баннер — во всю ширину контента; несколько — следующий выглядывает
  // краем справа, чтобы было видно, что их можно листать.
  const contentWidth = Math.min(viewportWidth, 720);
  const single = banners.length === 1;
  const cardWidth = contentWidth - SIDE_INSET * 2 - (single ? 0 : 24);
  const snapInterval = cardWidth + CARD_GAP;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / snapInterval);
    if (idx !== activeIndex && idx >= 0 && idx < banners.length) setActiveIndex(idx);
  };

  return (
    <View className="mt-8">
      <AppText
        accessibilityRole="header"
        weight="bold"
        className="mb-3 px-5 text-title-lg text-ink"
      >
        Реклама
      </AppText>
      <ScrollView
        horizontal
        scrollEnabled={!single}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: SIDE_INSET, gap: CARD_GAP }}
      >
        {banners.map((banner) => (
          <PromoCard key={banner.id} banner={banner} width={cardWidth} />
        ))}
      </ScrollView>

      {banners.length > 1 ? (
        <View
          className="mt-3 flex-row items-center justify-center gap-1.5"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {banners.map((banner, idx) => (
            <View
              key={banner.id}
              className={`h-1.5 rounded-full ${idx === activeIndex ? "bg-link" : "bg-hairline-strong/40"}`}
              style={{ width: idx === activeIndex ? 18 : 6 }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PromoCard({ banner, width }: { banner: PromoBanner; width: number }) {
  // 16:9 — формат баннера (фидбэк владельца).
  const height = Math.round((width * 9) / 16);
  const label = banner.title ? `Реклама: ${banner.title}` : "Реклама";
  const link = banner.link_url;

  const body = (
    <>
      <ExpoImage
        source={{ uri: cdnImage(banner.image_url, { width, quality: 80 }) }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
      {/* Метка на самом баннере — рекламу не путают с нашим содержимым. */}
      <View className="absolute top-2.5 left-2.5 rounded-pill bg-surface-dark/60 px-2 py-0.5">
        <AppText weight="semibold" className="text-caption text-on-dark">
          Реклама
        </AppText>
      </View>
    </>
  );

  if (!link) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        className="overflow-hidden rounded-2xl bg-surface-2"
        style={{ width, height }}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Откроется сайт рекламодателя"
      onPress={() => openExternalUrl(link)}
      className="overflow-hidden rounded-2xl bg-surface-2 active:opacity-90"
      style={{ width, height }}
    >
      {body}
    </Pressable>
  );
}
