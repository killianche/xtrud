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
  // Ожидание всегда конечно (design-quality §1.2): 15 с, затем понятная
  // ошибка вместо вечной загрузки.
  let res: Response;
  try {
    res = await fetch(`${await baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return {
      status: 0,
      json: {
        error: timeout
          ? "Сервер не ответил за 15 секунд. Попробуйте ещё раз."
          : "Нет связи с сервером. Проверьте интернет.",
      },
    };
  }
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

/** Очереди «Требует внимания» (admin_attention, 0215). */
export interface Attention {
  reports_open: number;
  verifications_pending: number;
  recovery_new: number;
  masters_pending: number;
}

/** Динамика по дням (admin_metrics_series, 0215). */
export interface SeriesPoint {
  day: string;
  signups: number;
  orders: number;
  responses: number;
}

export interface OrderRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  city: string | null;
  category: string | null;
  client_id: string;
  client_label: string | null;
  responses_count: number;
  picked_master_label: string | null;
  cancel_reason: string | null;
}

export interface OrderCardData {
  order: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
    city: string | null;
    district: string | null;
    category: string | null;
    budget_kind: string | null;
    budget_value: number | null;
    contact_mode: string | null;
    photo_urls: string[] | null;
    preferred_date: string | null;
    client_id: string;
    client_label: string | null;
    client_phone: string | null;
    picked_master_id: string | null;
    picked_master_label: string | null;
    cancel_reason: string | null;
    responses_count: number;
    /** Скрыто админом и можно вернуть — решает сервер по журналу (0215, F1). */
    restorable: boolean;
  };
  responses: Array<{
    id: string;
    master_id: string;
    master_label: string | null;
    status: string;
    price_kind: string | null;
    price_value: number | null;
    message: string | null;
    created_at: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number | null;
    text: string | null;
    status: string;
    direction: string;
    author_label: string | null;
    created_at: string;
  }>;
}

export interface ReviewRow {
  id: string;
  created_at: string;
  rating: number | null;
  text: string | null;
  status: string;
  direction: string;
  author_id: string;
  author_label: string | null;
  target_id: string;
  target_label: string | null;
  order_id: string | null;
  order_title: string | null;
}

export interface CategoryRow {
  l1_id: string;
  l1_name: string;
  l2_id: string;
  l2_name: string;
  is_active: boolean;
  is_visible: boolean;
  sort_order: number;
  open_orders: number;
  masters: number;
  /** Откликаться может любой (простые работы), иначе — только специалист с категорией (0217). */
  open_responses?: boolean;
}

export type BroadcastAudience = "all" | "clients" | "masters";

export interface BroadcastRow {
  id: string;
  created_at: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  recipients: number;
  created_by_label: string | null;
}

/** Заявка «Забыли пароль?» — перезвонить и задать временный пароль (0214). */
export interface RecoveryRequestRow {
  id: string;
  created_at: string;
  status: "new" | "done" | "rejected";
  phone: string;
  user_id: string;
  user_label: string | null;
  note: string | null;
  handled_at: string | null;
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
  // Тексты функций баннеров (0206) уже человеческие — показываем как есть.
  if (
    /^(Баннер не найден|Ссылка должна|Сначала загрузите фото|Не больше 20 баннеров|Название — до 80)/.test(
      message,
    )
  ) {
    return message;
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
  if (message.includes("order_not_found")) return "Задание не найдено.";
  if (message.includes("order_already_closed")) return "Задание уже закрыто.";
  if (message.includes("order_not_restorable")) {
    return "Вернуть можно только задание, скрытое модерацией.";
  }
  if (message.includes("review_not_found")) return "Отзыв не найден.";
  if (message.includes("client_not_active")) {
    return "Заказчик приостановлен или заблокирован — задание вернуть нельзя.";
  }
  if (message.includes("bad_days")) return "Период — от 1 до 365 дней.";
  if (message.includes("bad_visible")) return "Не указано, показать или скрыть.";
  if (message.includes("category_not_found")) return "Подраздел не найден.";
  if (message.includes("request_not_open")) return "Заявка уже закрыта.";
  if (message.includes("broadcast_too_soon")) {
    return "Рассылку можно отправлять не чаще раза в 10 минут.";
  }
  if (message.includes("broadcast_daily_limit")) return "Не больше 5 рассылок за сутки.";
  if (message.includes("broadcast_no_recipients")) return "В этой аудитории никого нет.";
  if (message.includes("bad_title")) return "Заголовок — от 3 до 60 символов, в одну строку.";
  if (message.includes("bad_body")) return "Текст — от 3 до 200 символов.";
  if (message.includes("bad_audience")) return "Выберите, кому отправить.";
  if (!message) return "Не удалось выполнить запрос.";
  return "Сервис не ответил. Попробуйте ещё раз.";
}

export interface OrderLimits {
  /** Заданий в сутки; 0 — без ограничения. */
  daily: number;
  /** Активных одновременно; 0 — без ограничения. */
  active: number;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  let token = await accessToken();
  let res = await postJson(`/v2/rpc/${name}`, args ?? {}, token ?? undefined);
  if (res.status === 401 && token) {
    token = await refreshToken();
    if (token) res = await postJson(`/v2/rpc/${name}`, args ?? {}, token);
  }
  if (res.status === 0) {
    throw new Error((res.json as { error?: string } | null)?.error ?? "Нет связи с сервером.");
  }
  if (res.status >= 400) {
    const body = (res.json ?? {}) as { error?: string; message?: string; code?: string };
    throw new Error(describe({ message: body.error ?? body.message, code: body.code }));
  }
  return res.json as T;
}

/** Рекламный баннер Главной (promo_banners, 0206). */
export interface PromoBannerRow {
  id: string;
  image_path: string;
  image_url: string;
  link_url: string | null;
  title: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** id администратора из токена: сервер пускает файлы только в свою папку. */
async function currentUserId(): Promise<string> {
  const token = await accessToken();
  const payload = token?.split(".")[1];
  if (!payload) throw new Error("Войдите заново.");
  const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
  if (!json.sub) throw new Error("Войдите заново.");
  return json.sub;
}

const PROMO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
/** Тот же предел, что у сервера (server/src/files/routes.ts). */
const PROMO_MAX_BYTES = 20 * 1024 * 1024;

/** Загрузить фото баннера в хранилище «promo»; вернуть путь для admin_add_promo_banner. */
async function uploadPromoImage(file: File): Promise<string> {
  const ext = PROMO_TYPES[file.type];
  if (!ext) throw new Error("Нужна картинка JPEG, PNG или WebP.");
  if (file.size > PROMO_MAX_BYTES) throw new Error("Файл больше 20 МБ. Уменьшите картинку.");
  const uid = await currentUserId();
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const put = async (token: string | null) =>
    fetch(`${await baseUrl()}/v2/files/promo/${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
  let res = await put(await accessToken());
  if (res.status === 401) res = await put(await refreshToken());
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Не удалось загрузить фото.");
  }
  return path;
}

/** Удалить файл баннера; ошибку не показываем — строка в базе уже удалена. */
async function deletePromoImage(path: string): Promise<void> {
  const token = await accessToken();
  await fetch(`${await baseUrl()}/v2/files/promo/${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => undefined);
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
  /** Имя и фамилию админ вписывает с документа: значок утверждает именно их (0182). */
  reviewVerification: (
    userId: string,
    approve: boolean,
    reason: string,
    firstName?: string,
    lastName?: string,
  ) =>
    rpc<void>("admin_review_verification", {
      p_user_id: userId,
      p_approve: approve,
      p_reason: reason.trim() === "" ? null : reason.trim(),
      p_first_name: firstName?.trim() || null,
      p_last_name: lastName?.trim() || null,
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
  /** Смена номера входа — вернуть аккаунт человеку, потерявшему симкарту (0190). */
  setPhone: (userId: string, phone: string, reason: string) =>
    rpc<{ ok: boolean; phone: string; login_email: string }>("admin_set_user_phone", {
      p_user_id: userId,
      p_phone: phone,
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
  attention: () => rpc<Attention>("admin_attention"),
  metricsSeries: (days = 30) => rpc<SeriesPoint[]>("admin_metrics_series", { p_days: days }),
  listOrders: (search: string, status: string | null, limit = 50, offset = 0) =>
    rpc<OrderRow[]>("admin_list_orders", {
      p_search: search.trim() === "" ? null : search.trim(),
      p_status: status,
      p_limit: limit,
      p_offset: offset,
    }),
  orderCard: (orderId: string) => rpc<OrderCardData>("admin_order_card", { p_order_id: orderId }),
  restoreOrder: (orderId: string, reason: string) =>
    rpc<void>("admin_restore_order", { p_order_id: orderId, p_reason: reason }),
  listReviews: (status: string | null, limit = 50, offset = 0) =>
    rpc<ReviewRow[]>("admin_list_reviews", { p_status: status, p_limit: limit, p_offset: offset }),
  setReviewStatus: (reviewId: string, status: "visible" | "hidden", reason: string) =>
    rpc<void>("admin_set_review_status", {
      p_review_id: reviewId,
      p_status: status,
      p_reason: reason,
    }),
  listCategories: () => rpc<CategoryRow[]>("admin_list_categories"),
  setCategoryOpenResponses: (l2Id: string, open: boolean, reason: string) =>
    rpc<void>("admin_set_category_open_responses", {
      p_l2_id: l2Id,
      p_open: open,
      p_reason: reason,
    }),
  appFlags: () =>
    rpc<{ find_screen?: string; find_tiles?: string; require_login?: boolean }>("get_app_flags"),
  setRequireLogin: (enabled: boolean) =>
    rpc<{ require_login?: boolean }>("admin_set_require_login", { p_enabled: enabled }),
  setFindTiles: (variant: "mosaic" | "grid") =>
    rpc<{ find_tiles?: string }>("admin_set_find_tiles", { p_variant: variant }),
  broadcastPreview: (audience: BroadcastAudience) =>
    rpc<{ recipients: number; with_push: number }>("admin_broadcast_preview", {
      p_audience: audience,
    }),
  broadcastPush: (title: string, body: string, audience: BroadcastAudience) =>
    rpc<{ id: string; recipients: number }>("admin_broadcast_push", {
      p_title: title,
      p_body: body,
      p_audience: audience,
    }),
  listBroadcasts: (limit = 20) => rpc<BroadcastRow[]>("admin_list_broadcasts", { p_limit: limit }),
  setCategoryVisible: (l2Id: string, visible: boolean, reason: string) =>
    rpc<void>("admin_set_category_visible", {
      p_l2_id: l2Id,
      p_visible: visible,
      p_reason: reason,
    }),
  listRecoveryRequests: (status: "new" | null, limit = 50, offset = 0) =>
    rpc<RecoveryRequestRow[]>("admin_list_recovery_requests", {
      p_status: status,
      p_limit: limit,
      p_offset: offset,
    }),
  resolveRecoveryRequest: (id: string, status: "done" | "rejected", note: string) =>
    rpc<{ ok: boolean }>("admin_resolve_recovery_request", {
      p_id: id,
      p_status: status,
      p_note: note,
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
  /** Лимиты публикации заданий (0203). */
  orderLimits: () => rpc<OrderLimits>("get_order_limits"),
  setOrderLimits: (daily: number, active: number) =>
    rpc<OrderLimits>("admin_set_order_limits", {
      p_daily: daily,
      p_active: active,
      p_reason: "Лимиты публикации заданий",
    }),
  listActions: (limit = 50, offset = 0) =>
    rpc<ActionRow[]>("admin_list_actions", { p_limit: limit, p_offset: offset }),
  /** Рекламные баннеры Главной (0206). */
  listPromoBanners: () => rpc<PromoBannerRow[]>("admin_list_promo_banners"),
  addPromoBanner: async (file: File, linkUrl: string, title: string) => {
    const path = await uploadPromoImage(file);
    try {
      return await rpc<PromoBannerRow>("admin_add_promo_banner", {
        p_image_path: path,
        p_link_url: linkUrl.trim() === "" ? null : linkUrl.trim(),
        p_title: title.trim() === "" ? null : title.trim(),
      });
    } catch (e) {
      // Строка не создалась — не оставляем осиротевший файл.
      await deletePromoImage(path);
      throw e;
    }
  },
  updatePromoBanner: (b: Pick<PromoBannerRow, "id" | "link_url" | "title" | "is_active">) =>
    rpc<PromoBannerRow>("admin_update_promo_banner", {
      p_id: b.id,
      p_link_url: b.link_url?.trim() ? b.link_url.trim() : null,
      p_title: b.title?.trim() ? b.title.trim() : null,
      p_is_active: b.is_active,
    }),
  movePromoBanner: (id: string, up: boolean) =>
    rpc<null>("admin_move_promo_banner", { p_id: id, p_up: up }),
  deletePromoBanner: async (id: string) => {
    const path = await rpc<string>("admin_delete_promo_banner", { p_id: id });
    if (path) await deletePromoImage(path);
  },
};
