// Instagram специалиста (0218, №207): заявка → проверка админом → в профиле.
// Смена имени — снова на проверку; пустое поле — убрать.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type InstagramStatus = "none" | "pending" | "approved" | "rejected";

export interface MyInstagram {
  status: InstagramStatus;
  handle: string | null;
  reason: string | null;
}

export function parseMyInstagram(raw: unknown): MyInstagram {
  const r = (raw ?? {}) as { status?: unknown; handle?: unknown; reason?: unknown };
  const status: InstagramStatus =
    r.status === "pending" || r.status === "approved" || r.status === "rejected"
      ? r.status
      : "none";
  return {
    status,
    handle: typeof r.handle === "string" ? r.handle : null,
    reason: typeof r.reason === "string" ? r.reason : null,
  };
}

const KEY = ["my-instagram"] as const;

export function useMyInstagram(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_instagram");
      if (error) throw error;
      return parseMyInstagram(data);
    },
  });
}

export function useSubmitInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (handle: string) => {
      const { data, error } = await supabase.rpc("submit_instagram", { p_handle: handle });
      if (error) throw error;
      return parseMyInstagram(data);
    },
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
    },
  });
}

/** То же, что делает база: «@имя» и ссылка instagram.com/имя → имя. */
export function normalizeInstagram(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
}

export function isInstagramValid(handle: string): boolean {
  return handle === "" || /^[a-z0-9._]{1,30}$/.test(handle);
}
