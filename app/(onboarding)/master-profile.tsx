import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import {
  type MasterProfileFormValues,
  masterProfileSchema,
} from "@/features/auth/master-profile-schema";
import { UsernameField } from "@/features/auth/UsernameField";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useExitOnboarding } from "@/features/auth/use-exit-onboarding";
import { useSubmitMasterProfile } from "@/features/auth/use-submit-master-profile";
import { useUserRecord } from "@/features/auth/use-user-record";
import { setUsernameErrorMessage, useSetUsername } from "@/features/auth/use-username";
import { useCities } from "@/features/cities/use-cities";
import { MasterProfileFormBody } from "@/features/master-profile/MasterProfileFormBody";

export default function MasterProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  // citiesLoading — отдельная переменная вместо `!cities`. Раньше пустой массив `[]`
  // или undefined одинаково блокировали submit. Сейчас blocker = только пока запрос
  // фактически в полёте.
  const { isLoading: citiesLoading } = useCities();
  const submitMaster = useSubmitMasterProfile();
  const setUsernameMut = useSetUsername();
  const scrollRef = useRef<ScrollView>(null);
  const { exit: exitOnboarding } = useExitOnboarding();

  // Юзернейм — закрепляется один раз, перед сохранением профиля. Если у юзера
  // он УЖЕ есть (клиент стал мастером, чтобы откликнуться — путь из orders/[id]),
  // поле не показываем и повторно не ставим (set_username бросил бы ошибку).
  const { data: userRec } = useUserRecord(userId);
  const hasUsername = !!userRec?.username;
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameValid, setUsernameValid] = useState(false);
  const usernameOk = hasUsername || usernameValid;

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
      // Контактный телефон — обязателен; WhatsApp — опционально. Оба пустые по
      // умолчанию (регистрационный номер не подставляется). Решение владельца 2026-05-24.
      whatsappPhone: "",
      contactPhone: "",
    },
    mode: "onChange",
  });

  // Sprint 2026-05-20 reorder: profile теперь ПЕРВЫЙ шаг (1/3), не последний.
  // submitMaster сохраняет данные через client + RLS, БЕЗ финализации онбординга.
  // Финализация — на photo-шаге (3/3) через finalize_master_onboarding RPC.
  const onSubmit = handleSubmit(
    async (values) => {
      if (!userId) return;
      try {
        // Закрепляем юзернейм (один раз) — только если его ещё нет.
        if (!hasUsername) {
          await setUsernameMut.mutateAsync({ username: usernameValue, userId });
        }
        await submitMaster.mutateAsync({ userId, ...values });
        // Сохранили → идём на categories (2/3). Используем object-syntax
        // вместо querystring — это надёжнее в Expo Router 6+, querystring
        // мог дропаться при некоторых route-resolution edge cases.
        router.push({
          pathname: "/(onboarding)/master-categories",
          params: { mode: "onboarding" },
        } as never);
      } catch (e) {
        // setUsernameErrorMessage пропускает не-username ошибки как есть.
        const message =
          e instanceof Error ? setUsernameErrorMessage(e.message) : "Неизвестная ошибка сервера.";
        console.error("[MasterProfile submit]", e);
        Alert.alert("Не удалось сохранить профиль", message);
      }
    },
    (formErrors) => {
      // Validation failed — скроллим к первой видимой ошибке, чтобы юзер
      // понял что от него хотят. Без этого кнопка молча ничего не делала.
      console.warn("[MasterProfile validation]", formErrors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    },
  );

  const isBusy = submitMaster.isPending || setUsernameMut.isPending;
  const submitError = submitMaster.error?.message;
  const canSubmit = isValid && usernameOk && !isBusy && !!userId && !citiesLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      <View className="py-4">
        <OnboardingProgress step={1} total={3} onCancel={exitOnboarding} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pb-6">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            Расскажите о себе
          </AppText>
        </View>

        <MasterProfileFormBody
          control={control}
          errors={errors}
          isBusy={isBusy}
        />

        {/* Юзернейм — уникальный публичный идентификатор, закрепляется один раз.
            Не показываем, если у пользователя он уже есть. */}
        {!hasUsername ? (
          <View className="mt-6 px-6">
            <UsernameField
              value={usernameValue}
              onChange={setUsernameValue}
              onValidityChange={setUsernameValid}
              editable={!isBusy}
            />
          </View>
        ) : null}

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
            disabled={!canSubmit}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Сохраняем..." : "Продолжить"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
