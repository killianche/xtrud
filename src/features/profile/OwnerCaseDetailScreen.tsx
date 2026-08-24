/**
 * OwnerCaseDetailScreen — детальный экран ОДНОЙ работы портфолио (для владельца,
 * с edit-actions). Один общий компонент для двух роутов:
 *   - /(tabs)/cases/[caseId]            ← основной (вкладка «Ваши работы»)
 *   - /(tabs)/profile/portfolio/[caseId] ← legacy (старый список портфолио)
 *
 * Зачем общий компонент: до 2026-05-24 экран жил ТОЛЬКО под profile-сегментом
 * (/profile/portfolio/[caseId]). Из-за этого при открытии работы с вкладки
 * «Ваши работы» активной в нижнем меню становилась «Профиль», а «назад» уводил
 * в профиль (фидбэк владельца). Перенесли экран в стек вкладки cases — back
 * теперь возвращает в список работ, активна остаётся «Ваши работы».
 *
 * Редактирование (фидбэк владельца 2026-05-24, второй заход):
 *   - Кнопка-карандаш СПРАВА от заголовка крупнее (h-11 круг). Тап по ней или
 *     по заголовку → режим правки, где СРАЗУ редактируются название + описание
 *     + дата выполнения (раньше описание/дата прятались в отдельном шите за «⋮»).
 *   - «⋮» теперь открывает блок ТОЛЬКО с «Удалить работу» — никакого
 *     «Описание и дата» (оно переехало под карандаш).
 *   - «Добавить фото» — плитка «+» в КОНЦЕ сетки фото (1 тап → мульти-выбор →
 *     batch upload → привязка). Удаление фото — крестик на плитке.
 *
 * Lazyweb-референсы: Apple Journal / Google Photos — «+ tile» в конце медиа-
 * грида; inline-rename как в Notion / Apple Notes (тап по заголовку правит).
 *
 * Pipeline выбора+загрузки фото — общий: pickMultipleImages + uploadPortfolioBatch
 * + useAddPortfolioItem(caseId). Тот же что в /cases.
 */

import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import {
  CaretLeft,
  DotsThreeVertical,
  ImageSquare,
  Pencil,
  Plus,
  Trash,
} from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useAddPortfolioItem, useDeletePortfolioItem } from "@/features/profile/use-my-portfolio";
import {
  useCaseDetail,
  useDeleteCase,
  useUpdateCase,
} from "@/features/profile/use-portfolio-cases";
import { confirmAsync } from "@/lib/confirm";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import {
  type PickedImage,
  pickMultiplePortfolioImages,
  uploadPortfolioBatch,
} from "@/lib/image-upload";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// Быстрый выбор даты выполнения (Сегодня / Вчера / Месяц / Год назад).
const QUICK_DATES = [
  { key: "today", label: "Сегодня", offsetDays: 0, offsetMonths: 0 },
  { key: "yesterday", label: "Вчера", offsetDays: 1, offsetMonths: 0 },
  { key: "month", label: "Месяц назад", offsetDays: 0, offsetMonths: 1 },
  { key: "year", label: "Год назад", offsetDays: 0, offsetMonths: 12 },
] as const;

function quickDateIso(offsetDays: number, offsetMonths: number): string {
  const dt = new Date();
  if (offsetDays > 0) dt.setDate(dt.getDate() - offsetDays);
  if (offsetMonths > 0) dt.setMonth(dt.getMonth() - offsetMonths);
  return dt.toISOString().slice(0, 10);
}

export default function OwnerCaseDetailScreen() {
  const insets = useSafeAreaInsets();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  // Fallback при холодном открытии (нет истории) — список работ.
  const goBack = useSafeBack("/(tabs)/cases" as const);
  const tc = useThemeColors(["ink", "mute", "muted-soft", "error", "on-primary"]);

  const screenW = useAppWidth();
  const tileSize = Math.floor((screenW - 32 - 16) / 3);

  const { data: caseDetail, isLoading } = useCaseDetail(caseId);
  const addItem = useAddPortfolioItem(userId);
  const deleteItem = useDeletePortfolioItem(userId);
  const updateCase = useUpdateCase(userId);
  const deleteCaseM = useDeleteCase(userId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Единый режим правки: название + описание + дата сразу (фидбэк владельца).
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [dateDraft, setDateDraft] = useState(""); // ISO yyyy-mm-dd или ""

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
          Работа не найдена
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
    if (!caseId || !userId || progress) return;
    const picked: PickedImage[] = await pickMultiplePortfolioImages(50);
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
      Alert.alert("Часть фото не загрузилась", `Ошибки: ${failed.length}. Попробуйте ещё раз.`);
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
      title: "Удалить работу?",
      message: "Все фото внутри также будут удалены. Это нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
    });
    if (!confirmed) return;
    try {
      await deleteCaseM.mutateAsync({ caseId });
      goBack();
    } catch (e) {
      Alert.alert("Не удалось удалить", e instanceof Error ? e.message : String(e));
    }
  };

  const startEdit = () => {
    if (!caseDetail) return;
    setTitleDraft(caseDetail.title);
    setDescDraft(caseDetail.description ?? "");
    setDateDraft(caseDetail.work_done_at ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!caseId) {
      setEditing(false);
      return;
    }
    // Название не может быть пустым (хук/каталог требуют непустое) — если
    // мастер стёр всё, подставляем «Без имени».
    const nextTitle = titleDraft.trim() || "Без имени";
    try {
      await updateCase.mutateAsync({
        caseId,
        title: nextTitle,
        description: descDraft.trim() || null,
        workDoneAt: dateDraft.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      Alert.alert("Не удалось сохранить", e instanceof Error ? e.message : String(e));
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
          Работа
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
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View className="h-12 rounded-xl bg-canvas-soft-2" />
        ) : caseDetail ? (
          editing ? (
            // ── Режим правки: название + описание + дата сразу ──────────────
            <View className="gap-4 px-1">
              <View>
                <AppText weight="semibold" className="mb-2 text-body-sm text-ink">
                  Название
                </AppText>
                <TextInput
                  value={titleDraft}
                  onChangeText={(v) => setTitleDraft(v.slice(0, 120))}
                  placeholder="Например: Укладка плитки в ванной"
                  placeholderTextColor={tc["muted-soft"]}
                  autoFocus
                  maxLength={120}
                  editable={!updateCase.isPending}
                  className="rounded-md border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
                />
              </View>

              <View>
                <AppText weight="semibold" className="mb-2 text-body-sm text-ink">
                  Описание
                </AppText>
                <TextInput
                  value={descDraft}
                  onChangeText={setDescDraft}
                  placeholder="Какие работы, материалы, сложности"
                  placeholderTextColor={tc["muted-soft"]}
                  autoCapitalize="sentences"
                  multiline
                  numberOfLines={3}
                  editable={!updateCase.isPending}
                  className="rounded-md border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
                  style={{ minHeight: 88, textAlignVertical: "top" }}
                />
              </View>

              <View>
                <AppText weight="semibold" className="mb-2 text-body-sm text-ink">
                  Дата выполнения
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  {QUICK_DATES.map((q) => {
                    const iso = quickDateIso(q.offsetDays, q.offsetMonths);
                    const isSelected = dateDraft === iso;
                    return (
                      <Pressable
                        key={q.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        disabled={updateCase.isPending}
                        onPress={() => setDateDraft(isSelected ? "" : iso)}
                        className={`rounded-full border px-3.5 py-2 ${
                          isSelected
                            ? "border-accent bg-accent-soft"
                            : "border-hairline bg-canvas active:opacity-70"
                        }`}
                      >
                        <AppText
                          weight={isSelected ? "semibold" : "medium"}
                          className={`text-body-sm ${isSelected ? "text-accent" : "text-ink"}`}
                        >
                          {q.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="mt-1 flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  disabled={updateCase.isPending}
                  onPress={cancelEdit}
                  className="h-12 flex-1 flex-row items-center justify-center rounded-md border border-hairline bg-canvas active:opacity-70"
                >
                  <AppText weight="semibold" className="text-button text-ink">
                    Отмена
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={updateCase.isPending}
                  onPress={saveEdit}
                  className={`h-12 flex-1 flex-row items-center justify-center rounded-md ${
                    updateCase.isPending ? "bg-surface-3" : "bg-primary active:opacity-80"
                  }`}
                >
                  {updateCase.isPending ? (
                    <ActivityIndicator size="small" color={tc["on-primary"]} />
                  ) : (
                    <AppText weight="semibold" className="text-button text-on-primary">
                      Сохранить
                    </AppText>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            // ── Режим просмотра: заголовок + крупная кнопка-карандаш ────────
            <View className="px-1">
              <View className="flex-row items-start gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Редактировать работу"
                  onPress={startEdit}
                  className="flex-1 active:opacity-70"
                >
                  <AppText weight="bold" className="text-display-md tracking-tight text-ink">
                    {caseDetail.title}
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Редактировать работу"
                  onPress={startEdit}
                  hitSlop={8}
                  className="h-11 w-11 items-center justify-center rounded-full bg-canvas-soft-2 active:opacity-70"
                >
                  <Pencil size={22} weight="bold" color={tc.ink} />
                </Pressable>
              </View>

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
                <AppText className="mt-4 text-body-md text-body">{caseDetail.description}</AppText>
              ) : null}
            </View>
          )
        ) : null}

        {/* Прогресс загрузки — компактный баннер над сеткой. */}
        {progress ? (
          <View className="mt-6 rounded-lg bg-canvas-soft px-4 py-3">
            <AppText weight="semibold" className="text-body-sm text-ink">
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
        ) : null}

        {/* Сетка фото 3-в-ряд + плитка «+» в конце. Скрыта в режиме правки,
            чтобы не отвлекать от формы. */}
        {!editing ? (
          <View className="mt-6 flex-row flex-wrap" style={{ gap: 8 }}>
            {items.map((item) => (
              <PhotoTile
                key={item.id}
                url={item.url}
                size={tileSize}
                errorColor={tc["muted-soft"]}
                dangerColor={tc.error}
                onDelete={() => handleDeleteItem(item.id, item.storage_path)}
              />
            ))}

            {/* Плитка «Добавить фото» — всегда в конце, 1 тап. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить фото"
              onPress={handleAdd}
              disabled={!!progress}
              className="items-center justify-center rounded-md border-2 border-dashed border-hairline bg-canvas active:opacity-70"
              style={{ width: tileSize, height: tileSize }}
            >
              <Plus size={26} weight="bold" color={tc["muted-soft"]} />
              <AppText weight="medium" className="mt-1 text-caption text-mute">
                Фото
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* «⋮» — блок только с удалением (правка названия/описания/даты переехала
          под карандаш у заголовка, фидбэк владельца 2026-05-24). */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Действия">
        <View className="pb-2">
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
              Удалить работу
            </AppText>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

// ============================================================================
// PhotoTile — одна плитка фото в сетке детальной работы.
// expo-image + blur-up + cdnImage (как PortfolioGrid) + delete-overlay.
// ============================================================================

function PhotoTile({
  url,
  size,
  errorColor,
  dangerColor,
  onDelete,
}: {
  url: string;
  size: number;
  errorColor: string;
  dangerColor: string;
  onDelete: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const blur = cdnBlur(url);
  return (
    <View
      className="overflow-hidden rounded-md bg-canvas-soft-2"
      style={{ width: size, height: size, position: "relative" }}
    >
      {failed ? (
        <View className="flex-1 items-center justify-center">
          <ImageSquare size={Math.min(28, size * 0.3)} weight="bold" color={errorColor} />
        </View>
      ) : (
        <Image
          source={{ uri: cdnImage(url, { width: size }) }}
          placeholder={blur ? { uri: blur } : undefined}
          placeholderContentFit="cover"
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Удалить фото"
        onPress={onDelete}
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
        <Trash size={14} weight="bold" color={dangerColor} />
      </Pressable>
    </View>
  );
}
