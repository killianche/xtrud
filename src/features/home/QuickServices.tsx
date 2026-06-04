/**
 * QuickServices — горизонтальный ряд из 4 «быстрых категорий» на главной
 * клиента, сразу под hero-блоком (перед рекламными баннерами).
 *
 * ── Редизайн 2026-06-04 (единая система tinted-плиток) ────────────────────
 * Проблема прошлой версии: визуальный разнобой. Уборка падала в моно-fallback
 * `Users` (нет L2-маппинга `cleaning` в ICON_MAP — баг), Сантехника/Отопление
 * рисовались глянцевыми мультяшными twemoji (капля/термометр), а «Все мастера»
 * — снова моно `Users`. Итог: две плоские серые line-иконки рядом с двумя
 * «детскими» цветными — несобранно, не премиально.
 *
 * Решение (Linear/Stripe-паттерн «soft tinted tile + clean glyph», подтверждён
 * DoorDash Browse — там вся сетка иконок выдержана в ОДНОМ семействе):
 *   - Каждая плитка = мягкий tinted-квадрат (rounded-2xl) одного из брендовых
 *     оттенков + один Phosphor-глиф (duotone) в тон. Цвет несёт плитка, глиф
 *     остаётся чистым и строгим — никакого глянца.
 *   - 4 плитки = одно семейство (Phosphor — наш моно-стандарт), но цветные.
 *   - Палитра сдержанная (Vercel-правило «без радуги»): акцент бренда + 2 тона.
 *   - «Все мастера» выделена фирменным accent-tint (розово-красный #fe5574) как
 *     primary-action ряда и иконкой UsersThree (а не Users — не дублирует чужой
 *     глиф). Категории — sky/cyan/amber soft.
 *
 * Почему НЕ цветные twemoji/fluent для категорий: единого цветного семейства
 * под cleaning/plumbing/climate в Iconify нет (в fluent-color отсутствуют
 * broom/water/thermometer; twemoji глянцево-мультяшен — ровно та претензия,
 * что и была). Tinted-Phosphor гарантирует 100% консистентность и обе темы
 * через токены без единого inline-hex.
 *
 * 4 категории (фикс.):
 *   1. Уборка квартиры → /category/cleaning   (Sparkle, sky-tint)
 *   2. Сантехника      → /category/plumbing   (Drop, cyan-tint)
 *   3. Отопление       → /category/climate    (Thermometer, amber-tint)
 *   4. Все мастера     → скролл к AllCategories (UsersThree, brand accent-tint)
 */

import { useRouter } from "expo-router";
import { Drop, Sparkle, Thermometer, UsersThree } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { IconComponent } from "@/types/icon";
import { useThemeColors } from "@/lib/use-theme-color";

// 4 токена цвета глифов, которые резолвим разом. Сужаем тип iconToken до них,
// чтобы индексация iconColors[...] была типобезопасной.
const ICON_TOKENS = ["link", "cyan-deep", "warning-deep", "accent"] as const;
type GlyphToken = (typeof ICON_TOKENS)[number];

interface QuickService {
  id: string;
  label: string;
  Icon: IconComponent;
  /** NativeWind-класс tinted-фона плитки (мягкий брендовый оттенок). */
  tintBg: string;
  /** Токен цвета глифа — контрастная пара к tintBg в обеих темах. */
  iconToken: GlyphToken;
  /** Куда ведёт тап. null — action-кнопка «Все мастера» (скролл). */
  href: string | null;
}

const SERVICES: QuickService[] = [
  {
    id: "cleaning",
    label: "Уборка квартиры",
    Icon: Sparkle,
    tintBg: "bg-link-bg-soft",
    iconToken: "link",
    href: "/category/cleaning",
  },
  {
    id: "plumbing",
    label: "Сантехника",
    Icon: Drop,
    tintBg: "bg-cyan-soft",
    iconToken: "cyan-deep",
    href: "/category/plumbing",
  },
  {
    id: "climate",
    label: "Отопление",
    Icon: Thermometer,
    tintBg: "bg-warning-soft",
    iconToken: "warning-deep",
    href: "/category/climate",
  },
  {
    id: "all",
    label: "Все мастера",
    Icon: UsersThree,
    tintBg: "bg-accent-soft",
    iconToken: "accent",
    href: null,
  },
];

interface QuickServicesProps {
  /** Колбэк 4-й плитки «Все мастера» — плавный скролл к блоку AllCategories. */
  onShowAll: () => void;
}

export function QuickServices({ onShowAll }: QuickServicesProps) {
  const router = useRouter();
  // Цвета глифов всех 4 плиток разом — резолв через токены (обе темы).
  const iconColors = useThemeColors(ICON_TOKENS);

  return (
    <View className="mt-6">
      <AppText weight="bold" className="mb-3 px-5 text-title-lg text-ink">
        Популярные категории
      </AppText>

      <View className="flex-row justify-between px-5">
        {SERVICES.map((s) => {
          const Icon = s.Icon;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={() => {
                if (s.href === null) onShowAll();
                else router.push(s.href as never);
              }}
              className="items-center active:opacity-70"
              style={{ width: 72 }}
            >
              {/* Tinted-плитка одного семейства: мягкий брендовый фон + чистый
                  Phosphor-глиф в тон. Цвет несёт плитка, глиф строгий. */}
              <View
                className={`h-16 w-16 items-center justify-center rounded-2xl ${s.tintBg}`}
              >
                <Icon
                  size={28}
                  weight="duotone"
                  color={iconColors[s.iconToken]}
                />
              </View>
              <AppText
                weight="medium"
                className="mt-2 text-center text-caption text-ink"
                numberOfLines={2}
              >
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
