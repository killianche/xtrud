/**
 * Фото задания — до 5 снимков. Первые плитки — «Снять фото» и «Из галереи»
 * (владелец, 2026-10-07, №268: «сразу две кнопки, чтобы можно было кликнуть»;
 * раньше «Добавить» открывало только галерею), дальше миниатюры;
 * обложка — первая. Загрузка в Storage — только при публикации (черновик и
 * отмена не оставляют сирот; гость получает userId лишь после входа).
 * Кнопка удаления — системный xmark.circle.fill поверх снимка.
 */

import { Camera, Images, XCircle } from "phosphor-react-native";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { showAlert } from "@/lib/alert";
import { lightColors } from "@/lib/colors";
import { hapticSelection } from "@/lib/haptics";
import { type PickedImage, pickMultipleImages, takePhoto } from "@/lib/image-upload";
import { useThemeColors } from "@/lib/use-theme-color";
import type { ComposerPhoto } from "./composer-store";

export const MAX_TASK_PHOTOS = 5;
/** Белый поверх фотографии — именованная константа, не литерал в JSX. */
// Белый поверх фото — токен on-dark, одинаковый в обеих темах.
const ON_PHOTO = lightColors["on-dark"];
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

  const append = (picked: PickedImage[]) => {
    if (picked.length === 0) return;
    hapticSelection();
    onChange([
      ...photos,
      ...picked
        .slice(0, MAX_TASK_PHOTOS - photos.length)
        .map((p) => ({ id: makeId(), uri: p.uri, width: p.width, height: p.height })),
    ]);
  };
  const fromLibrary = async () => {
    try {
      append(await pickMultipleImages(MAX_TASK_PHOTOS - photos.length));
    } catch {
      showAlert("Не удалось открыть фото", "Проверьте доступ к фото в Настройках.");
    }
  };
  const fromCamera = async () => {
    try {
      const shot = await takePhoto();
      if (shot) append([shot]);
    } catch {
      showAlert("Не удалось открыть камеру", "Проверьте доступ к камере в Настройках.");
    }
  };
  // Две плитки добавления — одного вида, отличаются иконкой и подписью.
  const addTile = (kind: "camera" | "library") => (
    <Pressable
      key={kind}
      accessibilityRole="button"
      accessibilityLabel={kind === "camera" ? "Снять фото камерой" : "Добавить фото из галереи"}
      onPress={() => void (kind === "camera" ? fromCamera() : fromLibrary())}
      // Как у полей конструктора: заливка светлее фона плюс тонкая
      // мягкая рамка. Без неё в тёмной теме плитка висела в пустоте.
      className="items-center justify-center overflow-hidden rounded-2xl border-hairline bg-canvas-soft px-1 active:opacity-70"
      style={{ width: tile, height: tile, borderWidth: 1 }}
    >
      {kind === "camera" ? (
        <SystemIcon
          sf="camera.fill"
          fallback={Camera}
          size={26}
          weight="regular"
          color={tc.accent}
        />
      ) : (
        <SystemIcon
          sf="photo.on.rectangle"
          fallback={Images}
          size={26}
          weight="regular"
          color={tc.accent}
        />
      )}
      <AppText className="mt-1 text-center text-ios-footnote text-accent" numberOfLines={2}>
        {kind === "camera" ? "Снять фото" : "Из галереи"}
      </AppText>
    </Pressable>
  );

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
        {canAdd ? [addTile("camera"), addTile("library")] : null}
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
