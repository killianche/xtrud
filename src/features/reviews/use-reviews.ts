// Hooks для отзывов:
// - useMyReviewForOrder: проверка, есть ли мой отзыв по заказу (sprint 7.3 client-only)
// - useSubmitReview: создание отзыва client→master по заказу
// - useSubmitMasterReview: отзыв специалисту по завершённому заданию (0196).
// - useReviewableOrderForMaster: есть ли завершённое задание с этим
//   специалистом без моего отзыва — от этого зависит кнопка «Оставить отзыв».
// - useHasDirectReview / useSubmitDirectReview: отзыв без задания (0254,
//   №356) — не влияет на рейтинг, может уйти «на проверку».

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
// Отзыв специалисту — только по завершённому заданию (0196, DECISION владельца
// 2026-09-13: «только в таком случае можно оставить отзыв, просто так нельзя»).
// RPC `submit_master_review` проверяет: задание моё, завершено, исполнитель —
// этот специалист, отзыва по заданию ещё нет. Лимит «раз в три дня» снят (0198).
// ============================================================================

export interface ReviewableOrder {
  id: string;
  title: string;
}

export const reviewableOrderKey = (targetId: string | undefined, authorId: string | undefined) =>
  ["reviewable-order", targetId, authorId] as const;

/**
 * Последнее моё завершённое задание с этим специалистом, по которому я ещё
 * не оставил отзыв. Нет такого — кнопки «Оставить отзыв» нет.
 */
export function useReviewableOrderForMaster(
  targetId: string | undefined,
  authorId: string | undefined,
) {
  return useQuery<ReviewableOrder | null>({
    queryKey: reviewableOrderKey(targetId, authorId),
    queryFn: async () => {
      if (!targetId || !authorId || targetId === authorId) return null;
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, title")
        .eq("client_id", authorId)
        .eq("picked_master_id", targetId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const list = orders ?? [];
      if (list.length === 0) return null;
      const { data: reviewed, error: reviewsError } = await supabase
        .from("reviews")
        .select("order_id")
        .eq("author_id", authorId)
        .in(
          "order_id",
          list.map((o) => o.id),
        );
      if (reviewsError) throw reviewsError;
      const done = new Set((reviewed ?? []).map((r) => r.order_id));
      return list.find((o) => !done.has(o.id)) ?? null;
    },
    enabled: !!targetId && !!authorId,
    staleTime: 30_000,
  });
}

export interface SubmitMasterReviewInput {
  targetId: string;
  orderId: string;
  rating: number;
  text?: string;
}

/** Отправить отзыв специалисту по завершённому заданию. Возвращает id отзыва. */
export function useSubmitMasterReview(authorId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitMasterReviewInput) => {
      const { data, error } = await supabase.rpc("submit_master_review", {
        p_target_id: input.targetId,
        p_order_id: input.orderId,
        p_rating: input.rating,
        p_text: input.text?.trim() || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { targetId, orderId }) => {
      queryClient.invalidateQueries({ queryKey: reviewableOrderKey(targetId, authorId) });
      queryClient.invalidateQueries({ queryKey: myReviewForOrderKey(orderId, authorId) });
      // Шапка профиля (rating_overall_avg/count) и список отзывов —
      // ключи из use-master-public.ts.
      queryClient.invalidateQueries({ queryKey: ["master-public", targetId] });
      queryClient.invalidateQueries({ queryKey: ["reviews-for-target", targetId] });
    },
  });
}

// ============================================================================
// Отзыв без задания (0254, DECISION владельца 2026-10-22, №356): человек, кто
// нашёл специалиста, но не создавал задание, может оставить отзыв один раз.
// В рейтинг не идёт (recalc_master_rating считает только order_id IS NOT
// NULL) — профиль всё равно инвалидируем, чтобы новая строка в списке
// появилась сразу. RPC `submit_direct_review` сама проверяет лимиты и при
// признаках накрутки возвращает status "pending" вместо "visible".
// ============================================================================

export const hasDirectReviewKey = (targetId: string | undefined, authorId: string | undefined) =>
  ["has-direct-review", targetId, authorId] as const;

/**
 * Уже оставлен отзыв без задания этому специалисту? RLS разрешает автору
 * видеть свой отзыв в любом статусе (visible/pending/hidden, раздел 1
 * REVIEWS_WITHOUT_ORDER_2026-10.md) — запрос поэтому ищет любую строку, а не
 * только видимую.
 */
export function useHasDirectReview(targetId: string | undefined, authorId: string | undefined) {
  return useQuery<boolean>({
    queryKey: hasDirectReviewKey(targetId, authorId),
    queryFn: async () => {
      if (!targetId || !authorId) return false;
      const { data, error } = await supabase
        .from("reviews")
        .select("id")
        .eq("author_id", authorId)
        .eq("target_id", targetId)
        .is("order_id", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!targetId && !!authorId && targetId !== authorId,
    staleTime: 30_000,
  });
}

export interface SubmitDirectReviewInput {
  targetId: string;
  rating: number;
  text: string;
}

export interface SubmitDirectReviewResult {
  id: string;
  status: "visible" | "pending";
}

/** Отправить отзыв без задания. Возвращает {id, status} — экран показывает
 *  разный текст успеха в зависимости от того, ушёл отзыв сразу или «на
 *  проверку» (§7.3). */
export function useSubmitDirectReview(authorId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitDirectReviewInput) => {
      const { data, error } = await supabase.rpc("submit_direct_review", {
        p_target_id: input.targetId,
        p_rating: input.rating,
        p_text: input.text.trim(),
      });
      if (error) throw error;
      return data as SubmitDirectReviewResult;
    },
    onSuccess: (_result, { targetId }) => {
      // Те же ключи, что у useSubmitMasterReview, плюс «уже оставлял» —
      // myReviewForOrderKey не нужен: у отзыва без задания нет orderId.
      queryClient.invalidateQueries({ queryKey: reviewableOrderKey(targetId, authorId) });
      queryClient.invalidateQueries({ queryKey: hasDirectReviewKey(targetId, authorId) });
      queryClient.invalidateQueries({ queryKey: ["master-public", targetId] });
      queryClient.invalidateQueries({ queryKey: ["reviews-for-target", targetId] });
    },
  });
}
