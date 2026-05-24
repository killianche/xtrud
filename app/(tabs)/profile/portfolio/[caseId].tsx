/**
 * /profile/portfolio/[caseId] — детальный экран одного кейса портфолио.
 *
 * - Title + дата + описание.
 * - Grid фото с удалением.
 * - Sticky bottom CTA «+ Добавить фото» (multi-pick + batch upload, тот же
 *   pipeline что в legacy /profile/portfolio).
 * - ⋮ overflow menu: Редактировать / Удалить кейс.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CaretLeft,
  DotsThreeVertical,
  ImageSquare,
  Pencil,
  Trash,
} from "phosphor-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAppWidth } from "@/lib/use-app-width";
import { BottomSheet } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useAddPortfolioItem,
  useDeletePortfolioItem,
} from "@/features/profile/use-my-portfolio";
import {
  useCaseDetail,
  useDeleteCase,
  useUpdateCase,
} from "@/features/profile/use-portfolio-cases";
import {
  pickMultiplePortfolioImages,
  uploadPortfolioBatch,
} from "@/lib/image-upload";
import { cdnImage } from "@/lib/image-cdn";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function CaseDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  // expo-router typed routes ещё не подхватили portfolio/index route — cast
  // через any. После следующего prebuild/dev-restart типы регенерятся.
  const goBack = useSafeBack(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "/(tabs)/profile" as any,
  );
  const tc = useThemeColors(["ink", "mute", "muted-soft", "error", "on-primary"]);

  const screenW = useAppWidth();
  const tileSize = Math.floor((screenW - 32 - 16) / 3);

  const { data: caseDetail, isLoading } = useCaseDetail(caseId);
  const addItem = useAddPortfolioItem(userId);
  const deleteItem = useDeletePortfolioItem(userId);
  const updateCase = useUpdateCase(userId);
  const deleteCaseM = useDeleteCase(userId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

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

  if (!caseId || (!isLoading && !caseDetail)) {
    return (
      <View
        className="flex-1 bg-canvas items-center justify-center px-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <AppText weight="semibold" className="text-title-md text-ink">
          Кейс не найден
        </AppText>
        <Pressable onPress={goBack} className="mt-4 active:opacity-70">
          <AppText weight="medium" className="text-body-md text-link">
            Вернуться
          </AppText>
        </Pressable>
      </View>
    );
  }

  const items = caseDetail?.items ?? [];

  const handleAdd = async () => {
    if (!caseId || !userId) return;
    const picked = await pickMultiplePortfolioImages(50);
    if (picked.length === 0) return;

    setProgress({ done: 0, total: picked.length });
    const results = await uploadPortfolioBatch(userId, picked, {
      concurrency: 3,
      onProgress: (done, total) => setProgress({ done, total }),
    });

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
          caseId,
        });
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }

    setProgress(null);
    if (failed.length > 0) {
      Alert.alert(
        "Часть фото не загрузилась",
        `Ошибки: ${failed.length}. Попробуйте ещё раз.`,
      );
    }
  };

  const handleDeleteItem = (id: string, storagePath: string) => {
    Alert.alert("Удалить фото?", "Действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => deleteItem.mutate({ id, storagePath }),
      },
    ]);
  };

  const handleDeleteCase = async () => {
    setMenuOpen(false);
    if (!caseId) return;
    const confirmed = await confirmAsync({
      title: "Удалить кейс?",
      message: "Все фото внутри также будут удалены. Это нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
    });
    if (!confirmed) return;
    try {
      await deleteCaseM.mutateAsync({ caseId });
      router.back();
    } catch (e) {
      Alert.alert("Не удалось удалить", e instanceof Error ? e.message : String(e));
    }
  };

  const formattedDate = caseDetail?.work_done_at
    ? new Date(caseDetail.work_done_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <View className="flex-1 bg-canvas">
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
          Кейс
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Действия"
          onPress={() => setMenuOpen(true)}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <DotsThreeVertical size={22} weight="bold" color={tc.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Редизайн 2026-05-20: убрали серую обёртку bg-canvas-soft вокруг
            заголовка и пустого состояния (была «матрёшка карточек»). Title +
            meta + description идут чистым текстом без рамки; пустое состояние
            — dashed-border placeholder, не серый бокс. Эталон: Universe,
            Fever event detail (Lazyweb refs). */}
        {isLoading ? (
          <View className="h-24 rounded-xl bg-canvas-soft-2" />
        ) : caseDetail ? (
          <View className="px-1">
            <AppText
              weight="bold"
              className="text-display-md tracking-tight text-ink"
            >
              {caseDetail.title}
            </AppText>
            {formattedDate || items.length > 0 ? (
              <View className="mt-2 flex-row items-center gap-3">
                {formattedDate ? (
                  <AppText weight="mono" className="text-mono-caption text-mute">
                    {formattedDate}
                  </AppText>
                ) : null}
                {formattedDate && items.length > 0 ? (
                  <AppText className="text-caption text-muted-soft">·</AppText>
                ) : null}
                {items.length > 0 ? (
                  <AppText weight="mono" className="text-mono-caption text-mute">
                    {items.length} фото
                  </AppText>
                ) : null}
              </View>
            ) : null}
            {caseDetail.description ? (
              <AppText className="mt-4 text-body-md text-body">
                {caseDetail.description}
              </AppText>
            ) : null}
          </View>
        ) : null}

        <View className="mt-6">
          {items.length === 0 ? (
            <View
              className="items-center justify-center rounded-xl border-2 border-dashed border-hairline bg-canvas px-6 py-14"
              style={{ minHeight: 220 }}
            >
              <ImageSquare size={36} weight="bold" color={tc["muted-soft"]} />
              <AppText
                weight="semibold"
                className="mt-3 text-body-md text-ink text-center"
              >
                Пока без фото
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute text-center">
                Тапните «Добавить фото» внизу — клиенты увидят вашу работу.
              </AppText>
            </View>
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {items.map((item) => (
                <View
                  key={item.id}
                  className="overflow-hidden rounded-md bg-canvas-soft-2"
                  style={{ width: tileSize, height: tileSize, position: "relative" }}
                >
                  <Image
                    source={{ uri: cdnImage(item.url, { width: Math.round(tileSize) || 120 }) }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Удалить фото"
                    onPress={() => handleDeleteItem(item.id, item.storage_path)}
                    hitSlop={6}
                    className="absolute top-1.5 right-1.5 h-8 w-8 items-center justify-center rounded-full bg-canvas active:opacity-70"
                    style={{
                      // shadow остаётся технической — RN style требует цвет в shadowColor
                      shadowColor: "rgba(0,0,0,0.15)",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 1,
                      shadowRadius: 3,
                      elevation: 2,
                    }}
                  >
                    <Trash size={14} weight="bold" color={tc.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

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
                className="h-full bg-ink"
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
            className="flex-row items-center justify-center gap-2 h-12 rounded-lg bg-primary active:opacity-80"
          >
            <ImageSquare size={18} weight="bold" color={tc["on-primary"]} />
            <AppText weight="semibold" className="text-button text-on-primary">
              Добавить фото
            </AppText>
          </Pressable>
        )}
      </View>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Действия">
        <View className="pb-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 20,
              paddingVertical: 14,
            })}
          >
            <Pencil size={20} weight="bold" color={tc.ink} />
            <AppText weight="semibold" className="text-body-md text-ink">
              Редактировать кейс
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleDeleteCase}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 20,
              paddingVertical: 14,
            })}
          >
            <Trash size={20} weight="bold" color={tc.error} />
            <AppText weight="semibold" className="text-body-md text-error">
              Удалить кейс
            </AppText>
          </Pressable>
        </View>
      </BottomSheet>

      {caseDetail ? (
        <EditCaseSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          initial={{
            title: caseDetail.title,
            description: caseDetail.description ?? "",
            workDoneAt: caseDetail.work_done_at ?? "",
          }}
          onSubmit={async (input) => {
            try {
              await updateCase.mutateAsync({ caseId, ...input });
              setEditOpen(false);
            } catch (e) {
              Alert.alert(
                "Не удалось сохранить",
                e instanceof Error ? e.message : String(e),
              );
            }
          }}
          isPending={updateCase.isPending}
        />
      ) : null}
    </View>
  );
}

function EditCaseSheet({
  open,
  onClose,
  initial,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  initial: { title: string; description: string; workDoneAt: string };
  onSubmit: (input: {
    title: string;
    description: string | null;
    workDoneAt: string | null;
  }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [workDoneAt, setWorkDoneAt] = useState(initial.workDoneAt);
  const tc = useThemeColors(["muted-soft", "ink", "on-primary"]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length >= 2 && !isPending;

  // Quick-pick дат — те же что в CreateCaseSheet (Сегодня / Вчера / Месяц / Год).
  const quickDates = [
    { key: "today", label: "Сегодня", offsetDays: 0, offsetMonths: 0 },
    { key: "yesterday", label: "Вчера", offsetDays: 1, offsetMonths: 0 },
    { key: "month", label: "Месяц назад", offsetDays: 0, offsetMonths: 1 },
    { key: "year", label: "Год назад", offsetDays: 0, offsetMonths: 12 },
  ];
  function pickDate(d: number, m: number): string {
    const dt = new Date();
    if (d > 0) dt.setDate(dt.getDate() - d);
    if (m > 0) dt.setMonth(dt.getMonth() - m);
    return dt.toISOString().slice(0, 10);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Редактировать кейс">
      <View className="gap-6 pb-6">
        <View>
          <AppText weight="semibold" className="text-body-sm text-ink mb-2">
            Название
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Название кейса"
            placeholderTextColor={tc["muted-soft"]}
            autoCapitalize="sentences"
            editable={!isPending}
            className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
          />
        </View>

        <View>
          <AppText weight="semibold" className="text-body-sm text-ink mb-2">
            Описание
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Какие работы, материалы, сложности"
            placeholderTextColor={tc["muted-soft"]}
            autoCapitalize="sentences"
            multiline
            numberOfLines={3}
            editable={!isPending}
            className="rounded-md border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
            style={{ minHeight: 88, textAlignVertical: "top" }}
          />
        </View>

        <View>
          <AppText weight="semibold" className="text-body-sm text-ink mb-2">
            Дата выполнения
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {quickDates.map((q) => {
              const iso = pickDate(q.offsetDays, q.offsetMonths);
              const isSelected = workDoneAt === iso;
              return (
                <Pressable
                  key={q.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  disabled={isPending}
                  onPress={() => setWorkDoneAt(isSelected ? "" : iso)}
                  className={`rounded-full border px-3.5 py-2 ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "border-hairline bg-canvas active:opacity-70"
                  }`}
                >
                  <AppText
                    weight={isSelected ? "semibold" : "medium"}
                    className={`text-body-sm ${
                      isSelected ? "text-accent" : "text-ink"
                    }`}
                  >
                    {q.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {workDoneAt ? (
            <View className="mt-2 flex-row items-center gap-2">
              <AppText className="text-body-sm text-mute">Выбрано:</AppText>
              <AppText weight="semibold" className="text-body-sm text-ink">
                {workDoneAt}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Очистить дату"
                disabled={isPending}
                onPress={() => setWorkDoneAt("")}
                hitSlop={8}
                className="active:opacity-60"
              >
                <AppText weight="medium" className="text-caption text-mute">
                  Очистить
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({
              title: trimmedTitle,
              description: description.trim() || null,
              workDoneAt: workDoneAt.trim() || null,
            })
          }
          className={`h-12 flex-row items-center justify-center rounded-md ${
            canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={tc["on-primary"]} />
          ) : (
            <AppText
              weight="semibold"
              className={`text-button-lg ${canSubmit ? "text-on-primary" : "text-mute"}`}
            >
              Сохранить
            </AppText>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}
