/**
 * ConfirmWorkSheet — форма «Этот мастер выполнил мне работу» (сценарий C
 * ad-hoc, см. дизайн в чате 2026-05-14).
 *
 * Триггер — кнопка на master/[id]. Открывает BottomSheet с формой:
 *   - Категория (CategoryPicker)
 *   - Что выполнено (короткое название, опц.)
 *   - Оценка 1-5 (stars, опц.)
 *   - Отзыв (textarea, опц.)
 *
 * Submit → RPC confirm_work_done → инкрементит master_profiles.closed_deals
 * + опционально создаёт review. Возвращает order_id (создаётся ad-hoc заказ
 * со status=completed, created_via=ad_hoc_completion).
 *
 * Анон → отправляем на /(auth)/phone (требует логин для подтверждения).
 *
 * Сценарии A/B (выбор из моих заказов) — отдельный спринт. Сейчас V1 = C.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Star } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { CategoryPicker } from "@/components/CategoryPicker";
import { BottomSheet, Button } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { supabase } from "@/lib/supabase";
import { useThemeColor } from "@/lib/use-theme-color";

interface ConfirmWorkSheetProps {
  open: boolean;
  onClose: () => void;
  masterId: string;
  masterName: string;
}

export function ConfirmWorkSheet({ open, onClose, masterId, masterName }: ConfirmWorkSheetProps) {
  const { session } = useAuthSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutedSoftColor = useThemeColor("muted-soft");

  const [l2Id, setL2Id] = useState("");
  const [title, setTitle] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isAnon = !session?.user?.id;

  const reset = () => {
    setL2Id("");
    setTitle("");
    setRating(0);
    setReviewText("");
    setError(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc("confirm_work_done", {
        p_master_id: masterId,
        // null → ad-hoc сценарий C (новый order создаётся внутри RPC)
        p_l2_id: l2Id || undefined,
        p_title: title || `Работа от ${masterName}`,
        p_review_rating: rating > 0 ? rating : undefined,
        p_review_text: reviewText || undefined,
      });
      if (rpcError) throw rpcError;
      return data;
    },
    onSuccess: () => {
      // Инвалидируем профиль мастера (closed_deals обновился) + отзывы.
      queryClient.invalidateQueries({ queryKey: ["master-public", masterId] });
      queryClient.invalidateQueries({ queryKey: ["reviews-for-target", masterId] });
      reset();
      onClose();
    },
    onError: (e: Error) => setError(e.message ?? "Не удалось подтвердить"),
  });

  const handleSubmit = () => {
    if (isAnon) {
      onClose();
      router.push("/(auth)/phone" as never);
      return;
    }
    if (!l2Id) {
      setError("Выберите категорию работы");
      return;
    }
    mutation.mutate();
  };

  const canSubmit = !!l2Id && !mutation.isPending;

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={isAnon ? "Войдите чтобы подтвердить" : `Этот мастер выполнил работу?`}
      subtitle={
        isAnon
          ? "Подтверждение работы доступно только зарегистрированным клиентам."
          : `Опишите что сделал ${masterName}. Это поможет другим клиентам.`
      }
    >
      {isAnon ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Button onPress={handleSubmit} variant="primary" size="lg" fullWidth>
            Войти по телефону
          </Button>
        </View>
      ) : (
        <View style={{ gap: 16, marginTop: 4 }}>
          {/* Категория */}
          <View>
            <AppText weight="medium" className="text-caption text-muted mb-2">
              Категория работы
            </AppText>
            <CategoryPicker value={l2Id} onChange={setL2Id} />
          </View>

          {/* Что выполнено */}
          <View>
            <AppText weight="medium" className="text-caption text-muted mb-2">
              Что выполнено (опционально)
            </AppText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Например: установил смеситель"
              placeholderTextColor={mutedSoftColor}
              className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
              maxLength={120}
            />
          </View>

          {/* Оценка */}
          <View>
            <AppText weight="medium" className="text-caption text-muted mb-2">
              Оценка работы
            </AppText>
            <View className="flex-row items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRating(n === rating ? 0 : n)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} звёзд`}
                >
                  <Star
                    size={32}
                    weight={n <= rating ? "fill" : "bold"}
                    color="#f5a623"
                  />
                </Pressable>
              ))}
            </View>
          </View>

          {/* Отзыв */}
          {rating > 0 ? (
            <View>
              <AppText weight="medium" className="text-caption text-muted mb-2">
                Отзыв (опционально)
              </AppText>
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="Расскажите как прошла работа"
                placeholderTextColor={mutedSoftColor}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="min-h-24 rounded-md border border-hairline bg-canvas px-3 py-2 text-body-md text-ink"
                maxLength={1000}
              />
            </View>
          ) : null}

          {error ? (
            <AppText className="text-caption text-error">{error}</AppText>
          ) : null}

          <Button
            onPress={handleSubmit}
            disabled={!canSubmit}
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
          >
            Подтвердить выполнение
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}
