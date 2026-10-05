// useMutation хуки для UI auth flow.
//
// Основной вход (с 2026-06-05): номер/почта + пароль (без SMS).
// - useRegister      → registerWithCredentials: создаёт аккаунт (почта+пароль),
//   сохраняет телефон в профиль.
// - useLogin         → loginWithCredentials: вход по «почта ИЛИ телефон» + пароль.
// - useRequestReset  → requestPasswordReset: письмо со ссылкой на сброс пароля.
// - useUpdatePassword→ updatePassword: установить новый пароль (экран /reset-password).
//
// Вход по SMS-коду удалён (аудит 2026-10-05); номер подтверждается обратным
// звонком (CallConfirmSheet). Реализация функций — src/lib/auth.ts.

import { useMutation } from "@tanstack/react-query";
import {
  loginWithCredentials,
  registerWithCredentials,
  requestPasswordReset,
  updatePassword,
} from "@/lib/auth";

// ── Основной вход: номер/почта + пароль ────────────────────────────────────

export interface RegisterInput {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Подтверждение номера обратным звонком (CallConfirmSheet), если сервер требует. */
  verificationToken?: string;
}

/** Регистрация: телефон + пароль. Адрес для auth строится из номера. */
export function useRegister() {
  return useMutation({
    mutationFn: async (input: RegisterInput): Promise<{ ok: true; userId: string }> => {
      const result = await registerWithCredentials(input);
      if (!result.ok) {
        // code нужен: phone_verification_required — сервер включил звонок.
        throw Object.assign(new Error(result.error), { code: result.code });
      }
      return { ok: true, userId: result.userId };
    },
  });
}

export interface LoginInput {
  /** Почта или телефон. */
  login: string;
  password: string;
}

/** Вход по «почта ИЛИ телефон» + пароль. */
export function useLogin() {
  return useMutation({
    mutationFn: async (input: LoginInput): Promise<{ ok: true; userId: string }> => {
      const result = await loginWithCredentials(input);
      if (!result.ok) {
        // code нужен экрану: account_not_found ведёт в регистрацию.
        throw Object.assign(new Error(result.error), { code: result.code });
      }
      return { ok: true, userId: result.userId };
    },
  });
}

/** Запрос письма для сброса пароля. */
export function useRequestReset() {
  return useMutation({
    mutationFn: async (email: string): Promise<{ ok: true }> => {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { ok: true };
    },
  });
}

/** Установить новый пароль (на экране /reset-password). */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (password: string): Promise<{ ok: true }> => {
      const result = await updatePassword(password);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { ok: true };
    },
  });
}
