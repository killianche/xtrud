import { ClipboardText } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";

interface ActiveOrdersLimitStateProps {
  limit: number;
  onOpenOrders: () => void;
  onBack: () => void;
}

function activeOrdersNoun(value: number): string {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "активных заданий";
  const last = absolute % 10;
  if (last === 1) return "активное задание";
  if (last >= 2 && last <= 4) return "активных задания";
  return "активных заданий";
}

export function ActiveOrdersLimitState({
  limit,
  onOpenOrders,
  onBack,
}: ActiveOrdersLimitStateProps) {
  const accent = useThemeColor("accent");

  return (
    <View className="flex-1 justify-center bg-canvas px-6 py-10">
      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
          <ClipboardText size={32} weight="fill" color={accent} />
        </View>
        <AppText weight="bold" className="mt-6 text-center text-display-md text-ink">
          У вас уже {limit} {activeOrdersNoun(limit)}
        </AppText>
        <View className="mt-6 w-full rounded-lg border border-hairline bg-canvas-soft px-4 py-4">
          <AppText className="text-center text-body-md text-body">
            Закройте одно, чтобы создать новое.
          </AppText>
        </View>
      </View>

      <View className="mt-10 gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Перейти к моим заданиям"
          onPress={onOpenOrders}
          className="min-h-14 items-center justify-center rounded-md bg-primary px-5 text-on-primary active:opacity-80"
        >
          <AppText weight="semibold" className="text-button-lg text-on-primary">
            Перейти к моим заданиям
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={onBack}
          className="min-h-14 items-center justify-center rounded-md border border-hairline bg-canvas px-5 active:bg-canvas-soft"
        >
          <AppText weight="semibold" className="text-button-lg text-ink">
            Назад
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
