// useUpdateMyProfile — обновляет первичные поля public.users текущего пользователя.
//
// Используется на клиентской вкладке профиля (Алина и др. клиенты). Мастер
// редактирует расширенный набор полей через edit-master.tsx — там отдельный
// pipeline.
//
// RLS: users_update_own разрешает auth.uid() = id, см. миграции 0010+.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export interface UpdateMyProfileInput {
  first_name: string;
  // last_name убран из UI 2026-05-29 (везде только имя) — поле опционально для
  // обратной совместимости; если не передан, фамилию не трогаем/обнуляем.
  last_name?: string | null;
  // city_id / district 2026-05-16: убраны из UI. Поля legacy в БД остаются
  // для совместимости с seed-данными, но клиент не пишет их через этот хук.
}

export function useUpdateMyProfile(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateMyProfileInput) => {
      if (!userId) throw new Error("Нет userId");
      const { error } = await supabase
        .from("users")
        .update({
          first_name: input.first_name.trim() || null,
          last_name: input.last_name?.trim() || null,
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}
