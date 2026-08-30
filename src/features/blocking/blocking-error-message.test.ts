import { describe, expect, it } from "vitest";
import { blockingActionFailureMessage } from "./blocking-error-message";

describe("blockingActionFailureMessage", () => {
  it("describes a transport failure as offline", () => {
    expect(blockingActionFailureMessage(new TypeError("Network request failed"))).toBe(
      "Нет соединения с интернетом. Проверьте сеть и попробуйте снова.",
    );
  });

  it("never leaks a raw Postgres error (e.g. a missing table before migration 0124)", () => {
    const pgError = { code: "42P01", message: 'relation "user_blocks" does not exist' };
    const message = blockingActionFailureMessage(pgError);
    expect(message).toBe("Сервер отклонил запрос. Попробуйте ещё раз чуть позже.");
    expect(message).not.toContain("relation");
    expect(message).not.toContain("user_blocks");
  });

  it("does not mask auth/API errors as offline", () => {
    expect(blockingActionFailureMessage({ code: "PGRST301", message: "JWT expired" })).toBe(
      "Сервер отклонил запрос. Попробуйте ещё раз чуть позже.",
    );
  });
});
