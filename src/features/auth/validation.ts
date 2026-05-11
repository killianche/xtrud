// Auth валидация: RU/ингушские номера телефона и OTP-код.
//
// Формат phone на UI: `+7 XXX XXX-XX-XX`. В БД храним как `+7XXXXXXXXXX` (нормализовано).

import { z } from "zod";

/**
 * Извлекает только цифры из строки телефона.
 */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Форматирует строку цифр в маску `+7 XXX XXX-XX-XX`.
 * Принимает любой ввод (с/без +7), вытаскивает первые 10 цифр кода+номера.
 */
export function formatPhoneMask(input: string): string {
  let d = digitsOnly(input);
  // Если ввели с ведущей 7 или 8 — отбрасываем (берём остальные 10 цифр)
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) {
    d = d.slice(1);
  }
  d = d.slice(0, 10);

  let result = "+7";
  if (d.length > 0) result += ` ${d.slice(0, 3)}`;
  if (d.length > 3) result += ` ${d.slice(3, 6)}`;
  if (d.length > 6) result += `-${d.slice(6, 8)}`;
  if (d.length > 8) result += `-${d.slice(8, 10)}`;
  return result;
}

/**
 * Нормализует ввод в E.164-style `+7XXXXXXXXXX`.
 * Для хранения в БД.
 */
export function normalizePhone(input: string): string {
  let d = digitsOnly(input);
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) {
    d = d.slice(1);
  }
  return `+7${d.slice(0, 10)}`;
}

/**
 * Zod-схема экрана phone.tsx.
 * Принимает на вход уже отформатированную строку (через formatPhoneMask).
 * Проверяет что после очистки осталось ровно 10 цифр.
 */
export const phoneFormSchema = z.object({
  phone: z
    .string()
    .min(1, "Введите номер телефона")
    .refine((v) => digitsOnly(v).replace(/^[78]/, "").length === 10, {
      message: "Введите номер в формате +7 XXX XXX-XX-XX",
    }),
});

export type PhoneFormValues = z.infer<typeof phoneFormSchema>;

/**
 * Zod-схема экрана verify.tsx — 6-значный OTP-код.
 */
export const otpFormSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Введите 6 цифр"),
});

export type OtpFormValues = z.infer<typeof otpFormSchema>;
