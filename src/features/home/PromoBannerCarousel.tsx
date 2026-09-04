/**
 * PromoBannerCarousel — рекламный слот на главной клиента.
 *
 * Зачем: место для монетизации. Реклама здесь — не наше содержимое, поэтому
 * блок называется «Реклама», и на самом баннере есть такая же метка. Обещания
 * подбора («Специально для вас») убраны 2026-09-04: подбора нет, баннер один
 * и одинаковый для всех (design-quality §5).
 *
 * Баннер бывает двух видов — фото рекламодателя (`kind: "image"`) и
 * нарисованный приложением (`kind: "art"`). Второй нужен, пока живого
 * рекламодателя нет: слот не должен стоять пустым. Оба вида — 16:9, вся
 * карточка кликабельна.
 *
 * Про цвет: градиент баннера — ФИКСИРОВАННАЯ пара, а не токены темы. Бренд
 * рекламодателя не переворачивается вместе с темой приложения (красный баннер
 * не становится светлым в тёмной теме), а белый текст на тёмном градиенте
 * читается в обеих. Текст поверх градиента берёт `on-dark` / `surface-dark` —
 * это токены, одинаковые в обеих темах, поэтому правило «только токены»
 * соблюдено.
 *
 * Карусель: горизонтальный ScrollView со снапом и точками-индикаторами.
 * Индикаторы показываются только когда баннеров больше одного.
 */

import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Sneaker } from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { openExternalUrl } from "@/lib/open-link";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColor } from "@/lib/use-theme-color";

// Готовое фото рекламодателя подключается так:
//   { kind: "image", id: "...", store: "...", url: "...",
//     image: require("../../../assets/illustrations/teplodom-banner.png") }
// Файл ТЕПЛЫЙ ДОМ лежит в assets/illustrations и ждёт возврата рекламодателя.

// Баннер бывает двух видов.
//
//  - `image` — готовое фото рекламодателя. Так выглядит реальная реклама: в
//    партнёрской системе картинка приходит из promo_banners.image_url.
//  - `art` — баннер, нарисованный самим приложением из текста и цвета. Нужен,
//    пока рекламодателя нет: слот не должен стоять пустым или показывать
//    чужой бренд.
//
// DECISION владельца 2026-09-04: поставить в слот рекламу кроссовок.
// Название и логотип реальной марки я не ставлю: это чужой товарный знак, а
// баннер в приложении из App Store выглядит как настоящая реклама этой марки.
// Когда появится живой рекламодатель — его фото встаёт сюда одной строкой
// данных, вид баннера при этом не меняется.
interface PromoImage {
  kind: "image";
  id: string;
  /** Название партнёра — для accessibility label (на самом фото уже всё есть). */
  store: string;
  /** Фото-баннер рекламодателя (require демо-ассета или {uri} из БД). */
  image: number;
  url: string;
}

interface PromoArt {
  kind: "art";
  id: string;
  store: string;
  /** Крупная строка — то, ради чего баннер существует. */
  headline: string;
  /** Пояснение под ней. */
  subline: string;
  /** Надпись на кнопке. */
  cta: string;
  /** Пара цветов фона. Не токены темы: бренд рекламодателя не меняется вместе
   *  с темой приложения, а белый текст обязан оставаться читаемым в обеих. */
  gradient: readonly [string, string];
  url: string;
}

type Promo = PromoImage | PromoArt;

// Баннеры. Пока один реальный (ТЕПЛЫЙ ДОМ). Остальные слоты добавим, когда
// подключим партнёрку (из таблицы promo_banners: image_url + url + valid_until).
// Тап по баннеру — звонок на номер с него (tel:), это реальное действие (§F).
const PROMOS: Promo[] = [
  {
    kind: "art",
    id: "ad-sneakers",
    store: "Кроссовки — скидка 20%",
    headline: "Кроссовки\nсо скидкой 20%",
    subline: "Спортивная обувь · доставка по Ингушетии",
    cta: "Смотреть",
    gradient: ["#1f2937", "#0f172a"],
    url: "https://xtrud.pro",
  },
];

export function PromoBannerCarousel() {
  const viewportWidth = useAppWidth();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Ширина одного баннера = ширина контента минус горизонтальные поля (px-5 = 20
  // с каждой стороны). Карусель — full-bleed ScrollView (без mx-5), а отступ
  // создаётся paddingHorizontal у contentContainer, чтобы соседние карточки
  // «выглядывали» краем (Costco/PayPal peeking-паттерн).
  const sideInset = 20;
  const cardGap = 12;
  const contentWidth = Math.min(viewportWidth, 720);
  // Карточка чуть уже контента — чтобы следующий баннер подсматривался справа.
  const cardWidth = contentWidth - sideInset * 2;
  const snapInterval = cardWidth + cardGap;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    if (idx !== activeIndex && idx >= 0 && idx < PROMOS.length) {
      setActiveIndex(idx);
    }
  }

  function openPromo(url: string) {
    // CTA не пустой (правило §F) — открываем сайт партнёра во внешней вкладке
    // (openExternalUrl: на web — новая вкладка, не перезагружает SPA).
    openExternalUrl(url);
  }

  return (
    <View className="mt-8">
      {/* Заголовок секции. Было «Специально для вас» — это обещание подбора,
          которого нет: баннер один и одинаковый для всех (design-quality §5,
          честность интерфейса). Реклама называется рекламой. */}
      <AppText weight="bold" className="mb-3 px-4 text-title-lg text-ink">
        Реклама
      </AppText>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: sideInset,
          gap: cardGap,
        }}
      >
        {PROMOS.map((promo) => (
          <PromoCard
            key={promo.id}
            promo={promo}
            width={cardWidth}
            onPress={() => openPromo(promo.url)}
          />
        ))}
      </ScrollView>

      {/* Точки-индикаторы. Активная — accent (link), шире (rounded pill).
          Неактивные — приглушённые узкие точки. Паттерн themepack/Costco. */}
      {PROMOS.length > 1 ? (
        <View className="mt-3 flex-row items-center justify-center gap-1.5">
          {PROMOS.map((promo, idx) => {
            const isActive = idx === activeIndex;
            return (
              <View
                key={promo.id}
                className={`h-1.5 rounded-full ${isActive ? "bg-link" : "bg-hairline-strong/40"}`}
                style={{ width: isActive ? 18 : 6 }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function PromoCard({
  promo,
  width,
  onPress,
}: {
  promo: Promo;
  width: number;
  onPress: () => void;
}) {
  // Соотношение баннера 16:9 — фидбэк владельца. height = width*9/16.
  const height = Math.round((width * 9) / 16);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Реклама: ${promo.store}`}
      onPress={onPress}
      className="overflow-hidden rounded-2xl bg-surface-2 active:opacity-90"
      style={{ width, height }}
    >
      {promo.kind === "image" ? (
        <ExpoImage
          source={promo.image}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <PromoArtwork promo={promo} height={height} />
      )}
    </Pressable>
  );
}

/**
 * Нарисованный баннер. Строится по тому же правилу, что карточка задания:
 * держится на типографике, а не на украшениях. Крупная строка, пояснение,
 * одна светлая кнопка и большой полупрозрачный предмет справа вместо
 * стокового фото.
 */
function PromoArtwork({ promo, height }: { promo: PromoArt; height: number }) {
  const onDark = useThemeColor("on-dark");

  return (
    <LinearGradient
      colors={promo.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Предмет рекламы — крупно и приглушённо, как подложка. Он уходит за
          правый край: так баннер выглядит кадром, а не наклейкой. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -height * 0.18,
          bottom: -height * 0.22,
          opacity: 0.16,
          transform: [{ rotate: "-12deg" }],
        }}
      >
        <Sneaker size={height * 0.95} weight="fill" color={onDark} />
      </View>

      <View className="flex-1 justify-center px-5 py-4">
        {/* Слово «Реклама» на самом баннере — чтобы её не путали с нашим
            содержимым. Требование честности интерфейса, не украшение. */}
        <View className="self-start rounded-pill bg-on-dark/15 px-2 py-0.5">
          <AppText weight="semibold" className="text-caption text-on-dark">
            Реклама
          </AppText>
        </View>
        <AppText weight="bold" className="mt-2 text-display-sm text-on-dark">
          {promo.headline}
        </AppText>
        <AppText className="mt-1 text-body-sm text-on-dark-soft" numberOfLines={1}>
          {promo.subline}
        </AppText>
        <View className="mt-3 self-start rounded-pill bg-on-dark px-4 py-2">
          <AppText weight="semibold" className="text-body-sm text-surface-dark">
            {promo.cta}
          </AppText>
        </View>
      </View>
    </LinearGradient>
  );
}
