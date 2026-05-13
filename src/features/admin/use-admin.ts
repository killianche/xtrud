/**
 * Admin hooks (Sprint I.5):
 *   - useReportsQueue — список жалоб (pending первыми), доступен только админу
 *     (RLS отсекает не-админов; для не-админа возвращается пустой массив)
 *   - useUpdateReport — изменить статус / admin_note
 *   - useUpdateUserStatus — суспенд/бан юзера
 *   - useUpdateReviewStatus — скрыть/восстановить отзыв
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Tables } from "@/types/database";

export type ReportRow = Tables<"reports">;
export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type ReportWithReporter = ReportRow & {
  reporter: Pick<Tables<"users">, "id" | "first_name" | "last_name" | "avatar_url"> | null;
};

export function adminReportsKey(status: ReportStatus | "all" = "pending") {
  return ["admin", "reports", status] as const;
}

export function useReportsQueue(status: ReportStatus | "all" = "pending") {
  return useQuery<ReportWithReporter[]>({
    queryKey: adminReportsKey(status),
    queryFn: async () => {
      let q = supabase
        .from("reports")
        .select("*, reporter:users!reports_reporter_id_fkey(id, first_name, last_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (status !== "all") {
        q = q.eq("status", status);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ReportWithReporter[];
    },
    staleTime: 15_000,
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reportId: string;
      status: ReportStatus;
      adminNote?: string | null;
      reviewerId: string;
    }) => {
      const { error } = await supabase
        .from("reports")
        .update({
          status: input.status,
          admin_note: input.adminNote ?? null,
          reviewed_by: input.reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", input.reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reports"] });
    },
  });
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      status: Database["public"]["Enums"]["user_status"];
    }) => {
      const { error } = await supabase
        .from("users")
        .update({ status: input.status })
        .eq("id", input.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useUpdateReviewStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reviewId: string;
      status: Database["public"]["Enums"]["review_status"];
    }) => {
      const { error } = await supabase
        .from("reviews")
        .update({ status: input.status })
        .eq("id", input.reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
