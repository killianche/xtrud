/**
 * useAdminMastersRatings — рейтинг мастеров по категориям для админки.
 *
 * Показывает владельцу/админу, у кого какой внутренний балл (ranking_score,
 * см. MASTER_RANKING_PLAN.md) внутри каждой L2-категории: имя мастера, балл,
 * публичный рейтинг (★ + кол-во отзывов), статус доступности. Сгруппировано по
 * категориям, внутри — по баллу убыванию (как клиент видит выдачу).
 *
 * Доступ: master_profiles / users / categories_l2 / master_categories —
 * public-read, так что админ видит всех (включая скрытых из поиска и demo —
 * это внутренняя аналитика, не клиентская выдача).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export interface AdminMasterRating {
  masterId: string;
  name: string;
  rankingScore: number;
  ratingAvg: number | null;
  ratingCount: number;
  availabilityStatus: Enums<"availability_status"> | null;
  availabilityUntil: string | null;
  hiddenFromSearch: boolean;
}

export interface AdminCategoryRatings {
  l2Id: string;
  categoryName: string;
  sortOrder: number;
  masters: AdminMasterRating[];
}

export function useAdminMastersRatings() {
  return useQuery<AdminCategoryRatings[]>({
    queryKey: ["admin", "master-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_categories").select(
        `
          l2_id,
          l2:categories_l2 ( name_ru, sort_order ),
          profile:master_profiles!master_categories_master_id_fkey (
            ranking_score, rating_overall_avg, rating_overall_count,
            availability_status, availability_until, is_hidden_from_search,
            user:users!master_profiles_user_id_fkey ( id, first_name, last_name )
          )
        `,
      );
      if (error) throw error;

      type Row = {
        l2_id: string;
        l2: { name_ru: string; sort_order: number } | null;
        profile: {
          ranking_score: number;
          rating_overall_avg: number | null;
          rating_overall_count: number;
          availability_status: Enums<"availability_status"> | null;
          availability_until: string | null;
          is_hidden_from_search: boolean | null;
          user: { id: string; first_name: string | null; last_name: string | null } | null;
        } | null;
      };

      const rows = (data ?? []) as unknown as Row[];
      const byCategory = new Map<string, AdminCategoryRatings>();

      for (const r of rows) {
        if (!r.profile?.user) continue;
        const cat = byCategory.get(r.l2_id) ?? {
          l2Id: r.l2_id,
          categoryName: r.l2?.name_ru ?? r.l2_id,
          sortOrder: r.l2?.sort_order ?? 999,
          masters: [],
        };
        cat.masters.push({
          masterId: r.profile.user.id,
          name:
            [r.profile.user.first_name, r.profile.user.last_name].filter(Boolean).join(" ") ||
            "Без имени",
          rankingScore: r.profile.ranking_score ?? 0,
          ratingAvg: r.profile.rating_overall_avg,
          ratingCount: r.profile.rating_overall_count ?? 0,
          availabilityStatus: r.profile.availability_status,
          availabilityUntil: r.profile.availability_until,
          hiddenFromSearch: r.profile.is_hidden_from_search === true,
        });
        byCategory.set(r.l2_id, cat);
      }

      const result = Array.from(byCategory.values());
      for (const cat of result) {
        cat.masters.sort((a, b) => b.rankingScore - a.rankingScore);
      }
      result.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.categoryName.localeCompare(b.categoryName),
      );
      return result;
    },
    staleTime: 30_000,
  });
}
