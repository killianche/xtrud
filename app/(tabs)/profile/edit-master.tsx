/**
 * Редактирование профиля мастера (после онбординга).
 *
 * Доступен только мастерам. Пре-заполняется текущими данными
 * (users + master_profiles), сохраняет через простой UPDATE без RPC.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { SignIn, User } from "phosphor-react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import {
  type MasterProfileFormValues,
  masterProfileSchema,
} from "@/features/auth/master-profile-schema";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useCities } from "@/features/cities/use-cities";
import { MasterProfileFormBody } from "@/features/master-profile/MasterProfileFormBody";
import { UsernameField } from "@/features/auth/UsernameField";
import { setUsernameErrorMessage, useSetUsername } from "@/features/auth/use-username";
import { useUpdateMasterProfile } from "@/features/master-profile/use-update-master-profile";
import { ServiceAreasSection } from "@/features/master-profile/ServiceAreasSection";
import { supabase } from "@/lib/supabase";
import { useSafeBack } from "@/lib/use-safe-back";
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
  const setUsernameMut = useSetUsername();

  // Юзернейм — отдельное состояние (не часть react-hook-form). Префилл из user.
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameValid, setUsernameValid] = useState(true);
  const usernameChanged = (usernameValue ?? "") !== (user?.username ?? "");

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
      whatsappPhone: "",
      contactPhone: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (!user || !masterProfile) return;
    // contact_phone prefill: подставляем явно сохранённый номер. Если в БД пусто
    // (старые мастера на «совпадает с регистрационным») — поле останется пустым,
    // и мастер обязан ввести номер (поле теперь required). Регистрационный номер
    // НЕ подставляем. Каст through unknown — типы регенерятся следующим типгеном.
    const contactPhoneFromDb = (user as unknown as { contact_phone: string | null })
      .contact_phone;

    reset({
      firstName: user.first_name ?? "",
      lastName: user.last_name ?? "",
      cityId: user.city_id ?? "",
      district: user.district ?? "",
      bio: masterProfile.bio ?? "",
      experienceYears: masterProfile.experience_years ?? 0,
      whatsappPhone: masterProfile.whatsapp_phone ?? "",
      contactPhone:
        typeof contactPhoneFromDb === "string" ? contactPhoneFromDb : "",
    });
    setUsernameValue(user.username ?? "");
  }, [user, masterProfile, reset]);

  // safeBack — fallback /(tabs)/profile, потому что edit-master открывается
  // из /profile, и при cross-stack push'е expo-router теряет history.
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const onSubmit = handleSubmit(async (values) => {
    if (!userId) return;
    try {
      // Сначала юзернейм (если менялся), потом профиль.
      if (usernameChanged && usernameValue.trim().length > 0) {
        await setUsernameMut.mutateAsync({ username: usernameValue, userId });
      }
      await updateMaster.mutateAsync({ userId, ...values });
      goBack();
    } catch (e) {
      Alert.alert(
        "Не удалось сохранить",
        e instanceof Error ? setUsernameErrorMessage(e.message) : "Ошибка сервера",
      );
    }
  });

  const isBusy = updateMaster.isPending || setUsernameMut.isPending;
  const submitError = updateMaster.error?.message;
  // Кнопка активна, если форма валидна И (поменялись данные формы ИЛИ юзернейм),
  // и юзернейм валиден.
  const canSave = isValid && usernameValid && (isDirty || usernameChanged) && !isBusy && !citiesLoading;
  const tc = useThemeColors(["accent"]);

  // Выход с подтверждением, если есть несохранённые правки.
  const onCancel = () => {
    if ((isDirty || usernameChanged) && !isBusy) {
      Alert.alert("Есть несохранённые изменения", "Выйти без сохранения?", [
        { text: "Остаться", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => goBack() },
      ]);
      return;
    }
    goBack();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas-soft"
      style={{ paddingTop: insets.top }}
    >
      {/* Навбар «Отмена / Профиль мастера / Сохранить» — единый паттерн с
          edit-client (Lazyweb: Bluesky / Lawfully). Save закреплён сверху и
          всегда доступен — у мастера длинная форма, нижняя кнопка уезжала. */}
      <View className="flex-row items-center justify-between border-hairline border-b bg-canvas px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отмена"
          onPress={onCancel}
          hitSlop={12}
          className="min-w-[64px] active:opacity-60"
        >
          <AppText weight="medium" className="text-body-md text-ink">
            Отмена
          </AppText>
        </Pressable>
        <AppText weight="semibold" className="text-title-md text-ink">
          Профиль мастера
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Сохранить"
          onPress={onSubmit}
          disabled={!canSave}
          hitSlop={12}
          className="min-w-[64px] items-end active:opacity-60"
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={tc.accent} />
          ) : (
            <AppText
              weight="semibold"
              className={`text-body-md ${canSave ? "text-accent" : "text-muted-soft"}`}
            >
              Сохранить
            </AppText>
          )}
        </Pressable>
      </View>

      {/* Анон → guest empty state с CTA. До 2026-05-27 здесь висел бесконечный
          спиннер (useUserRecord без userId возвращает isLoading=false, data=undefined,
          и условие `!user` бесконечно держало ActivityIndicator). Apple HIG:
          никаких тупиков без понятного next-step. */}
      {!userId && <EditMasterGuestState onLogin={() => router.push("/(auth)/phone" as never)} />}

      {/* Реальный loading — только когда есть userId и данные ещё грузятся. */}
      {userId && (profileLoading || !user) && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}

      {userId && !profileLoading && user && !isMaster && (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-body-md text-error">
            Этот экран доступен только мастерам.
          </AppText>
        </View>
      )}

      {userId && !profileLoading && user && isMaster && !masterProfile && (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-body-md text-muted">
            Профиль мастера ещё не создан. Завершите онбординг.
          </AppText>
        </View>
      )}

      {userId && !profileLoading && user && isMaster && masterProfile && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Заголовок «Профиль мастера» — в навбаре сверху. Небольшой воздух. */}
          <View className="pt-4" />

          <MasterProfileFormBody
            control={control}
            errors={errors}
            isBusy={isBusy}
          />

          {/* Юзернейм — уникальный публичный @идентификатор, можно менять. */}
          <View className="mt-6 px-6">
            <UsernameField
              value={usernameValue}
              onChange={setUsernameValue}
              onValidityChange={setUsernameValid}
              currentUsername={user.username ?? null}
              editable={!isBusy}
            />
          </View>

          {/* «Прайс-лист» (MasterServicesSection) удалён из редактора профиля
              по фидбэку user 2026-05-15: «прайс-лист отсюда полностью убрать,
              у нас есть отдельный блок Услуги и цены, там всё это записывается».
              Точка входа в редактирование услуг — карточка «Услуги и цены» на
              /profile, ведёт на отдельный экран. */}

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
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ----------------------------------------------------------------------------
// EditMasterGuestState — что показываем анониму вместо бесконечного спиннера.
// Раньше при заходе без auth висел синий ActivityIndicator без таймаута,
// потому что useUserRecord без userId не грузит данные, но `!user` оставалось
// true → loading-блок не схлопывался. Apple HIG требует понятный next-step.
// ----------------------------------------------------------------------------

function EditMasterGuestState({ onLogin }: { onLogin: () => void }) {
  const tc = useThemeColors(["muted-soft", "on-primary"]);
  return (
    <View className="flex-1 items-center justify-center px-6">
      <User size={48} weight="regular" color={tc["muted-soft"]} />
      <AppText
        weight="semibold"
        className="mt-4 text-title-md text-ink text-center"
      >
        Войдите в аккаунт
      </AppText>
      <AppText className="mt-2 text-body-sm text-mute text-center">
        Редактирование профиля мастера доступно только после входа по номеру
        телефона.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Войти по телефону"
        onPress={onLogin}
        className="mt-6 flex-row items-center justify-center gap-2 h-12 px-6 rounded-md bg-primary active:opacity-80"
      >
        <SignIn size={18} weight="bold" color={tc["on-primary"]} />
        <AppText weight="semibold" className="text-button-lg text-on-primary">
          Войти по телефону
        </AppText>
      </Pressable>
    </View>
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
