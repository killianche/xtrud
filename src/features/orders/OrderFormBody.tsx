/**
 * Общая форма заказа — поля без submit-кнопки и без header'а.
 *
 * Используется в:
 *  - /orders/new (создание)
 *  - /orders/edit/[id] (редактирование)
 *
 * Owner-каждый screen решает что показывать выше и ниже формы + сам submit-логика.
 */

import { useRouter } from "expo-router";
import { CalendarBlank } from "phosphor-react-native";
import { type ReactNode, useEffect } from "react";
import type { Control, FieldErrors, FieldPath } from "react-hook-form";
import { Controller, useController } from "react-hook-form";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { CategoryPicker } from "@/components/CategoryPicker";
import { LocationPicker } from "@/features/orders/LocationPicker";
import { useOrderDatePickerStore } from "@/features/orders/order-date-picker-store";
import type { CreateOrderFormValues, OrderPriceKind } from "@/features/orders/order-schema";
import {
  formatOrderTiming,
  orderPriceKindOptions,
  orderUrgencyOptions,
  priceKindLabel,
  urgencyLabel,
} from "@/features/orders/order-schema";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";
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
  /**
   * Точная дата (yyyy-mm-dd) когда выбран срок «К дате». Читается чипом «К дате»
   * для отображения «К 12 июня». Источник — watch("preferredDate") в форме.
   */
  preferredDate: string | null;
  /**
   * Записать точную дату в форму (setValue("preferredDate", ...)). Пишется при
   * выборе даты в календаре и обнуляется при выборе любого относительного срока.
   */
  setPreferredDate: (d: string | null) => void;
  isBusy: boolean;
  categories: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon">[] | undefined;
  cities: Pick<Tables<"cities">, "id" | "name">[] | undefined;
  /** Если задана — категорию нельзя сменить (после создания заказа). */
  lockCategory?: boolean;
  /** Creation flow already confirmed title/category in its intent step. */
  hideTitleField?: boolean;
  hideCategoryField?: boolean;
  /** Reviewed category-specific guidance for the free-text details field. */
  detailsPlaceholder?: string;
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
  preferredDate,
  setPreferredDate,
  isBusy,
  cities,
  lockCategory,
  hideTitleField = false,
  hideCategoryField = false,
  detailsPlaceholder = "Что важно знать исполнителю — объём, особенности и что уже есть…",
  step,
  photosSlot,
}: OrderFormBodyProps) {
  const router = useRouter();
  const mutedSoftColor = useThemeColor("muted-soft");
  // Цвета иконки chip «К дате» — резолвленные токены (SVG красится не className).
  const { ink: inkColor } = useThemeColors(["ink"]);

  // «К дате» теперь выбирается на отдельном route-экране
  // (`/orders/date-select`, нативная formSheet-модальность) — слушаем
  // результат из транзитного store и применяем в форму. Второй, top-level
  // `useController` на то же поле "urgency" — react-hook-form поддерживает
  // несколько независимых подписчиков одного поля; здесь он нужен, чтобы
  // выставить urgency="by_date" из эффекта, а не из inline-Controller ниже
  // (тот `onChange` доступен только внутри своего render-prop).
  const { field: urgencyField } = useController({ control, name: "urgency" });
  const dateResult = useOrderDatePickerStore((s) => s.result);
  const setDateResult = useOrderDatePickerStore((s) => s.setResult);
  useEffect(() => {
    if (!dateResult) return;
    urgencyField.onChange("by_date");
    setPreferredDate(dateResult.value);
    setDateResult(null);
  }, [dateResult, urgencyField, setPreferredDate, setDateResult]);

  // Wizard 2 шага: step 1 = описание + категория на одном экране, step 2 = бюджет/город.
  const showContent = step === undefined || step === 1;
  const showCategory = step === undefined || step === 1;
  const showBudgetCity = step === undefined || step === 2;
  return (
    <>
      {/* Title + Description — Шаг 1 (новый: сначала «что нужно сделать») */}
      {showContent && !hideTitleField && (
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
                  placeholder={detailsPlaceholder}
                  placeholderTextColor={mutedSoftColor}
                  multiline
                  numberOfLines={5}
                  maxLength={2000}
                  textAlignVertical="top"
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
      {showCategory && !hideCategoryField && (
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
            render={({ field: { value, onChange } }) => {
              // «К дате» выбран, когда urgency === "by_date".
              const byDateSelected = value === "by_date";
              return (
                <>
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Сроки"
                    className="mt-2 flex-row flex-wrap gap-2"
                  >
                    {/* 4 относительных срока. Выбор любого — mutex: обнуляет точную
                        дату (правило §E), иначе остался бы «и срочно, и 12 июня». */}
                    {orderUrgencyOptions.map((u) => {
                      const selected = value === u;
                      return (
                        <Pressable
                          key={u}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected, disabled: isBusy }}
                          disabled={isBusy}
                          onPress={() => {
                            onChange(u);
                            setPreferredDate(null);
                          }}
                          className={`h-11 items-center justify-center rounded-pill border px-4 ${
                            selected
                              ? "border-accent bg-accent-soft"
                              : "border-hairline bg-canvas active:opacity-70"
                          }`}
                        >
                          <AppText weight="medium" className="text-body-md text-ink">
                            {urgencyLabel(u)}
                          </AppText>
                        </Pressable>
                      );
                    })}

                    {/* 5-й вариант — «К дате»: открывает календарь. Если дата уже
                        выбрана — показываем «К 12 июня» и активный стиль. */}
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: byDateSelected, disabled: isBusy }}
                      accessibilityLabel="Выбрать дату"
                      disabled={isBusy}
                      onPress={() =>
                        router.push({
                          pathname: "/orders/date-select",
                          params: { value: preferredDate ?? "" },
                        } as never)
                      }
                      className={`h-11 flex-row items-center gap-1.5 rounded-pill border px-4 ${
                        byDateSelected
                          ? "border-accent bg-accent-soft"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <CalendarBlank
                        size={18}
                        weight={byDateSelected ? "fill" : "bold"}
                        color={inkColor}
                      />
                      <AppText weight="medium" className="text-body-md text-ink">
                        {byDateSelected ? formatOrderTiming("by_date", preferredDate) : "К дате"}
                      </AppText>
                    </Pressable>
                  </View>

                  {/* Ошибки валидации сроков. Точная дата не выбрана при by_date,
                      либо срок вообще не выбран. */}
                  {errors.preferredDate ? (
                    <AppText weight="medium" className="mt-2 text-caption text-error">
                      {errors.preferredDate.message}
                    </AppText>
                  ) : errors.urgency ? (
                    <AppText weight="medium" className="mt-2 text-caption text-error">
                      {errors.urgency.message}
                    </AppText>
                  ) : null}
                </>
              );
            }}
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
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Бюджет"
                className="mt-2 flex-row flex-wrap gap-2"
              >
                {orderPriceKindOptions.map((k) => {
                  const selected = value === k;
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: isBusy }}
                      disabled={isBusy}
                      onPress={() => onChange(k)}
                      className={`h-11 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText weight="medium" className="text-body-md text-ink">
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

      {/* Отображаемое имя — так заказ увидит мастер. По умолчанию подставлено имя
          из профиля; можно изменить на любое (заказ от другого имени) или стереть.
          Если пусто — на заказе покажется имя из профиля (фолбэк в orders/[id].tsx).
          Телефон НЕ собираем — модель «номер скрыт» не меняется. */}
      {showBudgetCity && (
        <View className="mt-6 px-6">
          <TextField
            label="Отображаемое имя"
            placeholder="Как вас называть в заказе"
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
            accessibilityLabel={props.label}
            value={value ?? ""}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder={props.placeholder}
            placeholderTextColor={mutedSoftColor}
            autoCapitalize={props.autoCapitalize ?? "none"}
            className={`mt-2 min-h-14 rounded-lg border bg-canvas px-4 py-4 text-field-md text-ink ${
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
            accessibilityLabel={props.label}
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
            className={`mt-2 min-h-14 rounded-lg border bg-canvas px-4 py-4 text-field-md text-ink ${
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
