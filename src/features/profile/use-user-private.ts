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
 * Меняет phone в users_private простым UPDATE (без SMS-OTP).
 *
 * SMS-вход убран 2026-06-05 (был платным), поэтому смена номера больше не
 * требует кода из SMS — это прямой UPDATE под текущей сессией (RLS:
 * users_private_update_own). Телефон хранится в users_private.phone и
 * помечен UNIQUE — один номер не может принадлежать двум аккаунтам.
 *
 * Обработка занятого номера: при нарушении UNIQUE Postgres возвращает код
 * 23505. Ловим его и бросаем человекочитаемое сообщение, чтобы экран показал
 * «Этот номер уже зарегистрирован на другом аккаунте» вместо сырого SQL-текста.
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
      if (error) {
        // 23505 = unique_violation. Также подстраховываемся по тексту, т.к.
        // PostgREST может прислать сообщение без кода в некоторых конфигурациях.
        const isUnique =
          error.code === "23505" ||
          /duplicate key|unique|already exists/i.test(error.message ?? "");
        if (isUnique) {
          throw new Error("Этот номер уже зарегистрирован на другом аккаунте.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userPrivateKey(userId) });
    },
  });
}
