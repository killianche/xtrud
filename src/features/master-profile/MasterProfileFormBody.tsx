/**
 * Общая форма master profile — поля без submit-кнопки и без header'а.
 *
 * Используется в:
 *  - (onboarding)/master-profile.tsx (первичное заполнение через RPC)
 *  - (tabs)/profile/edit-master.tsx (редактирование уже существующего профиля)
 *
 * Caller предоставляет свой submit и кнопку.
 */

import type { Control, FieldErrors, FieldPath } from "react-hook-form";
import { Controller } from "react-hook-form";
import { ActivityIndicator, Pressable, Switch, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { MasterProfileFormValues } from "@/features/auth/master-profile-schema";
import { useThemeColor } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

type FormControl = Control<MasterProfileFormValues>;

interface MasterProfileFormBodyProps {
  control: FormControl;
  errors: FieldErrors<MasterProfileFormValues>;
  isBusy: boolean;
  cities: Pick<Tables<"cities">, "id" | "name">[] | undefined;
}

export function MasterProfileFormBody({
  control,
  errors,
  isBusy,
  cities,
}: MasterProfileFormBodyProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  return (
    <>
      {/* Имя / Фамилия */}
      <View className="gap-4 px-6">
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
        {!cities && (
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

      {/* Bio с char-counter */}
      <View className="mt-6 px-6">
        <Controller
          control={control}
          name="bio"
          render={({ field: { value, onChange, onBlur } }) => {
            const len = (value ?? "").length;
            return (
              <View>
                <View className="flex-row items-center justify-between">
                  <AppText weight="medium" className="text-caption text-muted">
                    О себе (опц.)
                  </AppText>
                  <AppText
                    className={`text-caption-xs ${len > 450 ? "text-warning" : "text-muted-soft"}`}
                  >
                    {len} / 500
                  </AppText>
                </View>
                <TextInput
                  value={value ?? ""}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Опыт в стройке от фундамента до кровли..."
                  placeholderTextColor={mutedSoftColor}
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
            );
          }}
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
    </>
  );
}

// ----------------------------------------------------------------------------

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
  control: FormControl;
  name: MPStringField;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  disabled?: boolean;
}

function FormField(props: FormFieldProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
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
            placeholderTextColor={mutedSoftColor}
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
  control: FormControl;
  name: MPNumberField;
  placeholder?: string;
  disabled?: boolean;
}

function NumberField(props: NumberFieldProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
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
            placeholderTextColor={mutedSoftColor}
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
