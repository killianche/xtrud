// Hooks для управления portfolio_items текущего мастера.
//
// queryKey стратегия:
// - ['portfolio', masterId] — список фото конкретного мастера. Также используется
//   sprint 8.3 public master view (тот же набор данных, RLS read public).
//
// Лимит 12 фото enforced trigger'ом БД, на клиенте disable add при достижении.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteFromBucket } from "@/lib/image-upload";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type PortfolioItem = Tables<"portfolio_items">;

export const PORTFOLIO_MAX = 12;

export function portfolioKey(masterId: string | null | undefined) {
  return ["portfolio", masterId] as const;
}

export function useMasterPortfolio(masterId: string | null | undefined) {
  return useQuery<PortfolioItem[]>({
    queryKey: portfolioKey(masterId),
    queryFn: async () => {
      if (!masterId) return [];
      const { data, error } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("master_id", masterId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!masterId,
    staleTime: 60_000,
  });
}

/**
 * Inserts a portfolio_items row. Storage-upload должен быть сделан caller'ом
 * (через useUploadPortfolioImage), сюда передаются метаданные.
 *
 * sort_order ставим в конец списка (max + 1) — порядок сохраняется при добавлении.
 */
export function useAddPortfolioItem(masterId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<
    PortfolioItem,
    Error,
    { url: string; storagePath: string; width?: number; height?: number }
  >({
    mutationFn: async ({ url, storagePath, width, height }) => {
      if (!masterId) throw new Error("Не авторизованы");

      const { data: maxRow } = await supabase
        .from("portfolio_items")
        .select("sort_order")
        .eq("master_id", masterId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = (maxRow?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from("portfolio_items")
        .insert({
          master_id: masterId,
          url,
          storage_path: storagePath,
          width: width ?? null,
          height: height ?? null,
          sort_order: nextOrder,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portfolioKey(masterId) });
    },
  });
}

/**
 * Удаляет row + соответствующий объект из bucket portfolio.
 * Если row удалили — даже при ошибке storage-delete (например, файл уже исчез),
 * UI должен очиститься. Поэтому storage-delete не throw'ит наружу.
 */
export function useDeletePortfolioItem(masterId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; storagePath: string }>({
    mutationFn: async ({ id, storagePath }) => {
      const { error } = await supabase.from("portfolio_items").delete().eq("id", id);
      if (error) throw error;
      try {
        await deleteFromBucket({ bucket: "portfolio", path: storagePath });
      } catch {
        // Тихо — row уже удалён, файл максимум осиротеет.
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portfolioKey(masterId) });
    },
  });
}
