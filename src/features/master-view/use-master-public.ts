/**
 * Hooks для публичной страницы мастера `/master/[id]`.
 *
 * Все RLS политики уже разрешают SELECT публично:
 * - users / master_profiles (read all)
 * - master_categories (read all)
 * - portfolio_items (read all)
 * - reviews (read visible)
 *
 * useMasterPortfolio (см. profile/use-my-portfolio.ts) переиспользуем — тот же queryKey
 * и тот же набор данных.
 */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

const REVIEWS_PAGE_SIZE = 20;

export type MasterPublicProfile = {
  user: Pick<
    Tables<"users">,
    "id" | "first_name" | "last_name" | "avatar_url" | "city_id" | "district" | "is_master"
  >;
  master: Pick<
    Tables<"master_profiles">,
    | "bio"
    | "experience_years"
    | "has_tools"
    | "has_transport"
    | "rating_overall_avg"
    | "rating_overall_count"
    | "closed_deals"
    | "languages"
    | "status"
    | "account_type"
    | "team_size"
    | "availability_status"
    | "availability_until"
  > | null;
  city: { id: string; name: string } | null;
};

export function useMasterPublicProfile(masterId: string | null | undefined) {
  return useQuery<MasterPublicProfile | null>({
    queryKey: ["master-public", masterId],
    queryFn: async () => {
      if (!masterId) return null;

      const { data: userData, error: userErr } = await supabase
        .from("users")
        .select("id, first_name, last_name, avatar_url, city_id, district, is_master")
        .eq("id", masterId)
        .maybeSingle();
      if (userErr) throw userErr;
      if (!userData) return null;

      const { data: masterData, error: masterErr } = await supabase
        .from("master_profiles")
        .select(
          "bio, experience_years, has_tools, has_transport, rating_overall_avg, rating_overall_count, closed_deals, languages, status, account_type, team_size, availability_status, availability_until",
        )
        .eq("user_id", masterId)
        .maybeSingle();
      if (masterErr) throw masterErr;

      let city: { id: string; name: string } | null = null;
      if (userData.city_id) {
        const { data: cityData } = await supabase
          .from("cities")
          .select("id, name")
          .eq("id", userData.city_id)
          .maybeSingle();
        if (cityData) city = cityData;
      }

      return { user: userData, master: masterData, city };
    },
    enabled: !!masterId,
    staleTime: 60_000,
  });
}

/**
 * Категории конкретного мастера для публичного просмотра.
 * Возвращает строки master_categories с JOIN на categories_l2 для имени.
 */
export type MasterCategoryPublic = Tables<"master_categories"> & {
  l2: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon"> | null;
};

export function useMasterCategoriesPublic(masterId: string | null | undefined) {
  return useQuery<MasterCategoryPublic[]>({
    queryKey: ["master-categories-public", masterId],
    queryFn: async () => {
      if (!masterId) return [];
      const { data, error } = await supabase
        .from("master_categories")
        .select("*, l2:categories_l2(id, name_ru, icon)")
        .eq("master_id", masterId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as MasterCategoryPublic[] | null) ?? [];
    },
    enabled: !!masterId,
    staleTime: 60_000,
  });
}

/**
 * Видимые отзывы на конкретного target_id с указанным direction.
 * JOIN на users (автор) для отображения имени/аватара.
 */
export type ReviewWithAuthor = Tables<"reviews"> & {
  author: Pick<Tables<"users">, "id" | "first_name" | "last_name" | "avatar_url"> | null;
  l2: Pick<Tables<"categories_l2">, "id" | "name_ru"> | null;
};

type ReviewsPage = { rows: ReviewWithAuthor[]; nextCursor: string | null };

/**
 * Видимые отзывы на target_id, keyset pagination по created_at DESC.
 * Возвращает useInfiniteQuery — caller использует `data.pages.flatMap(p => p.rows)`
 * и `fetchNextPage` / `hasNextPage` для UI кнопки «Показать ещё».
 */
/**
 * Phone мастера для прямого контакта (tel: / wa.me) с публичной страницы.
 * Через RPC `get_master_phone` (миграция 0040) — обходит RLS на users (phone
 * живёт в auth.users), но фильтрует только активных мастеров.
 * Возвращает null для клиентов / неактивных / несуществующих.
 */
export function useMasterPhone(masterId: string | null | undefined) {
  return useQuery<string | null>({
    queryKey: ["master-phone", masterId],
    queryFn: async () => {
      if (!masterId) return null;
      const { data, error } = await supabase.rpc("get_master_phone", {
        p_master_id: masterId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: !!masterId,
    staleTime: 5 * 60_000,
  });
}

export function useReviewsForTarget(
  targetId: string | null | undefined,
  direction: Tables<"reviews">["direction"] = "client_to_master",
) {
  return useInfiniteQuery<ReviewsPage>({
    queryKey: ["reviews-for-target", targetId, direction],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!targetId) return { rows: [], nextCursor: null };
      let q = supabase
        .from("reviews")
        .select(
          "*, author:users!reviews_author_id_fkey(id, first_name, last_name, avatar_url), l2:categories_l2(id, name_ru)",
        )
        .eq("target_id", targetId)
        .eq("direction", direction)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(REVIEWS_PAGE_SIZE);
      if (typeof pageParam === "string") {
        q = q.lt("created_at", pageParam);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data as ReviewWithAuthor[] | null) ?? [];
      const last = rows[rows.length - 1];
      const nextCursor = rows.length === REVIEWS_PAGE_SIZE ? (last?.created_at ?? null) : null;
      return { rows, nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!targetId,
    staleTime: 30_000,
  });
}
