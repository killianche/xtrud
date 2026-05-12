import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import {
  type MasterProfileFormValues,
  masterProfileSchema,
} from "@/features/auth/master-profile-schema";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useSubmitMasterProfile } from "@/features/auth/use-submit-master-profile";
import { useCities } from "@/features/cities/use-cities";
import { MasterProfileFormBody } from "@/features/master-profile/MasterProfileFormBody";

export default function MasterProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: cities, isLoading: citiesLoading } = useCities();
  const submitMaster = useSubmitMasterProfile();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<MasterProfileFormValues>({
    resolver: zodResolver(masterProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      cityId: "",
      district: "",
      bio: "",
      experienceYears: 0,
      hasTools: false,
      hasTransport: false,
      serviceRadiusKm: 10,
    },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!userId) return;
    try {
      await submitMaster.mutateAsync({ userId, ...values });
      // onSuccess → invalidate userRecord → AuthGate увидит
      // onboarding_completed_at и редиректнет на /(tabs).
    } catch (_e) {
      // submitMaster.error
    }
  });

  const isBusy = submitMaster.isPending;
  const submitError = submitMaster.error?.message;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pb-6">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            Профиль мастера
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">
            Заполните основные поля. Категории и фото настроите позже.
          </AppText>
        </View>

        <MasterProfileFormBody
          control={control}
          errors={errors}
          isBusy={isBusy || citiesLoading}
          cities={cities ?? undefined}
        />

        {submitError && (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось сохранить. {submitError}
            </AppText>
          </View>
        )}

        <View className="mt-8 px-6">
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || isBusy || !userId || !cities}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              isValid && !isBusy && userId && cities
                ? "bg-primary active:opacity-80"
                : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Сохраняем..." : "Завершить"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
