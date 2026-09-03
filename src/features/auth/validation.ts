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
 *
 * Bugfix 2026-05-16: раньше при каждом ввода маска absorbed `+7` префикс
 * как «цифры», поэтому повторный onChangeText генерировал phantom-семёрки
 * (типа +7 9 → +7 79 → +7 779 ...). Фикс: первым шагом снимаем literal
 * префикс `+7` (или `+`) ДО digitsOnly, чтобы его `7` не считалась цифрой
 * номера. Бывшая ветка `if (d.length === 11 && d[0]===7|8)` оставлена для
 * paste-кейсов вроде `89001234567` / `79001234567` (без `+`).
 *
 * Важно: НЕ снимаем bare leading `7` — Kazakhstan-номера законно начинаются
 * с 7 (700/707/747/771/775/777/778). Только literal `+7`.
 */
export function formatPhoneMask(input: string): string {
  const stripped = input.replace(/^\+7/, "");
  let d = digitsOnly(stripped);
  // Paste-кейс: ввели 11 цифр с ведущей 7 или 8 (без +).
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
 * Нормализует номер в каноническую E.164-форму для хранения в БД.
 *
 * Два режима:
 *  1. Уже собранный международный номер (`+<код≠7><цифры>`, например `+49…`,
 *     `+375…`, `+1…`) — приходит из экрана регистрации, где он собран как
 *     `+${country.dial}${digits}`. Такой номер НЕ режем и НЕ переписываем в +7:
 *     просто чистим до `+` + цифры. Иначе foreign-номер искажался
 *     (`+4915123456789` → `+74915123456`), и вход по нему был невозможен.
 *  2. РФ/КЗ-ввод (`+7…`, `8…`, `7…`, либо 10 «голых» цифр) — приходит из маски
 *     `formatPhoneMask` и старых экранов. Снимаем literal `+7`, отбрасываем
 *     ведущую `7`/`8` у 11-значного, берём последние 10 → `+7XXXXXXXXXX`.
 *
 * Симметрична formatPhoneMask: literal `+7` снимается до digitsOnly, чтобы
 * prefix-семёрка не считалась цифрой номера.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();

  // Режим 1: уже международный номер с кодом страны ≠ 7 (и не пустой набор цифр).
  // Пример: `+49…`, `+375…`, `+1…`. Не трогаем — только чистим до `+` и цифр.
  if (/^\+[1-9]\d{6,}$/.test(trimmed)) {
    const all = digitsOnly(trimmed);
    if (all.length > 0 && all[0] !== "7") {
      return `+${all}`;
    }
  }

  // Режим 2: РФ/КЗ-ввод. `+7` снимаем литералом, чтобы не считать его «7» цифрой.
  const stripped = trimmed.replace(/^\+7/, "");
  let d = digitsOnly(stripped);
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) {
    d = d.slice(1);
  }
  return `+7${d.slice(0, 10)}`;
}

/**
 * Zod-схема экрана phone.tsx.
 *
 * Sprint 2026-05-20: после введения CountryCodeSelect поле phone содержит
 * ТОЛЬКО digits (без +N префикса). Минимум 6 цифр (соответствует самым
 * коротким E.164 номерам). Жёсткой длины не задаём — разные страны имеют
 * разные форматы. Точную проверку по country.digitsLength делает компонент
 * на submit при необходимости; для UX-валидации минимум 6 цифр достаточно.
 */
export const phoneFormSchema = z.object({
  phone: z
    .string()
    .min(1, "Введите номер телефона")
    .refine((v) => digitsOnly(v).length >= 6, {
      message: "Введите корректный номер телефона",
    }),
});

export type PhoneFormValues = z.infer<typeof phoneFormSchema>;

/**
 * Zod-схема экрана verify.tsx — 6-значный OTP-код.
 * (Оставлена для будущего SMS-входа; сейчас основной вход — номер/почта+пароль.)
 */
export const otpFormSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Введите 6 цифр"),
});

export type OtpFormValues = z.infer<typeof otpFormSchema>;

// ============================================================================
// Вход по номеру/почте + пароль (2026-06-05). SMS-OTP заменён на пароль, чтобы
// не платить операторам за branded-SMS. Почта добавлена для восстановления
// пароля и как альтернативный логин (решение владельца — разворот прежнего
// «без email», см. CLAUDE.md правило №6).
// ============================================================================

/** Простая проверка «это похоже на email». */
export function looksLikeEmail(input: string): boolean {
  return /\S+@\S+\.\S+/.test(input.trim());
}

/**
 * Схема входа: одно поле «почта или телефон» + пароль.
 * Поле login принимаем как есть; различение email/phone — в логике входа.
 */
export const loginFormSchema = z.object({
  login: z.string().min(1, "Введите номер телефона или почту"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

/**
 * Схема регистрации: номер (digits, ≥6) + пароль (≥6).
 *
 * Почта из формы убрана (DECISION владельца 2026-09-01): на время закрытого
 * теста регистрация должна занимать два поля. Адрес для auth.users строится
 * из номера в registerWithCredentials и пользователю не показывается.
 *
 * Цена решения названа прямо: восстановление пароля письмом для таких
 * аккаунтов не работает — почтового ящика у них нет. На время теста это
 * приемлемо, база будет очищена перед боевым запуском.
 */
export const registerFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Введите имя")
    .max(60, "Слишком длинное имя")
    .refine((v) => !/\d/.test(v), { message: "Имя не содержит цифр" }),
  lastName: z
    .string()
    .trim()
    .min(2, "Введите фамилию")
    .max(60, "Слишком длинная фамилия")
    .refine((v) => !/\d/.test(v), { message: "Фамилия не содержит цифр" }),
  // Ровно 10 цифр без кода страны: номер вводится в единственном формате
  // +7 XXX XXX-XX-XX (DECISION владельца 2026-09-03 — «чтобы не было такого,
  // что один раз написал 8, другой раз 7»). Ввод сам срезает лишние 7/8 в
  // начале, см. normalizeRuPhoneDigits.
  phone: z
    .string()
    .min(1, "Введите номер телефона")
    .refine((v) => digitsOnly(v).length === 10, {
      message: "Номер из 10 цифр после +7",
    }),
  password: z.string().min(6, "Минимум 6 символов"),
});

/**
 * Приводит любой ввод российского номера к 10 цифрам без кода страны.
 *
 * `8 928 123-45-67`, `+7 928 123-45-67`, `7928…`, `928…` — всё это один и тот
 * же номер, и человек не должен думать, в каком виде его писать. На сервере
 * поиск аккаунта тоже идёт по последним 10 цифрам (RPC resolve_login_email),
 * поэтому форматы совпадают с обеих сторон.
 */
export function normalizeRuPhoneDigits(input: string): string {
  const digits = digitsOnly(input);
  // 11 цифр, начинается с 7 или 8 — это код страны, снимаем его.
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) return digits.slice(1);
  // Длиннее — берём последние 10: так переживаем вставку из буфера с +7 и
  // прочими префиксами.
  if (digits.length > 11) return digits.slice(-10);
  return digits.slice(0, 10);
}

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

/** Схема экрана «Забыли пароль» — только почта. */
export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Введите почту").email("Некорректная почта"),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
