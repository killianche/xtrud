/**
 * Общая форма заказа — поля без submit-кнопки и без header'а.
 *
 * Используется в:
 *  - /orders/new (создание)
 *  - /orders/edit/[id] (редактирование)
 *
 * Owner-каждый screen решает что показывать выше и ниже формы + сам submit-логика.
 */

import type { ReactNode } from "react";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { CategoryPicker } from "@/components/CategoryPicker";
import { LocationPicker } from "@/features/orders/LocationPicker";
import type { CreateOrderFormValues, OrderPriceKind } from "@/features/orders/order-schema";
import {
  orderPriceKindOptions,
  orderUrgencyOptions,
  priceKindLabel,
  urgencyLabel,
} from "@/features/orders/order-schema";
import { useThemeColor } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

/**
 * Плейсхолдер числового поля для конкретного kind.
 * Для negotiable поле скрывается, для остальных подсказка отражает смысл.
 */
function priceFieldLabel(k: OrderPriceKind): string {
  switch (k) {
    case "fixed":
      return "Сумма, ₽";
    case "from":
      return "От, ₽";
    case "up_to":
      return "До, ₽";
    case "negotiable":
      return "";
  }
}

type FormControl = Control<CreateOrderFormValues>;

interface OrderFormBodyProps {
  control: FormControl;
  errors: FieldErrors<CreateOrderFormValues>;
  budgetKind: CreateOrderFormValues["budgetKind"];
  isBusy: boolean;
  categories: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon">[] | undefined;
  cities: Pick<Tables<"cities">, "id" | "name">[] | undefined;
  /** Если задана — категорию нельзя сменить (после создания заказа). */
  lockCategory?: boolean;
  /**
   * Слот «Фото» — рендерится после описания, перед категорией (дизайн-спека
   * ORDER_PHOTOS_DESIGN.md §3.1). Передаётся только из формы создания заказа
   * (new.tsx) с компонентом <OrderPhotosPicker/>. Edit-экран фото не передаёт →
   * слот не рендерится, поведение edit не меняется.
   */
  photosSlot?: ReactNode;
  /**
   * Wizard-режим (2 шага):
   *   1 = описание (название + детали) + выбор категории на ОДНОМ экране
   *   2 = бюджет + город + район + срочность
   * Если не задан — рендерим все секции (для edit-экрана).
   */
  step?: 1 | 2 | 3;
}

export function OrderFormBody({
  control,
  errors,
  budgetKind,
  isBusy,
  categories,
  cities,
  lockCategory,
  step,
  photosSlot,
}: OrderFormBodyProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  // Wizard 2 шага: step 1 = описание + категория на одном экране, step 2 = бюджет/город.
  const showContent = step === undefined || step === 1;
  const showCategory = step === undefined || step === 1;
  const showBudgetCity = step === undefined || step === 2;
  return (
    <>
      {/* Title + Description — Шаг 1 (новый: сначала «что нужно сделать») */}
      {showContent && (
        <View className="px-6">
          <TextField
            label="Опишите задачу в двух словах"
            placeholder="Заменить смеситель на кухне"
            control={control}
            name="title"
            error={errors.title?.message}
            disabled={isBusy}
            autoCapitalize="sentences"
          />
        </View>
      )}

      {showContent && (
        <View className="mt-6 px-6">
          <Controller
            control={control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="semibold" className="text-body-sm text-ink">
                  Подробности <AppText className="text-body-sm text-mute">(необязательно)</AppText>
                </AppText>
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Что важно знать мастеру — детали, сроки, особенности…"
                  placeholderTextColor={mutedSoftColor}
                  multiline
                  numberOfLines={5}
                  maxLength={2000}
                  textAlignVertical="top"
                  maxFontSizeMultiplier={1.3}
                  className={`mt-2 min-h-36 rounded-lg border bg-canvas px-4 py-3.5 text-body-md text-ink ${
                    errors.description ? "border-error" : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
                {errors.description && (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.description.message}
                  </AppText>
                )}
                {value && value.length > 0 ? (
                  <View className="mt-1.5 flex-row justify-end">
                    <AppText weight="mono" className="text-mono-caption text-mute">
                      {value.length} / 2000
                    </AppText>
                  </View>
                ) : null}
              </View>
            )}
          />
        </View>
      )}

      {/* Фото заказа — после описания (визуальное продолжение «что нужно»).
          Слот передаётся только из new.tsx (см. photosSlot). */}
      {showContent && photosSlot ? photosSlot : null}

      {/* Группа-разделитель: «о задаче» ↑ | «категория и место» ↓.
          Full-bleed hairline (Airbnb/depop section grouping). Только в полной
          форме (new/edit), в wizard-режиме секции и так на разных шагах. */}
      {step === undefined ? <View className="mt-8 h-px bg-hairline" /> : null}

      {/* Категория — Шаг 1 (CategoryPicker — compact selector + bottom-sheet
          с typeahead). 2-col grid плиток выглядел перегружено для 32 категорий.
          Lazyweb-вывод: Klarna/Profi/Яндекс используют compact + bottom-sheet. */}
      {showCategory && (
        <View className={showContent ? "mt-6 px-6" : "px-6"}>
          <AppText weight="semibold" className="text-body-sm text-ink">
            Категория
          </AppText>
          <Controller
            control={control}
            name="l2Id"
            render={({ field: { value, onChange } }) => (
              <CategoryPicker
                value={value}
                onChange={onChange}
                disabled={isBusy || lockCategory}
                error={errors.l2Id?.message}
              />
            )}
          />
          {lockCategory && (
            <AppText className="mt-2 text-caption text-muted">
              Категорию нельзя сменить после публикации.
            </AppText>
          )}
        </View>
      )}

      {/* Локация — единый иерархический picker (город + район + село)
          в bottom-sheet. Заменил две плоские chip-row секции (Город / Район).
          Подход взят из Ingush-Business `LocationSheet`. */}
      {showBudgetCity && (
        <View className={showContent ? "mt-6 px-6" : "px-6"}>
          <AppText weight="semibold" className="text-body-sm text-ink">
            Где находится задача
          </AppText>
          <Controller
            control={control}
            name="cityId"
            render={({ field: { value: cityValue, onChange: setCity } }) => (
              <Controller
                control={control}
                name="district"
                render={({ field: { value: districtValue, onChange: setDistrict } }) => (
                  <LocationPicker
                    cityId={cityValue}
                    district={districtValue}
                    cities={cities}
                    disabled={isBusy}
                    error={errors.cityId?.message ?? errors.district?.message}
                    onChange={(next) => {
                      setCity(next.cityId);
                      setDistrict(next.district);
                    }}
                  />
                )}
              />
            )}
          />
        </View>
      )}

      {/* Группа-разделитель: «категория и место» ↑ | «сроки и бюджет» ↓. */}
      {step === undefined ? <View className="mt-8 h-px bg-hairline" /> : null}

      {/* Сроки — Шаг 2. Короткий заголовок «Сроки» по фидбэку user 2026-05-14
          (длинное «Готовность мастера взяться за работу» избыточно: chips
          «Срочно / На неделе / В этом месяце / Не срочно» сами достаточно
          самообъясняющие). */}
      {showBudgetCity && (
        <View className="mt-6 px-6">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Сроки
          </AppText>
          <Controller
            control={control}
            name="urgency"
            render={({ field: { value, onChange } }) => (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {orderUrgencyOptions.map((u) => {
                  const selected = value === u;
                  return (
                    <Pressable
                      key={u}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isBusy}
                      onPress={() => onChange(u)}
                      className={`h-11 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-body-md ${selected ? "text-accent" : "text-ink"}`}
                      >
                        {urgencyLabel(u)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>
      )}

      {/* Бюджет — 4 chip-варианта + одно числовое поле. Раньше был «Диапазон»
          с двумя полями (от/до) — выпилили по фидбэку user 2026-05-15
          «убрать диапазоны из всех заказов». См. order-schema.ts. */}
      {showBudgetCity && (
        <View className="mt-6 px-6">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Бюджет
          </AppText>
          <Controller
            control={control}
            name="budgetKind"
            render={({ field: { value, onChange } }) => (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {orderPriceKindOptions.map((k) => {
                  const selected = value === k;
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isBusy}
                      onPress={() => onChange(k)}
                      className={`h-11 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-body-md ${selected ? "text-accent" : "text-ink"}`}
                      >
                        {priceKindLabel(k)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {budgetKind != null && budgetKind !== "negotiable" && (
            <View className="mt-3">
              <NumberField
                label={priceFieldLabel(budgetKind)}
                placeholder="1500"
                control={control}
                name="budgetValue"
                error={errors.budgetValue?.message}
                disabled={isBusy}
              />
            </View>
          )}
        </View>
      )}

      {/* Ваше имя — необязательное. Так вас увидит мастер в заказе (вместо
          профиля заказчика). По умолчанию подставлено имя из регистрации;
          можно изменить или стереть. Телефон НЕ собираем — модель «номер
          скрыт» не меняется (решение владельца 2026-05-24). */}
      {showBudgetCity && (
        <View className="mt-6 px-6">
          <TextField
            label="Ваше имя (необязательно)"
            placeholder="Как вас называть"
            control={control}
            name="contactName"
            error={errors.contactName?.message}
            disabled={isBusy}
            autoCapitalize="words"
          />
        </View>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------

type StringFieldName = Extract<
  FieldPath<CreateOrderFormValues>,
  "title" | "description" | "district" | "contactName"
>;
type NumberFieldName = Extract<FieldPath<CreateOrderFormValues>, "budgetValue">;

interface TextFieldProps {
  label: string;
  placeholder?: string;
  control: FormControl;
  name: StringFieldName;
  error: string | undefined;
  disabled?: boolean;
  autoCapitalize?: "none" | "sentences" | "words";
}

function TextField(props: TextFieldProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field: { value, onChange, onBlur } }) => (
        <View>
          <AppText weight="semibold" className="text-body-sm text-ink">
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
            className={`mt-2 h-14 rounded-lg border bg-canvas px-4 text-body-md text-ink ${
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
  placeholder?: string;
  control: FormControl;
  name: NumberFieldName;
  error: string | undefined;
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
          <AppText weight="semibold" className="text-body-sm text-ink">
            {props.label}
          </AppText>
          <TextInput
            value={value === null || value === undefined ? "" : String(value)}
            onBlur={onBlur}
            onChangeText={(raw) => {
              const cleaned = raw.replace(/\D/g, "");
              onChange(cleaned === "" ? null : Number.parseInt(cleaned, 10));
            }}
            placeholder={props.placeholder}
            placeholderTextColor={mutedSoftColor}
            keyboardType="number-pad"
            inputMode="numeric"
            maxFontSizeMultiplier={1.3}
            className={`mt-2 h-14 rounded-lg border bg-canvas px-4 text-body-md text-ink ${
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
