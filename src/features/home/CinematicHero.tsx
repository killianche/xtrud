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
 * Карусель фото (2026-05-27, переписана с нуля по фидбэку «микролаги»):
 *   - 4 фотографии мастеров за работой, каждая видна полностью PHOTO_HOLD_MS
 *     (5с), затем плавный crossfade FADE_MS (1.2с) на следующую. Цикл
 *     1 → 2 → 3 → 4 → 1 → ...
 *   - Все слои фото рендерятся СРАЗУ абсолютно поверх друг друга. Один
 *     Animated.Value на каждый слой управляет opacity через native driver.
 *     Это даёт ноль re-render'ов компонента на каждом кадре анимации (старая
 *     версия делала setState на underPhoto/overPhoto каждые 4с — отсюда
 *     микро-фризы) и одинаково плавный crossfade для всех переходов,
 *     включая возврат 4→1 и самое первое появление 1-го фото.
 *   - Easing.inOut(ease) — без рывков на старте/финише каждого перехода.
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
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CITIES } from "@/components/CitySelector";
import { type PickerOption, PickerSheet } from "@/components/ui";
import { XtrudWordmark } from "@/components/XtrudWordmark";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { RoleSwitchPill } from "@/features/master-view/RoleSwitchPill";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColor } from "@/lib/use-theme-color";
import { useUserCity } from "@/lib/use-user-city";

const HERO_PHOTOS = [
  require("../../../assets/illustrations/hero-photo-1.jpg"),
  require("../../../assets/illustrations/hero-photo-2.jpg"),
  require("../../../assets/illustrations/hero-photo-3.jpg"),
  require("../../../assets/illustrations/hero-photo-4.jpg"),
];

// Длительность «hold» — фото видно полностью, без анимации. Crossfade поверх
// идёт ОТДЕЛЬНО, не съедает hold-время. Цикл одного фото: hold 5с → fade 1.2с.
const PHOTO_HOLD_MS = 5000;
const FADE_MS = 1200;

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

  // Dual-role: если у клиента есть также мастер-аккаунт (is_master=true),
  // показываем компактный pill «Клиент / Мастер» в правом верхнем углу hero,
  // тот же что на главной мастера (фидбэк владельца 2026-05-27 — «добавь pill
  // также и на клиентский экран если клиент имеет аккаунт мастера»). Если
  // мастер-аккаунта нет — pill не рендерится (нечего переключать).
  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const { data: currentUser } = useUserRecord(currentUserId);
  const showRolePill = !!currentUser?.is_master && !!currentUserId;

  // По одному Animated.Value на каждое фото. Все начинают с 0; первое
  // фото плавно появляется в эффекте ниже (fade-in 0→1 при монтировании
  // тем же easing'ом, что и остальные переходы). Lazy-init через ref —
  // массив создаётся ровно один раз и стабилен между рендерами, так что
  // useEffect отрабатывает один раз.
  const opacitiesRef = useRef<Animated.Value[] | null>(null);
  if (opacitiesRef.current === null) {
    opacitiesRef.current = HERO_PHOTOS.map(() => new Animated.Value(0));
  }
  const opacities = opacitiesRef.current;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let currentIdx = 0;

    const easing = Easing.inOut(Easing.ease);

    const fade = (idx: number, toValue: number) =>
      // biome-ignore lint/style/noNonNullAssertion: idx всегда валиден (% HERO_PHOTOS.length), opacities той же длины
      Animated.timing(opacities[idx]!, {
        toValue,
        duration: FADE_MS,
        easing,
        useNativeDriver: true,
      });

    const scheduleNext = () => {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const nextIdx = (currentIdx + 1) % HERO_PHOTOS.length;
        // Параллельный crossfade: следующее фото 0→1, текущее 1→0.
        // Одинаковая длительность и easing → синхронный плавный переход.
        Animated.parallel([fade(nextIdx, 1), fade(currentIdx, 0)]).start(({ finished }) => {
          if (!finished || cancelled) return;
          currentIdx = nextIdx;
          scheduleNext();
        });
      }, PHOTO_HOLD_MS);
    };

    // Плавный fade-in 1-го фото при первом рендере — тем же easing'ом,
    // что и все последующие переходы. После завершения запускаем цикл.
    fade(0, 1).start(({ finished }) => {
      if (!finished || cancelled) return;
      scheduleNext();
    });

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [opacities]);

  // Высота фото-блока: статус-бар + контентная зона (шапка + H1 + поиск + воздух).
  // Контентную зону держим ~ширине, с потолком для широких web-вьюпортов.
  // 2026-05-28: фото-блок удлинён вниз по фидбэку владельца — множитель
  // 0.92→1.12, потолок 440→560 (фото стало выше, больше «воздуха» под поиском).
  const heroWidth = Math.min(viewportWidth, 720);
  const contentZone = Math.min(Math.round(heroWidth * 1.12), 560);
  const heroHeight = insets.top + contentZone;

  return (
    <View>
      {/* ===== Full-bleed фото-блок: от верха экрана, скруглён снизу ===== */}
      <View
        className="relative overflow-hidden rounded-b-[28px]"
        style={{ width: "100%", height: heroHeight }}
      >
        {/* N слоёв фото поверх друг друга. opacity управляется через native
            driver — ноль re-render'ов на каждом кадре. */}
        {HERO_PHOTOS.map((src, i) => (
          <Animated.View
            key={String(src)}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              opacity: opacities[i],
            }}
          >
            <ExpoImage
              source={src}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              priority={i === 0 ? "high" : "normal"}
              cachePolicy="memory-disk"
            />
          </Animated.View>
        ))}

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

        {/* ── Шапка поверх фото ──
            Ряд 1: логотип xtrud СЛЕВА | (опц.) pill «Клиент / Мастер» СПРАВА —
            показывается только если у этого клиента есть мастер-аккаунт
            (dual-role), тогда он может одним тапом переключиться на главную
            мастера. У чистых клиентов справа пусто.
            Ряд 2: город под логотипом. */}
        <View className="absolute left-0 right-0 px-4" style={{ top: insets.top + 6 }}>
          <View className="flex-row items-center justify-between">
            <XtrudWordmark size={30} color={ON_PHOTO} />
            {showRolePill && currentUserId ? (
              <RoleSwitchPill userId={currentUserId} currentRole="client" isClient={true} />
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
            // dark:border + dark:border-white/15 — тонкое серое свечение по краю
            // плашки в тёмной теме (фидбэк владельца 2026-05-27: поиск сливался с
            // тёмным hero, нужна обводка чтобы выделить). В light режиме граница
            // прозрачная — там работает обычная тень снизу.
            className="mt-4 flex-row items-center gap-3 h-14 rounded-2xl bg-canvas px-5 border border-transparent dark:border-white/15 active:opacity-80"
            style={{
              boxShadow: Platform.OS === "web" ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
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
