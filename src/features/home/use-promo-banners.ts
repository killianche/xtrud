/**
 * Рекламные баннеры Главной — из таблицы public.promo_banners (0206).
 *
 * Добавляет и включает их владелец в веб-админке («Реклама»). База отдаёт
 * только включённые (RLS). Ни одного — блок «Реклама» на Главной не
 * показывается вовсе (DECISION владельца 2026-09-22: баннер-заглушку с
 * кроссовками отключить до своих баннеров).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PromoBanner {
  id: string;
  image_url: string;
  link_url: string | null;
  title: string | null;
}

export const promoBannersKey = ["promo-banners"] as const;

export function usePromoBanners() {
  return useQuery<PromoBanner[]>({
    queryKey: promoBannersKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_banners")
        .select("id,image_url,link_url,title")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PromoBanner[];
    },
    // Реклама меняется редко; сеть не должна дёргаться на каждом заходе.
    staleTime: 10 * 60_000,
  });
}
