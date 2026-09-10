/**
 * /profile/portfolio/create-case — форма создания нового кейса портфолио.
 *
 * Раньше `CreateCaseSheet` жил как `BottomSheet` внутри
 * `profile/portfolio/index.tsx`. Теперь — отдельный route с нативной iOS
 * `modal`-модальностью (`docs/IOS_FOUNDATION.md` §2.4): самостоятельная
 * отменяемая целиком задача с вводом текста → `presentation: "modal"`, а не
 * `formSheet` (полю ввода с клавиатурой в маленькой шторке тесно, detents
 * тут неприменимы).
 *
 * Мутация (`useCreateCase`) выполняется прямо здесь, а не на списочном
 * экране: `useCreateCase.onSuccess` уже инвалидирует `["portfolio-cases", …]`
 * (см. `src/features/profile/use-portfolio-cases.ts`), поэтому списочный
 * экран сам подхватит новый кейс при следующем маунте/фокусе — round-trip
 * результата через store не нужен (в отличие от пикеров типа `city-select`).
 * После успешного создания уходим `router.back()` (закрыть модалку) и сразу
 * `router.push` в созданный кейс (мастер хочет сразу добавить фото).
 *
 * Приватный route (владелец-only) — не в `PUBLIC_DETAIL_ROUTES`: `profile/
 * portfolio` сам приватный, анонимный/чужой deep link уводит на табы.
 *
 * `KeyboardAvoidingView behavior="padding"`: `presentation: "modal"` рендерит
 * контент как обычное RN-дерево (нативная модальность не решает клавиатуру
 * сама), `keyboardVerticalOffset={0}` — хедер и поля в этом же flex-потоке, без
 * отдельного absolute-позиционированного слоя над ним (тот же расчёт, что у
 * `profile/edit-client.tsx`). Требует проверки на реальном устройстве —
 * симулятора/устройства в этой среде нет.
 */

import { Stack, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCreateCase } from "@/features/profile/use-portfolio-cases";
import { useThemeColors } from "@/lib/use-theme-color";

const MAX_TITLE_LEN = 120;
const MAX_DESCRIPTION_LEN = 500;

export default function CreateCaseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const createCase = useCreateCase(userId);
  const tc = useThemeColors(["mute", "ink"]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const close = () => {
    if (createCase.isPending) return;
    router.back();
  };

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length >= 2 && !createCase.isPending;
  const titleLen = title.length;
  const descriptionLen = description.length;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const created = await createCase.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || null,
        workDoneAt: null,
      });
      router.back();
      router.push(`/profile/portfolio/${created.id}` as never);
    } catch (e) {
      Alert.alert("Не удалось создать кейс", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ presentation: "modal" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-canvas"
        // Отступ от чёлки обязателен на каждом экране (DECISION владельца
        // 2026-09-06). Внутри системной модалки inset маленький, на полном
        // экране — высота статус-бара; в обоих случаях заголовок не под часами.
        style={{ paddingTop: insets.top }}
      >
        {/* Header — тот же стиль, что у formSheet-роутов (bold title + close-X). */}
        <View className="flex-row items-center gap-3 px-5 py-3">
          <AppText weight="bold" className="flex-1 text-display-sm tracking-tight text-ink">
            Новый кейс
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={close}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft"
          >
            <X size={22} weight="bold" color={tc.mute} />
          </Pressable>
        </View>

        <View className="flex-1 px-5">
          <View className="gap-8 pt-2">
            {/* ============ Название ============ */}
            <View>
              <AppText weight="semibold" className="text-body-md text-ink">
                Название
              </AppText>
              <TextInput
                value={title}
                onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE_LEN))}
                placeholder="Например, ремонт ванной с плиткой"
                placeholderTextColor={tc.mute}
                autoCapitalize="sentences"
                autoFocus
                maxLength={MAX_TITLE_LEN}
                editable={!createCase.isPending}
                className="mt-2.5 min-h-14 rounded-lg border border-hairline bg-canvas-soft px-4 text-field-md text-ink"
              />
              <AppText
                weight="mono"
                className={`mt-1.5 self-end text-mono-caption ${
                  titleLen > MAX_TITLE_LEN - 20 ? "text-warning" : "text-muted-soft"
                }`}
              >
                {titleLen} / {MAX_TITLE_LEN}
              </AppText>
            </View>

            {/* ============ Описание (не обязательно) ============ */}
            <View>
              <View className="flex-row items-baseline gap-1.5">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Описание
                </AppText>
                <AppText className="text-body-sm text-mute">не обязательно</AppText>
              </View>
              <TextInput
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, MAX_DESCRIPTION_LEN))}
                placeholder="Какие работы делали, какие материалы, что было сложного"
                placeholderTextColor={tc.mute}
                autoCapitalize="sentences"
                multiline
                maxLength={MAX_DESCRIPTION_LEN}
                editable={!createCase.isPending}
                className="mt-2.5 rounded-lg border border-hairline bg-canvas-soft px-4 py-3.5 text-body-md text-ink"
                style={{ minHeight: 128, textAlignVertical: "top" }}
              />
              <AppText
                weight="mono"
                className={`mt-1.5 self-end text-mono-caption ${
                  descriptionLen > MAX_DESCRIPTION_LEN - 50 ? "text-warning" : "text-muted-soft"
                }`}
              >
                {descriptionLen} / {MAX_DESCRIPTION_LEN}
              </AppText>
            </View>
          </View>

          {/* ============ Footer: один primary CTA + explainer о шаге ============ */}
          <View className="mt-auto gap-3 pt-6">
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={handleSubmit}
              className={`h-14 items-center justify-center rounded-full ${
                canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
              }`}
            >
              <AppText
                weight="semibold"
                className={`text-button-lg ${canSubmit ? "text-on-primary" : "text-mute"}`}
              >
                {createCase.isPending ? "Создаём…" : "Создать кейс"}
              </AppText>
            </Pressable>
            <AppText className="text-caption text-mute text-center">
              На следующем шаге добавите фото работы.
            </AppText>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
