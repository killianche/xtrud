import { Redirect, useRouter } from "expo-router";
import { Briefcase, MagnifyingGlass } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  type OnboardingRole,
  useCompleteOnboarding,
} from "@/features/auth/use-complete-onboarding";
import { useExitOnboarding } from "@/features/auth/use-exit-onboarding";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useThemeColors } from "@/lib/use-theme-color";

interface RoleCardProps {
  selected: boolean;
  disabled: boolean;
  title: string;
  description: string;
  Icon: typeof MagnifyingGlass;
  onPress: () => void;
}

function RoleCard({ selected, disabled, title, description, Icon, onPress }: RoleCardProps) {
  // Иконки — через токены (раньше был inline-hex #ffffff/#374151, нарушение
  // design-quality §B). on-primary = контрастный цвет для bg-accent.
  const tc = useThemeColors(["on-primary", "muted-soft"]);
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
          <Icon
            size={24}
            weight="bold"
            color={selected ? tc["on-primary"] : tc["muted-soft"]}
          />
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
  const { session, status } = useAuthSession();
  const userId = session?.user?.id;
  const { data: userRecord, isLoading: userLoading } = useUserRecord(userId);
  const completeOnboarding = useCompleteOnboarding();
  const { exit: exitOnboarding } = useExitOnboarding();

  const [selected, setSelected] = useState<OnboardingRole | null>(null);

  // Sprint 2026-05-20 P0 fix: guard от мерцания экрана role.tsx у существующих
  // юзеров при логине. Раньше AuthGate (_layout.tsx) решал редирект асинхронно
  // через router.replace() — между mount и replace юзер видел 0.5с flash
  // полностью отрендеренного UI «Как будем работать?». Теперь сам экран
  // решает «не моё дело рендериться» когда onboarding уже пройден.
  // Поведение:
  //   - анон → /(tabs) (AuthGate тоже это делает, но Redirect быстрее)
  //   - залогинен + onboarding_completed_at заполнен → /(tabs)
  //   - залогинен + onboarding не пройден → рендерим UI
  //   - userRecord ещё грузится → null (пустой экран на 50-100мс,
  //     лучше чем флэш role.tsx)
  if (status === "unauthenticated") return <Redirect href="/(tabs)" />;
  if (userLoading) return null;
  if (userRecord?.onboarding_completed_at) {
    return <Redirect href="/(tabs)" />;
  }

  const onSubmit = async () => {
    if (!selected || !userId) return;
    if (selected === "master") {
      // Sprint 2026-05-20 reorder: profile (имя/опыт/whatsapp) → categories → photo.
      // Фото логично в самом конце (Profi.ru/YouDo делают так же). master-photo
      // вызывает finalize_master_onboarding() и ставит onboarding_completed_at,
      // после чего AuthGate редиректит на /(tabs).
      router.push("/(onboarding)/master-profile");
      return;
    }
    // Client: переходим на обязательный шаг ввода имени (фидбэк user
    // 2026-05-18: «нужно, чтобы человек обязательно ввёл своё имя»).
    // Сам complete_onboarding mutation вызовется на client-name.tsx.
    router.push("/(onboarding)/client-name" as never);
  };

  const isBusy = completeOnboarding.isPending;
  const error = completeOnboarding.error?.message;

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row justify-end px-6 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить регистрацию"
          onPress={exitOnboarding}
          hitSlop={8}
          className="active:opacity-60"
        >
          <AppText weight="medium" className="text-caption text-muted">
            Отмена
          </AppText>
        </Pressable>
      </View>

      <View className="flex-1 px-6">
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Как будем работать?
        </AppText>

        <View className="mt-10 gap-3">
          <RoleCard
            selected={selected === "client"}
            disabled={isBusy}
            title="Я ищу мастера"
            description="Создавать заявки и выбирать исполнителя из откликов."
            Icon={MagnifyingGlass}
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
