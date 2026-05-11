import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import {
  type MasterProfileFormValues,
  masterProfileSchema,
} from "@/features/auth/master-profile-schema";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useSubmitMasterProfile } from "@/features/auth/use-submit-master-profile";
import { useCities } from "@/features/cities/use-cities";

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
      // Ошибка отрендерится через submitMaster.error ниже.
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
      {/* Top bar */}
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
        <View className="px-6">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            Профиль мастера
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">
            Заполните основные поля. Категории и фото настроите позже.
          </AppText>
        </View>

        {/* Имя / Фамилия */}
        <View className="mt-8 gap-4 px-6">
          <FormField
            label="Имя"
            error={errors.firstName?.message}
            control={control}
            name="firstName"
            placeholder="Магомед"
            autoCapitalize="words"
            disabled={isBusy}
          />
          <FormField
            label="Фамилия"
            error={errors.lastName?.message}
            control={control}
            name="lastName"
            placeholder="Албогачиев"
            autoCapitalize="words"
            disabled={isBusy}
          />
        </View>

        {/* Город */}
        <View className="mt-6 px-6">
          <AppText weight="medium" className="text-caption text-muted">
            Город
          </AppText>
          {citiesLoading && (
            <View className="mt-2">
              <ActivityIndicator />
            </View>
          )}
          {cities && (
            <Controller
              control={control}
              name="cityId"
              render={({ field: { value, onChange } }) => (
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {cities.map((city) => {
                    const selected = value === city.id;
                    return (
                      <Pressable
                        key={city.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={isBusy}
                        onPress={() => onChange(city.id)}
                        className={`h-10 items-center justify-center rounded-pill border px-4 ${
                          selected
                            ? "border-accent bg-accent-soft"
                            : "border-hairline bg-canvas active:opacity-70"
                        }`}
                      >
                        <AppText
                          weight="medium"
                          className={`text-caption ${selected ? "text-accent" : "text-body"}`}
                        >
                          {city.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
          )}
          {errors.cityId && (
            <AppText weight="medium" className="mt-2 text-caption text-error">
              {errors.cityId.message}
            </AppText>
          )}
        </View>

        {/* Район */}
        <View className="mt-6 px-6">
          <FormField
            label="Район или село (опц.)"
            error={errors.district?.message}
            control={control}
            name="district"
            placeholder="Центр / Назрань-Юг"
            disabled={isBusy}
          />
        </View>

        {/* Bio */}
        <View className="mt-6 px-6">
          <Controller
            control={control}
            name="bio"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-caption text-muted">
                  О себе (опц., до 500 символов)
                </AppText>
                <TextInput
                  value={value ?? ""}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Опыт в стройке от фундамента до кровли..."
                  placeholderTextColor="#71717a"
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  textAlignVertical="top"
                  maxFontSizeMultiplier={1.3}
                  className={`mt-2 min-h-24 rounded-md border bg-canvas px-3 py-3 text-body-md text-ink ${
                    errors.bio ? "border-error" : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
                {errors.bio && (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.bio.message}
                  </AppText>
                )}
              </View>
            )}
          />
        </View>

        {/* Опыт и радиус */}
        <View className="mt-6 flex-row gap-3 px-6">
          <View className="flex-1">
            <NumberField
              label="Опыт, лет"
              error={errors.experienceYears?.message}
              control={control}
              name="experienceYears"
              placeholder="5"
              disabled={isBusy}
            />
          </View>
          <View className="flex-1">
            <NumberField
              label="Радиус выезда, км"
              error={errors.serviceRadiusKm?.message}
              control={control}
              name="serviceRadiusKm"
              placeholder="10"
              disabled={isBusy}
            />
          </View>
        </View>

        {/* Тогглы */}
        <View className="mt-6 gap-2 px-6">
          <Controller
            control={control}
            name="hasTools"
            render={({ field: { value, onChange } }) => (
              <ToggleRow
                label="Со своим инструментом"
                value={value}
                onChange={onChange}
                disabled={isBusy}
              />
            )}
          />
          <Controller
            control={control}
            name="hasTransport"
            render={({ field: { value, onChange } }) => (
              <ToggleRow
                label="На своём транспорте"
                value={value}
                onChange={onChange}
                disabled={isBusy}
              />
            )}
          />
        </View>

        {submitError && (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось сохранить. {submitError}
            </AppText>
          </View>
        )}

        {/* Submit */}
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

// ----------------------------------------------------------------------------
// Внутренние компоненты — типизированы под MasterProfileFormValues (не дженерик).
// ----------------------------------------------------------------------------

import type { Control, FieldPath } from "react-hook-form";

type MPControl = Control<MasterProfileFormValues>;
type MPStringField = Extract<
  FieldPath<MasterProfileFormValues>,
  "firstName" | "lastName" | "cityId" | "district" | "bio"
>;
type MPNumberField = Extract<
  FieldPath<MasterProfileFormValues>,
  "experienceYears" | "serviceRadiusKm"
>;

interface FormFieldProps {
  label: string;
  error: string | undefined;
  control: MPControl;
  name: MPStringField;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  disabled?: boolean;
}

function FormField(props: FormFieldProps) {
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field: { value, onChange, onBlur } }) => (
        <View>
          <AppText weight="medium" className="text-caption text-muted">
            {props.label}
          </AppText>
          <TextInput
            value={value ?? ""}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder={props.placeholder}
            placeholderTextColor="#71717a"
            autoCapitalize={props.autoCapitalize ?? "none"}
            maxFontSizeMultiplier={1.3}
            className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
              props.error ? "border-error" : "border-hairline"
            }`}
            editable={!props.disabled}
          />
          {props.error && (
            <AppText weight="medium" className="mt-2 text-caption text-error">
              {props.error}
            </AppText>
          )}
        </View>
      )}
    />
  );
}

interface NumberFieldProps {
  label: string;
  error: string | undefined;
  control: MPControl;
  name: MPNumberField;
  placeholder?: string;
  disabled?: boolean;
}

function NumberField(props: NumberFieldProps) {
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field: { value, onChange, onBlur } }) => (
        <View>
          <AppText weight="medium" className="text-caption text-muted">
            {props.label}
          </AppText>
          <TextInput
            value={String(value ?? 0)}
            onBlur={onBlur}
            onChangeText={(raw) => {
              const cleaned = raw.replace(/\D/g, "");
              onChange(cleaned === "" ? 0 : Number.parseInt(cleaned, 10));
            }}
            placeholder={props.placeholder}
            placeholderTextColor="#71717a"
            keyboardType="number-pad"
            inputMode="numeric"
            maxFontSizeMultiplier={1.3}
            className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
              props.error ? "border-error" : "border-hairline"
            }`}
            editable={!props.disabled}
          />
          {props.error && (
            <AppText weight="medium" className="mt-2 text-caption text-error">
              {props.error}
            </AppText>
          )}
        </View>
      )}
    />
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, value, onChange, disabled }: ToggleRowProps) {
  return (
    <View className="flex-row items-center justify-between rounded-md bg-surface-2 px-4 py-3">
      <AppText weight="medium" className="flex-1 text-body-md text-ink">
        {label}
      </AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: "#2563eb", false: "#e5e7eb" }}
      />
    </View>
  );
}
