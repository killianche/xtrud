// Zod-схема create-order формы.
//
// Локационные константы (`ALL_INGUSHETIA_CITY`, `districtNames`,
// `villagesByDistrict`, `findDistrictByVillage`, `isDistrict`) переехали в
// `src/lib/location-config.ts` — единый источник истины. Здесь оставляем
// re-export'ы под старыми именами для обратной совместимости импортов.

import { z } from "zod";
import {
  ALL_INGUSHETIA_CITY_ID,
  districtNames,
  findDistrictByVillage as _findDistrictByVillage,
  isDistrictName,
  villagesByDistrict,
} from "@/lib/location-config";

// Re-export под старыми именами (не ломаем consumers'ов).
export const ALL_INGUSHETIA_CITY = ALL_INGUSHETIA_CITY_ID;
export const districtOptions = districtNames;
export { villagesByDistrict };
export const findDistrictByVillage = _findDistrictByVillage;
export const isDistrict = (value: string): boolean => isDistrictName(value);

export const orderUrgencyOptions = ["urgent", "this_week", "this_month", "flexible"] as const;

/**
 * Способ задания цены — соответствует enum `order_price_kind` в БД.
 * Раньше было `order_budget_mode` (`exact | range | negotiable`) с диапазоном
 * (price_min/price_max). По фидбэку user 2026-05-15 «убрать диапазоны из всех
 * заказов» — модель изменена на 4 варианта с одним числовым значением:
 *   - fixed       — точная цена
 *   - from        — «от X ₽»
 *   - up_to       — «до X ₽»
 *   - negotiable  — договорная (без числа)
 * См. supabase/migrations/0068_orders_remove_price_range.sql.
 */
export const orderPriceKindOptions = ["fixed", "from", "up_to", "negotiable"] as const;
export type OrderPriceKind = (typeof orderPriceKindOptions)[number];

export function urgencyLabel(u: (typeof orderUrgencyOptions)[number]): string {
  switch (u) {
    case "urgent":
      return "Срочно";
    case "this_week":
      return "На неделе";
    case "this_month":
      return "В этом месяце";
    case "flexible":
      return "Не срочно";
  }
}

/** Короткий лейбл для chip-кнопки в форме. */
export function priceKindLabel(k: OrderPriceKind): string {
  switch (k) {
    case "fixed":
      return "Точная";
    case "from":
      return "От";
    case "up_to":
      return "До";
    case "negotiable":
      return "Договорная";
  }
}

/**
 * Форматирование цены для отображения в UI (карточки, заголовки).
 * Возвращает «1 500 ₽», «от 1 500 ₽», «до 5 000 ₽», «Цена договорная».
 */
export function formatPrice(kind: OrderPriceKind, value: number | null): string {
  if (kind === "negotiable" || value === null) return "Цена договорная";
  const num = new Intl.NumberFormat("ru-RU").format(value);
  switch (kind) {
    case "fixed":
      return `${num} ₽`;
    case "from":
      return `от ${num} ₽`;
    case "up_to":
      return `до ${num} ₽`;
  }
}

export const createOrderSchema = z
  .object({
    l2Id: z.string().min(1, "Выберите категорию"),
    title: z.string().min(5, "Минимум 5 символов").max(120, "Максимум 120 символов"),
    // contactName — необязательное имя, которое мастер увидит в заказе вместо
    // профиля заказчика. Пустая строка допустима (тогда покажем имя из
    // регистрации). Телефон НЕ собираем — модель «номер скрыт» не меняется.
    contactName: z.string().max(80, "Максимум 80 символов"),
    // description — необязательное. Пустая строка допустима.
    description: z.string().max(2000, "Максимум 2000 символов"),
    // cityId: либо id города из таблицы cities, либо "all" для «Вся Ингушетия»
    // (на submit конвертируется в null), либо "" (тогда выбран район — см. ниже).
    // Валидация «либо город, либо район» — в superRefine ниже.
    cityId: z.string(),
    district: z.string().max(60, "Максимум 60 символов"),
    // urgency / budgetKind — nullable, чтобы поля не были предвыбраны.
    // До 2026-05-27 default был "flexible" / "negotiable" — пользователь видел
    // их активными и отправлял заказ не выбирая, что давало 90% заказов с
    // «Не срочно / Договорная» и отбивало мастеров. Теперь null → chip-row
    // изначально пустой, submit заблокирован пока пользователь не выберет.
    // Валидация «оба обязательны» — в superRefine ниже.
    urgency: z.enum(orderUrgencyOptions).nullable(),
    budgetKind: z.enum(orderPriceKindOptions).nullable(),
    /** Одно числовое значение цены. NULL для negotiable. */
    budgetValue: z.number().int().min(0).nullable(),
  })
  .superRefine((val, ctx) => {
    // Локация обязательна — должен быть либо город (включая "all"=Вся
    // Ингушетия), либо район. LocationPicker делает их взаимоисключающими.
    if (!val.cityId && !val.district) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cityId"],
        message: "Выберите город или район",
      });
    }
    // urgency / budgetKind обязательны — пользователь должен явно выбрать.
    if (val.urgency === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["urgency"],
        message: "Выберите срок",
      });
    }
    if (val.budgetKind === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetKind"],
        message: "Выберите тип цены",
      });
    }
  });

export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;
