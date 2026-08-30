// Hook агрегированной статистики мастера для главной (P1-1).
//
// Под капотом RPC get_master_stats возвращает {responses_total,
// picked_total, completed_total, today_used, today_max}.
// Cached 60s — не часто меняется, но invalidate после нового отклика.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MasterStats {
  responses_total: number;
  picked_total: number;
  completed_total: number;
  today_used: number;
  today_max: number;
}

export const MASTER_STATS_QUERY_KEY = ["master-stats"] as const;

export function useMasterStats(enabled = true) {
  return useQuery<MasterStats>({
    queryKey: MASTER_STATS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_master_stats");
      if (error) throw error;
      const json = data as unknown as MasterStats | null;
      return {
        responses_total: typeof json?.responses_total === "number" ? json.responses_total : 0,
        picked_total: typeof json?.picked_total === "number" ? json.picked_total : 0,
        completed_total: typeof json?.completed_total === "number" ? json.completed_total : 0,
        today_used: typeof json?.today_used === "number" ? json.today_used : 0,
        today_max: typeof json?.today_max === "number" ? json.today_max : 5,
      };
    },
    enabled,
    staleTime: 60_000,
  });
}
