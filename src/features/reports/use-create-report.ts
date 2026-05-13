/**
 * Hook для создания жалобы (Sprint I.4). RLS требует reporter_id = auth.uid().
 */

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type ReportTargetType = Database["public"]["Enums"]["report_target_type"];
export type ReportReason = Database["public"]["Enums"]["report_reason"];

export interface CreateReportInput {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export function useCreateReport() {
  return useMutation({
    mutationFn: async (input: CreateReportInput) => {
      const { error } = await supabase.from("reports").insert({
        reporter_id: input.reporterId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        description: input.description?.trim() || null,
      });
      if (error) throw error;
    },
  });
}

export const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Спам",
  fraud: "Мошенничество",
  inappropriate: "Оскорбительный контент",
  fake_profile: "Фейковый профиль",
  fake_review: "Накрученный отзыв",
  off_platform: "Предлагает работать вне платформы",
  safety: "Угроза безопасности",
  other: "Другое",
};

/**
 * Разные target_type показывают разный набор reason'ов.
 */
export function reasonsFor(targetType: ReportTargetType): ReportReason[] {
  switch (targetType) {
    case "user":
      return ["fraud", "fake_profile", "inappropriate", "safety", "off_platform", "other"];
    case "order":
      return ["spam", "fraud", "inappropriate", "other"];
    case "review":
      return ["fake_review", "inappropriate", "other"];
    case "message":
      return ["spam", "inappropriate", "off_platform", "safety", "other"];
  }
}
