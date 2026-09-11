// GET /v2/events — поток SSE «у вас что-то новое». Нужен вход; внутри только
// сигналы без данных (см. hub.ts). Соединение живёт не дольше 55 минут:
// access-токен живёт час, после переподключения приложение приходит со
// свежим — вход и блокировка проверяются заново.
import type { FastifyInstance } from "fastify";
import type { Tokens } from "../auth/jwt.js";
import { bearer } from "../auth/routes.js";
import { type EventHub, SSE_HEARTBEAT, sseFrame } from "./hub.js";

/** Меньше таймаута nginx (proxy_read_timeout 120 с для /v2/). */
const HEARTBEAT_MS = 25_000;
const MAX_LIFETIME_MS = 55 * 60_000;

export function registerEventRoutes(scope: FastifyInstance, tokens: Tokens, hub: EventHub): void {
  scope.get("/events", async (req, reply) => {
    const claims = await tokens.verify(bearer(req.headers.authorization));
    if (!claims) return reply.code(401).send({ error: "Нужен вход" });

    const raw = reply.raw;
    let remove = hub.add(claims.sub, (frame) => {
      raw.write(frame);
    });
    if (!remove) return reply.code(429).send({ error: "Слишком много подключений" });

    reply.hijack();
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx не должен копить поток (у /v2/ и так proxy_buffering off).
      "X-Accel-Buffering": "no",
    });
    raw.write(`retry: 5000\n${sseFrame("ready", {})}`);

    const heartbeat = setInterval(() => raw.write(SSE_HEARTBEAT), HEARTBEAT_MS);
    const lifetime = setTimeout(() => raw.end(), MAX_LIFETIME_MS);
    raw.on("close", () => {
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      remove?.();
      remove = null;
    });
  });
}
