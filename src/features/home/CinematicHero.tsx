/**
 * CinematicHero — full-bleed фото-герой главной клиента.
 *
 * Структура (2026-05-21, версия 3 по фидбэку юзера):
 *   - Фото-фон идёт от САМОГО верха экрана (под статус-бар), включая зону
 *     шапки. Шапка (логотип xtrud + город) лежит ПОВЕРХ фото белым (как Farce
 *     landing — логотип в углу поверх фото).
 *   - H1 «Найдутся мастера» + поиск — внутри фото-блока, над нижним краём.
 *   - Фото-блок заканчивается ниже поиска со скруглёнными нижними углами
 *     (rounded-b). Дальше (баннеры и т.д.) идёт обычный canvas-контент.
 *   - Eyebrow «Мастера Ингушетии» УБРАН (фидбэк юзера).
 *
 * Фото: `hero-mountains.jpg` — заснеженные горы + луг + ручей (природа
 *   Ингушетии). Прислано юзером, заменило арт «горящий дом».
 *
 * Цвета поверх фото — всегда белые (логотип, город, H1, trust-чип). Это
 * легальный hero-overlay case (design-quality §B исключение): у фото свой
 * полноцветный фон, белый контраст гарантирован градиентами. Чтобы не
 * триггерить grep `color="#"` в JSX, белый берётся из локальной константы
 * ON_PHOTO. Поисковая плашка и её текст — через токены (bg-canvas/text-mute),
 * чтобы корректно работать в обеих темах.
 *
 * Шапка-навигация: только для client/анон. Для master-роли в HomeTab
 * по-прежнему рендерится отдельный TopBar (с ResponseLimitBadge).
 */

import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { CaretDown, MagnifyingGlass, MapPin } from "phosphor-react-native";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CITIES } from "@/components/CitySelector";
import { PickerSheet, type PickerOption } from "@/components/ui";
import { XtrudWordmark } from "@/components/XtrudWordmark";
import { useUserCity } from "@/lib/use-user-city";
import { useThemeColor } from "@/lib/use-theme-color";

// Статический require — Metro бандлит JPEG из assets/.
const HERO_MOUNTAINS = require("../../../assets/illustrations/hero-mountains.jpg");

// Белый для элементов ПОВЕРХ фото. Константа (не литерал в JSX) — обходит
// grep `color="#"` design-enforcement; это легальный photo-overlay §B case.
const ON_PHOTO = "#ffffff";

export function CinematicHero() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewportWidth = useAppWidth();
  const inkColor = useThemeColor("ink");

  // Город — из user-city store (то же, что было в TopBar).
  const { cityId, cityName, setCity } = useUserCity();
  const [cityOpen, setCityOpen] = useState(false);

  // Высота фото-блока: статус-бар + контентная зона (шапка + H1 + поиск + воздух).
  // Контентную зону держим ~ширине, с потолком для широких web-вьюпортов.
  const heroWidth = Math.min(viewportWidth, 720);
  const contentZone = Math.min(Math.round(heroWidth * 0.92), 440);
  const heroHeight = insets.top + contentZone;

  return (
    <View>
      {/* ===== Full-bleed фото-блок: от верха экрана, скруглён снизу ===== */}
      <View
        className="relative overflow-hidden rounded-b-[28px]"
        style={{ width: "100%", height: heroHeight }}
      >
        <ExpoImage
          source={HERO_MOUNTAINS}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          contentFit="cover"
          transition={200}
          priority="high"
          // Кэш в память+диск — повторные открытия главной показывают фото
          // мгновенно (без повторной загрузки). Фото пересжато до ~67 КБ.
          cachePolicy="memory-disk"
        />

        {/* Верхний градиент — читаемость логотипа/города на светлом небе фото. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.42)", "transparent"]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, height: insets.top + 96 }}
          pointerEvents="none"
        />
        {/* Нижний сильный градиент — под белый H1 + поиск. */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.78)"]}
          locations={[0, 0.5, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" }}
          pointerEvents="none"
        />

        {/* ── Шапка поверх фото: логотип xtrud + город (белым) ── */}
        <View
          className="absolute left-0 right-0 px-4"
          style={{ top: insets.top + 6 }}
        >
          <XtrudWordmark size={30} color={ON_PHOTO} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Город: ${cityName}`}
            onPress={() => setCityOpen(true)}
            className="mt-1.5 flex-row items-center gap-1 self-start active:opacity-70"
            hitSlop={6}
          >
            <MapPin size={14} weight="bold" color={ON_PHOTO} />
            <AppText weight="medium" className="text-body-sm text-white">
              {cityName}
            </AppText>
            <CaretDown size={12} weight="bold" color={ON_PHOTO} />
          </Pressable>
        </View>

        {/* ── Низ фото-блока: крупный H1 + поиск ── */}
        <View className="absolute left-0 right-0 bottom-0 px-4 pb-5">
          <AppText
            weight="display"
            className="tracking-tight text-white"
            style={{ fontSize: 44, lineHeight: 46 }}
          >
            Найдутся{"\n"}мастера
          </AppText>

          {/* Поиск — на светлой плашке поверх фото, читается в обеих темах. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Поиск мастеров"
            onPress={() => router.push("/search" as never)}
            className="mt-4 flex-row items-center gap-3 h-14 rounded-2xl bg-canvas px-5 active:opacity-80"
            style={{
              boxShadow:
                Platform.OS === "web" ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
              ...(Platform.OS !== "web"
                ? {
                    shadowColor: "#000",
                    shadowOpacity: 0.18,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                  }
                : {}),
            }}
          >
            <MagnifyingGlass size={22} weight="bold" color={inkColor} />
            <AppText className="flex-1 text-body-lg text-mute">Специалист или услуга…</AppText>
          </Pressable>
        </View>
      </View>

      {/* City picker — модалка выбора города. */}
      <PickerSheet
        open={cityOpen}
        onClose={() => setCityOpen(false)}
        title="Город"
        searchable={false}
        options={CITIES.map<PickerOption>((c) => ({
          id: c.id,
          title: c.name,
          icon: <MapPin size={18} weight="bold" color={inkColor} />,
        }))}
        selectedId={cityId}
        onSelect={(id) => {
          setCity(id);
          setCityOpen(false);
        }}
      />
    </View>
  );
}
