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
  // Фамилия убрана из UI 2026-05-29 (везде показываем только имя). Поле
  // оставлено в типе для совместимости, но без проверок — пустое проходит.
  lastName: z.string(),
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
  // Контактный телефон — ОБЯЗАТЕЛЕН (решение владельца 2026-05-24). Мастер
  // ВСЕГДА указывает явный публичный номер для клиентов. Чекбокса «совпадает с
  // регистрационным» больше нет; регистрационный номер (users_private.phone)
  // нигде не подставляется автоматически. Минимум 10 цифр.
  contactPhone: z
    .string()
    .max(20, "Максимум 20 символов")
    .refine(
      (v) => {
        const digits = (v ?? "").replace(/\D/g, "");
        return digits.length >= 10 && digits.length <= 15;
      },
      { message: "Укажите контактный номер (10–15 цифр)" },
    ),
  // WhatsApp — необязательный явный номер. Пусто = не указан (кнопка WhatsApp не
  // показывается клиентам). Если указан — минимум 5 цифр.
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
