// Hooks для отзывов:
// - useMyReviewForOrder: проверка, есть ли мой отзыв по заказу (sprint 7.3 client-only)
// - useSubmitReview: создание отзыва client→master по заказу
// - useSubmitMasterReview: freeform-отзыв на мастера с профиля (без заказа,
//   лимит 1/30 дней, реализовано через RPC submit_master_review с миграции
//   freeform_master_reviews 2026-05-27).
// - useMyRecentReviewForMaster: проверка, может ли клиент оставить отзыв
//   этому мастеру (есть ли отзыв за последние 30 дней).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Tables } from "@/types/database";

export type Review = Tables<"reviews">;

export function myReviewForOrderKey(orderId: string | undefined, userId: string | undefined) {
  return ["my-review-for-order", orderId, userId] as const;
}

export function useMyReviewForOrder(orderId: string | undefined, userId: string | undefined) {
  return useQuery<Review | null>({
    queryKey: myReviewForOrderKey(orderId, userId),
    queryFn: async () => {
      if (!orderId || !userId) return null;
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("order_id", orderId)
        .eq("author_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && !!userId,
    staleTime: 30_000,
  });
}

export interface SubmitReviewInput {
  orderId: string;
  authorId: string;
  targetId: string;
  l2Id: string;
  rating: number;
  text: string;
  direction: Database["public"]["Enums"]["review_direction"];
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitReviewInput) => {
      const { error } = await supabase.from("reviews").insert({
        order_id: input.orderId,
        author_id: input.authorId,
        target_id: input.targetId,
        l2_id: input.l2Id,
        rating: input.rating,
        text: input.text || null,
        direction: input.direction,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, authorId }) => {
      queryClient.invalidateQueries({ queryKey: myReviewForOrderKey(orderId, authorId) });
    },
  });
}

// ============================================================================
// Freeform отзывы на мастера (без привязки к заказу).
// Backend: RPC `submit_master_review` из миграции freeform_master_reviews
// (2026-05-27). RPC сам проверяет лимит 1 отзыв / 30 дней / (author,target).
// ============================================================================

export function recentReviewByAuthorKey(targetId: string | undefined, authorId: string | undefined) {
  return ["recent-review-by-author", targetId, authorId] as const;
}

/** Проверка: есть ли отзыв от текущего клиента на этого мастера за последние
 *  30 дней. Используется чтобы скрыть кнопку «Оставить отзыв» / показать
 *  «Вы уже оставили отзыв». */
export function useMyRecentReviewForMaster(
  targetId: string | undefined,
  authorId: string | undefined,
) {
  return useQuery<Review | null>({
    queryKey: recentReviewByAuthorKey(targetId, authorId),
    queryFn: async () => {
      if (!targetId || !authorId) return null;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("target_id", targetId)
        .eq("author_id", authorId)
        .eq("direction", "client_to_master")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!targetId && !!authorId,
    staleTime: 30_000,
  });
}

export interface SubmitMasterReviewInput {
  targetId: string;
  rating: number;
  text?: string;
}

/** Отправить freeform-отзыв на мастера (без заказа). RPC сам проверит
 *  авторизацию, рейтинг 1-5, что target — мастер, и лимит 1/30 дней.
 *  Возвращает id созданного отзыва. */
export function useSubmitMasterReview(authorId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitMasterReviewInput) => {
      const { data, error } = await supabase.rpc("submit_master_review", {
        p_target_id: input.targetId,
        p_rating: input.rating,
        p_text: input.text?.trim() || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { targetId }) => {
      queryClient.invalidateQueries({
        queryKey: recentReviewByAuthorKey(targetId, authorId),
      });
      // Профиль мастера держит rating_overall_avg/count — инвалидируем,
      // чтобы шапка обновилась после успешной отправки.
      queryClient.invalidateQueries({ queryKey: ["master-public-profile", targetId] });
      queryClient.invalidateQueries({ queryKey: ["master-reviews", targetId] });
    },
  });
}
