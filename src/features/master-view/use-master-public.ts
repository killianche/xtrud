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
import { useBlockedUserIds } from "@/features/blocking/use-user-blocks";
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
    | "rating_overall_avg"
    | "rating_overall_count"
    | "closed_deals"
    | "languages"
    | "status"
    | "account_type"
    | "team_size"
    | "availability_status"
    | "availability_until"
    | "whatsapp_phone"
    | "whatsapp_same_as_phone"
    | "verification_level"
  > | null;
};

export function useMasterPublicProfile(masterId: string | null | undefined) {
  const query = useQuery<MasterPublicProfile | null>({
    queryKey: ["master-public", masterId],
    // Один запрос вместо трёх последовательных. Раньше здесь шли подряд
    // users → master_profiles → cities, то есть три обращения к серверу друг
    // за другом, и весь экран мастера стоял под скелетом до последнего из них.
    // PostgREST умеет вложенную выборку по внешнему ключу — берём всё разом.
    //
    // Запрос города убран целиком: поле city не читает ни один из трёх
    // потребителей хука (экран мастера, экран заказа, экран кейса), а город
    // мастера на карточке намеренно не показывается. Третий round-trip делался
    // впустую.
    queryFn: async () => {
      if (!masterId) return null;

      const { data, error } = await supabase
        .from("users")
        .select(
          "id, first_name, last_name, avatar_url, city_id, district, is_master, master:master_profiles!master_profiles_user_id_fkey(bio, experience_years, rating_overall_avg, rating_overall_count, closed_deals, languages, status, account_type, team_size, availability_status, availability_until, whatsapp_phone, whatsapp_same_as_phone, verification_level)",
        )
        .eq("id", masterId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // Вложенная выборка по связи «один к одному» приходит объектом либо
      // массивом в зависимости от того, как PostgREST вывел кардинальность.
      // Приводим к одной форме, чтобы потребители не гадали.
      const { master: rawMaster, ...user } = data as typeof data & { master: unknown };
      const master = Array.isArray(rawMaster) ? (rawMaster[0] ?? null) : (rawMaster ?? null);

      return { user, master } as MasterPublicProfile;
    },
    enabled: !!masterId,
    staleTime: 60_000,
  });

  // UGC safety блокировка (см. use-user-blocks.ts): если ТЕКУЩИЙ пользователь
  // заблокировал masterId, экран должен вести себя так же, как для несущест-
  // вующего профиля — переиспользуем состояние «профиль не найден» вместо
  // нового баннера, чтобы не выдавать, что здесь сработала именно блокировка
  // (двусмысленность намеренная). Обратное направление («меня заблокировал
  // этот мастер») клиенту недоступно и не фильтруется — см. useBlockedUserIds.
  const blocked = useBlockedUserIds();
  const isBlockedByMe = !!masterId && !!blocked.data?.has(masterId);
  return { ...query, data: isBlockedByMe ? null : query.data };
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
