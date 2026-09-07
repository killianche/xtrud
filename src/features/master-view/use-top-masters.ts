/**
 * Hook: топ-N мастеров глобально (не привязка к L2) — для карусели на главной.
 *
 * Сортировка: rating_overall_avg DESC (NULLS LAST) → closed_deals DESC →
 * experience_years DESC. Показываем только тех, кто завершил онбординг
 * (onboarding_completed_at NOT NULL) и активный мастер.
 *
 * RLS: read-public на users + master_profiles.
 */

import { useQuery } from "@tanstack/react-query";
import { excludeBlockedUsers, useBlockedUserIds } from "@/features/blocking/use-user-blocks";
import { shouldHideDemo } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type TopMaster = {
  user: Pick<
    Tables<"users">,
    "id" | "first_name" | "last_name" | "avatar_url" | "city_id" | "district"
  >;
  profile: Pick<
    Tables<"master_profiles">,
    | "rating_overall_avg"
    | "rating_overall_count"
    | "closed_deals"
    | "experience_years"
    | "availability_status"
    | "availability_until"
    | "ranking_score"
  >;
  city: Pick<Tables<"cities">, "id" | "name"> | null;
  /** Имена L2-категорий мастера (для строки «чем занимается» в карточке). */
  categories: string[];
};

export function useTopMasters(limit = 7) {
  const query = useQuery<TopMaster[]>({
    queryKey: ["top-masters", limit] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_profiles")
        .select(
          `
          rating_overall_avg, rating_overall_count, closed_deals, experience_years,
          availability_status, availability_until, ranking_score, is_hidden_from_search,
          user:users!master_profiles_user_id_fkey (
            id, first_name, last_name, avatar_url, city_id, district, onboarding_completed_at, is_demo
          )
          `,
        )
        .eq("status", "active")
        // Сортировка по внутреннему рейтингу (MASTER_RANKING_PLAN.md Этап 1).
        // «Лучшие мастера» — витрина, здесь чистый балл (без бонуса доступности).
        .order("ranking_score", { ascending: false })
        .order("closed_deals", { ascending: false })
        .order("experience_years", { ascending: false })
        .limit(limit * 2); // overfetch: отфильтруем тех у кого онбординг не пройден
      if (error) throw error;

      type Row = {
        rating_overall_avg: number | null;
        rating_overall_count: number;
        closed_deals: number;
        experience_years: number | null;
        availability_status: TopMaster["profile"]["availability_status"];
        availability_until: string | null;
        ranking_score: number;
        is_hidden_from_search: boolean | null;
        user:
          | (Pick<
              Tables<"users">,
              "id" | "first_name" | "last_name" | "avatar_url" | "city_id" | "district"
            > & { onboarding_completed_at: string | null; is_demo: boolean | null })
          | null;
      };
      const rows = (data ?? []) as unknown as Row[];

      // P0-10: фильтр is_hidden_from_search (privacy bug — мастер скрыл профиль
      // через settings, но top-carousel его показывал).
      // P0-09: фильтр demo-аккаунтов в production submit (EXPO_PUBLIC_DEMO_MODE=false).
      const hideDemo = shouldHideDemo();
      const filtered = rows
        .filter((r) => {
          if (!r.user || r.user.onboarding_completed_at === null) return false;
          if (r.is_hidden_from_search === true) return false;
          if (hideDemo && r.user.is_demo === true) return false;
          return true;
        })
        .slice(0, limit);

      const cityIds = Array.from(
        new Set(filtered.map((r) => r.user?.city_id).filter((v): v is string => !!v)),
      );

      // Города и категории не зависят друг от друга — один round-trip вместо
      // двух подряд (QA, 2026-09-07).
      const masterIds = filtered.map((r) => r.user?.id).filter((v): v is string => !!v);
      const [citiesRes, catsRes] = await Promise.all([
        cityIds.length > 0
          ? supabase.from("cities").select("id, name").in("id", cityIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
        masterIds.length > 0
          ? supabase
              .from("master_categories")
              .select("master_id, l2:categories_l2(name_ru, sort_order)")
              .in("master_id", masterIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (citiesRes.error) throw citiesRes.error;
      if (catsRes.error) throw catsRes.error;
      const citiesMap = new Map<string, { id: string; name: string }>(
        (citiesRes.data ?? []).map((c) => [c.id, c]),
      );
      const categoriesMap = new Map<string, string[]>();
      {
        const catRows = catsRes.data;
        type CatRow = {
          master_id: string;
          l2: { name_ru: string; sort_order: number } | null;
        };
        for (const row of (catRows ?? []) as unknown as CatRow[]) {
          if (!row.l2) continue;
          const list = categoriesMap.get(row.master_id) ?? [];
          list.push(row.l2.name_ru);
          categoriesMap.set(row.master_id, list);
        }
      }

      return filtered
        .map<TopMaster | null>((r) => {
          if (!r.user) return null;
          const { onboarding_completed_at: _ignored, ...userFields } = r.user;
          return {
            user: userFields,
            profile: {
              rating_overall_avg: r.rating_overall_avg,
              rating_overall_count: r.rating_overall_count,
              closed_deals: r.closed_deals,
              experience_years: r.experience_years,
              availability_status: r.availability_status,
              availability_until: r.availability_until,
              ranking_score: r.ranking_score,
            },
            city: r.user.city_id ? (citiesMap.get(r.user.city_id) ?? null) : null,
            categories: categoriesMap.get(r.user.id) ?? [],
          };
        })
        .filter((m): m is TopMaster => m !== null);
    },
    staleTime: 60_000,
  });

  // UGC safety: та же односторонняя фильтрация, что и в use-masters-by-l2.ts.
  const blocked = useBlockedUserIds();
  const data = excludeBlockedUsers(query.data, blocked.data, (m) => m.user.id);
  return { ...query, data };
}
