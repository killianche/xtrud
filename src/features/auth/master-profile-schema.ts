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
  // Sprint 0079: WhatsApp. Чекбокс «совпадает с основным» (по умолчанию true)
  // ИЛИ явный номер. Пустая строка валидна (= не указан). Если same=false и
  // указан — минимум 5 цифр.
  whatsappSameAsPhone: z.boolean(),
  whatsappPhone: z
    .string()
    .max(20, "Максимум 20 символов")
    .refine(
      (v) => {
        if (!v || v.trim() === "") return true;
        const digits = v.replace(/\D/g, "");
        return digits.length >= 5 && digits.length <= 18;
      },
      { message: "Введите валидный номер (минимум 5 цифр)" },
    ),
});

export type MasterProfileFormValues = z.infer<typeof masterProfileSchema>;
