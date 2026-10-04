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
 * Смена номера — только после подтверждения звонком с нового номера (№220,
 * 2026-10-04). Номер — это вход, поэтому прямой записи в users_private у
 * приложения больше нет (0220): сервер проверяет подтверждение, меняет номер
 * и адрес входа, отзывает прежние входы и выдаёт этому устройству новый.
 */
export interface UpdatePhoneInput {
  phone: string;
  /** Подтверждение нового номера звонком (CallConfirmSheet, change_phone). */
  verificationToken: string;
}

export function useUpdateMyPhone(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePhoneInput) => {
      if (!userId) throw new Error("Нужен вход");
      const { error } = await supabase.auth.changePhone(input.phone, input.verificationToken);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userPrivateKey(userId) });
    },
  });
}
