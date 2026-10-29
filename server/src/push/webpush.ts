// Web Push для веб-админки (0255, №367): админка, добавленная на экран
// «Домой» iPhone (iOS 16.4+), получает уведомления о новых заявках.
//
// База сообщает о событии очереди: pg_notify('xtrud_admin_events',
// {"kind","ref"}) — только вид события и id, без персональных данных. Сервер
// берёт подписки сотрудников, у которых этот вид включён и доступен роли
// (xtrud_private.admin_push_targets), и шлёт каждому зашифрованное
// уведомление (RFC 8291, VAPID — библиотека web-push). Мёртвые подписки
// (404/410) удаляются.
//
// Текст уведомления тоже без ПДн: его видно на заблокированном экране.
import pg from "pg";
import webpush from "web-push";
import type { Db } from "../db.js";

export const ADMIN_EVENTS_CHANNEL = "xtrud_admin_events";

/** Адрес админки: уведомление открывает нужный раздел. */
export const ADMIN_BASE_URL = "https://xtrud.pro/admin/";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminPushMessage {
  title: string;
  body: string;
  /** Хеш-маршрут админки, без '#'. */
  path: string;
  /** Одинаковый tag заменяет прошлое уведомление того же вида. */
  tag: string;
}

/** Текст и переход для вида события. null — вид неизвестен, не шлём. */
export function adminPushMessage(kind: string, ref: string | null): AdminPushMessage | null {
  const id = ref !== null && UUID.test(ref) ? ref.toLowerCase() : null;
  switch (kind) {
    case "report":
      return {
        title: "Новая жалоба",
        body: "Откройте, чтобы разобрать",
        path: "/inbox/reports",
        tag: "report",
      };
    case "order_review":
      return {
        title: "Задание на проверке",
        body: "Не подошла ни одна категория",
        path: id ? `/orders/${id}` : "/orders",
        tag: "order_review",
      };
    case "order_new":
      return {
        title: "Новое задание",
        body: "Опубликовано в ленте",
        path: id ? `/orders/${id}` : "/orders",
        tag: "order_new",
      };
    case "passport":
      return {
        title: "Паспорт на проверку",
        body: "Новая заявка на подтверждение личности",
        path: "/inbox/passport",
        tag: "passport",
      };
    case "company":
      return {
        title: "Заявка компании",
        body: "Проверьте компанию",
        path: "/inbox/company",
        tag: "company",
      };
    case "instagram":
      return {
        title: "Instagram на проверку",
        body: "Новая ссылка на Instagram",
        path: "/inbox/instagram",
        tag: "instagram",
      };
    case "experience":
      return {
        title: "«Большой опыт»",
        body: "Новая заявка на значок",
        path: "/inbox/experience",
        tag: "experience",
      };
    case "recovery":
      return {
        title: "Восстановление доступа",
        body: "Человек просит перезвонить",
        path: "/inbox/recovery",
        tag: "recovery",
      };
    case "specialist_new":
      return {
        title: "Новый специалист",
        body: "Зарегистрировался специалист",
        path: id ? `/users/${id}` : "/users",
        tag: "specialist_new",
      };
    case "test":
      return {
        title: "Уведомления работают",
        body: "Так будут приходить новые заявки",
        path: "/more/notifications",
        tag: "test",
      };
    default:
      return null;
  }
}

/** Разбор сигнала базы. Мусор — null. */
export function parseAdminEvent(
  channel: string,
  payload: string | undefined,
): { kind: string; ref: string | null; user: string | null } | null {
  if (channel !== ADMIN_EVENTS_CHANNEL || !payload) return null;
  try {
    const v = JSON.parse(payload) as Record<string, unknown>;
    if (typeof v.kind !== "string" || !/^[a-z_]{1,40}$/.test(v.kind)) return null;
    const ref = typeof v.ref === "string" ? v.ref : null;
    const user = typeof v.user === "string" && UUID.test(v.user) ? v.user.toLowerCase() : null;
    if (v.kind === "test" && user === null) return null;
    return { kind: v.kind, ref, user };
  } catch {
    return null;
  }
}

export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendResult {
  endpoint: string;
  ok: boolean;
  gone: boolean;
  status: number;
}

export type WebPushSend = (target: WebPushTarget, payload: string) => Promise<SendResult>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const PUSH_HOSTS =
  /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

/**
 * Адрес подписки — только известный push-сервис по https без порта. База
 * проверяет то же (CHECK + admin_push_subscribe), здесь — второй рубеж:
 * сервер делает POST на этот адрес (SSRF).
 */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" && u.port === "" && u.username === "" && PUSH_HOSTS.test(u.hostname)
    );
  } catch {
    return false;
  }
}

/** Отправка одной подписке через web-push. Ошибки не бросает. */
export function webPushSender(vapid: VapidKeys): WebPushSend {
  return async (target, payload) => {
    if (!isPushEndpoint(target.endpoint)) {
      return { endpoint: target.endpoint, ok: false, gone: true, status: 0 };
    }
    try {
      const res = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: vapid,
          TTL: 24 * 60 * 60,
          urgency: "high",
          timeout: 10_000,
        },
      );
      return { endpoint: target.endpoint, ok: true, gone: false, status: res.statusCode };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0;
      return {
        endpoint: target.endpoint,
        ok: false,
        gone: status === 404 || status === 410,
        status,
      };
    }
  };
}

interface Log {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

/** Пробное уведомление — не чаще раза в 30 с на сотрудника. */
const TEST_INTERVAL_MS = 30_000;
const lastTest = new Map<string, number>();

export function testAllowed(user: string, now = Date.now()): boolean {
  const prev = lastTest.get(user);
  if (prev !== undefined && now - prev < TEST_INTERVAL_MS) return false;
  lastTest.set(user, now);
  if (lastTest.size > 1000) lastTest.clear();
  return true;
}

/** Разослать событие всем подходящим подпискам. */
export async function dispatchAdminEvent(
  db: Db,
  send: WebPushSend,
  event: { kind: string; ref: string | null; user: string | null },
  log: Log,
): Promise<{ sent: number; removed: number }> {
  const message = adminPushMessage(event.kind, event.ref);
  if (message === null) return { sent: 0, removed: 0 };
  if (event.kind === "test" && (event.user === null || !testAllowed(event.user))) {
    return { sent: 0, removed: 0 };
  }
  const targets = await db.asService(async (client) => {
    const r = await client.query<WebPushTarget>(
      "SELECT endpoint, p256dh, auth FROM xtrud_private.admin_push_targets($1, $2)",
      [event.kind, event.user],
    );
    return r.rows;
  });
  if (targets.length === 0) return { sent: 0, removed: 0 };
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: `${ADMIN_BASE_URL}#${message.path}`,
    tag: message.tag,
  });
  const results = await Promise.all(targets.map((t) => send(t, payload)));
  const ok = results.filter((r) => r.ok).map((r) => r.endpoint);
  const dead = results.filter((r) => r.gone).map((r) => r.endpoint);
  await db.asService((client) =>
    client.query("SELECT xtrud_private.admin_push_report($1::text[], $2::text[])", [ok, dead]),
  );
  const failed = results.filter((r) => !r.ok && !r.gone);
  if (failed.length > 0) {
    log.warn(
      { kind: event.kind, failed: failed.map((f) => f.status) },
      "webpush: часть не доставлена",
    );
  }
  return { sent: ok.length, removed: dead.length };
}

/**
 * Слушатель событий админки: одно подключение LISTEN, обрыв —
 * переподключение с паузой 1 → 30 с (как events/listener.ts).
 */
export function startAdminPushListener(
  url: string,
  db: Db,
  send: WebPushSend,
  log: Log,
): () => Promise<void> {
  let client: pg.Client | null = null;
  let stopped = false;
  let delay = 1000;
  let timer: NodeJS.Timeout | null = null;

  const connect = async (): Promise<void> => {
    if (stopped) return;
    const c = new pg.Client({ connectionString: url });
    client = c;
    c.on("notification", (msg) => {
      const event = parseAdminEvent(msg.channel, msg.payload);
      if (event === null) return;
      dispatchAdminEvent(db, send, event, log).catch((err: unknown) =>
        log.warn({ err: String(err), kind: event.kind }, "webpush: рассылка не удалась"),
      );
    });
    const retry = (err: unknown) => {
      if (stopped || client !== c) return;
      client = null;
      log.warn({ err: String(err) }, "webpush: LISTEN оборвался, переподключаюсь");
      c.removeAllListeners();
      c.on("error", () => undefined);
      void c.end().catch(() => undefined);
      timer = setTimeout(() => void connect(), delay);
      delay = Math.min(delay * 2, 30_000);
    };
    c.on("error", retry);
    c.on("end", () => retry(new Error("соединение закрыто")));
    try {
      await c.connect();
      await c.query(`LISTEN ${ADMIN_EVENTS_CHANNEL}`);
      delay = 1000;
      log.info({}, "webpush: LISTEN подключён");
    } catch (err) {
      retry(err);
    }
  };

  void connect();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await client?.end().catch(() => undefined);
  };
}
