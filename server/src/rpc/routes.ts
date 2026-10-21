// Мост к функциям базы: POST /v2/rpc/<имя> {аргументы}. Тот же контракт, что у
// PostgREST /rpc: именованные аргументы, роль и claims — из JWT. Список
// разрешённых функций явный; прямой путь /v2/rest/rpc/* закрыт в прокси.
// Настоящая граница по-прежнему гранты EXECUTE в базе (0166).
import type { FastifyInstance } from "fastify";
import type { Tokens } from "../auth/jwt.js";
import { bearer } from "../auth/routes.js";
import { type Db, pgErrorToHttp } from "../db.js";

/** Функции, которые зовёт приложение (инвентаризация 2026-09-08). */
export const RPC_ALLOWLIST = new Set([
  "delete_my_account",
  "enable_master_mode",
  "finalize_master_onboarding",
  "get_master_phone",
  "get_app_flags",
  "get_order_limits",
  "get_popular_queries",
  "get_response_limit_today",
  "get_unread_responses_count",
  "is_username_available",
  "log_search_query",
  "mark_feed_seen",
  "complete_order",
  "mark_order_responses_viewed",
  "pick_order_master",
  // Личный архив заданий и откликов (0199).
  "archive_order",
  "archive_response",
  "record_master_view",
  "reject_response",
  "reopen_order",
  "search_categories",
  "search_masters",
  "set_availability",
  "set_master_categories",
  "set_master_service_areas",
  "set_specialist_contacts",
  "set_username",
  "submit_master_review",
  "submit_order_response",
  "touch_last_active",
  "unpick_order_master",
  "withdraw_response",
  "admin_metrics",
  "admin_list_users",
  "admin_user_card",
  "admin_list_masters",
  "admin_set_master_visibility",
  // Значок «Большой опыт» (0225): внутри проверка is_admin_session().
  "admin_set_experience_badge",
  // Первый экран создания задания (0228): внутри проверка is_admin_session().
  "admin_set_composer_start",
  // Форма задания одним экраном (0229, №249): внутри проверка is_admin_session().
  "admin_set_composer_form",
  "admin_list_reports",
  "admin_resolve_report",
  // Заявки «Забыли пароль?» (0214); проверка админа — внутри функций.
  "admin_list_recovery_requests",
  "admin_resolve_recovery_request",
  // Админка 2026-10 (0215): сводка, задания, отзывы, каталог.
  "admin_attention",
  "admin_metrics_series",
  "admin_list_orders",
  "admin_order_card",
  "admin_restore_order",
  "admin_list_reviews",
  "admin_set_review_status",
  "admin_list_categories",
  "admin_set_category_visible",
  // 0216: плитки «Найти задание» и рассылка push; 0217: кто может откликаться.
  "admin_set_find_tiles",
  "admin_broadcast_preview",
  "admin_broadcast_push",
  "admin_list_broadcasts",
  "admin_set_category_open_responses",
  "can_respond_to_order",
  "admin_set_require_login",
  // 0218: Instagram специалиста.
  "submit_instagram",
  "my_instagram",
  "admin_list_instagram_requests",
  "admin_review_instagram",
  // 0245: подтверждение компании (№308).
  "submit_company_verification",
  "set_account_type",
  "my_company_verification",
  "admin_list_company_verifications",
  "admin_review_company_verification",
  "admin_revoke_company",
  // 0246: заявка на значок «Большой опыт» (№318).
  "submit_experience_badge_request",
  "my_experience_badge_request",
  "admin_list_experience_badge_requests",
  "admin_review_experience_badge_request",
  "admin_set_user_status",
  "admin_warn_user",
  "admin_set_user_password",
  "admin_set_user_phone",
  "admin_list_actions",
  "admin_list_verifications",
  "admin_review_verification",
  "admin_hide_order",
  "admin_set_order_limits",
  "admin_set_find_screen",
  // Рекламные баннеры Главной (0206).
  "admin_list_promo_banners",
  "admin_add_promo_banner",
  "admin_update_promo_banner",
  "admin_move_promo_banner",
  "admin_delete_promo_banner",
  // Задания без категории (0230, №251). С 0239 — is_staff_session() (админ или
  // управляющий) у функций из docs/STAFF_ROLES_2026-10.md §2.
  "admin_list_uncategorized_orders",
  "admin_set_order_category",
  "admin_create_category",
  // Скрытые задания «красный флаг» (0231, №253): внутри проверка is_admin_session().
  "admin_list_shadow_hidden_orders",
  "admin_unhide_order",
  "admin_hide_order_shadow",
  // Подсказки нейросети по категориям (0236, №279): внутри is_admin_session().
  "admin_list_ai_category_suggestions",
  // Управление каталогом (0238, №284): внутри is_admin_session().
  "admin_update_category",
  "admin_merge_category",
  "admin_move_orders",
  "admin_list_category_orders",
  "admin_rename_section",
  "admin_reorder",
  // Управляющие (0239, №286): роль текущего пользователя (вход веб-админки и
  // экран «Управление» в приложении), команда — только админ (проверка
  // is_admin_session() внутри функций).
  "my_staff_role",
  "admin_list_staff",
  "admin_set_staff_role",
  // Аналитика (0243, №299). track_event — EXECUTE только authenticated,
  // неверные данные молча отбрасываются в базе; отчёты и отметка «тестовое»
  // — is_staff_session() внутри функций.
  "track_event",
  "admin_analytics_overview",
  "admin_analytics_orders",
  "admin_analytics_masters",
  "admin_analytics_clients",
  "admin_analytics_daily",
  "admin_set_order_test",
]);

const NAME_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Тело ответа для функции, возвращающей одно значение, — всегда JSON, как у
 * PostgREST. Fastify отдаёт строку как есть, без кавычек: get_master_phone
 * приходил телом «+79…», клиентский JSON.parse не справлялся и подставлял
 * null — у специалистов пропали кнопки «Позвонить» и «WhatsApp» (2026-09-10).
 */
export function rpcScalarBody(value: unknown): string {
  return JSON.stringify(value ?? null);
}

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
      const keys = Object.keys(args);
      if (keys.some((k) => !NAME_RE.test(k)))
        return reply.code(400).send({ error: "Неверное имя аргумента" });
      const placeholders = keys.map((k, i) => `"${k}" := $${i + 1}`).join(", ");
      const values = keys.map((k) => {
        const v = (args as Record<string, unknown>)[k];
        // Массивы node-pg сериализует сам (text[]); объекты — как jsonb-текст.
        if (Array.isArray(v)) return v;
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
          const value =
            rows.rows.length === 1 ? (rows.rows[0]?.[name] ?? null) : rows.rows.map((r) => r[name]);
          return reply.type("application/json; charset=utf-8").send(rpcScalarBody(value));
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
