// Всё общение с базой идёт через RPC вида admin_*. Прямых запросов к таблицам
// панель не делает: широкая политика на users начала бы применяться и к
// мобильному приложению (docs/ADMIN_PANEL.md §6).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";

let client: SupabaseClient | null = null;

export async function getClient(): Promise<SupabaseClient> {
  if (client) return client;
  const config = await loadConfig();
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export interface Metrics {
  users_total: number;
  users_suspended: number;
  users_banned: number;
  masters_total: number;
  orders_open: number;
  orders_total: number;
  responses_total: number;
  reports_open: number;
  signups_7d: number;
}

export interface UserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
  is_master: boolean;
  is_admin: boolean;
  created_at: string;
  orders_count: number;
  responses_count: number;
}

export interface UserCard {
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    phone: string | null;
    login_email: string | null;
    status: string;
    is_master: boolean;
    is_admin: boolean;
    created_at: string;
    last_sign_in_at: string | null;
    city_id: string | null;
    district: string | null;
  };
  orders: Array<{ id: string; title: string; status: string; created_at: string }>;
  responses: Array<{ id: string; order_id: string; status: string; created_at: string }>;
  reviews: Array<{ id: string; rating: number | null; status: string; created_at: string }>;
}

export interface ReportRow {
  id: string;
  created_at: string;
  status: string;
  reason: string;
  description: string | null;
  target_type: string;
  target_id: string;
  target_label: string | null;
  target_user_id: string | null;
  reporter_id: string;
  reporter_label: string | null;
  reports_on_target: number;
  reports_by_reporter: number;
}

export type UserStatus = "active" | "suspended" | "banned";

/** Специалист в каталоге (admin_list_masters, 0172). */
export interface MasterRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  user_status: UserStatus | string;
  master_status: "draft" | "pending" | "active" | "suspended" | "archived" | string;
  is_hidden: boolean;
  categories: string[];
  photos_count: number;
  rating_avg: number | null;
  rating_count: number | null;
  created_at: string;
}

export interface ActionRow {
  id: string;
  performed_at: string;
  admin_label: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
}

/** Ошибку базы переводим в человеческий текст: техническую строку показывать нельзя. */
function describe(error: { message?: string; code?: string } | null): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "42501" || message.includes("forbidden")) {
    return "Нет прав администратора для этого действия.";
  }
  if (code === "P0002" || message.includes("user_not_found")) {
    return "Пользователь не найден.";
  }
  if (message.includes("password_too_short")) return "Пароль короче шести символов.";
  if (message.includes("reason_required")) return "Укажите причину — она попадёт в журнал.";
  if (message.includes("cannot_sanction_admin")) {
    return "Администратора нельзя наказать: панель закрылась бы сама за собой.";
  }
  if (message.includes("user_deleted")) return "Аккаунт удалён — санкции к нему неприменимы.";
  if (message.includes("report_not_found")) return "Жалоба не найдена.";
  if (message.includes("bad_status")) return "Недопустимое состояние.";
  if (message.includes("master_not_found")) return "Профиль специалиста не найден.";
  if (!message) return "Не удалось выполнить запрос.";
  return "Сервис не ответил. Попробуйте ещё раз.";
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) throw new Error(describe(error));
  return data as T;
}

export const api = {
  metrics: () => rpc<Metrics>("admin_metrics"),
  listMasters: (search: string, limit = 50, offset = 0) =>
    rpc<MasterRow[]>("admin_list_masters", {
      p_search: search.trim() === "" ? null : search.trim(),
      p_limit: limit,
      p_offset: offset,
    }),
  setMasterVisibility: (userId: string, visible: boolean, reason: string) =>
    rpc<void>("admin_set_master_visibility", {
      p_user_id: userId,
      p_visible: visible,
      p_reason: reason.trim() === "" ? null : reason.trim(),
    }),
  listUsers: (search: string, limit = 50, offset = 0) =>
    rpc<UserRow[]>("admin_list_users", {
      p_search: search.trim() === "" ? null : search.trim(),
      p_limit: limit,
      p_offset: offset,
    }),
  userCard: (userId: string) => rpc<UserCard>("admin_user_card", { p_user_id: userId }),
  setPassword: (userId: string, password: string, reason: string) =>
    rpc<{ ok: boolean }>("admin_set_user_password", {
      p_user_id: userId,
      p_new_password: password,
      p_reason: reason,
    }),
  listReports: (status: string | null, limit = 50, offset = 0) =>
    rpc<ReportRow[]>("admin_list_reports", {
      p_status: status,
      p_limit: limit,
      p_offset: offset,
    }),
  resolveReport: (reportId: string, status: string, note: string) =>
    rpc<{ ok: boolean }>("admin_resolve_report", {
      p_report_id: reportId,
      p_status: status,
      p_note: note,
    }),
  setUserStatus: (userId: string, status: UserStatus, reason: string, reportId?: string) =>
    rpc<{ ok: boolean; from: string; to: string }>("admin_set_user_status", {
      p_user_id: userId,
      p_status: status,
      p_reason: reason,
      p_report_id: reportId ?? null,
    }),
  warnUser: (userId: string, reason: string, reportId?: string) =>
    rpc<{ ok: boolean }>("admin_warn_user", {
      p_user_id: userId,
      p_reason: reason,
      p_report_id: reportId ?? null,
    }),
  listActions: (limit = 50, offset = 0) =>
    rpc<ActionRow[]>("admin_list_actions", { p_limit: limit, p_offset: offset }),
};
