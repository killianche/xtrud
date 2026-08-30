/**
 * Hook: статистика просмотров для текущего мастера (последние 7 дней).
 *
 * RPC `get_my_master_view_stats` (SECURITY INVOKER) сам ограничивает строки
 * через `master_id = auth.uid()`, поэтому никаких параметров не передаём.
 *
 * USAGE: MasterViewStatsCard на /index при active_role='master'.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MasterViewStats {
  impressions: number;
  profile_opens: number;
}

export function useMyMasterViewStats(userId: string | null | undefined) {
  return useQuery<MasterViewStats>({
    queryKey: ["my-master-view-stats", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_master_view_stats");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        impressions: row?.impressions ?? 0,
        profile_opens: row?.profile_opens ?? 0,
      };
    },
    enabled: !!userId,
    staleTime: 60_000, // 1 минута — статистика не критична к свежести
  });
}
