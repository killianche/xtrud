/**
 * /master/review — форма freeform-отзыва на мастера.
 *
 * Открывается с публичного профиля мастера (`/master/[id]`) по тапу
 * «Оставить отзыв» (только для авторизованного клиента). Раньше жил как
 * `BottomSheet` внутри `master/[id].tsx`. Теперь — отдельный route с
 * нативной iOS `modal`-модальностью (`docs/IOS_FOUNDATION.md` §2.4):
 * самостоятельная отменяемая целиком задача с вводом текста →
 * `presentation: "modal"`.
 *
 * Не требует завершённого заказа — отзыв freeform (решение владельца
 * 2026-05-27). Лимит — один отзыв от автора в 3 дня (0191) — проверяется на
 * стороне БД через RPC `submit_master_review`.
 *
 * `authorId` берётся из своей сессии (`useAuthSession`), а не параметром —
 * это PII текущего пользователя, ему незачем идти через URL. `masterId` /
 * `masterName` приходят параметрами (нужны для RPC и копирайта, `master/[id]`
 * их уже знает). Мутация (`useSubmitMasterReview`) сама инвалидирует
 * recent-review / master-profile / master-reviews queries на success — round-
 * trip результата через store не нужен (та же логика, что у `create-case` /
 * `change-phone`).
 *
 * Приватный route (авторизация обязательна) — не в `PUBLIC_DETAIL_ROUTES`,
 * хотя родительский `master/[id]` публичный: анонимный deep link уводит на
 * табы (fail-closed), что и требуется — отзыв без сессии оставить нельзя.
 *
 * `KeyboardAvoidingView behavior="padding"`: требует проверки на реальном
 * устройстве — симулятора/устройства в этой среде нет.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Star, X } from "phosphor-react-native";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useSubmitMasterReview } from "@/features/reviews/use-reviews";
import { useThemeColors } from "@/lib/use-theme-color";

// Константа модуля: объект, создаваемый на каждый рендер, заставлял систему
// переоткрывать модалку (владелец, 2026-09-07: «кликаешь на отзыв — снова
// открывает эту же страницу»).
const SCREEN_OPTIONS = { presentation: "modal" as const };

const MAX_TEXT_LENGTH = 500;

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

export default function MasterReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ masterId?: string; masterName?: string }>();
  const masterId = typeof params.masterId === "string" ? params.masterId : undefined;
  const masterName = params.masterName || "Мастер";
  const { session } = useAuthSession();
  const authorId = session?.user?.id;

  const tc = useThemeColors(["ink", "muted-soft", "warning", "on-primary", "mute"]);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const submit = useSubmitMasterReview(authorId);

  const canSubmit = !!masterId && rating >= 1 && rating <= 5 && !submit.isPending;

  const close = () => router.back();

  const handleSubmit = () => {
    if (!canSubmit || !masterId) return;
    setServerError(null);
    submit.mutate(
      { targetId: masterId, rating, text },
      {
        onSuccess: () => {
          close();
          Alert.alert("Отзыв отправлен", "Спасибо за оценку.");
        },
        onError: (e) => {
          // RPC возвращает понятный текст: «Один отзыв в три дня» /
          // «Можно оставить отзыв только специалисту». Показываем как есть.
          const msg = e instanceof Error ? e.message : "Не удалось отправить отзыв";
          setServerError(msg);
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
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
            Оставить отзыв
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            disabled={submit.isPending}
            onPress={close}
            hitSlop={10}
            className={`h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft ${
              submit.isPending ? "opacity-40" : ""
            }`}
          >
            <X size={22} weight="bold" color={tc.mute} />
          </Pressable>
        </View>

        <View className="flex-1 px-5 pb-6">
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
            Один отзыв в три дня. Будьте честны — отзывы видны всем клиентам.
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
