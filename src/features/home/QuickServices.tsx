/**
 * Быстрый task-first вход: четыре понятных примера открывают единый сценарий
 * `/orders/new`, а не каталог исполнителей. Конкретная категория подтверждается
 * уже в intent-step; плитки только подставляют понятный черновик запроса.
 */

import { Drop, Lightning, Plus, Sparkle } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

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
  /** Начальный текст, который подставляется в создание задания. */
  draft: string;
}

const SERVICES: QuickService[] = [
  {
    id: "cleaning",
    label: "Убрать после ремонта",
    Icon: Sparkle,
    tintBg: "bg-link-bg-soft",
    iconToken: "link",
    draft: "Уборка после ремонта",
  },
  {
    id: "plumbing",
    label: "Нужен сантехник",
    Icon: Drop,
    tintBg: "bg-cyan-soft",
    iconToken: "cyan-deep",
    draft: "Нужен сантехник",
  },
  {
    id: "electrical",
    label: "Нужен электрик",
    Icon: Lightning,
    tintBg: "bg-warning-soft",
    iconToken: "warning-deep",
    draft: "Нужен электрик",
  },
  {
    id: "all",
    label: "Другая задача",
    Icon: Plus,
    tintBg: "bg-accent-soft",
    iconToken: "accent",
    draft: "",
  },
];

interface QuickServicesProps {
  onCreateTask: (draft?: string) => void;
}

export function QuickServices({ onCreateTask }: QuickServicesProps) {
  // Цвета глифов всех 4 плиток разом — резолв через токены (обе темы).
  const iconColors = useThemeColors(ICON_TOKENS);

  return (
    <View className="mt-6">
      <AppText weight="bold" className="mb-3 px-5 text-title-lg text-ink">
        Примеры заданий
      </AppText>

      <View className="flex-row justify-between px-5">
        {SERVICES.map((s) => {
          const Icon = s.Icon;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={() => onCreateTask(s.draft || undefined)}
              className="items-center active:opacity-70"
              style={{ width: 72 }}
            >
              {/* Tinted-плитка одного семейства: мягкий брендовый фон + чистый
                  Phosphor-глиф в тон. Цвет несёт плитка, глиф строгий. */}
              <View className={`h-16 w-16 items-center justify-center rounded-2xl ${s.tintBg}`}>
                <Icon size={28} weight="duotone" color={iconColors[s.iconToken]} />
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
