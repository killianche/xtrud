import { describe, expect, it } from "vitest";
import { RPC_ALLOWLIST } from "../src/rpc/routes.js";

// Управляющие (0239, №286, docs/STAFF_ROLES_2026-10.md). Граница доступа —
// проверки внутри функций базы; список лишь открывает путь /v2/rpc/<имя>.
describe("RPC_ALLOWLIST — управляющие (0239)", () => {
  it("роль и команда открыты", () => {
    for (const name of ["my_staff_role", "admin_list_staff", "admin_set_staff_role"]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(true);
    }
  });

  it("экран жалоб и «Без категории» в приложении — через RPC", () => {
    for (const name of [
      "admin_list_reports",
      "admin_resolve_report",
      "admin_set_user_status",
      "admin_set_review_status",
      "admin_warn_user",
      "admin_attention",
      "admin_list_uncategorized_orders",
      "admin_set_order_category",
      "admin_create_category",
      "admin_list_ai_category_suggestions",
      "admin_list_categories",
      "admin_order_card",
      "admin_user_card",
      "admin_hide_order",
      "admin_restore_order",
      "admin_hide_order_shadow",
      "admin_unhide_order",
      "admin_list_shadow_hidden_orders",
    ]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(true);
    }
  });

  it("служебные функции наружу не открыты", () => {
    for (const name of ["admin_log_action", "is_staff_session", "is_admin_session"]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(false);
    }
  });
});
