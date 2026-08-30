// Компонент плитки категории для bento-сетки.
//
// Sprint 8.7 — два режима:
//  - coverUrl задан → expo-image cover + LinearGradient overlay + лейбл внизу
//    (DESIGN_SYSTEM §9.1 сигнатурный паттерн).
//  - coverUrl NULL → fallback: surface-2 фон, lucide-иконка, label.
//
// Использование (хук useVisibleCategories отдаёт cover_image_url):
//   <CategoryTile name={cat.name_ru} iconName={cat.icon} coverUrl={cat.cover_image_url} ... />

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import { useThemeColor } from "@/lib/use-theme-color";

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
  /** Public URL обложки. NULL → icon-fallback. */
  coverUrl?: string | null;
  /** Tap handler — обычно navigate к /(tabs)/category/[id] */
  onPress?: () => void;
}

export function CategoryTile({ name, iconName, coverUrl, onPress }: CategoryTileProps) {
  const inkColor = useThemeColor("ink");
  if (coverUrl) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Категория ${name}`}
        onPress={onPress}
        className="aspect-square overflow-hidden rounded-xl bg-surface-dark active:opacity-90 hover:opacity-90"
      >
        <Image
          source={{ uri: coverUrl }}
          style={{ position: "absolute", inset: 0 }}
          contentFit="cover"
          transition={180}
        />
        {/* Bottom-up gradient для читаемости лейбла */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
          locations={[0.45, 1]}
          style={{ position: "absolute", inset: 0 }}
        />
        <View className="flex-1 justify-end p-3">
          <AppText weight="semibold" className="text-title-sm text-on-dark" numberOfLines={2}>
            {name}
          </AppText>
        </View>
      </Pressable>
    );
  }

  // Fallback: icon-режим (Sprint 2.3 baseline)
  const Icon = getIcon(iconName);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Категория ${name}`}
      onPress={onPress}
      className="aspect-square overflow-hidden rounded-xl bg-surface-2 p-4 active:opacity-80 hover:bg-surface-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-md bg-canvas">
        <Icon size={20} strokeWidth={1.75} color={inkColor} />
      </View>
      <View className="flex-1 justify-end">
        <AppText weight="semibold" className="text-title-sm text-ink" numberOfLines={2}>
          {name}
        </AppText>
      </View>
    </Pressable>
  );
}
