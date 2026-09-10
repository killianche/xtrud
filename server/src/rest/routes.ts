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
];

/** Таблицы, к которым ходит приложение (инвентаризация 2026-09-08). Схема — только public. */
const TABLE_ALLOWLIST = new Set([
  "cities",
  "client_errors",
  "master_categories",
  "master_profiles",
  "master_service_areas",
  "master_services",
  "master_verifications",
  "notification_tokens",
  "notifications",
  "order_responses",
  "orders",
  "portfolio_cases",
  "portfolio_items",
  "reports",
  "reviews",
  "user_blocks",
  "users",
  "users_private",
  "categories_l1",
  "categories_l2",
  "categories_l3",
  // Словарь поисковых терминов: публичный, нужен генератору каталога при
  // сборке. Раньше тот ходил за ним в /rest/v1 Supabase (2026-09-10).
  "category_terms",
]);
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
    // Только таблицы из списка; функции — через /v2/rpc; корень (swagger) закрыт.
    if (!TABLE_ALLOWLIST.has(path)) return reply.code(404).send({ error: "Нет такой таблицы" });
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
    let upstream: Response;
    try {
      upstream = await fetch(`${postgrestUrl}/${path}${query}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      req.log.warn({ err: e, path }, "postgrest unreachable");
      return reply.code(502).send({ error: "Сервер данных не ответил. Попробуйте ещё раз." });
    }
    reply.code(upstream.status);
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    return reply.send(await upstream.text());
  });
}
