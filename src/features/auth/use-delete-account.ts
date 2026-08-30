// Mutation: удаление аккаунта пользователем (Sprint 0088, миграция 0088).
//
// Вызывается из /profile/settings после двойного подтверждения.
// После успешного RPC обязательно делаем signOut() — phone в БД уже NULL,
// возвращаться обратно не получится, JWT в кэше нужно скинуть.
//
// RPC контракт (см. supabase/migrations/0088_delete_my_account.sql):
//   { ok: true,  deleted_at }  — аккаунт удалён.
//   { ok: false, reason: 'already_deleted' } — повторный вызов, ничего не делаем.
//   throws — если auth.uid() пустой или user_record отсутствует.

import { useMutation } from "@tanstack/react-query";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export interface DeleteAccountResult {
  ok: boolean;
  deletedAt?: string;
  reason?: string;
}

export function useDeleteMyAccount() {
  return useMutation<DeleteAccountResult, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_my_account");
      if (error) throw error;

      const payload = (data ?? {}) as {
        ok?: boolean;
        deleted_at?: string;
        reason?: string;
      };
      const result: DeleteAccountResult = {
        ok: payload.ok === true,
        deletedAt: payload.deleted_at,
        reason: payload.reason,
      };

      // Идемпотентный «already_deleted» — без signOut, его не было в БД сессии.
      if (result.ok) {
        await signOut();
      }
      return result;
    },
  });
}
