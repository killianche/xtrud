/**
 * Редактирование профиля мастера (после онбординга).
 *
 * Доступен только мастерам. Пре-заполняется текущими данными
 * (users + master_profiles), сохраняет через простой UPDATE без RPC.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import {
  type MasterProfileFormValues,
  masterProfileSchema,
} from "@/features/auth/master-profile-schema";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useCities } from "@/features/cities/use-cities";
import { MasterProfileFormBody } from "@/features/master-profile/MasterProfileFormBody";
import { useUpdateMasterProfile } from "@/features/master-profile/use-update-master-profile";
import { MasterServicesSection } from "@/features/master-services/MasterServicesSection";
import { ServiceAreasSection } from "@/features/master-profile/ServiceAreasSection";
import { supabase } from "@/lib/supabase";
import { useThemeColor } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

export default function EditMasterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: user } = useUserRecord(userId);
  const { data: masterProfile, isLoading: profileLoading } = useMyMasterProfile(userId);
  const { data: cities, isLoading: citiesLoading } = useCities();
  const updateMaster = useUpdateMasterProfile();
  const inkColor = useThemeColor("ink");

  const isMaster = user?.is_master === true;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid, isDirty },
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

  useEffect(() => {
    if (!user || !masterProfile) return;
    reset({
      firstName: user.first_name ?? "",
      lastName: user.last_name ?? "",
      cityId: user.city_id ?? "",
      district: user.district ?? "",
      bio: masterProfile.bio ?? "",
      experienceYears: masterProfile.experience_years ?? 0,
      hasTools: masterProfile.has_tools,
      hasTransport: masterProfile.has_transport,
      serviceRadiusKm: masterProfile.service_radius_km,
    });
  }, [user, masterProfile, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!userId) return;
    try {
      await updateMaster.mutateAsync({ userId, ...values });
      router.back();
    } catch (_e) {
      // updateMaster.error
    }
  });

  const isBusy = updateMaster.isPending;
  const submitError = updateMaster.error?.message;

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
          onPress={() => {
            if (isDirty && !isBusy) {
              Alert.alert("Есть несохранённые изменения", "Выйти без сохранения?", [
                { text: "Остаться", style: "cancel" },
                {
                  text: "Выйти",
                  style: "destructive",
                  onPress: () => router.back(),
                },
              ]);
              return;
            }
            router.back();
          }}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={inkColor} />
        </Pressable>
      </View>

      {(profileLoading || !user) && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}

      {!profileLoading && user && !isMaster && (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-body-md text-error">
            Этот экран доступен только мастерам.
          </AppText>
        </View>
      )}

      {!profileLoading && user && isMaster && !masterProfile && (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-body-md text-muted">
            Профиль мастера ещё не создан. Завершите онбординг.
          </AppText>
        </View>
      )}

      {!profileLoading && user && isMaster && masterProfile && (
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
              Изменения видны клиентам сразу.
            </AppText>
          </View>

          <MasterProfileFormBody
            control={control}
            errors={errors}
            isBusy={isBusy || citiesLoading}
            cities={cities ?? undefined}
          />

          <View className="mt-8">
            <MasterServicesSection masterId={userId} />
          </View>

          {/* P1-3: где работает мастер (multi-select городов и районов). */}
          <View className="mt-8">
            <ServiceAreasSection masterId={userId} />
          </View>

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
              disabled={!isValid || !isDirty || isBusy || !cities}
              onPress={onSubmit}
              className={`h-12 items-center justify-center rounded-md ${
                isValid && isDirty && !isBusy && cities
                  ? "bg-primary active:opacity-80"
                  : "bg-surface-3"
              }`}
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                {isBusy ? "Сохраняем..." : "Сохранить"}
              </AppText>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ----------------------------------------------------------------------------

function useMyMasterProfile(userId: string | null | undefined) {
  return useQuery<Tables<"master_profiles"> | null>({
    queryKey: ["master-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}
