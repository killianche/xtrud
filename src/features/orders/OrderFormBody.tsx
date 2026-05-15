/**
 * Общая форма заказа — поля без submit-кнопки и без header'а.
 *
 * Используется в:
 *  - /orders/new (создание)
 *  - /orders/edit/[id] (редактирование)
 *
 * Owner-каждый screen решает что показывать выше и ниже формы + сам submit-логика.
 */

import type { Control, FieldErrors, FieldPath } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { CategoryPicker } from "@/components/CategoryPicker";
import { LocationPicker } from "@/features/orders/LocationPicker";
import type { CreateOrderFormValues } from "@/features/orders/order-schema";
import {
  orderBudgetModeOptions,
  orderUrgencyOptions,
  urgencyLabel,
} from "@/features/orders/order-schema";
import { useThemeColor } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

export function budgetModeLabel(m: (typeof orderBudgetModeOptions)[number]): string {
  switch (m) {
    case "exact":
      return "Точная цена";
    case "range":
      return "Диапазон";
    case "negotiable":
      return "Договорная";
  }
}

type FormControl = Control<CreateOrderFormValues>;

interface OrderFormBodyProps {
  control: FormControl;
  errors: FieldErrors<CreateOrderFormValues>;
  budgetMode: CreateOrderFormValues["budgetMode"];
  isBusy: boolean;
  categories: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon">[] | undefined;
  cities: Pick<Tables<"cities">, "id" | "name">[] | undefined;
  /** Если задана — категорию нельзя сменить (после создания заказа). */
  lockCategory?: boolean;
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
  budgetMode,
  isBusy,
  categories,
  cities,
  lockCategory,
  step,
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
            label="В двух словах"
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
                  className={`mt-2 min-h-32 rounded-md border bg-canvas px-3 py-3 text-body-md text-ink ${
                    errors.description ? "border-error" : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
                {errors.description && (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.description.message}
                  </AppText>
                )}
              </View>
            )}
          />
        </View>
      )}

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
            <AppText className="mt-2 text-caption-xs text-muted">
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

      {/* Сроки — Шаг 2. Короткий заголовок «Сроки» по фидбэку user 2026-05-14
          (длинное «Готовность мастера взяться за работу» избыточно: chips
          «Срочно / На неделе / В этом месяце / Неважно» сами достаточно
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
                      className={`h-10 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-ink bg-ink"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
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

      {/* Бюджет — Шаг 3 */}
      {showBudgetCity && (
        <View className="mt-6 px-6">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Бюджет
          </AppText>
          <Controller
            control={control}
            name="budgetMode"
            render={({ field: { value, onChange } }) => (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {orderBudgetModeOptions.map((m) => {
                  const selected = value === m;
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isBusy}
                      onPress={() => onChange(m)}
                      className={`h-10 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-ink bg-ink"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
                      >
                        {budgetModeLabel(m)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {budgetMode !== "negotiable" && (
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1">
                <NumberField
                  label={budgetMode === "exact" ? "Сумма, ₽" : "От, ₽"}
                  placeholder="1500"
                  control={control}
                  name="budgetMin"
                  error={errors.budgetMin?.message}
                  disabled={isBusy}
                />
              </View>
              {budgetMode === "range" && (
                <View className="flex-1">
                  <NumberField
                    label="До, ₽"
                    placeholder="5000"
                    control={control}
                    name="budgetMax"
                    error={errors.budgetMax?.message}
                    disabled={isBusy}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------

type StringFieldName = Extract<
  FieldPath<CreateOrderFormValues>,
  "title" | "description" | "district"
>;
type NumberFieldName = Extract<FieldPath<CreateOrderFormValues>, "budgetMin" | "budgetMax">;

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
