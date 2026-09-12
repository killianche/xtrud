// Внутренний маршрут отправки push: POST /v2/internal/push.
//
// Зовёт его только база — функция notify_user через pg_net, по внутреннему
// адресу контейнера. Снаружи маршрут не публикуется nginx и дополнительно
// закрыт общим секретом из vault (`notify_secret`), тем же, что использовала
// прежняя edge-функция.
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import type { ApnsClient, ApnsEnvironment, DeliveryResult } from "./apns.js";
import type { RuStorePushClient } from "./rustore.js";

interface PushRequestBody {
  user_id?: unknown;
  title?: unknown;
  body?: unknown;
  data?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Сравнение секретов за постоянное время: длина наружу тоже не утекает. */
function secretMatches(provided: string | undefined, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function registerPushRoutes(
  app: FastifyInstance,
  db: Db,
  apns: ApnsClient | null,
  notifySecret: string,
  rustore: RuStorePushClient | null = null,
) {
  app.post<{ Body: PushRequestBody }>("/internal/push", async (req, reply) => {
    if (!secretMatches(req.headers["x-notify-secret"] as string | undefined, notifySecret)) {
      return reply.code(401).send({ error: "Нет доступа" });
    }
    // Уведомление в приложении уже записано базой до этого вызова, поэтому
    // отсутствие ключа APNs не считается ошибкой сценария: пользователь
    // увидит его на экране «Уведомления», просто без звука на телефоне.
    if (apns === null && rustore === null) {
      return reply.code(200).send({ sent: 0, skipped: "push не настроен" });
    }

    const body = req.body ?? {};
    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const title = typeof body.title === "string" ? body.title : "";
    const text = typeof body.body === "string" ? body.body : "";
    if (!UUID_RE.test(userId) || title.length === 0) {
      return reply.code(400).send({ error: "Нужны user_id и title" });
    }
    const data =
      typeof body.data === "object" && body.data !== null && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : {};

    // Прямых прав на таблицы у роли API нет (0177c) — читаем через функцию
    // владельца базы, как это сделано для входа и регистрации.
    const rows = await db.asService(async (client) => {
      const r = await client.query<{
        device_token: string;
        environment: string;
        platform: string;
        unread: number;
      }>("SELECT device_token, environment, platform, unread FROM xtrud_api.push_targets($1)", [
        userId,
      ]);
      return r.rows;
    });
    const tokens = rows;
    const unread = rows[0]?.unread ?? 0;

    if (tokens.length === 0) return { sent: 0, tokens: 0 };

    // Телефон получает уведомление там, где он зарегистрирован: iPhone — у
    // Apple, Android — у RuStore. Токен платформы, отправитель которой не
    // настроен, просто пропускаем: он живой и дождётся настройки.
    const message = { title, body: text, data, badge: unread };
    const results = (
      await Promise.all(
        tokens.map((t) => {
          if (t.platform === "android") {
            return rustore === null ? null : rustore.send(t.device_token, message);
          }
          return apns === null
            ? null
            : apns.send(t.device_token, (t.environment as ApnsEnvironment) ?? "production", message);
        }),
      )
    ).filter((r): r is DeliveryResult => r !== null);

    // Мёртвый токен убираем сразу: иначе он копится и каждое уведомление
    // тратит запрос впустую.
    const dead = results.filter((r) => r.gone).map((r) => r.deviceToken);
    if (dead.length > 0) {
      await db.asService((client) =>
        client.query("SELECT xtrud_api.drop_dead_push_tokens($1::text[])", [dead]),
      );
    }

    const sent = results.filter((r) => r.status === 200).length;
    const failed = results.filter((r) => r.status !== 200);
    if (failed.length > 0) {
      req.log.warn(
        { failed: failed.map((f) => ({ status: f.status, reason: f.reason })) },
        "push: часть уведомлений не доставлена",
      );
    }
    return { sent, tokens: tokens.length, removed: dead.length };
  });
}
