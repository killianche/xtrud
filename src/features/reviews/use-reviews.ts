// Hooks для отзывов:
// - useMyReviewForOrder: проверка, есть ли мой отзыв по заказу (sprint 7.3 client-only)
// - useSubmitReview: создание отзыва client→master

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
