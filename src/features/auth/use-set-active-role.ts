// Mutation: переключить активную роль пользователя (client ↔ master).
//
// Применимо только для dual-role: is_master=true. RLS не блокирует UPDATE
// (auth.uid() = id), CHECK constraint требует active_role='master' ⇒ is_master=true.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export type ActiveRole = Enums<"user_active_role">;

export interface SetActiveRoleInput {
  userId: string;
  role: ActiveRole;
}

export function useSetActiveRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: SetActiveRoleInput) => {
      const { error } = await supabase.from("users").update({ active_role: role }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}
