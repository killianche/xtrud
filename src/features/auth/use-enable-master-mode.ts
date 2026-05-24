/**
 * useEnableMasterMode — быстрое превращение клиента в мастера.
 *
 * Фидбэк user 2026-05-18: «нет кнопки Я хочу стать мастером — дай быстро
 * сделать, потом он должен заполнить поля чтобы стать доступным».
 *
 * Что делает:
 *   1. Вызывает RPC `enable_master_mode` (миграция 0083). Сервер:
 *      - users.is_master = true, active_role = 'master'
 *      - INSERT master_profiles { status: 'pending', is_hidden_from_search: true }
 *      - Идемпотентно, ON CONFLICT DO NOTHING.
 *   2. Инвалидирует `userRecord` кэш — UI сразу видит is_master=true.
 *
 * После успеха frontend пушит юзера на /(onboarding)/master-categories?mode=onboarding
 * чтобы он начал заполнять обязательные поля (категории → фото → bio/опыт).
 *
 * Мастер остаётся скрытым (is_hidden_from_search=true + status='pending')
 * пока не завершит wizard через `complete_master_onboarding` — тот RPC
 * сбрасывает оба флага в visible-состояние.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export function useEnableMasterMode(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("enable_master_mode");
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
      }
    },
  });
}
