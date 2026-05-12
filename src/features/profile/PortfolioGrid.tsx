/**
 * 3-col grid портфолио мастера. Тап по фото → delete confirm (через onDelete).
 *
 * Используется и на странице редактирования (с delete-кнопкой), и в публичном
 * master-view (без delete — для просмотра). Контролируется через onDelete:
 * undefined = read-only.
 */

import { Image } from "expo-image";
import { Trash2 } from "lucide-react-native";
import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { PortfolioItem } from "@/features/profile/use-my-portfolio";

interface PortfolioGridProps {
  items: PortfolioItem[];
  isLoading?: boolean;
  /** Если задано — на каждое фото вешается delete-overlay. */
  onDelete?: (id: string, storagePath: string) => void;
  /** Тап по фото для full-screen просмотра (sprint 8.3). */
  onOpen?: (item: PortfolioItem) => void;
}

const GUTTER = 8;
const HORIZONTAL_PADDING = 0;

export function PortfolioGrid({ items, isLoading, onDelete, onOpen }: PortfolioGridProps) {
  const { width } = useWindowDimensions();
  // Контейнер занимает доступную ширину минус 2x px-6 (24px=padding) из родителя.
  const containerWidth = width - 48;
  const itemSize = Math.floor((containerWidth - GUTTER * 2 - HORIZONTAL_PADDING) / 3);

  if (isLoading) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className="items-center rounded-md bg-surface-2 px-4 py-10">
        <AppText className="text-center text-body-sm text-muted">Пока нет фото работ.</AppText>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap" style={{ gap: GUTTER }}>
      {items.map((item) => {
        const interactive = !!onDelete || !!onOpen;
        const content = (
          <View
            style={{ width: itemSize, height: itemSize, borderRadius: 8 }}
            className="overflow-hidden bg-surface-2"
          >
            <Image
              source={{ uri: item.url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
            {onDelete && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Удалить фото"
                onPress={() => onDelete(item.id, item.storage_path)}
                hitSlop={6}
                className="absolute top-1.5 right-1.5 h-7 w-7 items-center justify-center rounded-full bg-canvas/90 active:opacity-70"
              >
                <Trash2 size={14} strokeWidth={2} color="#ef4444" />
              </Pressable>
            )}
          </View>
        );

        if (interactive && onOpen) {
          return (
            <Pressable key={item.id} onPress={() => onOpen(item)} className="active:opacity-80">
              {content}
            </Pressable>
          );
        }
        return <View key={item.id}>{content}</View>;
      })}
    </View>
  );
}
