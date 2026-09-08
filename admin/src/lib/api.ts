// Всё общение с базой идёт через RPC вида admin_*. Прямых запросов к таблицам
// панель не делает: широкая политика на users начала бы применяться и к
// мобильному приложению (docs/ADMIN_PANEL.md §6).

// Всё общение с базой идёт через RPC вида admin_* на xtrud-api (без Supabase:
// docs/BACKEND_REWRITE_PLAN.md, этап 5). Прямых запросов к таблицам панель не
// делает (docs/ADMIN_PANEL.md §6).

import { loadConfig } from "./config";

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const SESSION_KEY = "xtrud-admin-session";

function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(s: StoredSession | null): void {
  if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(SESSION_KEY);
}

async function baseUrl(): Promise<string> {
  return (await loadConfig()).supabaseUrl.replace(/\/+$/, "");
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

async function postJson(
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${await baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text };
  }
  return { status: res.status, json };
}

let refreshing: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const s = readSession();
    if (!s) return null;
    const { status, json } = await postJson("/v2/auth/refresh", { refreshToken: s.refreshToken });
    if (status >= 400) {
      if (status === 401) writeSession(null);
      return null;
    }
    const t = json as TokenResponse;
    writeSession({
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
    });
    return t.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Действующий access-токен (обновляется за полторы минуты до истечения). */
async function accessToken(): Promise<string | null> {
  const s = readSession();
  if (!s) return null;
  if (s.expiresAt - Math.floor(Date.now() / 1000) > 90) return s.accessToken;
  return refreshToken();
}

export function hasSession(): boolean {
  return readSession() !== null;
}

export async function login(email: string, password: string): Promise<{ error: string | null }> {
  const { status, json } = await postJson("/v2/auth/login", {
    login: email.trim().toLowerCase(),
    password,
  });
  if (status >= 400) {
    const err = (json as { error?: string } | null)?.error;
    return { error: status === 401 ? "Неверная почта или пароль." : (err ?? "Не удалось войти.") };
  }
  const t = json as TokenResponse;
  writeSession({
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: t.expiresAt,
  });
  return { error: null };
}

export async function logout(): Promise<void> {
  const s = readSession();
  writeSession(null);
  if (s) await postJson("/v2/auth/logout", { refreshToken: s.refreshToken }).catch(() => undefined);
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

/** Заявка на подтверждение паспорта (admin_list_verifications, 0174). */
export interface VerificationRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: "pending" | "approved" | "rejected" | string;
  passport_main_path: string;
  selfie_path: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  verification_level: number | null;
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
  let token = await accessToken();
  let res = await postJson(`/v2/rpc/${name}`, args ?? {}, token ?? undefined);
  if (res.status === 401 && token) {
    token = await refreshToken();
    if (token) res = await postJson(`/v2/rpc/${name}`, args ?? {}, token);
  }
  if (res.status >= 400) {
    const body = (res.json ?? {}) as { error?: string; message?: string; code?: string };
    throw new Error(describe({ message: body.error ?? body.message, code: body.code }));
  }
  return res.json as T;
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
  listVerifications: (status: string, limit = 50, offset = 0) =>
    rpc<VerificationRow[]>("admin_list_verifications", {
      p_status: status,
      p_limit: limit,
      p_offset: offset,
    }),
  reviewVerification: (userId: string, approve: boolean, reason: string) =>
    rpc<void>("admin_review_verification", {
      p_user_id: userId,
      p_approve: approve,
      p_reason: reason.trim() === "" ? null : reason.trim(),
    }),
  /** Подписанная ссылка на фото документа: бакет приватный, читает только админ (RLS). */
  verificationPhotoUrl: async (path: string): Promise<string> => {
    const token = await accessToken();
    const { status, json } = await postJson(
      "/v2/files/sign",
      { bucket: "master-verifications", path },
      token ?? undefined,
    );
    const url = (json as { url?: string } | null)?.url;
    if (status >= 400 || !url) throw new Error("Не удалось открыть фото документа.");
    return url;
  },
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
  /** Р5 (0175): скрыть задание по жалобе — статус cancelled, автору уведомление. */
  hideOrder: (orderId: string, reason: string, reportId: string | null) =>
    rpc<void>("admin_hide_order", {
      p_order_id: orderId,
      p_reason: reason.trim(),
      p_report_id: reportId,
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
