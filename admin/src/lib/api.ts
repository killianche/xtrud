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
  users_blocked: number;
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
  listActions: (limit = 50, offset = 0) =>
    rpc<ActionRow[]>("admin_list_actions", { p_limit: limit, p_offset: offset }),
};
