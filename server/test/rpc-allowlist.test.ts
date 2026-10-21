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

// Аналитика админки (0243, №299). Доступ проверяется в базе: track_event —
// только authenticated, отчёты — is_staff_session(); список лишь открывает путь.
describe("RPC_ALLOWLIST — аналитика (0243)", () => {
  it("запись событий и отчёты открыты", () => {
    for (const name of [
      "track_event",
      "admin_analytics_overview",
      "admin_analytics_orders",
      "admin_analytics_masters",
      "admin_analytics_clients",
      "admin_analytics_daily",
      "admin_set_order_test",
    ]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(true);
    }
  });

  it("служебные функции аналитики наружу не открыты", () => {
    for (const name of ["analytics_excluded_user", "analytics_excluded_order"]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(false);
    }
  });
});

// Подтверждение компании (0245, №308, docs/COMPANY_VERIFICATION_2026-10.md).
// Доступ проверяют сами функции: специалист — активный вошедший,
// админские — is_staff_session().
describe("RPC_ALLOWLIST — подтверждение компании (0245)", () => {
  it("функции специалиста и админки открыты", () => {
    for (const name of [
      "submit_company_verification",
      "set_account_type",
      "my_company_verification",
      "admin_list_company_verifications",
      "admin_review_company_verification",
      "admin_revoke_company",
    ]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(true);
    }
  });

  it("внутренний помощник не открыт", () => {
    expect(RPC_ALLOWLIST.has("company_verification_state")).toBe(false);
  });
});

// Заявка на значок «Большой опыт» (0246, №318). Доступ проверяют сами
// функции: специалист — активный вошедший, админские — is_admin_session().
describe("RPC_ALLOWLIST — заявка на значок «Большой опыт» (0246)", () => {
  it("функции специалиста и админки открыты", () => {
    for (const name of [
      "submit_experience_badge_request",
      "my_experience_badge_request",
      "admin_list_experience_badge_requests",
      "admin_review_experience_badge_request",
    ]) {
      expect(RPC_ALLOWLIST.has(name), name).toBe(true);
    }
  });

  it("внутренние помощники не открыты", () => {
    expect(RPC_ALLOWLIST.has("experience_badge_state")).toBe(false);
    expect(RPC_ALLOWLIST.has("notify_admins_badge_request")).toBe(false);
  });
});
