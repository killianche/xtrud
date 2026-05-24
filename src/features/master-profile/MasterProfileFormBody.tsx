/**
 * Общая форма master profile — поля без submit-кнопки и без header'а.
 *
 * Используется в:
 *  - (onboarding)/master-profile.tsx (первичное заполнение через RPC)
 *  - (tabs)/profile/edit-master.tsx (редактирование уже существующего профиля)
 *
 * Caller предоставляет свой submit и кнопку.
 */

import { Check, Phone, WhatsappLogo } from "phosphor-react-native";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
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

      {/* Блок «Что у вас есть» (свой инструмент / свой транспорт) удалён
          2026-05-19 по фидбэку user. Поля БД has_tools/has_transport legacy,
          остаются NULL/false; в hooks передаются false по умолчанию. */}

      {/* Контактный телефон (sprint 2026-05-20, миграция 0097). Чекбокс
          «совпадает с регистрационным» (по умолчанию true) ИЛИ явный публичный
          номер. Это номер, который видят клиенты на странице мастера и в
          карточке отклика для звонка. Регистрационный (users_private.phone)
          не показывается никому. */}
      <ContactPhoneSection control={control} errors={errors} isBusy={isBusy} />

      {/* WhatsApp — sprint 0079. Чекбокс «совпадает с контактным» + опц. явный
          номер. Если оба пусты, кнопка WhatsApp не показывается клиентам.
          Теперь «основной» = contact_phone (контактный), а не регистрационный. */}
      <WhatsappSection control={control} errors={errors} isBusy={isBusy} />
    </>
  );
}

// ============================================================================
// Contact phone section — чекбокс «совпадает с регистрационным» + conditional
// TextInput. Сохраняется в public.users.contact_phone (см. миграцию 0097).
// ============================================================================

interface ContactPhoneSectionProps {
  control: FormControl;
  errors: FieldErrors<MasterProfileFormValues>;
  isBusy: boolean;
}

function ContactPhoneSection({ control, errors, isBusy }: ContactPhoneSectionProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  const accentColor = useThemeColor("accent");
  const onPrimaryColor = useThemeColor("on-primary");
  const sameAsPhone = useWatch({ control, name: "contactSameAsPhone" });

  return (
    <View className="mt-6 px-6">
      <View className="flex-row items-center gap-2">
        <Phone size={16} weight="bold" color={accentColor} />
        <AppText weight="medium" className="text-caption text-muted">
          Контактный телефон
        </AppText>
      </View>

      {/* Checkbox row — «совпадает с регистрационным номером». */}
      <Controller
        control={control}
        name="contactSameAsPhone"
        render={({ field: { value, onChange } }) => (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value, disabled: isBusy }}
            disabled={isBusy}
            onPress={() => onChange(!value)}
            className="mt-2 flex-row items-center gap-3 rounded-md border border-hairline bg-canvas px-3 py-3 active:opacity-70"
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded border-2 ${
                value ? "border-accent bg-accent" : "border-hairline bg-canvas"
              }`}
            >
              {value ? <Check size={12} weight="bold" color={onPrimaryColor} /> : null}
            </View>
            <AppText weight="medium" className="flex-1 text-body-sm text-ink">
              Совпадает с регистрационным номером
            </AppText>
          </Pressable>
        )}
      />

      {/* Conditional: если чекбокс снят — обязательное поле ввода. */}
      {!sameAsPhone ? (
        <Controller
          control={control}
          name="contactPhone"
          render={({ field: { value, onChange, onBlur } }) => (
            <View className="mt-3">
              <TextInput
                value={value ?? ""}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="+7 999 123-45-67"
                placeholderTextColor={mutedSoftColor}
                keyboardType="phone-pad"
                inputMode="tel"
                maxLength={20}
                maxFontSizeMultiplier={1.3}
                className={`h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                  errors.contactPhone ? "border-error" : "border-hairline"
                }`}
                editable={!isBusy}
              />
              {errors.contactPhone ? (
                <AppText weight="medium" className="mt-2 text-caption text-error">
                  {errors.contactPhone.message}
                </AppText>
              ) : (
                <AppText className="mt-2 text-caption text-mute">
                  Этот номер увидят клиенты, чтобы вам позвонить.
                </AppText>
              )}
            </View>
          )}
        />
      ) : (
        <AppText className="mt-2 text-caption text-mute">
          Этот номер увидят клиенты, чтобы вам позвонить.
        </AppText>
      )}
    </View>
  );
}

// ============================================================================
// WhatsApp section — чекбокс «совпадает» + conditional TextInput.
// ============================================================================

interface WhatsappSectionProps {
  control: FormControl;
  errors: FieldErrors<MasterProfileFormValues>;
  isBusy: boolean;
}

function WhatsappSection({ control, errors, isBusy }: WhatsappSectionProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  const accentColor = useThemeColor("accent");
  // on-primary токен для check-иконки на accent-фоне (раньше был inline #ffffff).
  const onPrimaryColor = useThemeColor("on-primary");
  const sameAsPhone = useWatch({ control, name: "whatsappSameAsPhone" });

  return (
    <View className="mt-6 px-6">
      <View className="flex-row items-center gap-2">
        <WhatsappLogo size={16} weight="bold" color={accentColor} />
        <AppText weight="medium" className="text-caption text-muted">
          WhatsApp
        </AppText>
      </View>

      {/* Checkbox row — «совпадает с контактным номером».
          Sprint 2026-05-20: «основной» переименован в «контактный»,
          потому что появился contact_phone отдельно от регистрационного. */}
      <Controller
        control={control}
        name="whatsappSameAsPhone"
        render={({ field: { value, onChange } }) => (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value, disabled: isBusy }}
            disabled={isBusy}
            onPress={() => onChange(!value)}
            className="mt-2 flex-row items-center gap-3 rounded-md border border-hairline bg-canvas px-3 py-3 active:opacity-70"
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded border-2 ${
                value ? "border-accent bg-accent" : "border-hairline bg-canvas"
              }`}
            >
              {value ? <Check size={12} weight="bold" color={onPrimaryColor} /> : null}
            </View>
            <AppText weight="medium" className="flex-1 text-body-sm text-ink">
              Совпадает с контактным номером
            </AppText>
          </Pressable>
        )}
      />

      {/* Conditional: если чекбокс снят — показываем поле ввода. Пустое значит
          «WhatsApp не указан, кнопка не отображается клиентам». */}
      {!sameAsPhone ? (
        <Controller
          control={control}
          name="whatsappPhone"
          render={({ field: { value, onChange, onBlur } }) => (
            <View className="mt-3">
              <TextInput
                value={value ?? ""}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="+7 999 123-45-67 (опционально)"
                placeholderTextColor={mutedSoftColor}
                keyboardType="phone-pad"
                inputMode="tel"
                maxLength={20}
                maxFontSizeMultiplier={1.3}
                className={`h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                  errors.whatsappPhone ? "border-error" : "border-hairline"
                }`}
                editable={!isBusy}
              />
              {errors.whatsappPhone ? (
                <AppText weight="medium" className="mt-2 text-caption text-error">
                  {errors.whatsappPhone.message}
                </AppText>
              ) : (
                <AppText className="mt-2 text-caption text-mute">
                  Оставьте пустым, если WhatsApp у вас нет — кнопка не отобразится клиентам.
                </AppText>
              )}
            </View>
          )}
        />
      ) : null}
    </View>
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
