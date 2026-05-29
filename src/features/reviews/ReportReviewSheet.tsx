/**
 * ReportReviewSheet — мастер обжалует оставленный ему отзыв.
 *
 * Зачем. Мастер видит свои отзывы на собственной странице (/master/[id], когда
 * isOwnProfile). Если отзыв накручен / оскорбителен — мастер жмёт «Обжаловать»,
 * выбирает причину и (опц.) комментарий → создаётся запись в `reports`
 * (target_type='review', target_id = review.id) через общий useCreateReport.
 * Дальше жалоба попадает в очередь модерации /admin/reports, где админ может
 * «Скрыть отзыв» (status='hidden' → пропадает из публичного списка, т.к.
 * useReviewsForTarget фильтрует status='visible').
 *
 * Бэкенд для этого уже существовал (таблица reports + enum target_type='review'
 * + admin reports.tsx). Здесь — только недостающая точка входа со стороны
 * мастера. Никакого нового бэка не добавляем.
 *
 * Дизайн: BottomSheet (full-screen) + chip-выбор причины (radio, mutex) +
 * необязательный комментарий + один primary-CTA. Без subtitle под H1 (§G),
 * цвета — токены через className, иконки — Phosphor.
 */

import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ReviewWithAuthor } from "@/features/master-view/use-master-public";
import {
  REASON_LABELS,
  type ReportReason,
  reasonsFor,
  useCreateReport,
} from "@/features/reports/use-create-report";
import { useThemeColor } from "@/lib/use-theme-color";

interface ReportReviewSheetProps {
  open: boolean;
  onClose: () => void;
  /** Отзыв, на который жалуется мастер. null → шит не активен. */
  review: ReviewWithAuthor | null;
  /** Кто жалуется (текущий мастер). RLS требует reporter_id = auth.uid(). */
  reporterId: string | null | undefined;
}

const REVIEW_REASONS: ReportReason[] = reasonsFor("review");

export function ReportReviewSheet({
  open,
  onClose,
  review,
  reporterId,
}: ReportReviewSheetProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  const createReport = useCreateReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");

  const reset = () => {
    setReason(null);
    setDescription("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSubmit = reason !== null && !!reporterId && !!review && !createReport.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || !reason || !review || !reporterId) return;
    try {
      await createReport.mutateAsync({
        reporterId,
        targetType: "review",
        targetId: review.id,
        reason,
        description,
      });
      reset();
      onClose();
      Alert.alert(
        "Жалоба отправлена",
        "Модератор рассмотрит отзыв. Если он нарушает правила — мы его удалим.",
      );
    } catch (e) {
      Alert.alert(
        "Не удалось отправить",
        e instanceof Error ? e.message : "Попробуйте ещё раз.",
      );
    }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Пожаловаться на отзыв">
      <View className="pt-2">
        {/* Текст самого отзыва — чтобы мастер видел, на что жалуется. */}
        {review?.text ? (
          <View className="rounded-lg border border-hairline bg-canvas-soft px-4 py-3">
            <AppText className="text-body-sm text-body" numberOfLines={4}>
              «{review.text}»
            </AppText>
          </View>
        ) : null}

        {/* Причина — обязательна (radio/mutex). */}
        <AppText weight="semibold" className="mt-6 text-body-sm text-ink">
          Причина
        </AppText>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {REVIEW_REASONS.map((r) => {
            const selected = reason === r;
            return (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={createReport.isPending}
                onPress={() => setReason(r)}
                className={`h-11 items-center justify-center rounded-pill border px-4 ${
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-hairline bg-canvas active:opacity-70"
                }`}
              >
                <AppText
                  weight="medium"
                  className={`text-body-md ${selected ? "text-accent" : "text-ink"}`}
                >
                  {REASON_LABELS[r]}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Комментарий — необязательный. */}
        <AppText weight="semibold" className="mt-6 text-body-sm text-ink">
          Комментарий <AppText className="text-body-sm text-mute">(необязательно)</AppText>
        </AppText>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Что именно не так с этим отзывом?"
          placeholderTextColor={mutedSoftColor}
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          maxFontSizeMultiplier={1.3}
          editable={!createReport.isPending}
          className="mt-2 min-h-24 rounded-lg border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
          style={{ outlineWidth: 0, outlineStyle: "none" } as object}
        />

        {/* CTA */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить жалобу"
          disabled={!canSubmit}
          onPress={handleSubmit}
          className={`mt-6 h-12 items-center justify-center rounded-full ${
            canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          <AppText weight="semibold" className="text-button-lg text-on-primary">
            {createReport.isPending ? "Отправляем…" : "Отправить жалобу"}
          </AppText>
        </Pressable>

        <AppText className="mt-3 text-center text-caption text-mute">
          Жалобу рассмотрит модератор xtrud.
        </AppText>
      </View>
    </BottomSheet>
  );
}
