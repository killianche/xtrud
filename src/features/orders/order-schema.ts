// Zod-схема create-order формы.

import { z } from "zod";

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
  cityId: z.string().min(1, "Выберите город"),
  district: z.string().max(60, "Максимум 60 символов"),
  urgency: z.enum(orderUrgencyOptions),
  budgetMode: z.enum(orderBudgetModeOptions),
  budgetMin: z.number().int().min(0).nullable(),
  budgetMax: z.number().int().min(0).nullable(),
});

export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;
