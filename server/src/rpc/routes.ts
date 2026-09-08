// Мост к функциям базы: POST /v2/rpc/<имя> {аргументы}. Тот же контракт, что у
// PostgREST /rpc: именованные аргументы, роль и claims — из JWT. Список
// разрешённых функций явный: чужие имена не вызываются.
import type { FastifyInstance } from "fastify";
import { type Db, pgErrorToHttp } from "../db.js";
import { bearer } from "../auth/routes.js";
import type { Tokens } from "../auth/jwt.js";

/** Функции, которые зовёт приложение (инвентаризация 2026-09-08). */
export const RPC_ALLOWLIST = new Set([
  "delete_my_account",
  "enable_master_mode",
  "finalize_master_onboarding",
  "get_master_phone",
  "get_popular_queries",
  "get_response_limit_today",
  "get_unread_responses_count",
  "is_username_available",
  "log_search_query",
  "mark_feed_seen",
  "mark_order_responses_viewed",
  "record_master_view",
  "reject_response",
  "reopen_order",
  "resolve_login_email",
  "search_categories",
  "search_masters",
  "set_availability",
  "set_master_categories",
  "set_master_service_areas",
  "set_specialist_contacts",
  "set_username",
  "submit_master_review",
  "touch_last_active",
  "withdraw_response",
  "admin_metrics",
  "admin_list_users",
  "admin_user_card",
  "admin_list_masters",
  "admin_set_master_visibility",
  "admin_list_reports",
  "admin_resolve_report",
  "admin_set_user_status",
  "admin_warn_user",
  "admin_set_user_password",
  "admin_list_actions",
  "admin_list_verifications",
  "admin_review_verification",
  "admin_hide_order",
]);

const NAME_RE = /^[a-z_][a-z0-9_]*$/;

export function registerRpcRoutes(app: FastifyInstance, db: Db, tokens: Tokens) {
  app.post<{ Params: { name: string }; Body: Record<string, unknown> | undefined }>(
    "/rpc/:name",
    async (req, reply) => {
      const name = req.params.name;
      if (!NAME_RE.test(name) || !RPC_ALLOWLIST.has(name)) {
        return reply.code(404).send({ error: "Нет такой функции" });
      }
      const claims = await tokens.verify(bearer(req.headers.authorization));
      const args = req.body && typeof req.body === "object" ? req.body : {};
      const keys = Object.keys(args).filter((k) => NAME_RE.test(k));
      const placeholders = keys.map((k, i) => `"${k}" := $${i + 1}`).join(", ");
      const values = keys.map((k) => {
        const v = (args as Record<string, unknown>)[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      try {
        const rows = await db.asUser(claims, async (c) => {
          const r = await c.query(`SELECT * FROM public."${name}"(${placeholders})`, values);
          return r;
        });
        // Скалярная функция возвращает одну колонку с именем функции — отдаём
        // значение, как PostgREST; табличная — массив строк.
        const fields = rows.fields.map((f) => f.name);
        if (fields.length === 1 && fields[0] === name) {
          return reply.send(rows.rows.length === 1 ? rows.rows[0]?.[name] ?? null : rows.rows.map((r) => r[name]));
        }
        return reply.send(rows.rows);
      } catch (e) {
        const http = pgErrorToHttp(e);
        req.log.warn({ err: e, rpc: name }, "rpc failed");
        return reply.code(http.status).send({ error: http.message, code: http.code });
      }
    },
  );
}
