// Компонент плитки категории для bento-сетки.
//
// В sprint 2.3 — упрощённая версия без атмосферных фото (фото-инфра R2 — sprint 3+).
// Сейчас: surface-2 фон, lucide-иконка сверху, название категории снизу.
// Сигнатурный radius-xl (20dp) из DESIGN_SYSTEM §9.1.
//
// Когда подключим фото — заменим background на <Image source={coverImageUrl} /> с overlay.

import {
  Antenna,
  Armchair,
  BookOpen,
  Brain,
  Briefcase,
  Bug,
  Building2,
  Cake,
  Calculator,
  Camera,
  Code,
  Disc,
  DoorOpen,
  Droplet,
  Droplets,
  Dumbbell,
  Eye,
  Flame,
  GraduationCap,
  Hammer,
  Hand,
  HardHat,
  Heart,
  Home,
  Languages,
  Laptop,
  LifeBuoy,
  type LucideIcon,
  Megaphone,
  Mic,
  Monitor,
  MoreHorizontal,
  Package,
  PackageOpen,
  Paintbrush,
  PartyPopper,
  PawPrint,
  Refrigerator,
  Scale,
  Scissors,
  Shield,
  Sparkles,
  Square,
  Stethoscope,
  Trash2,
  Trees,
  Truck,
  Users,
  Wind,
  Wrench,
  Zap,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";

// Маппинг icon-имя → компонент lucide. Если имя не известно — fallback на Square.
// Покрывает все 66 L2 категорий sprint 1.5 + L1 для будущей расширяемости.
const iconMap: Record<string, LucideIcon> = {
  Antenna,
  Armchair,
  BookOpen,
  Briefcase,
  Brain,
  Bug,
  Building2,
  Cake,
  Calculator,
  Camera,
  Code,
  Disc,
  DoorOpen,
  Droplet,
  Droplets,
  Dumbbell,
  Eye,
  Flame,
  GraduationCap,
  Hammer,
  Hand,
  HardHat,
  Heart,
  Home,
  Languages,
  Laptop,
  LifeBuoy,
  Megaphone,
  Mic,
  Monitor,
  MoreHorizontal,
  Package,
  PackageOpen,
  Paintbrush,
  PartyPopper,
  PawPrint,
  Refrigerator,
  Scale,
  Scissors,
  Shield,
  Sparkles,
  Square,
  Stethoscope,
  Trash2,
  Trees,
  Truck,
  Users,
  Wind,
  Wrench,
  Zap,
};

function getIcon(name: string): LucideIcon {
  return iconMap[name] ?? Square;
}

export interface CategoryTileProps {
  /** Имя из БД (categories_l2.name_ru) */
  name: string;
  /** Имя lucide-иконки (categories_l2.icon) */
  iconName: string;
  /** Tap handler — обычно navigate к /(tabs)/category/[id] */
  onPress?: () => void;
}

export function CategoryTile({ name, iconName, onPress }: CategoryTileProps) {
  const Icon = getIcon(iconName);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Категория ${name}`}
      onPress={onPress}
      className="aspect-square overflow-hidden rounded-xl bg-surface-2 p-4 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-md bg-canvas">
        <Icon size={20} strokeWidth={1.75} color="#0a0a0a" />
      </View>

      <View className="flex-1 justify-end">
        <AppText weight="semibold" className="text-title-sm text-ink" numberOfLines={2}>
          {name}
        </AppText>
      </View>
    </Pressable>
  );
}
