/**
 * Экраны публикации задания: «Публикуем задание…» (сразу после нажатия —
 * владелец, 2026-10-03: «человеку сразу показывать, что задание выложится»)
 * и результат «Задание опубликовано» / «Изменения сохранены». Общие для шага
 * проверки (review) и шага аккаунта гостя (account).
 */

import { useRouter } from "expo-router";
import { CheckCircle } from "phosphor-react-native";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useThemeColors } from "@/lib/use-theme-color";
import { ComposerScreen } from "./ComposerScreen";
import type { PublishOutcome } from "./use-publish-task";

/** Шаг «Ваш аккаунт» — регистрация гостя внутри создания задания. */
export const COMPOSER_ACCOUNT_ROUTE = "/orders/new/account";

export function PublishProgressScreen() {
  return (
    <ComposerScreen
      step="review"
      title="Публикуем задание…"
      primaryLabel=""
      onPrimary={() => undefined}
      hideActions
    >
      <View className="items-center px-5 pt-10">
        <ActivityIndicator size="large" accessibilityLabel="Публикуем задание" />
      </View>
    </ComposerScreen>
  );
}

export function PublishOutcomeScreen({ outcome }: { outcome: PublishOutcome }) {
  const router = useRouter();
  const tc = useThemeColors(["success"]);
  return (
    <ComposerScreen
      step="review"
      title={outcome.kind === "saved" ? "Изменения сохранены" : "Задание опубликовано"}
      subtitle={
        outcome.kind === "saved"
          ? undefined
          : "Специалисты из этой категории уже получают уведомление. Отклики придут в «Мои задания»."
      }
      onClose={() => router.replace("/(tabs)/orders" as never)}
      primaryLabel=""
      onPrimary={() => undefined}
      hideActions
    >
      <View className="items-center px-5 pt-6">
        <SystemIcon
          sf="checkmark.circle.fill"
          fallback={CheckCircle}
          size={72}
          weight="regular"
          color={tc.success}
        />
        <View className="mt-8 w-full gap-3">
          {outcome.orderId ? (
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onPress={() => router.replace(`/orders/${outcome.orderId}` as never)}
            >
              Открыть задание
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => router.replace("/(tabs)/orders" as never)}
          >
            К моим заданиям
          </Button>
        </View>
      </View>
    </ComposerScreen>
  );
}
