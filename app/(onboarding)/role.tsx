import { useRouter } from "expo-router";
import { Briefcase, Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  type OnboardingRole,
  useCompleteOnboarding,
} from "@/features/auth/use-complete-onboarding";

interface RoleCardProps {
  selected: boolean;
  disabled: boolean;
  title: string;
  description: string;
  Icon: typeof Search;
  onPress: () => void;
}

function RoleCard({ selected, disabled, title, description, Icon, onPress }: RoleCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={onPress}
      className={`rounded-xl border p-5 active:opacity-80 ${
        selected ? "border-accent bg-accent-soft" : "border-hairline bg-surface-2"
      }`}
    >
      <View className="flex-row items-start gap-4">
        <View
          className={`h-12 w-12 items-center justify-center rounded-lg ${
            selected ? "bg-accent" : "bg-surface-3"
          }`}
        >
          <Icon size={24} strokeWidth={1.75} color={selected ? "#ffffff" : "#374151"} />
        </View>
        <View className="flex-1">
          <AppText weight="semibold" className="text-title-md text-ink">
            {title}
          </AppText>
          <AppText className="mt-1 text-body-sm text-body">{description}</AppText>
        </View>
      </View>
    </Pressable>
  );
}

export default function RoleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const completeOnboarding = useCompleteOnboarding();

  const [selected, setSelected] = useState<OnboardingRole | null>(null);

  const onSubmit = async () => {
    if (!selected || !userId) return;
    if (selected === "master") {
      // Master wizard: categories → photo → profile. onboarding_completed_at
      // выставляется по завершению визарда через RPC complete_master_onboarding.
      // mode=onboarding меняет поведение master-categories.tsx: save → push next,
      // а не router.back() как в settings-режиме.
      router.push("/(onboarding)/master-categories?mode=onboarding");
      return;
    }
    // Client: онбординг завершён немедленно.
    try {
      await completeOnboarding.mutateAsync({ userId, role: selected });
    } catch (_e) {
      // Ошибка показывается через completeOnboarding.error в UI ниже.
    }
  };

  const isBusy = completeOnboarding.isPending;
  const error = completeOnboarding.error?.message;

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-1 px-6">
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Как будем работать?
        </AppText>
        <AppText className="mt-3 text-body-md text-body">
          Можно изменить позже в настройках.
        </AppText>

        <View className="mt-10 gap-3">
          <RoleCard
            selected={selected === "client"}
            disabled={isBusy}
            title="Я ищу мастера"
            description="Создавать заявки и выбирать исполнителя из откликов."
            Icon={Search}
            onPress={() => setSelected("client")}
          />
          <RoleCard
            selected={selected === "master"}
            disabled={isBusy}
            title="Я мастер"
            description="Принимать заявки и отправлять отклики клиентам. Профиль настраивается на следующем шаге."
            Icon={Briefcase}
            onPress={() => setSelected("master")}
          />
        </View>

        {error && (
          <AppText weight="medium" className="mt-4 text-caption text-error">
            {error}
          </AppText>
        )}
      </View>

      <View className="px-6">
        <Pressable
          accessibilityRole="button"
          disabled={!selected || isBusy || !userId}
          onPress={onSubmit}
          className={`h-12 items-center justify-center rounded-md ${
            selected && !isBusy && userId ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            {isBusy ? "Сохраняем..." : "Продолжить"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
