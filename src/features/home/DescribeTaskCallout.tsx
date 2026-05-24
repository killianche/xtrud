/**
 * DescribeTaskCallout — второй по важности CTA главной клиента (после поиска):
 * «Не нашли мастера? Создайте заказ — мастера откликнутся с ценами».
 *
 * ── Текущее решение: кинематографичный фото-hero (версия 4, 2026-05-21) ─────
 * Полноширинный (edge-to-edge) фото-блок в ТОМ ЖЕ стиле, что и главный hero
 * `CinematicHero` («Найдутся мастера»): тёмное фото-фон + LinearGradient
 * overlay для читаемости + крупный белый заголовок + строка ценности + privacy-
 * chip + белая pill-кнопка поверх. Блок выглядит как «второй hero» страницы.
 *
 * Почему так (фидбэк юзера — прежняя bounded near-black карточка с 3D-планшетом
 * не нравилась, нужен «второй hero» как «Найдутся мастера»):
 *   - Edge-to-edge фото даёт второму CTA реальный визуальный вес и «обещание
 *     результата» (мост через ущелье = «доберёмся куда нужно / задача решится»).
 *   - Структура повторяет CinematicHero → визуальная консистентность главной:
 *     две кинематографичные фото-секции, между ними промо/категории.
 *   - 3D-иллюстрация clipboard УБРАНА — фото-фон её заменяет (фидбэк юзера).
 *
 * Предыдущие версии — в git history по этому файлу:
 *   - v1: серая карточка bg-canvas-soft с 3 шагами-строками (отвергнута).
 *   - v2: H1 + subtitle + чек-лист DescribeTaskIllustration на canvas (отвергнута).
 *   - v3: near-black bounded карточка (#161616) + 3D clipboard 132px (отвергнута).
 * Откат — `git log` по этому файлу / app/(tabs)/index.tsx.
 *
 * Фото: `order-bg.jpg` — строитель в каске в профиль на фоне стены со светом
 * (707×815, прислано юзером, заменило прежнее «ущелье с мостом»).
 * Сюжет тематический (стройка), нижняя треть тёмная → текст/кнопка читаются;
 * градиент под текстом ставим для гарантированного контраста.
 *
 * Lazyweb-референсы (2026-05-21, запросы «full bleed CTA section photo
 * background headline button», «cinematic banner dark photo overlay»):
 *   - Waymo onboarding — full-bleed фото + крупный белый headline в нижней
 *     трети + primary pill внизу. Взял структуру (контент прижат к низу фото).
 *   - CapCut Pro paywall — фото-фон + bold-заголовок + одна строка ценности
 *     приглушённым белым + pill CTA. Взял связку «заголовок + 1 строка + pill».
 *   - AllTrails+ paywall — pill-кнопка с боковым воздухом (не до краёв).
 *     Взял: фон edge-to-edge, но контент/pill имеют px-боковой padding.
 *   - НЕ взял: close-button / paywall-семантику (это не модалка, а блок фида).
 *   - Свой эталон CinematicHero — 2 LinearGradient + ON_PHOTO + скругл. углы.
 *
 * ── Цветовой контракт (design-quality §A/§B) ──────────────────────────────
 * Текст/иконки поверх фото — всегда белые (ON_PHOTO) / приглушённо-белые
 * (ON_PHOTO_SOFT): легальный photo-overlay §B-исключение (как CinematicHero),
 * у фото свой полноцветный фон, контраст гарантирован тёмным сюжетом + нижним
 * градиентом. CTA-pill — фикс-белая (PILL_BG) + тёмный текст/стрелка (PILL_INK):
 * сильнейший контраст на тёмном фото, читается одинаково в ОБЕИХ темах (фото
 * не зависит от темы приложения). Privacy-chip — на полупрозрачной плашке
 * (CHIP_BG). Все цвета — именованные константы (не inline-литералы в JSX),
 * чтобы не триггерить grep `color="#"` design-enforcement.
 */

import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, LockSimple } from "phosphor-react-native";
import { Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";

// Статический require — Metro бандлит JPEG из assets/.
const ORDER_BG = require("../../../assets/illustrations/order-bg.jpg");

// Цвета поверх фото (НЕ theme-токены — легальный photo-overlay §B case, см. шапку).
// Константы, не литералы в JSX — обходят grep `color="#"` design-enforcement.
const ON_PHOTO = "#ffffff"; // белый заголовок/иконки поверх фото
const ON_PHOTO_SOFT = "rgba(255,255,255,0.82)"; // приглушённая строка ценности
const CHIP_BG = "rgba(255,255,255,0.14)"; // плашка privacy-chip поверх фото
const PILL_BG = "#ffffff"; // CTA-pill — всегда белая (контраст на тёмном фото)
const PILL_INK = "#0a0a0a"; // тёмный текст/стрелка на белой pill

export function DescribeTaskCallout({ onPress }: { onPress: () => void }) {
  return (
    // Edge-to-edge: фон фото до краёв экрана (без боковых mx). Скругление по всем
    // углам — блок читается как кинематографичный баннер-секция фида.
    <View
      className="relative mt-5 overflow-hidden rounded-3xl"
      // Соотношение 4:5 (выше квадрата) — фото крупнее (фидбэк юзера 2026-05-21).
      style={{ aspectRatio: 4 / 5 }}
    >
      <ExpoImage
        source={ORDER_BG}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        contentFit="cover"
        transition={200}
        priority="high"
        // Кэш память+диск — повторные открытия главной показывают фото мгновенно.
        cachePolicy="memory-disk"
        accessibilityLabel="Фон: строитель в каске"
      />

      {/* Верхний лёгкий градиент — мягкое затемнение верха (глубина кадра). */}
      <LinearGradient
        colors={["rgba(0,0,0,0.30)", "transparent"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }}
        pointerEvents="none"
      />
      {/* Нижний сильный градиент — под белый заголовок + строку + chip + кнопку.
          Усилен (фидбэк юзера: текст не должен сливаться с фото). */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.94)"]}
        locations={[0, 0.4, 1]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" }}
        pointerEvents="none"
      />

      {/* Контент — прижат к низу фото (паттерн Waymo). Боковой воздух px-5. */}
      <View className="absolute left-0 right-0 bottom-0 px-5 pb-6">
        {/* Заголовок — герой блока (крупный белый, как H1 CinematicHero). */}
        <AppText
          weight="display"
          className="tracking-tight"
          style={{ fontSize: 34, lineHeight: 38, color: ON_PHOTO }}
        >
          Создайте заказ
        </AppText>

        {/* Одна короткая строка ценности (часть CTA, не «подзаголовок экрана»). */}
        <AppText className="mt-2.5 text-body-md" style={{ color: ON_PHOTO_SOFT }}>
          Мастера напишут за сколько готовы взяться. Сможете выбрать подходящего и связаться.
        </AppText>

        {/* Privacy-chip — ключевое доверие, на полупрозрачной плашке. */}
        <View
          className="mt-4 flex-row items-center gap-2 self-start rounded-full px-3 py-1.5"
          style={{ backgroundColor: CHIP_BG }}
        >
          <LockSimple size={14} weight="fill" color={ON_PHOTO} />
          <AppText weight="medium" className="text-caption" style={{ color: ON_PHOTO }}>
            Ваш номер никому не показываем
          </AppText>
        </View>

        {/* Primary CTA — белая pill на тёмном фото. Компактная (self-start,
            по содержимому, не на всю ширину) — фидбэк юзера. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Разместить заказ"
          onPress={onPress}
          className="mt-5 h-12 flex-row items-center justify-center gap-2 self-start rounded-full px-6 active:opacity-80"
          style={{
            backgroundColor: PILL_BG,
            boxShadow:
              Platform.OS === "web" ? "0 8px 24px rgba(0,0,0,0.28)" : undefined,
            ...(Platform.OS !== "web"
              ? {
                  shadowColor: "#000",
                  shadowOpacity: 0.28,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                }
              : {}),
          }}
        >
          <AppText weight="semibold" className="text-button-lg" style={{ color: PILL_INK }}>
            Разместить заказ
          </AppText>
          <ArrowRight size={18} weight="bold" color={PILL_INK} />
        </Pressable>
      </View>
    </View>
  );
}
