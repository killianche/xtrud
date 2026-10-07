/**
 * Админ и управляющий в приложении (№286, docs/STAFF_ROLES_2026-10.md).
 *
 * Права проверяет база (`is_staff_session()` / `is_admin_session()`),
 * приложение лишь показывает кнопки тем, у кого есть роль. Функции staff —
 * те же RPC admin_*, что у веб-админки; в типах базы приложения их нет,
 * поэтому вызов без генерированных типов, с явной формой ответа.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserRecord } from "@/features/auth/use-user-record";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";

export type StaffRole = "admin" | "manager";

/**
 * Роль сотрудника: 'admin' | 'manager' | null, undefined — ещё грузится.
 *
 * Своя запись (users.is_admin / staff_role) лишь отбирает кандидатов —
 * обычный пользователь лишнего запроса не делает. Окончательно роль
 * отвечает база (`my_staff_role()`, 0239): там же условие «не demo,
 * активен», что и в проверках прав (ревью xtrud-security 2026-10-07, M4).
 * Нет связи — роль по записи: кнопки покажутся, право всё равно проверит база.
 */
export function useStaffRole(userId: string | undefined): StaffRole | null | undefined {
  const record = useUserRecord(userId);
  const row = record.data as { is_admin?: boolean; staff_role?: string | null } | null | undefined;
  const fromRow: StaffRole | null =
    row?.is_admin === true ? "admin" : row?.staff_role === "manager" ? "manager" : null;
  const server = useQuery({
    queryKey: ["staff", "my-role", userId],
    enabled: !!userId && fromRow !== null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await staffRpc<string | null>("my_staff_role");
      return r === "admin" || r === "manager" ? r : null;
    },
  });
  if (!userId) return null;
  if (record.isLoading) return undefined;
  if (fromRow === null) return null;
  if (server.isLoading) return undefined;
  if (server.error) return fromRow;
  return server.data ?? null;
}

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function staffRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as UntypedRpc)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface StaffUncategorizedOrder {
  id: string;
  title: string;
  description_short: string | null;
  status: string;
  created_at: string;
  city_name: string | null;
  district: string | null;
  village: string | null;
  responses_count: number;
}

export interface StaffAiSuggestion {
  order_id: string;
  suggested_l2: string | null;
  l2_name: string | null;
  confidence: number | null;
  status: "pending" | "assigned" | "unsure" | "failed";
}

export interface StaffCategory {
  l1_id: string;
  l1_name: string;
  l2_id: string;
  l2_name: string;
  is_active: boolean;
  is_visible: boolean;
  sort_order: number;
  l1_sort_order?: number;
  terms?: string[];
}

export const staffUncategorizedKey = ["staff", "uncategorized"] as const;

export function useStaffUncategorized(enabled: boolean) {
  return useQuery({
    queryKey: staffUncategorizedKey,
    enabled,
    queryFn: async () => {
      const [orders, suggestions] = await Promise.all([
        staffRpc<StaffUncategorizedOrder[]>("admin_list_uncategorized_orders", {
          p_limit: 100,
        }),
        // Подсказки — дополнение: не загрузились — список работает без них.
        staffRpc<StaffAiSuggestion[]>("admin_list_ai_category_suggestions", {
          p_limit: 200,
        }).catch(() => [] as StaffAiSuggestion[]),
      ]);
      const byOrder = new Map(suggestions.map((s) => [s.order_id, s]));
      return orders
        .filter((o) => o.status === "open")
        .map((o) => ({ order: o, suggestion: byOrder.get(o.id) ?? null }));
    },
  });
}

export function useStaffCategories(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "categories"],
    enabled,
    staleTime: 5 * 60_000,
    // Как в веб-админке: любая активная подкатегория, включая скрытую из
    // каталога клиента; порядок — как в каталоге (0238).
    queryFn: async () =>
      (await staffRpc<StaffCategory[]>("admin_list_categories"))
        .filter((c) => c.is_active && c.l2_id !== "uncategorized")
        .sort(
          (a, b) =>
            (a.l1_sort_order ?? 0) - (b.l1_sort_order ?? 0) ||
            a.l1_name.localeCompare(b.l1_name, "ru") ||
            a.sort_order - b.sort_order,
        ),
  });
}

export function useStaffSetOrderCategory() {
  const qc = useQueryClient();
  return useMutation<void, Error, { orderId: string; l2Id: string; reason: string }>({
    mutationFn: async ({ orderId, l2Id, reason }) => {
      await staffRpc("admin_set_order_category", {
        p_order_id: orderId,
        p_l2_id: l2Id,
        p_reason: reason,
      });
    },
    onSuccess: (_d, { orderId }) => {
      void qc.invalidateQueries({ queryKey: staffUncategorizedKey });
      void qc.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["all-open-orders"] });
    },
  });
}

/** Жалоба в очереди (admin_list_reports): предмет уже подписан, без ПДн. */
export interface StaffReport {
  id: string;
  created_at: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  reason: string;
  description: string | null;
  target_type: "user" | "order" | "review" | "message";
  target_id: string;
  target_label: string | null;
  target_user_id: string | null;
  reporter_label: string | null;
  reports_on_target: number;
  reports_by_reporter: number;
}

export function useStaffReports(status: StaffReport["status"] | null, enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "reports", status],
    enabled,
    staleTime: 15_000,
    queryFn: () =>
      staffRpc<StaffReport[]>("admin_list_reports", {
        p_status: status,
        p_limit: 100,
      }),
  });
}

export type StaffReportAction =
  | { kind: "dismiss" }
  | { kind: "resolve" }
  | { kind: "warn" }
  | { kind: "suspend" }
  | { kind: "ban" }
  | { kind: "hide_order" }
  | { kind: "hide_review" };

/**
 * Решение по жалобе — те же функции, что у веб-админки (Reports.tsx).
 * Санкция лишь пишет номер жалобы в журнал, поэтому после неё жалоба
 * закрывается отдельно как решённая; скрытие задания закрывает её само.
 */
export function useStaffReportAction() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { report: StaffReport; action: StaffReportAction; reason: string }
  >({
    mutationFn: async ({ report: r, action, reason }) => {
      const userId = r.target_user_id;
      switch (action.kind) {
        case "dismiss":
          await staffRpc("admin_resolve_report", {
            p_report_id: r.id,
            p_status: "dismissed",
            p_note: reason,
          });
          return;
        case "resolve":
          await staffRpc("admin_resolve_report", {
            p_report_id: r.id,
            p_status: "resolved",
            p_note: reason,
          });
          return;
        case "hide_order":
          await staffRpc("admin_hide_order", {
            p_order_id: r.target_id,
            p_reason: reason,
            p_report_id: r.id,
          });
          return;
        case "hide_review":
          await staffRpc("admin_set_review_status", {
            p_review_id: r.target_id,
            p_status: "hidden",
            p_reason: reason,
          });
          break;
        case "warn":
          await staffRpc("admin_warn_user", {
            p_user_id: userId,
            p_reason: reason,
            p_report_id: r.id,
          });
          break;
        case "suspend":
        case "ban":
          await staffRpc("admin_set_user_status", {
            p_user_id: userId,
            p_status: action.kind === "ban" ? "banned" : "suspended",
            p_reason: reason,
            p_report_id: r.id,
          });
          break;
      }
      await staffRpc("admin_resolve_report", {
        p_report_id: r.id,
        p_status: "resolved",
        p_note: reason,
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["staff", "reports"] });
      void qc.invalidateQueries({ queryKey: ["all-open-orders"] });
    },
  });
}
