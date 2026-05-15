/**
 * Hook: список мастеров, работающих в конкретной L2 категории.
 *
 * Показывается в category-detail. Два запроса:
 *  1) master_categories JOIN users + master_profiles по master_id.
 *  2) cities по уникальным city_id из шага 1.
 *
 * Сортировка по rating_overall_avg DESC (NULLS LAST), затем closed_deals DESC,
 * затем experience_years DESC — сначала проверенные мастера.
 *
 * RLS: read-public на всех трёх таблицах.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type MasterInCategory = {
  master_id: string;
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
    | "bio"
    | "account_type"
    | "team_size"
    | "availability_status"
    | "availability_until"
  > | null;
  city: Pick<Tables<"cities">, "id" | "name"> | null;
};

type Row = {
  master_id: string;
  user: Pick<
    Tables<"users">,
    "id" | "first_name" | "last_name" | "avatar_url" | "city_id" | "district"
  > | null;
  profile: Pick<
    Tables<"master_profiles">,
    | "rating_overall_avg"
    | "rating_overall_count"
    | "closed_deals"
    | "experience_years"
    | "bio"
    | "account_type"
    | "team_size"
    | "availability_status"
    | "availability_until"
  > | null;
};

export function useMastersByL2(l2Id: string | null | undefined) {
  return useQuery<MasterInCategory[]>({
    queryKey: ["masters-by-l2", l2Id],
    queryFn: async () => {
      if (!l2Id) return [];

      // FK master_categories.master_id ссылается на master_profiles(user_id),
      // НЕ на users(id). Поэтому JOIN до users делаем через master_profiles:
      // master_categories → master_profiles → users.
      const { data, error } = await supabase
        .from("master_categories")
        .select(
          `
          master_id,
          profile:master_profiles!master_categories_master_id_fkey (
            rating_overall_avg, rating_overall_count, closed_deals, experience_years, bio,
            account_type, team_size, availability_status, availability_until,
            user:users!master_profiles_user_id_fkey (
              id, first_name, last_name, avatar_url, city_id, district
            )
          )
          `,
        )
        .eq("l2_id", l2Id);
      if (error) throw error;

      // Развёртываем nested user из profile → row.user (чтобы дальнейший код
      // работал с прежним shape).
      type NestedRow = {
        master_id: string;
        profile:
          | (Omit<NonNullable<Row["profile"]>, never> & {
              user: Row["user"];
            })
          | null;
      };
      const rows: Row[] = ((data ?? []) as unknown as NestedRow[]).map((r) => ({
        master_id: r.master_id,
        user: r.profile?.user ?? null,
        profile: r.profile
          ? {
              rating_overall_avg: r.profile.rating_overall_avg,
              rating_overall_count: r.profile.rating_overall_count,
              closed_deals: r.profile.closed_deals,
              experience_years: r.profile.experience_years,
              bio: r.profile.bio,
              account_type: r.profile.account_type,
              team_size: r.profile.team_size,
              availability_status: r.profile.availability_status,
              availability_until: r.profile.availability_until,
            }
          : null,
      }));

      const cityIds = Array.from(
        new Set(rows.map((r) => r.user?.city_id).filter((v): v is string => !!v)),
      );

      let citiesMap = new Map<string, { id: string; name: string }>();
      if (cityIds.length > 0) {
        const { data: cityData, error: cityErr } = await supabase
          .from("cities")
          .select("id, name")
          .in("id", cityIds);
        if (cityErr) throw cityErr;
        citiesMap = new Map(cityData?.map((c) => [c.id, c]) ?? []);
      }

      const seen = new Set<string>();
      const list: MasterInCategory[] = [];
      for (const r of rows) {
        if (!r.user || seen.has(r.master_id)) continue;
        seen.add(r.master_id);
        list.push({
          master_id: r.master_id,
          user: r.user,
          profile: r.profile,
          city: r.user.city_id ? (citiesMap.get(r.user.city_id) ?? null) : null,
        });
      }

      list.sort((a, b) => {
        const ra = a.profile?.rating_overall_avg ?? -1;
        const rb = b.profile?.rating_overall_avg ?? -1;
        if (rb !== ra) return rb - ra;
        const da = a.profile?.closed_deals ?? 0;
        const db = b.profile?.closed_deals ?? 0;
        if (db !== da) return db - da;
        const ea = a.profile?.experience_years ?? 0;
        const eb = b.profile?.experience_years ?? 0;
        return eb - ea;
      });

      return list;
    },
    enabled: !!l2Id,
    staleTime: 60_000,
  });
}
