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
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
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
  categories: Pick<Tables<"categories_l2">, "id" | "name_ru">[] | undefined;
  cities: Pick<Tables<"cities">, "id" | "name">[] | undefined;
  /** Если задана — категорию нельзя сменить (после создания заказа). */
  lockCategory?: boolean;
}

export function OrderFormBody({
  control,
  errors,
  budgetMode,
  isBusy,
  categories,
  cities,
  lockCategory,
}: OrderFormBodyProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  return (
    <>
      {/* Категория */}
      <View className="px-6">
        <AppText weight="medium" className="text-caption text-muted">
          Категория
        </AppText>
        {!categories && (
          <View className="mt-2">
            <ActivityIndicator />
          </View>
        )}
        {categories && (
          <Controller
            control={control}
            name="l2Id"
            render={({ field: { value, onChange } }) => (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {categories.map((cat) => {
                  const selected = value === cat.id;
                  const interactive = !lockCategory;
                  return (
                    <Pressable
                      key={cat.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isBusy || !interactive}
                      onPress={() => interactive && onChange(cat.id)}
                      className={`h-10 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : interactive
                            ? "border-hairline bg-canvas active:opacity-70"
                            : "border-hairline-soft bg-canvas opacity-40"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-caption ${selected ? "text-accent" : "text-body"}`}
                      >
                        {cat.name_ru}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        )}
        {lockCategory && (
          <AppText className="mt-2 text-caption-xs text-muted">
            Категорию нельзя сменить после публикации.
          </AppText>
        )}
        {errors.l2Id && (
          <AppText weight="medium" className="mt-2 text-caption text-error">
            {errors.l2Id.message}
          </AppText>
        )}
      </View>

      {/* Title */}
      <View className="mt-6 px-6">
        <TextField
          label="Краткое название"
          placeholder="Заменить смеситель на кухне"
          control={control}
          name="title"
          error={errors.title?.message}
          disabled={isBusy}
          autoCapitalize="sentences"
        />
      </View>

      {/* Description */}
      <View className="mt-6 px-6">
        <Controller
          control={control}
          name="description"
          render={({ field: { value, onChange, onBlur } }) => (
            <View>
              <AppText weight="medium" className="text-caption text-muted">
                Подробное описание
              </AppText>
              <TextInput
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Что нужно сделать, в какие сроки, особенности задачи..."
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
                {cities.map((c) => {
                  const selected = value === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isBusy}
                      onPress={() => onChange(c.id)}
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
                        {c.name}
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
        <TextField
          label="Район (опц.)"
          placeholder="Центр / Назрань-Юг"
          control={control}
          name="district"
          error={errors.district?.message}
          disabled={isBusy}
        />
      </View>

      {/* Срочность */}
      <View className="mt-6 px-6">
        <AppText weight="medium" className="text-caption text-muted">
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
                        ? "border-accent bg-accent-soft"
                        : "border-hairline bg-canvas active:opacity-70"
                    }`}
                  >
                    <AppText
                      weight="medium"
                      className={`text-caption ${selected ? "text-accent" : "text-body"}`}
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

      {/* Бюджет */}
      <View className="mt-6 px-6">
        <AppText weight="medium" className="text-caption text-muted">
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
                        ? "border-accent bg-accent-soft"
                        : "border-hairline bg-canvas active:opacity-70"
                    }`}
                  >
                    <AppText
                      weight="medium"
                      className={`text-caption ${selected ? "text-accent" : "text-body"}`}
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
          <AppText weight="medium" className="text-caption text-muted">
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
