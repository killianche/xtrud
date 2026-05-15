/**
 * Маппинг имён иконок из БД (`categories_l2.icon`) → Lucide React Native компоненты.
 *
 * Используется везде где рендерим plitku категории:
 *   - Главная: AllCategories (app/(tabs)/index.tsx)
 *   - Wizard: OrderFormBody step 2 (src/features/orders/OrderFormBody.tsx)
 *   - Master detail: список категорий мастера
 *
 * Дефолт (если icon не найден в маппе) — Wrench (универсальный «мастер»).
 */

import {
  Antenna,
  Armchair,
  Blinds,
  Brush,
  Building2,
  Camera,
  CloudFog,
  Construction,
  DoorOpen,
  Drill,
  Droplet,
  Droplets,
  Fence,
  Flame,
  Grid3x3,
  Hammer,
  HardHat,
  Home,
  Layers,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Paintbrush,
  Pencil,
  PencilRuler,
  Pickaxe,
  RectangleHorizontal,
  Refrigerator,
  Rows3,
  Snowflake,
  Sparkles,
  Square,
  Thermometer,
  Trees,
  Truck,
  Waves,
  Wrench,
  Zap,
} from "lucide-react-native";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Antenna,
  Armchair,
  Blinds,
  Brush,
  Building2,
  Camera,
  CloudFog,
  Construction,
  DoorOpen,
  Drill,
  Droplet,
  Droplets,
  Fence,
  Flame,
  Grid3x3,
  Hammer,
  HardHat,
  Home,
  Layers,
  LayoutGrid,
  Lock,
  Paintbrush,
  Pencil,
  PencilRuler,
  Pickaxe,
  RectangleHorizontal,
  Refrigerator,
  Rows3,
  Snowflake,
  Sparkles,
  Square,
  Thermometer,
  Trees,
  Truck,
  Waves,
  Wrench,
  Zap,
};

export const DEFAULT_CATEGORY_ICON: LucideIcon = Wrench;

/**
 * Безопасный лукап с фоллбеком.
 *
 * Return type — `IconComponent` (generic), не `LucideIcon`: вызывающие места
 * передают Phosphor-prop'ы (`weight="bold"`) которые Lucide игнорирует runtime,
 * но без generic-типа tsc ругается. См. `docs/UI_ICONS.md`.
 */
export function getCategoryIcon(
  iconName: string | null | undefined,
): import("@/types/icon").IconComponent {
  if (!iconName) return DEFAULT_CATEGORY_ICON as unknown as import("@/types/icon").IconComponent;
  return (CATEGORY_ICONS[iconName] ?? DEFAULT_CATEGORY_ICON) as unknown as import(
    "@/types/icon"
  ).IconComponent;
}
