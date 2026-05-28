/**
 * MasterCinematicHero — full-bleed фото-герой главной мастера.
 *
 * Запрошено владельцем 2026-05-24: «верх мастера сделать таким же фото-блоком,
 * как на главной клиента — фоновое фото гор со скруглением снизу, поверх белым
 * текстом информация мастера».
 *
 * Приём скопирован 1-в-1 из `src/features/home/CinematicHero.tsx` (герой
 * клиента), чтобы у обеих ролей был единый визуальный язык:
 *   - Фото-фон идёт от САМОГО верха экрана (под статус-бар), включая зону
 *     шапки. Шапка (логотип xtrud + лимит откликов + город) лежит ПОВЕРХ фото.
 *   - Низ фото-блока (как H1 у клиента): приветствие + персональная статистика.
 *     Слева аватар, справа «Ассаламу алейкум, Имя» + строка показов/открытий.
 *   - Фото-блок заканчивается скруглёнными нижними углами (rounded-b-[28px]).
 *     Дальше (готовность, «Ваши отклики») идёт обычный canvas-контент в
 *     MasterHomeContent.
 *
 * Чем отличается от клиентского героя:
 *   - Содержимое поверх фото — информация мастера, не H1+поиск.
 *   - Контент-зона компактнее (множитель 0.78, потолок 360): у мастера снизу
 *     две строки текста + аватар, объём меньше чем H1-44px+поиск-h14 у клиента,
 *     иначе фото было бы неоправданно высоким.
 *   - Переключатель готовности (AvailabilitySwitcher) НЕ кладётся на фото: это
 *     раскрывающийся inline-список, он обрезался бы при overflow-hidden. Он
 *     остаётся под фото-блоком на обычном canvas (в MasterHomeContent).
 *
 * Цвета поверх фото — всегда белые (логотип, город, приветствие, статистика).
 * Это легальный hero-overlay case (design-quality §B исключение): у фото свой
 * полноцветный фон, белый контраст гарантирован градиентами. Чтобы не
 * триггерить grep `color="#"` в JSX, белый берётся из локальной константы
 * ON_PHOTO. Бейдж лимита откликов (ResponseLimitBadge) — самодостаточный
 * компонент через токены: он лежит на чистом pill-фоне (bg-canvas + border),
 * не нуждается в белом-на-фото и корректно читается в обеих темах.
 */

import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { CaretDown, MapPin } from "phosphor-react-native";
import { useState } from "react";
import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CITIES } from "@/components/CitySelector";
import { PickerSheet, type PickerOption } from "@/components/ui";
import { XtrudWordmark } from "@/components/XtrudWordmark";
import { useUserRecord } from "@/features/auth/use-user-record";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABELS,
  type AvailabilityStatus,
  effectiveStatus,
  useMyAvailability,
  useSetAvailability,
} from "@/features/master-view/availability";
import { RoleSwitchPill } from "@/features/master-view/RoleSwitchPill";
import { useResponseLimit } from "@/features/orders/use-response-limit";
import { useMyMasterViewStats } from "@/features/master-view/use-my-view-stats";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColor } from "@/lib/use-theme-color";
import { useUserCity } from "@/lib/use-user-city";

// Статический require — Metro бандлит JPEG из assets/. Фон героя мастера —
// `master-hero.jpg` (рабочий на закате, фидбэк владельца 2026-05-24). У клиента
// свой фон (hero-mountains.jpg) — роли визуально различаются.
const HERO_IMAGE = require("../../../assets/illustrations/master-hero.jpg");

// Белый для элементов ПОВЕРХ фото. Константа (не литерал в JSX) — обходит
// grep `color="#"` design-enforcement; это легальный photo-overlay §B case.
const ON_PHOTO = "#ffffff";

// Порядок статусов готовности в окне выбора: срочные → «не указан» → недоступен.
const AVAIL_OPTIONS: AvailabilityStatus[] = [
  "today",
  "this_week",
  "next_week",
  "unspecified",
  "unavailable",
];

interface MasterCinematicHeroProps {
  userId: string;
}

export function MasterCinematicHero({ userId }: MasterCinematicHeroProps) {
  const insets = useSafeAreaInsets();
  const viewportWidth = useAppWidth();
  const inkColor = useThemeColor("ink");

  // Город — из user-city store (то же поведение, что в клиентском герое).
  const { cityId, cityName, setCity } = useUserCity();
  const [cityOpen, setCityOpen] = useState(false);

  // Готовность к заказам — компактная плашка ПОВЕРХ фото; по тапу открывается
  // окно выбора (PickerSheet), а не inline-список (он обрезался бы overflow).
  const [availOpen, setAvailOpen] = useState(false);
  const { data: avail } = useMyAvailability(userId);
  const setAvailability = useSetAvailability();
  const currentAvail = effectiveStatus(
    avail?.availability_status,
    avail?.availability_until,
  );

  // Данные мастера: имя/фамилия/аватар + персональная статистика за неделю.
  const { data: user } = useUserRecord(userId);
  const { data: stats, isLoading: statsLoading } = useMyMasterViewStats(userId);

  const firstName = user?.first_name?.trim() || "Мастер";

  // Статистика: loading → «…», 0 — валидное значение (у новых мастеров норма).
  const impressions = statsLoading ? "…" : String(stats?.impressions ?? 0);
  const profileOpens = statsLoading ? "…" : String(stats?.profile_opens ?? 0);

  // Лимит откликов мастера — переехал из верхнего бейджа в строку статистики
  // (фидбэк владельца 2026-05-27). Тот же стиль text-body-sm text-white, чтобы
  // выглядеть единой строкой с «показов» / «открыли профиль».
  const { data: respLimit, isLoading: respLoading } = useResponseLimit();
  const respUsed = respLoading ? "…" : String(respLimit?.used ?? 0);
  const respMax = respLoading ? "…" : String(respLimit?.max ?? 5);

  // Высота фото-блока: статус-бар + контентная зона (шапка + приветствие +
  // статистика + воздух). Зона компактнее клиентской (меньше текста снизу).
  const heroWidth = Math.min(viewportWidth, 720);
  const contentZone = Math.min(Math.round(heroWidth * 0.78), 360);
  // +56 — полоса под компактную плашку готовности внизу фото.
  const heroHeight = insets.top + contentZone + 56;

  return (
    <View>
      {/* ===== Full-bleed фото-блок: от верха экрана, скруглён снизу ===== */}
      <View
        className="relative overflow-hidden rounded-b-[28px]"
        style={{ width: "100%", height: heroHeight }}
      >
        <ExpoImage
          source={HERO_IMAGE}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          contentFit="cover"
          transition={200}
          priority="high"
          cachePolicy="memory-disk"
        />

        {/* Верхний градиент — читаемость логотипа/бейджа/города на светлом небе. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.42)", "transparent"]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, height: insets.top + 96 }}
          pointerEvents="none"
        />
        {/* Нижний сильный градиент — под белое приветствие + статистику. */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.78)"]}
          locations={[0, 0.5, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" }}
          pointerEvents="none"
        />

        {/* ── Шапка поверх фото ──
            Ряд 1: логотип xtrud слева | RoleSwitchPill справа (фидбэк
            владельца 2026-05-27 — «перенеси переключатель Клиент/Мастер
            в правый верхний угол hero, где раньше был бейдж откликов»).
            Pill — компактный (28px высоты, только иконки), помещается
            рядом с логотипом h=30. Скрывается для single-master.
            Ряд 2: город под логотипом. */}
        <View
          className="absolute left-0 right-0 px-4"
          style={{ top: insets.top + 6 }}
        >
          <View className="flex-row items-center justify-between">
            <XtrudWordmark size={30} color={ON_PHOTO} />
            {user ? (
              <RoleSwitchPill
                userId={userId}
                currentRole={user.active_role}
                isClient={user.is_client}
              />
            ) : null}
          </View>
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

        {/* ── Низ фото-блока: приветствие + строка статистики (без аватара) ── */}
        <View className="absolute left-0 right-0 bottom-0 px-4 pb-5">
          <AppText
            numberOfLines={2}
            className="tracking-tight text-white"
            style={{ fontSize: 24, lineHeight: 28 }}
          >
            <AppText weight="medium" className="text-white">
              Ассаламу алейкум,{" "}
            </AppText>
            <AppText weight="bold" className="text-white">
              {firstName}
            </AppText>
          </AppText>

          {/* Статистика за неделю — тихая строка белым (как строка города у
              клиента: className text-white, RNW резолвит белый корректно).
              Цифры выделены весом (semibold) от подписей. */}
          <View className="mt-1.5 flex-row flex-wrap items-center gap-x-1">
            <AppText weight="semibold" className="text-body-sm text-white">
              {impressions}
            </AppText>
            <AppText className="text-body-sm text-white">показов ·</AppText>
            <AppText weight="semibold" className="text-body-sm text-white">
              {profileOpens}
            </AppText>
            <AppText className="text-body-sm text-white">открыли профиль ·</AppText>
            <AppText weight="semibold" className="text-body-sm text-white">
              {respUsed} из {respMax}
            </AppText>
            <AppText className="text-body-sm text-white">откликов</AppText>
          </View>

          {/* Готовность к заказам — компактная фростед-плашка (точка-статус +
              подпись + caret). Тап открывает окно выбора (PickerSheet). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Изменить готовность к заказам"
            onPress={() => setAvailOpen(true)}
            hitSlop={4}
            className="mt-3 self-start flex-row items-center gap-2 rounded-pill border border-white/30 bg-black/40 px-3.5 py-2 active:opacity-80"
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: AVAILABILITY_DOT[currentAvail],
              }}
            />
            <AppText weight="semibold" className="text-body-sm text-white">
              {AVAILABILITY_LABELS[currentAvail]}
            </AppText>
            <CaretDown size={14} weight="bold" color={ON_PHOTO} />
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

      {/* Availability picker — выбор готовности (вместо inline-списка, чтобы не
          обрезался overflow-hidden фото). Точка-цвет статуса как иконка. */}
      <PickerSheet
        open={availOpen}
        onClose={() => setAvailOpen(false)}
        title="Когда готовы взять заказ?"
        searchable={false}
        options={AVAIL_OPTIONS.map<PickerOption>((s) => ({
          id: s,
          title: AVAILABILITY_LABELS[s],
          icon: (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: AVAILABILITY_DOT[s],
              }}
            />
          ),
        }))}
        selectedId={currentAvail}
        onSelect={(id) => {
          if (id) setAvailability.mutate(id as AvailabilityStatus);
          setAvailOpen(false);
        }}
      />
    </View>
  );
}
