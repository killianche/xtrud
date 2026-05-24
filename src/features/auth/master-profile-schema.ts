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
  // cityId / district — поля удалены из onboarding-формы 2026-05-15 (мастер
  // указывает зоны работы через ServiceAreasSection в /profile/edit-master).
  // Оставляем z.string() без min/max-проверок, чтобы пустые значения проходили
  // валидацию. RPC complete_master_onboarding принимает их и пишет в users —
  // если empty, останется существующее значение (если есть) или NULL.
  cityId: z.string(),
  district: z.string().max(50, "Максимум 50 символов"),
  bio: z.string().max(500, "Максимум 500 символов"),
  experienceYears: z
    .number({ message: "Введите число" })
    .int()
    .min(0, "Не меньше 0")
    .max(70, "Не больше 70"),
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
  // Sprint 2026-05-20: contact_phone (миграция 0097). Публичный контактный
  // номер для клиентов. Отделён от users_private.phone (auth-идентификатор).
  // По умолчанию contactSameAsPhone=true → null в БД → читается через
  // COALESCE(users.contact_phone, users_private.phone) в get_master_phone RPC.
  // Если same=false → требуется минимум 10 цифр (валидный международный номер).
  contactSameAsPhone: z.boolean(),
  contactPhone: z
    .string()
    .max(20, "Максимум 20 символов")
    .refine(
      (v) => {
        if (!v || v.trim() === "") return true;
        const digits = v.replace(/\D/g, "");
        return digits.length >= 10 && digits.length <= 15;
      },
      { message: "Введите корректный номер (10–15 цифр)" },
    ),
}).superRefine((data, ctx) => {
  // Если чекбокс снят — contact_phone обязателен (минимум 10 цифр).
  if (!data.contactSameAsPhone) {
    const digits = data.contactPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["contactPhone"],
        message: "Введите номер или включите «Совпадает с регистрационным»",
      });
    }
  }
});

export type MasterProfileFormValues = z.infer<typeof masterProfileSchema>;
