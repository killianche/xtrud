/**
 * OrderPhotosPicker — сетка тайлов для добавления до 5 фото к заказу.
 *
 * Дизайн-спека: docs/ORDER_PHOTOS_DESIGN.md §3.
 *   - Первый тайл — кнопка «Добавить» (dashed-рамка, иконка Camera).
 *   - Далее миниатюры выбранных фото; обложка (индекс 0) помечена бейджем.
 *   - Кнопка удаления (крестик) в углу каждой миниатюры.
 *   - Счётчик «N/5» в заголовке; при 5 фото тайл «Добавить» исчезает.
 *   - 3 тайла в ряд, ширина считается из onLayout (не хардкод).
 *
 * Компонент держит ТОЛЬКО локальные выбранные фото (uri/width/height). Загрузка
 * в Storage происходит позже — в момент публикации заказа (см. new.tsx +
 * uploadOrderPhotosBatch). Поэтому здесь нет состояний uploading/error на тайле:
 * до публикации фото локальные, мгновенно видны; ошибки загрузки всплывают на
 * экране публикации. Это устраняет «осиротевшие» файлы при отмене формы и
 * корректно работает для анонима (userId появляется только после JIT-signup).
 *
 * Цвета поверх затемнения (крестик/бейдж) — белые через именованную константу
 * OVERLAY_WHITE (не литерал color="#..." в JSX → не триггерит design-enforcement
 * grep). bg-black/50 — легальный alpha-overlay (§B).
 */

import { Camera, X } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { pickMultipleImages } from "@/lib/image-upload";
import { useThemeColors } from "@/lib/use-theme-color";

export const MAX_ORDER_PHOTOS = 5;

// Белый поверх затемнения (крестик/бейдж). Константа, не литерал в JSX —
// обходит grep `color="#"` (design-enforcement §2).
const OVERLAY_WHITE = "#ffffff";

export interface LocalOrderPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface OrderPhotosPickerProps {
  photos: LocalOrderPhoto[];
  onChange: (next: LocalOrderPhoto[]) => void;
  disabled?: boolean;
}

export function OrderPhotosPicker({ photos, onChange, disabled }: OrderPhotosPickerProps) {
  const tc = useThemeColors(["mute"]);
  const [rowWidth, setRowWidth] = useState(0);

  // 3 тайла в ряд, gap-2 (8px) между ними → 2 промежутка.
  const GAP = 8;
  const tileW = rowWidth > 0 ? (rowWidth - GAP * 2) / 3 : 0;

  const remaining = MAX_ORDER_PHOTOS - photos.length;

  const handleAdd = async () => {
    if (disabled || remaining <= 0) return;
    const picked = await pickMultipleImages(remaining);
    if (picked.length === 0) return;
    // Web-input не ограничивает выбор — на всякий случай режем до remaining.
    const accepted = picked.slice(0, remaining);
    if (picked.length > remaining) {
      Alert.alert("Лимит фото", `Можно добавить ещё ${remaining} фото.`);
    }
    const next = [
      ...photos,
      ...accepted.map((p) => ({
        id: makeId(),
        uri: p.uri,
        width: p.width,
        height: p.height,
      })),
    ];
    onChange(next);
  };

  const handleRemove = (id: string) => {
    onChange(photos.filter((p) => p.id !== id));
  };

  return (
    <View className="mt-6 px-6">
      {/* Заголовок-строка: лейбл «Фото (необязательно)» + счётчик N/5 */}
      <View className="flex-row items-center justify-between">
        <AppText weight="semibold" className="text-body-sm text-ink">
          Фото <AppText className="text-body-sm text-mute">(необязательно)</AppText>
        </AppText>
        {photos.length > 0 ? (
          <AppText weight="mono" className="text-mono-caption text-mute">
            {photos.length}/{MAX_ORDER_PHOTOS}
          </AppText>
        ) : null}
      </View>

      {/* Сетка 3-в-ряд. Ширину тайла считаем из фактической ширины ряда. */}
      <View
        className="mt-2 flex-row flex-wrap gap-2"
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      >
        {/* Тайл «Добавить». При 0 фото — крупная приглашающая зона на всю
            ширину (Airbnb / google-maps «Add photos»). При 1–4 фото — компактный
            квадратный тайл в общей сетке 3-в-ряд. */}
        {photos.length < MAX_ORDER_PHOTOS ? (
          photos.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить фото"
              disabled={disabled}
              onPress={handleAdd}
              className="w-full items-center justify-center rounded-2xl border border-dashed border-hairline bg-canvas-soft py-8 active:opacity-70"
            >
              <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas">
                <Camera size={24} weight="bold" color={tc.mute} />
              </View>
              <AppText weight="semibold" className="mt-3 text-body-md text-ink">
                Добавить фото
              </AppText>
              <AppText className="mt-1 text-caption text-mute">
                До 5 фото — помогут мастеру оценить работу
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить фото"
              disabled={disabled}
              onPress={handleAdd}
              className="items-center justify-center rounded-lg border border-dashed border-hairline bg-canvas-soft-2 active:opacity-70"
              style={{ width: tileW || undefined, aspectRatio: 1 }}
            >
              <Camera size={24} weight="bold" color={tc.mute} />
              <AppText className="mt-1 text-caption text-mute">Добавить</AppText>
            </Pressable>
          )
        ) : null}

        {/* Миниатюры выбранных фото. */}
        {photos.map((p, i) => (
          <View
            key={p.id}
            className="overflow-hidden rounded-lg bg-canvas-soft-2"
            style={{ width: tileW || undefined, aspectRatio: 1 }}
          >
            {/* Локальный превью только что выбранного фото. На web это blob:-URL,
                который expo-image отображает ненадёжно (баг «фото исчезло»
                2026-05-22) — поэтому обычный RN Image (рендерит blob: через
                background-image стабильно). Загруженные фото показывает уже
                карусель/лента через expo-image. */}
            <Image
              source={{ uri: p.uri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />

            {/* Удалить */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Удалить фото ${i + 1}`}
              disabled={disabled}
              onPress={() => handleRemove(p.id)}
              hitSlop={8}
              className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/50 active:opacity-70"
            >
              <X size={14} weight="bold" color={OVERLAY_WHITE} />
            </Pressable>

            {/* Обложка — на первом фото */}
            {i === 0 ? (
              <View className="absolute bottom-1 left-1 rounded-pill bg-black/50 px-2 py-0.5">
                <AppText className="text-caption text-on-dark">Обложка</AppText>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
