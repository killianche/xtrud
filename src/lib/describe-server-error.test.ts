import { describe, expect, it, vi } from "vitest";
import { describeServerError, looksLikeErrorCode } from "./describe-server-error";

describe("describeServerError", () => {
  it("переводит код, который увидел владелец", () => {
    // Ровно та строка со скриншота 2026-09-05.
    expect(describeServerError(new Error("cannot_withdraw_after_decision"), "запасной")).toBe(
      "Этот отклик уже нельзя отозвать.",
    );
  });

  it("не пускает на экран незнакомый код", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(describeServerError(new Error("some_new_guard_failed"), "Не удалось сохранить.")).toBe(
      "Не удалось сохранить.",
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("оставляет готовую фразу сервера как есть", () => {
    const phrase = "Аккаунт ограничен: публикация недоступна. Обратитесь в поддержку.";
    expect(describeServerError(new Error(phrase), "запасной")).toBe(phrase);
  });

  it("подставляет запасной текст на пустой ошибке", () => {
    expect(describeServerError(new Error(""), "Не удалось отозвать отклик.")).toBe(
      "Не удалось отозвать отклик.",
    );
    expect(describeServerError(null, "Не удалось отозвать отклик.")).toBe(
      "Не удалось отозвать отклик.",
    );
  });

  it("отличает код от фразы", () => {
    expect(looksLikeErrorCode("order_not_open")).toBe(true);
    expect(looksLikeErrorCode("Задание уже закрыто")).toBe(false);
    expect(looksLikeErrorCode("new row violates row-level security policy")).toBe(false);
  });
});
