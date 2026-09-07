/**
 * /profile/specialist/photos — фото работ. Сетка 3 в ряд, «Добавить» первой
 * плиткой, удаление — системный xmark.circle.fill. Загрузка сразу в
 * портфолио (bucket portfolio), как «Work Photos» у TaskRabbit.
 */

import { useRouter } from "expo-router";
import { Camera, XCircle } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useAddPortfolioItem,
  useDeletePortfolioItem,
  useMasterPortfolio,
} from "@/features/profile/use-my-portfolio";
import { useInvalidateSpecialistCounts } from "@/features/specialist/use-specialist";
import { hapticSelection } from "@/lib/haptics";
import { pickMultipleImages, uploadPortfolioBatch } from "@/lib/image-upload";
import { useThemeColors } from "@/lib/use-theme-color";

const MAX_PHOTOS = 30;
const ON_PHOTO = "#ffffff";
const GAP = 8;

export default function SpecialistPhotosScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["accent", "mute"]);
  const portfolio = useMasterPortfolio(userId ?? null);
  const addItem = useAddPortfolioItem(userId ?? null);
  const deleteItem = useDeletePortfolioItem(userId ?? null);
  const invalidate = useInvalidateSpecialistCounts();
  const [rowWidth, setRowWidth] = useState(0);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const tile = rowWidth > 0 ? Math.floor((rowWidth - GAP * 2) / 3) : 0;
  const items = portfolio.data ?? [];
  const canAdd = !!userId && items.length < MAX_PHOTOS && !uploading;

  const add = async () => {
    if (!userId) return;
    try {
      const picked = await pickMultipleImages(Math.min(10, MAX_PHOTOS - items.length));
      if (picked.length === 0) return;
      hapticSelection();
      setUploading({ done: 0, total: picked.length });
      const results = await uploadPortfolioBatch(userId, picked, {
        onProgress: (done, total) => setUploading({ done, total }),
      });
      for (const r of results) {
        if (r.ok) await addItem.mutateAsync({ url: r.publicUrl, storagePath: r.path });
      }
      if (results.some((r) => !r.ok)) {
        Alert.alert("Часть фото не загрузилась", "Проверьте связь и попробуйте ещё раз.");
      }
      invalidate(userId);
    } catch {
      Alert.alert("Не удалось открыть фото", "Проверьте доступ к фото в Настройках.");
    } finally {
      setUploading(null);
    }
  };

  const remove = (id: string, storagePath: string) => {
    Alert.alert("Удалить фото?", undefined, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () =>
          deleteItem.mutate({ id, storagePath }, { onSuccess: () => userId && invalidate(userId) }),
      },
    ]);
  };

  return (
    <FormScreen
      title="Фото работ"
      subtitle="Клиенты смотрят фото до звонка. Лучше 5–10 настоящих работ."
      onBack={() => router.back()}
    >
      <View className="px-4">
        <View className="mb-1.5 ml-4 flex-row items-baseline justify-between">
          <AppText className="text-ios-footnote uppercase text-mute">Фото</AppText>
          <AppText className="mr-1 text-ios-footnote text-mute">
            {uploading
              ? `Загружаем ${uploading.done} из ${uploading.total}…`
              : `${items.length} из ${MAX_PHOTOS}`}
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
              className="items-center justify-center overflow-hidden rounded-2xl bg-canvas active:opacity-70"
              style={{ width: tile, height: tile }}
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
          {items.map((p, i) => (
            <View
              key={p.id}
              className="overflow-hidden rounded-2xl"
              style={{ width: tile, height: tile }}
            >
              <Image
                source={{ uri: p.url }}
                style={{ width: tile, height: tile }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить фото ${i + 1}`}
                hitSlop={8}
                onPress={() => remove(p.id, p.storage_path)}
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
            </View>
          ))}
        </View>
      </View>
    </FormScreen>
  );
}
