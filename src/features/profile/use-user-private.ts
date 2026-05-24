// useUserPrivate — приватные данные текущего пользователя (phone, gender,
// birth_year) из таблицы `users_private`.
//
// RLS:
//   - users_private_select_own: auth.uid() = user_id
//   - users_private_update_own: auth.uid() = user_id
//
// Зачем отдельная таблица: в Sprint 1 phone хранится в `users_private.phone`
// (а не в `auth.users.phone`) — потому что Phone Provider в Supabase Auth
// ещё не подключён, и реальный SMS-OTP не работает. Anonymous sign-in не
// создаёт `auth.users.phone`. Поэтому единственный источник истины — это
// public.users_private.phone (его пишет JIT-signup-flow в `lib/auth.ts`).
//
// Когда в Sprint 2 подключим Phone Provider — `auth.users.phone` станет
// source-of-truth, а users_private.phone можно будет дропнуть.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type UserPrivate = Tables<"users_private">;

export function userPrivateKey(userId: string | undefined) {
  return ["user-private", userId] as const;
}

export function useUserPrivate(userId: string | undefined) {
  return useQuery<UserPrivate | null>({
    queryKey: userPrivateKey(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("users_private")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Меняет phone в users_private. В Sprint 1 — без SMS-OTP (просто UPDATE,
 * соответствует тому, как JIT-signup сохраняет phone при первом входе).
 *
 * В Sprint 2, когда подключим Phone Provider, заменим на:
 *   supabase.auth.updateUser({ phone })  // шлёт SMS на новый номер
 *   supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })
 *
 * Сейчас UI просит OTP-код для UX-симметрии с регистрацией, но код
 * не валидируется (как и при signInAnonymouslyWithPhone).
 */
export interface UpdatePhoneInput {
  phone: string;
}

export function useUpdateMyPhone(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePhoneInput) => {
      if (!userId) throw new Error("Нет userId");
      const { error } = await supabase
        .from("users_private")
        .update({ phone: input.phone, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userPrivateKey(userId) });
    },
  });
}
