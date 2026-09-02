import { z } from "zod";
import { orderPriceKindOptions } from "@/features/orders/order-schema";

export const responseFormSchema = z
  .object({
    // Текст необязателен (DECISION владельца 2026-09-01): отклик — это
    // «я готов сделать» плюс цена, срок и контакты. Раньше требовалось
    // минимум 10 символов, и это же ограничение стояло в базе; снято
    // миграцией 0146, иначе форма упиралась бы в 400 при отправке.
    message: z.string().trim().max(1000, "Максимум 1000 символов"),
    priceKind: z.enum(orderPriceKindOptions),
    priceValue: z
      .number()
      .int("Укажите целую сумму")
      .nonnegative()
      .max(2_147_483_647, "Слишком большая сумма")
      .nullable(),
    // Срок обязателен: без него клиент не может выбрать между откликами,
    // а «когда сможете» — половина решения. Раньше поле было необязательным.
    leadTime: z
      .string()
      .trim()
      .min(1, "Укажите, когда сможете взяться")
      .max(100, "Максимум 100 символов"),
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
