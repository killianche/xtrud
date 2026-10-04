// Флаги интерфейса с сервера (get_app_flags, 0205/0216): вид экрана меняется
// из админки без новой сборки — «чтобы можно было быстро откатиться»
// (владелец, 2026-10-04). Пока ответа нет или сервер старый — прежний вид.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

import { type AppFlags, parseAppFlags } from "./app-flags";

export type { AppFlags, FindTilesVariant } from "./app-flags";

const DEFAULT_FLAGS: AppFlags = { findTiles: "grid", requireLogin: false };

/** Флаги и признак, что ответ сервера уже есть (до него — не решаем). */
export function useAppFlagsQuery() {
  return useQuery({
    queryKey: ["app-flags"],
    queryFn: async () => {
      const { data: raw, error } = await supabase.rpc("get_app_flags");
      if (error) throw error;
      return parseAppFlags(raw);
    },
    staleTime: 5 * 60_000,
  });
}

export function useAppFlags(): AppFlags {
  return useAppFlagsQuery().data ?? DEFAULT_FLAGS;
}
