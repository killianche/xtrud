/**
 * Хуки для избранных мастеров (миграция 0089).
 *
 * - useIsFavorite(masterId)    — boolean: «у меня этот мастер в избранном?»
 * - useToggleFavorite()        — mutation add/remove (optimistic update)
 * - useMyFavorites()           — list избранных + master profile + основное L2
 *
 * RLS: пользователь видит только свои favorites; мастер не знает кто его добавил.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { supabase } from "@/lib/supabase";

export interface FavoriteMasterRow {
  masterId: string;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  cityId: string | null;
  district: string | null;
  ratingAvg: number | null;
  ratingCount: number;
}

const FAVORITES_LIST_KEY = ["favorites", "my"] as const;
const isFavoriteKey = (masterId: string | undefined) =>
  ["favorites", "is", masterId] as const;

export function useMyFavorites() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  return useQuery<FavoriteMasterRow[]>({
    queryKey: FAVORITES_LIST_KEY,
    queryFn: async () => {
      if (!userId) return [];

      // Шаг 1: получить master_id'ы избранных в порядке добавления.
      const { data: favRows, error: favErr } = await supabase
        .from("user_favorites")
        .select("master_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (favErr) throw favErr;
      if (!favRows || favRows.length === 0) return [];

      const ids = favRows.map((r) => r.master_id);

      // Шаг 2: подтянуть публичные поля users пачкой.
      const { data: usersRows, error: usersErr } = await supabase
        .from("users")
        .select("id, first_name, last_name, avatar_url, city_id, district")
        .in("id", ids);
      if (usersErr) throw usersErr;

      // Шаг 3: рейтинги мастеров пачкой (необязательно, master_profile может отсутствовать).
      const { data: profileRows } = await supabase
        .from("master_profiles")
        .select("user_id, rating_overall_avg, rating_overall_count")
        .in("user_id", ids);

      const userById = new Map((usersRows ?? []).map((u) => [u.id, u]));
      const profileById = new Map((profileRows ?? []).map((p) => [p.user_id, p]));

      // Сохраняем порядок favRows (DESC по created_at).
      return favRows
        .map((r) => {
          const u = userById.get(r.master_id);
          const p = profileById.get(r.master_id);
          if (!u) return null;
          return {
            masterId: r.master_id,
            createdAt: r.created_at,
            firstName: u.first_name ?? null,
            lastName: u.last_name ?? null,
            avatarUrl: u.avatar_url ?? null,
            cityId: u.city_id ?? null,
            district: u.district ?? null,
            ratingAvg: p?.rating_overall_avg ?? null,
            ratingCount: p?.rating_overall_count ?? 0,
          };
        })
        .filter((x): x is FavoriteMasterRow => x !== null);
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useIsFavorite(masterId: string | undefined) {
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  return useQuery<boolean>({
    queryKey: isFavoriteKey(masterId),
    queryFn: async () => {
      if (!userId || !masterId) return false;
      const { data, error } = await supabase
        .from("user_favorites")
        .select("master_id")
        .eq("user_id", userId)
        .eq("master_id", masterId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!userId && !!masterId,
    staleTime: 30_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  return useMutation({
    mutationFn: async (input: { masterId: string; nextValue: boolean }) => {
      if (!userId) throw new Error("Войдите в аккаунт, чтобы добавить в избранное.");
      if (userId === input.masterId) {
        throw new Error("Себя добавить в избранное нельзя.");
      }
      if (input.nextValue) {
        const { error } = await supabase
          .from("user_favorites")
          .insert({ user_id: userId, master_id: input.masterId });
        // Идемпотентность: 23505 = unique_violation (уже в избранном) — не падаем.
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("master_id", input.masterId);
        if (error) throw error;
      }
    },
    onMutate: async ({ masterId, nextValue }) => {
      await qc.cancelQueries({ queryKey: isFavoriteKey(masterId) });
      const prev = qc.getQueryData<boolean>(isFavoriteKey(masterId));
      qc.setQueryData(isFavoriteKey(masterId), nextValue);
      return { prev };
    },
    onError: (_err, { masterId }, ctx) => {
      // Rollback optimistic.
      if (ctx) qc.setQueryData(isFavoriteKey(masterId), ctx.prev);
    },
    onSettled: (_data, _err, { masterId }) => {
      qc.invalidateQueries({ queryKey: isFavoriteKey(masterId) });
      qc.invalidateQueries({ queryKey: FAVORITES_LIST_KEY });
    },
  });
}
