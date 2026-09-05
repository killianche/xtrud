/**
 * /master/report-review — мастер обжалует оставленный ему отзыв.
 *
 * Зачем. Мастер видит свои отзывы на собственной странице (/master/[id], когда
 * isOwnProfile). Если отзыв накручен / оскорбителен — мастер жмёт «Обжаловать»,
 * выбирает причину и (опц.) комментарий → создаётся запись в `reports`
 * (target_type='review', target_id = review.id) через общий useCreateReport.
 * Дальше жалоба попадает в очередь модерации /admin/reports, где админ может
 * «Скрыть отзыв» (status='hidden' → пропадает из публичного списка, т.к.
 * useReviewsForTarget фильтрует status='visible').
 *
 * Раньше `ReportReviewSheet` жил как `BottomSheet` внутри `master/[id].tsx`.
 * Теперь — отдельный route с нативной iOS `modal`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4): самостоятельная отменяемая целиком задача
 * с вводом текста → `presentation: "modal"`.
 *
 * `review` (полный `ReviewWithAuthor`) сюда прямым объектом не идёт — экран
 * использует только `id` и `text`, поэтому они переданы параметрами
 * (`reviewId`, `reviewText`). `reporterId` берётся из своей сессии
 * (`useAuthSession`), а не параметром — RLS требует `reporter_id = auth.uid()`
 * в любом случае, идти через URL незачем.
 *
 * Мутация (`useCreateReport`) не требует round-trip результата назад в
 * `master/[id].tsx` — отзыв остаётся видимым до решения модератора, список
 * отзывов не меняется сразу.
 *
 * Приватный route (авторизация обязательна) — не в `PUBLIC_DETAIL_ROUTES`,
 * хотя родительский `master/[id]` публичный: анонимный/чужой deep link уводит
 * на табы (fail-closed) — жалобу без сессии подать нельзя.
 *
 * `KeyboardAvoidingView behavior="padding"`: требует проверки на реальном
 * устройстве — симулятора/устройства в этой среде нет.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  REASON_LABELS,
  type ReportReason,
  reasonsFor,
  useCreateReport,
} from "@/features/reports/use-create-report";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";

const REVIEW_REASONS: ReportReason[] = reasonsFor("review");

export default function ReportReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ reviewId?: string; reviewText?: string }>();
  const reviewId = typeof params.reviewId === "string" ? params.reviewId : undefined;
  const reviewText = typeof params.reviewText === "string" ? params.reviewText : undefined;
  const { session } = useAuthSession();
  const reporterId = session?.user?.id;

  const mutedSoftColor = useThemeColor("muted-soft");
  const tc = useThemeColors(["mute"]);
  const createReport = useCreateReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");

  const close = () => router.back();

  const canSubmit = reason !== null && !!reporterId && !!reviewId && !createReport.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || !reason || !reviewId || !reporterId) return;
    try {
      await createReport.mutateAsync({
        reporterId,
        targetType: "review",
        targetId: reviewId,
        reason,
        description,
      });
      close();
      Alert.alert(
        "Жалоба отправлена",
        "Модератор рассмотрит отзыв. Если он нарушает правила — мы его удалим.",
      );
    } catch (e) {
      Alert.alert("Не удалось отправить", e instanceof Error ? e.message : "Попробуйте ещё раз.");
    }
  };

  return (
    <>
      <Stack.Screen options={{ presentation: "modal", gestureEnabled: !createReport.isPending }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-canvas"
        // Отступ от чёлки обязателен на каждом экране (DECISION владельца
        // 2026-09-06). Внутри системной модалки inset маленький, на полном
        // экране — высота статус-бара; в обоих случаях заголовок не под часами.
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center gap-3 px-5 py-3">
          <AppText weight="bold" className="flex-1 text-display-sm tracking-tight text-ink">
            Пожаловаться на отзыв
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            disabled={createReport.isPending}
            onPress={close}
            hitSlop={10}
            className={`h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft ${
              createReport.isPending ? "opacity-40" : ""
            }`}
          >
            <X size={22} weight="bold" color={tc.mute} />
          </Pressable>
        </View>

        <View className="flex-1 px-5 pb-6 pt-2">
          {/* Текст самого отзыва — чтобы мастер видел, на что жалуется. */}
          {reviewText ? (
            <View className="rounded-lg border border-hairline bg-canvas-soft px-4 py-3">
              <AppText className="text-body-sm text-body" numberOfLines={4}>
                «{reviewText}»
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
            editable={!createReport.isPending}
            className="mt-2 min-h-24 rounded-lg border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
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
      </KeyboardAvoidingView>
    </>
  );
}
