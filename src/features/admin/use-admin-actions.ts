/**
 * Админские действия внутри приложения (DECISION владельца 2026-09-08:
 * «выдать аккаунту статус админа — блокировать, удалять и т.д. прямо в
 * приложении»). Все действия — те же RPC admin_*, что у веб-панели: право
 * проверяет база (`is_admin_session()`), приложение лишь показывает кнопки
 * тем, у кого users.is_admin.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserRecord } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export function useIsAdmin(userId: string | undefined): boolean {
  const { data } = useUserRecord(userId);
  return data?.is_admin === true;
}

export type AdminUserStatus = "active" | "suspended" | "banned";

export function useAdminSetUserStatus() {
  const qc = useQueryClient();
  return useMutation<void, Error, { userId: string; status: AdminUserStatus; reason: string }>({
    mutationFn: async ({ userId, status, reason }) => {
      const { error } = await supabase.rpc("admin_set_user_status", {
        p_user_id: userId,
        p_status: status,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { userId }) => {
      qc.invalidateQueries({ queryKey: ["master-public", userId] });
      qc.invalidateQueries({ queryKey: ["search-masters"] });
    },
  });
}

export function useAdminHideOrder() {
  const qc = useQueryClient();
  return useMutation<void, Error, { orderId: string; reason: string }>({
    mutationFn: async ({ orderId, reason }) => {
      const { error } = await supabase.rpc("admin_hide_order", {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-open-orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
    },
  });
}

export interface AdminVerificationRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: "pending" | "approved" | "rejected";
  passport_main_path: string;
  submitted_at: string;
  rejection_reason: string | null;
}

export const adminVerificationsKey = (status: string) => ["admin-verifications", status] as const;

export function useAdminVerifications(
  status: "pending" | "approved" | "rejected",
  enabled: boolean,
) {
  return useQuery<AdminVerificationRow[]>({
    queryKey: adminVerificationsKey(status),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_verifications", { p_status: status });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AdminVerificationRow[];
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useAdminReviewVerification() {
  const qc = useQueryClient();
  return useMutation<void, Error, { userId: string; approve: boolean; reason?: string }>({
    mutationFn: async ({ userId, approve, reason }) => {
      const { error } = await supabase.rpc("admin_review_verification", {
        p_user_id: userId,
        p_approve: approve,
        p_reason: reason ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-verifications"] });
      qc.invalidateQueries({ queryKey: ["search-masters"] });
    },
  });
}

/** Ссылка на фото документа (закрытый бакет, только админу и владельцу). */
export async function verificationPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("master-verifications").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
