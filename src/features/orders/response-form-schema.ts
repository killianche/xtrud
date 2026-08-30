import { z } from "zod";
import { orderPriceKindOptions } from "@/features/orders/order-schema";

export const responseFormSchema = z
  .object({
    message: z.string().trim().min(10, "Минимум 10 символов").max(1000, "Максимум 1000 символов"),
    priceKind: z.enum(orderPriceKindOptions),
    priceValue: z
      .number()
      .int("Укажите целую сумму")
      .nonnegative()
      .max(2_147_483_647, "Слишком большая сумма")
      .nullable(),
    leadTime: z.string().max(100, "Максимум 100 символов"),
  })
  .superRefine((values, context) => {
    if (values.priceKind !== "negotiable" && (!values.priceValue || values.priceValue <= 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите сумму больше 0",
        path: ["priceValue"],
      });
    }
  });

export type ResponseFormValues = z.infer<typeof responseFormSchema>;
