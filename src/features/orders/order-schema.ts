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
export const orderBudgetModeOptions = ["exact", "range", "negotiable"] as const;

export function urgencyLabel(u: (typeof orderUrgencyOptions)[number]): string {
  switch (u) {
    case "urgent":
      return "Срочно";
    case "this_week":
      return "На неделе";
    case "this_month":
      return "В этом месяце";
    case "flexible":
      return "Неважно";
  }
}

export const createOrderSchema = z.object({
  l2Id: z.string().min(1, "Выберите категорию"),
  title: z.string().min(5, "Минимум 5 символов").max(120, "Максимум 120 символов"),
  // description — необязательное. Пустая строка допустима.
  description: z.string().max(2000, "Максимум 2000 символов"),
  // cityId: либо id города из таблицы cities, либо "all" для «Вся Ингушетия»
  // (на submit конвертируется в null). Должно быть выбрано (.min(1)) — чтобы
  // клиент явно сделал выбор, а не оставил пустое.
  cityId: z.string().min(1, "Выберите город"),
  district: z.string().max(60, "Максимум 60 символов"),
  urgency: z.enum(orderUrgencyOptions),
  budgetMode: z.enum(orderBudgetModeOptions),
  budgetMin: z.number().int().min(0).nullable(),
  budgetMax: z.number().int().min(0).nullable(),
});

export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;
