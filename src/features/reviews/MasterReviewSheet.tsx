/**
 * MasterReviewSheet — bottom-sheet с формой отзыва на мастера.
 *
 * Открывается с публичного профиля мастера (`/master/[id]`) по тапу
 * «Оставить отзыв». Не требует завершённого заказа — отзыв freeform
 * (решение владельца 2026-05-27). Лимит 1 отзыв / 30 дней / (author, target)
 * проверяется на стороне БД через RPC `submit_master_review`.
 *
 * Внутри:
 *   - 5 звёзд (interactive — тап на звезду i ставит rating=i+1)
 *   - Textarea (опц., до 500 символов)
 *   - CTA «Отправить отзыв» (disabled пока не выбран rating)
 *   - Error message — если RPC отверг (например, лимит 30 дней)
 *
 * Не показывать sheet:
 *   - анонимам (нужна авторизация — внешняя логика на /master/[id])
 *   - мастеру самому себе
 *   - если есть отзыв за последние 30 дней (внешняя логика через
 *     useMyRecentReviewForMaster)
 */

import { Star, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { useSubmitMasterReview } from "@/features/reviews/use-reviews";
import { useThemeColors } from "@/lib/use-theme-color";

const MAX_TEXT_LENGTH = 500;

interface MasterReviewSheetProps {
  open: boolean;
  onClose: () => void;
  /** ID мастера (target отзыва). */
  masterId: string;
  /** ID текущего пользователя — нужен для invalidate query. */
  authorId: string;
  /** Имя мастера для копирайта. */
  masterName: string;
}

export function MasterReviewSheet({
  open,
  onClose,
  masterId,
  authorId,
  masterName,
}: MasterReviewSheetProps) {
  const tc = useThemeColors(["ink", "muted-soft", "warning", "on-primary", "mute"]);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const submit = useSubmitMasterReview(authorId);

  // Сбрасываем состояние при каждом открытии — чтобы старые значения
  // не показывались если sheet открыт повторно.
  useEffect(() => {
    if (open) {
      setRating(0);
      setText("");
      setServerError(null);
    }
  }, [open]);

  const canSubmit = rating >= 1 && rating <= 5 && !submit.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setServerError(null);
    submit.mutate(
      { targetId: masterId, rating, text },
      {
        onSuccess: () => {
          Alert.alert("Отзыв отправлен", "Спасибо за оценку.");
          onClose();
        },
        onError: (e) => {
          // RPC возвращает понятный текст: «Вы уже оставляли отзыв этому
          // мастеру в последние 30 дней» / «Можно оставить отзыв только
          // мастеру» / etc. Показываем как есть.
          const msg = e instanceof Error ? e.message : "Не удалось отправить отзыв";
          setServerError(msg);
        },
      },
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Оставить отзыв">
      <View className="px-5">
        <AppText className="text-body-md text-mute">
          Ваша оценка мастера{" "}
          <AppText weight="semibold" className="text-ink">
            {masterName}
          </AppText>
          .
        </AppText>

        {/* Звёзды — крупные tap-targets, чтобы тап точно попадал. */}
        <View className="mt-6 flex-row items-center justify-center gap-3">
          {[1, 2, 3, 4, 5].map((i) => {
            const active = i <= rating;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${i} ${i === 1 ? "звезда" : "звёзд"}`}
                accessibilityState={{ selected: active }}
                onPress={() => setRating(i)}
                hitSlop={6}
                className="active:opacity-70"
              >
                <Star
                  size={40}
                  weight={active ? "fill" : "regular"}
                  color={active ? tc.warning : tc["muted-soft"]}
                />
              </Pressable>
            );
          })}
        </View>

        {rating > 0 ? (
          <AppText weight="medium" className="mt-3 text-center text-caption text-mute">
            {ratingLabel(rating)}
          </AppText>
        ) : null}

        {/* Текст (опц.) — placeholder поясняет что писать. */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between">
            <AppText weight="medium" className="text-caption text-mute">
              Комментарий (необязательно)
            </AppText>
            <AppText weight="mono" className="text-mono-caption text-mute">
              {text.length} / {MAX_TEXT_LENGTH}
            </AppText>
          </View>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX_TEXT_LENGTH))}
            placeholder="Расскажите, как прошла работа"
            placeholderTextColor={tc["muted-soft"]}
            multiline
            numberOfLines={5}
            maxFontSizeMultiplier={1.3}
            editable={!submit.isPending}
            className="mt-2 min-h-[120px] rounded-md border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
            style={{ textAlignVertical: "top" }}
          />
        </View>

        {serverError ? (
          <View className="mt-3 rounded-md border border-error/40 bg-error-soft px-3 py-2 flex-row items-start gap-2">
            <X size={16} weight="bold" color={tc.warning} />
            <AppText className="flex-1 text-caption text-error">{serverError}</AppText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить отзыв"
          disabled={!canSubmit}
          onPress={handleSubmit}
          className={`mt-6 h-12 items-center justify-center rounded-md ${
            canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          <AppText weight="semibold" className="text-button-lg text-on-primary">
            {submit.isPending ? "Отправляем…" : "Отправить отзыв"}
          </AppText>
        </Pressable>

        <AppText className="mt-4 text-caption text-mute text-center">
          Один отзыв в 30 дней. Будьте честны — отзывы видны всем клиентам.
        </AppText>
      </View>
    </BottomSheet>
  );
}

function ratingLabel(rating: number): string {
  switch (rating) {
    case 1:
      return "Очень плохо";
    case 2:
      return "Плохо";
    case 3:
      return "Так себе";
    case 4:
      return "Хорошо";
    case 5:
      return "Отлично";
    default:
      return "";
  }
}
