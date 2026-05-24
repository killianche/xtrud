/**
 * PromoBannerCarousel — горизонтальная карусель рекламных promo-баннеров на
 * главной клиента (партнёрские строительные магазины со скидками).
 *
 * Зачем: юзер прислал референс приложения клининга — синяя градиентная карточка
 * «Get 10% Discount» + бейдж услуги + CTA «Book Now». Хочет такой же блок, но с
 * рекламой строительных магазинов РИ. Это место для монетизации (партнёрка).
 *
 * Что делает:
 *   1. Горизонтальная карусель (ScrollView pagingEnabled со snap) из 3 баннеров.
 *   2. Каждый баннер — карточка rounded-2xl с диагональным LinearGradient-фоном
 *      (бренд-цвет → его тёмный оттенок). Структура по референсу:
 *        - крупный заголовок скидки («Скидка 10%»),
 *        - подзаголовок («на стройматериалы»),
 *        - pill снизу с названием магазина,
 *        - CTA «Подробнее» (НЕ «Book Now» — у нас переход к партнёру, не бронь).
 *      В углу — крупная полупрозрачная Phosphor-иконка как декор (без stock-фото).
 *   3. Точки-индикаторы под каруселью: активная — accent (link), неактивные —
 *      приглушённые (hairline-strong на полупрозрачности).
 *
 * Цвета:
 *   - Градиент = ФИКСИРОВАННАЯ бренд-пара (BRAND_GRADIENTS), не theme-токены.
 *     Почему не токены: токены палитры (violet, warning-deep) инвертируют светлоту
 *     между темами (в dark они становятся СВЕТЛЫМИ — это их назначение как
 *     текст/акцент на тёмном canvas). На баннере-карточке с белым текстом светлый
 *     фон в dark-теме = белое-на-светлом, нечитаемо (§A нарушение). Бренд-цвет
 *     партнёра концептуально НЕ зависит от темы приложения (как красный баннер
 *     Coca-Cola остаётся красным в dark mode). Поэтому это data (как partner.color
 *     из БД), а не styling-токен — фиксированный, всегда тёмный/насыщенный, белый
 *     текст контрастен в ОБЕИХ темах. Это легально по §B: цвета определены
 *     именованными константами (BRAND_GRADIENTS), а не inline-hex в JSX.
 *   - expo-linear-gradient на web «запекает» colors в CSS linear-gradient(…) —
 *     hex-значения подходят напрямую (rgb(var(--token)) бы НЕ распарсился).
 *   - Текст ПОВЕРХ градиента — всегда белый (text-white). Легальный overlay-case
 *     (§B исключение): у карточки свой полноцветный насыщенный фон, белый контраст
 *     гарантирован (бренд-цвета достаточно тёмные). Аналогично hero-фото.
 *   - CTA-кнопка — белая surface (bg-white) + тёмный бренд-текст: явный контраст,
 *     выделяется на цветном фоне (паттерн «Shop Now» из GOAT/camlist).
 *
 * Демо-контент:
 *   Массив PROMOS захардкожен прямо здесь (юзер выбрал демо, НЕ БД-систему).
 *   url — placeholder-сайты. В реальной партнёрской системе это будет partner.url
 *   из таблицы promo_banners (название/скидка/цвет/url/срок действия из БД).
 *
 * Lazyweb-референсы (2026-05-21):
 *   - PayPal: featured offer carousel (cashback-карты + Save CTA, гориз. свайп) →
 *     взял горизонтальную ленту карточек с CTA внутри.
 *   - GOAT / camlist: home promo banner (крупный hero + «Shop Now» в углу) →
 *     взял крупный заголовок + светлую CTA-pill снизу.
 *   - themepack / Costco: page-indicator dots под слайдером → взял точки-
 *     индикаторы (активная accent / неактивные приглушённые).
 *   - НЕ взял: full-screen промо-модалки (blinkist/wattpad/memrise) с «X dismiss» —
 *     это перебивающий paywall, нам нужен ненавязчивый встроенный в фид баннер.
 */

import { Image as ExpoImage } from "expo-image";
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

// Демо-баннер партнёра (готовое рекламное фото). В реальной партнёрской системе
// каждый рекламодатель загружает СВОЁ фото 16:9 — здесь оно придёт из
// promo_banners.image_url (Supabase Storage). Для демо используем одно
// присланное фото во всех слотах.
const PROMO_DEMO = require("../../../assets/illustrations/promo-demo.jpg");

interface Promo {
  id: string;
  /** Название партнёра — для accessibility label (на самом фото уже всё есть). */
  store: string;
  /** Фото-баннер рекламодателя (require демо-ассета или {uri} из БД). */
  image: number;
  /** Внешний URL партнёра. DEMO-плейсхолдер; в реальной системе — partner.url из БД. */
  url: string;
}

// Демо-баннеры (хардкод). В реальной партнёрской системе придут из таблицы
// promo_banners (Supabase): image_url (фото 16:9) + url + valid_until.
// Сейчас все слоты используют одно присланное демо-фото — рекламодатели
// заменят на свои баннеры.
const PROMOS: Promo[] = [
  { id: "ad-1", store: "СтройДом", image: PROMO_DEMO, url: "https://xtrud.ru" },
  { id: "ad-2", store: "Мир Плитки", image: PROMO_DEMO, url: "https://xtrud.ru" },
  { id: "ad-3", store: "ЭлектроМир", image: PROMO_DEMO, url: "https://xtrud.ru" },
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
      {/* Заголовок секции — «Специально для вас» (референс «Special for you»). */}
      <AppText weight="bold" className="mb-3 px-4 text-title-lg text-ink">
        Специально для вас
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
  // Соотношение баннера 16:9 (ширина:высота) — фидбэк юзера. height = width*9/16.
  // Баннер = готовое фото рекламодателя (без градиента/текста/плашки). Вся
  // карточка кликабельна → сайт партнёра.
  const height = Math.round((width * 9) / 16);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Реклама партнёра: ${promo.store}`}
      onPress={onPress}
      className="overflow-hidden rounded-2xl bg-surface-2 active:opacity-90"
      style={{ width, height }}
    >
      <ExpoImage
        source={promo.image}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={150}
      />
    </Pressable>
  );
}
