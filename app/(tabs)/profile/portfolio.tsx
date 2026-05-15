/**
 * /profile/portfolio — отдельный экран управления портфолио мастера.
 *
 * Почему отдельный route (не sheet/inline в profile/index):
 *   - Полноэкранный grid даёт больше места для 50 фото (раньше было 12 в
 *     стиснутом inline-блоке внизу профиля — неудобно).
 *   - Multi-select из галереи + batch upload с прогрессом требует своего
 *     состояния, которое не должно блокировать остальной профиль.
 *   - Можно дать deeplink (notification «вы добавили фото» → сразу сюда).
 *
 * Фидбэк user 2026-05-15: «отдельная кнопочка, до 50 фото, со сжатием,
 * обрезкой кривых, удобно работать».
 *
 * Pipeline:
 *   1. Tap «Добавить фото» → multi-pick (до min(50 - текущее, 50) за раз)
 *   2. Каждый файл → resize 1920 + JPEG 0.82 + aspect-guard crop к 4:5 при
 *      экстремальных пропорциях (см. src/lib/image-upload.ts)
 *   3. Batch upload по 3 параллельно с прогресс-баром
 *   4. После каждого успешного — INSERT в portfolio_items, refetch
 */

import { useRouter } from "expo-router";
import { CaretLeft, ImageSquare, Trash } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  PORTFOLIO_MAX,
  useAddPortfolioItem,
  useDeletePortfolioItem,
  useMasterPortfolio,
} from "@/features/profile/use-my-portfolio";
import {
  pickMultiplePortfolioImages,
  uploadPortfolioBatch,
} from "@/lib/image-upload";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const tc = useThemeColors(["ink", "mute", "muted-soft", "canvas-soft"]);

  const portfolio = useMasterPortfolio(userId);
  const addItem = useAddPortfolioItem(userId);
  const deleteItem = useDeletePortfolioItem(userId);

  const items = portfolio.data ?? [];
  const slotsLeft = Math.max(0, PORTFOLIO_MAX - items.length);

  // Прогресс batch-загрузки. null = не идёт, иначе {done, total}.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [batchError, setBatchError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!userId) return;
    if (slotsLeft === 0) {
      Alert.alert(
        "Лимит достигнут",
        `Максимум ${PORTFOLIO_MAX} фото в портфолио. Удалите ненужные, чтобы добавить новые.`,
      );
      return;
    }
    setBatchError(null);
    const picked = await pickMultiplePortfolioImages(slotsLeft);
    if (picked.length === 0) return;

    setProgress({ done: 0, total: picked.length });
    const results = await uploadPortfolioBatch(userId, picked, {
      concurrency: 3,
      onProgress: (done, total) => setProgress({ done, total }),
    });

    // Записываем metadata в БД для каждой успешной загрузки.
    // Делаем последовательно — лимит-trigger на портфолио должен видеть
    // постепенный рост счётчика.
    let savedCount = 0;
    const failed: string[] = [];
    for (const r of results) {
      if (!r.ok) {
        failed.push(r.error);
        continue;
      }
      try {
        await addItem.mutateAsync({
          url: r.publicUrl,
          storagePath: r.path,
        });
        savedCount++;
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }

    setProgress(null);
    if (failed.length > 0) {
      setBatchError(
        `Загружено ${savedCount} из ${picked.length}. Ошибки: ${failed.length}.`,
      );
    }
  };

  const handleDelete = (id: string, storagePath: string) => {
    Alert.alert("Удалить фото?", "Действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          deleteItem.mutate({ id, storagePath });
        },
      },
    ]);
  };

  if (!userId) {
    return (
      <View
        className="flex-1 bg-canvas items-center justify-center px-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <AppText className="text-body-md text-mute">Войдите в аккаунт.</AppText>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-3 py-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={22} weight="bold" color={tc.ink} />
        </Pressable>
        <AppText weight="semibold" className="text-body-md text-ink">
          Портфолио
        </AppText>
        <View className="w-10">
          <AppText weight="mono" className="text-caption text-mute text-right">
            {items.length}/{PORTFOLIO_MAX}
          </AppText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Description */}
        <View className="mt-2 mb-4 px-2">
          <AppText className="text-body-sm text-mute">
            Фото работ повышают доверие клиентов. Минимум 6 — заметно сильнее
            конверсия. Загружая, мы автоматически уменьшаем разрешение до
            1920×1920 и обрезаем экстремальные пропорции.
          </AppText>
        </View>

        {/* Grid */}
        {portfolio.isLoading ? (
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton row
                key={i}
                className="rounded-md bg-canvas-soft-2"
                style={{ width: "32%", aspectRatio: 1 }}
              />
            ))}
          </View>
        ) : items.length === 0 ? (
          <View
            className="items-center justify-center rounded-xl bg-canvas-soft px-6 py-12"
            style={{ minHeight: 220 }}
          >
            <ImageSquare size={36} weight="bold" color={tc["muted-soft"]} />
            <AppText
              weight="semibold"
              className="mt-3 text-body-md text-ink text-center"
            >
              Пока нет фото
            </AppText>
            <AppText className="mt-1 text-body-sm text-mute text-center">
              Добавьте 6–10 фото своих работ — клиенты доверяют профилям с
              портфолио в 4 раза чаще.
            </AppText>
          </View>
        ) : (
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {items.map((item) => (
              <View
                key={item.id}
                className="overflow-hidden rounded-md bg-canvas-soft-2"
                style={{ width: "32%", aspectRatio: 1, position: "relative" }}
              >
                <Image
                  source={{ uri: item.url }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Удалить фото"
                  onPress={() => handleDelete(item.id, item.storage_path)}
                  hitSlop={6}
                  className="absolute top-1.5 right-1.5 h-8 w-8 items-center justify-center rounded-full bg-canvas active:opacity-70"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.15,
                    shadowRadius: 3,
                    elevation: 2,
                  }}
                >
                  <Trash size={14} weight="bold" color="#ef4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {batchError ? (
          <View className="mt-4 rounded-md bg-canvas-soft px-4 py-3">
            <AppText className="text-caption text-error">{batchError}</AppText>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky bottom action — Add / Progress */}
      <View
        className="absolute left-0 right-0 bg-canvas border-t border-hairline px-5 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
      >
        {progress ? (
          <View className="items-center py-3">
            <AppText weight="semibold" className="text-body-md text-ink">
              Загружаем {progress.done} / {progress.total}…
            </AppText>
            <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft-2">
              <View
                className="h-full bg-primary"
                style={{
                  width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                }}
              />
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={handleAdd}
            disabled={slotsLeft === 0}
            className={`flex-row items-center justify-center gap-2 h-12 rounded-pill active:opacity-80 ${
              slotsLeft === 0 ? "bg-canvas-soft-2" : "bg-ink"
            }`}
          >
            <ImageSquare
              size={18}
              weight="bold"
              color={slotsLeft === 0 ? tc.mute : "#ffffff"}
            />
            <AppText
              weight="semibold"
              className={`text-body-md ${slotsLeft === 0 ? "text-mute" : "text-on-primary"}`}
            >
              {slotsLeft === 0
                ? "Лимит достигнут"
                : `Добавить фото (осталось ${slotsLeft})`}
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}
