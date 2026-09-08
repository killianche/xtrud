// Прокси к PostgREST: GET/POST/PATCH/DELETE /v2/rest/<таблица>?<фильтры>.
// PostgREST — открытый проект (postgrest.org), не Supabase; он остаётся как
// движок запросов к таблицам под RLS. Клиент приложения шлёт наш JWT, роль и
// claims PostgREST берёт из него сам.
import type { FastifyInstance } from "fastify";

const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "prefer",
  "content-type",
  "accept",
  "range",
  "range-unit",
  "accept-profile",
  "content-profile",
];
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "preference-applied",
  "location",
];

export function registerRestProxy(app: FastifyInstance, postgrestUrl: string) {
  app.all<{ Params: { "*": string } }>("/rest/*", async (req, reply) => {
    const path = req.params["*"];
    if (!/^[A-Za-z0-9_./-]*$/.test(path) || path.includes("..")) {
      return reply.code(400).send({ error: "Неверный путь" });
    }
    const url = req.raw.url ?? "";
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    const headers: Record<string, string> = {};
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = req.headers[h];
      if (typeof v === "string") headers[h] = v;
    }
    const method = req.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD" && req.body != null;
    const body = hasBody
      ? typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? new Uint8Array(req.body)
          : JSON.stringify(req.body)
      : undefined;
    const upstream = await fetch(`${postgrestUrl}/${path}${query}`, { method, headers, body });
    reply.code(upstream.status);
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    return reply.send(await upstream.text());
  });
}
