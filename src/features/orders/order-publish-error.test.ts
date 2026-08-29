import { describe, expect, it } from "vitest";
import { orderPublishFailureMessage } from "./order-publish-error";

describe("orderPublishFailureMessage", () => {
  it("describes only a transport failure as offline", () => {
    expect(orderPublishFailureMessage(new TypeError("Network request failed"))).toContain(
      "восстановления соединения",
    );
  });

  it("does not mask auth or API errors as offline", () => {
    expect(orderPublishFailureMessage({ code: "PGRST301", message: "JWT expired" })).toBe(
      "Сервер отклонил публикацию. Проверьте вход в аккаунт и повторите попытку.",
    );
  });
});
