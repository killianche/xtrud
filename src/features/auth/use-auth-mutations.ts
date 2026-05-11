// useMutation хуки для UI auth flow.
//
// Sprint 1 решение:
// - sendOtp — симуляция (resolve через 800ms). В sprint 2 заменим на supabase.auth.signInWithOtp({phone}).
// - verifyAndSignIn — anonymous sign-in + UPDATE phone в users_private.
//   OTP-код ввода не проверяется (в sprint 1). В sprint 2 — supabase.auth.verifyOtp.

import { useMutation } from "@tanstack/react-query";
import { signInAnonymouslyWithPhone } from "@/lib/auth";

export interface SendOtpInput {
  phone: string;
}

/**
 * Sprint 1: симулирует отправку OTP. Просто задержка для UX.
 * Sprint 2: заменим на supabase.auth.signInWithOtp({phone}).
 */
export function useSendOtp() {
  return useMutation({
    mutationFn: async (_input: SendOtpInput): Promise<{ ok: true }> => {
      // Симуляция сетевого вызова
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { ok: true };
    },
  });
}

export interface VerifyOtpInput {
  phone: string;
  /** Sprint 1: код игнорируется. Любые 6 цифр проходят. */
  code: string;
}

/**
 * Sprint 1: создаёт anonymous-сессию и сохраняет phone.
 * Sprint 2: верифицирует OTP через supabase.auth.verifyOtp.
 */
export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (input: VerifyOtpInput): Promise<{ ok: true }> => {
      const result = await signInAnonymouslyWithPhone(input.phone);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { ok: true };
    },
  });
}
