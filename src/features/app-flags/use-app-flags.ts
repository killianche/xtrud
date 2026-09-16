/**
 * Флаги интерфейса из админки (0205) — например, вид экрана «Найти задание».
 * Нужны для отката без новой сборки. Не прочитали — действует значение по
 * умолчанию; последний ответ хранится в кэше запросов между запусками.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { type AppFlags, DEFAULT_APP_FLAGS, parseAppFlags } from "./app-flags";

export type { AppFlags, FindScreenVariant } from "./app-flags";

export function useAppFlags(): AppFlags {
  const q = useQuery<AppFlags>({
    queryKey: ["app-flags"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_app_flags");
      if (error) throw error;
      return parseAppFlags(data);
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
  return q.data ?? DEFAULT_APP_FLAGS;
}
