// useMutation хуки для UI auth flow.
//
// Реальный вход по SMS (с 2026-06-04):
// - useSendOtp   → sendOtpToPhone: supabase.auth.signInWithOtp({phone}) для
//   реальных номеров (Supabase → Send SMS Hook → SMS.ru). Demo-номера (флаг
//   включён) код не шлют — вход по email/паролю на шаге verify.
// - useVerifyOtp → verifyOtpCode: supabase.auth.verifyOtp({phone,token,type:'sms'})
//   для реальных номеров. Demo — email/пароль, код игнорируется.
// Реализация в src/lib/auth.ts.

import { useMutation } from "@tanstack/react-query";
import { sendOtpToPhone, verifyOtpCode } from "@/lib/auth";

export interface SendOtpInput {
  phone: string;
}

/** Отправить код на номер (реальный SMS или demo-no-op). */
export function useSendOtp() {
  return useMutation({
    mutationFn: async (input: SendOtpInput): Promise<{ ok: true }> => {
      const result = await sendOtpToPhone(input.phone);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { ok: true };
    },
  });
}

export interface VerifyOtpInput {
  phone: string;
  /** 6-значный код из SMS. Для demo-номеров игнорируется. */
  code: string;
}

/** Проверить код и войти. */
export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (input: VerifyOtpInput): Promise<{ ok: true }> => {
      const result = await verifyOtpCode(input.phone, input.code);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { ok: true };
    },
  });
}
