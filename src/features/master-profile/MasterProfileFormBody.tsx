/**
 * Общая форма master profile — поля без submit-кнопки и без header'а.
 *
 * Используется в:
 *  - (onboarding)/master-profile.tsx (первичное заполнение через RPC)
 *  - (tabs)/profile/edit-master.tsx (редактирование уже существующего профиля)
 *
 * Caller предоставляет свой submit и кнопку.
 */

import { Car, Wrench } from "phosphor-react-native";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { MasterProfileFormValues } from "@/features/auth/master-profile-schema";
import { useThemeColor } from "@/lib/use-theme-color";

type FormControl = Control<MasterProfileFormValues>;

interface MasterProfileFormBodyProps {
  control: FormControl;
  errors: FieldErrors<MasterProfileFormValues>;
  isBusy: boolean;
  // cities — больше не используется (Город убран из формы 2026-05-15;
  // мастер указывает где работает через ServiceAreasSection в edit-master).
  cities?: never;
}

export function MasterProfileFormBody({
  control,
  errors,
  isBusy,
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

      {/* Город / Район / Радиус выезда УБРАНЫ (фидбэк user 2026-05-15):
          мастер не указывает свой персональный город — важно ГДЕ ОН РАБОТАЕТ,
          а это уже в ServiceAreasSection ниже («Где работаете» с multi-select
          городов и районов). Persistent cityId в users остаётся для legacy,
          новый UX не его не запрашивает. */}

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

      {/* Опыт (Радиус выезда УБРАН — поле не нужно, локации задаются
          через ServiceAreasSection «Где работаете») */}
      <View className="mt-6 px-6">
        <NumberField
          label="Опыт, лет"
          error={errors.experienceYears?.message}
          control={control}
          name="experienceYears"
          placeholder="5"
          disabled={isBusy}
        />
      </View>

      {/* Toggles — переделаны на 2-column toggleable карточки (фидбэк user
          2026-05-15: «дизайн отстойный»). Раньше были широкие row'ы с
          текстом слева и switch справа — выглядело как настройки iOS.
          Теперь карточки с lucide-иконкой, подписью и галочкой при selected. */}
      <View className="mt-6 px-6">
        <AppText weight="medium" className="text-caption text-muted">
          Что у вас есть
        </AppText>
        <View className="mt-2 flex-row gap-3">
          <Controller
            control={control}
            name="hasTools"
            render={({ field: { value, onChange } }) => (
              <ToggleCard
                Icon={Wrench}
                label="Свой инструмент"
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
              <ToggleCard
                Icon={Car}
                label="Свой транспорт"
                value={value}
                onChange={onChange}
                disabled={isBusy}
              />
            )}
          />
        </View>
      </View>
    </>
  );
}

// ----------------------------------------------------------------------------

interface ToggleCardProps {
  Icon: typeof Wrench;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function ToggleCard({ Icon, label, value, onChange, disabled }: ToggleCardProps) {
  const inkColor = useThemeColor("ink");
  const accentColor = useThemeColor("accent");
  const iconColor = value ? accentColor : inkColor;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className={`flex-1 items-center gap-2 rounded-xl border-2 p-4 active:opacity-70 ${
        value ? "border-accent bg-accent-soft" : "border-hairline bg-canvas"
      }`}
    >
      <Icon size={24} weight="bold" color={iconColor} />
      <AppText
        weight={value ? "semibold" : "medium"}
        className={`text-center text-body-sm ${value ? "text-accent" : "text-ink"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

// ----------------------------------------------------------------------------

type MPStringField = Extract<
  FieldPath<MasterProfileFormValues>,
  "firstName" | "lastName" | "cityId" | "district" | "bio"
>;
type MPNumberField = Extract<
  FieldPath<MasterProfileFormValues>,
  "experienceYears"
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

// ToggleRow удалён 2026-05-15 — заменён на ToggleCard выше (фидбэк
// «дизайн отстойный» про iOS-style switch'и).
