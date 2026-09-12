/**
 * Фото задания — до 5 снимков. Первая плитка «Добавить», дальше миниатюры;
 * обложка — первая. Загрузка в Storage — только при публикации (черновик и
 * отмена не оставляют сирот; гость получает userId лишь после входа).
 * Кнопка удаления — системный xmark.circle.fill поверх снимка.
 */

import { Camera, XCircle } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { hapticSelection } from "@/lib/haptics";
import { pickMultipleImages } from "@/lib/image-upload";
import { useThemeColors } from "@/lib/use-theme-color";
import type { ComposerPhoto } from "./composer-store";

export const MAX_TASK_PHOTOS = 5;
/** Белый поверх фотографии — именованная константа, не литерал в JSX. */
const ON_PHOTO = "#ffffff";
const GAP = 8;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PhotoGrid({
  photos,
  onChange,
  disabled = false,
}: {
  photos: ComposerPhoto[];
  onChange: (next: ComposerPhoto[]) => void;
  disabled?: boolean;
}) {
  const tc = useThemeColors(["accent", "mute"]);
  const [rowWidth, setRowWidth] = useState(0);
  const tile = rowWidth > 0 ? Math.floor((rowWidth - GAP * 2) / 3) : 0;
  const canAdd = photos.length < MAX_TASK_PHOTOS && !disabled;

  const add = async () => {
    try {
      const picked = await pickMultipleImages(MAX_TASK_PHOTOS - photos.length);
      if (picked.length === 0) return;
      hapticSelection();
      onChange([
        ...photos,
        ...picked.map((p) => ({ id: makeId(), uri: p.uri, width: p.width, height: p.height })),
      ]);
    } catch {
      Alert.alert("Не удалось открыть фото", "Проверьте доступ к фото в Настройках.");
    }
  };

  return (
    <View className="mb-6 px-4">
      <View className="mb-1.5 ml-4 flex-row items-baseline justify-between">
        <AppText className="text-ios-footnote uppercase text-mute">Фото</AppText>
        <AppText className="mr-1 text-ios-footnote text-mute">
          {photos.length} из {MAX_TASK_PHOTOS}
        </AppText>
      </View>
      <View
        className="flex-row flex-wrap"
        style={{ gap: GAP }}
        onLayout={(e) => setRowWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {canAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Добавить фото"
            onPress={() => void add()}
            // Как у полей конструктора: заливка светлее фона плюс тонкая
            // мягкая рамка. Без неё в тёмной теме «Добавить» висело в пустоте.
            className="items-center justify-center overflow-hidden rounded-2xl border-hairline bg-canvas-soft active:opacity-70"
            style={{ width: tile, height: tile, borderWidth: 1 }}
          >
            <SystemIcon
              sf="camera.fill"
              fallback={Camera}
              size={26}
              weight="regular"
              color={tc.accent}
            />
            <AppText className="mt-1 text-ios-footnote text-accent" numberOfLines={1}>
              Добавить
            </AppText>
          </Pressable>
        ) : null}
        {photos.map((p, i) => (
          <View
            key={p.id}
            className="overflow-hidden rounded-2xl"
            style={{ width: tile, height: tile }}
          >
            <Image
              source={{ uri: p.uri }}
              style={{ width: tile, height: tile }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {i === 0 ? (
              <View className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-2 py-0.5">
                <AppText className="text-ios-footnote" style={{ color: ON_PHOTO }}>
                  Обложка
                </AppText>
              </View>
            ) : null}
            {disabled ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить фото ${i + 1}`}
                hitSlop={8}
                onPress={() => onChange(photos.filter((x) => x.id !== p.id))}
                className="absolute right-0.5 top-0.5 h-8 w-8 items-center justify-center rounded-full bg-black/50 active:opacity-70"
              >
                <SystemIcon
                  sf="xmark.circle.fill"
                  fallback={XCircle}
                  size={22}
                  weight="regular"
                  color={ON_PHOTO}
                />
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
