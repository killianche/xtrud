/**
 * Редактирование профиля мастера (после онбординга).
 *
 * Доступен только мастерам. Пре-заполняется текущими данными
 * (users + master_profiles), сохраняет через простой UPDATE без RPC.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
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
import { ScreenHeader } from "@/components/ui";
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
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
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

  // Скрываем TabBar при редактировании профиля — full-screen форма с длинным
  // списком полей не должна перекрываться нижним меню (фидбэк user 2026-05-15
  // «убрать нижнее меню когда редактируешь данные»). Тот же паттерн что в
  // chats/[id].tsx и orders/new.
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

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
      <ScreenHeader
        title="Профиль мастера"
        subtitle="Изменения видны клиентам сразу."
        onBack={() => {
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
      />

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
          {/* Заголовок «Профиль мастера» + subtitle переехали в ScreenHeader. */}
          <View className="pt-2" />

          <MasterProfileFormBody
            control={control}
            errors={errors}
            isBusy={isBusy}
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
