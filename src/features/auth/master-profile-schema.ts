// Zod-схема для master onboarding wizard.
// Без optional()/default() — иначе IN vs OUT тип не совпадает с Control<T>.
// Пустые строки разрешены (district, bio).
// Default-значения задаются в useForm({ defaultValues }).

import { z } from "zod";

export const masterProfileSchema = z.object({
  firstName: z
    .string()
    .min(2, "Минимум 2 символа")
    .max(30, "Максимум 30 символов")
    .regex(/^[\p{L} -]+$/u, "Только буквы, пробел и дефис"),
  lastName: z
    .string()
    .min(2, "Минимум 2 символа")
    .max(30, "Максимум 30 символов")
    .regex(/^[\p{L} -]+$/u, "Только буквы, пробел и дефис"),
  cityId: z.string().min(1, "Выберите город"),
  district: z.string().max(50, "Максимум 50 символов"),
  bio: z.string().max(500, "Максимум 500 символов"),
  experienceYears: z
    .number({ message: "Введите число" })
    .int()
    .min(0, "Не меньше 0")
    .max(70, "Не больше 70"),
  hasTools: z.boolean(),
  hasTransport: z.boolean(),
});

export type MasterProfileFormValues = z.infer<typeof masterProfileSchema>;
