import { describe, expect, it } from "vitest";
import { orderPublishFailureMessage } from "./order-publish-error";

describe("orderPublishFailureMessage", () => {
  it("describes only a transport failure as offline", () => {
    expect(orderPublishFailureMessage(new TypeError("Network request failed"))).toContain(
      "восстановления соединения",
    );
  });

  it("does not mask auth or API errors as offline", () => {
    expect(orderPublishFailureMessage({ code: "PGRST301", message: "JWT expired" })).not.toContain(
      "восстановления соединения",
    );
  });

  it("mentions signing in only when the session is the actual cause", () => {
    expect(orderPublishFailureMessage({ code: "PGRST301", status: 401 })).toContain("Войдите");
    expect(orderPublishFailureMessage({ details: "account_unknown", status: 403 })).toContain(
      "Войдите",
    );
  });

  it("never blames the session for a server-side failure", () => {
    // 404 из PostgREST (например, 0179: неверная сигнатура функции в триггере)
    // не имеет отношения ко входу — сообщение не должно этого утверждать.
    const message = orderPublishFailureMessage({ status: 404, message: "Нет такой таблицы" });
    expect(message).toBe("Не удалось опубликовать задание. Попробуйте ещё раз.");
    expect(message).not.toContain("вход");
  });

  it("shows the server text for limits and restricted accounts", () => {
    expect(
      orderPublishFailureMessage({ details: "daily_limit", message: "Одно задание в день." }),
    ).toBe("Одно задание в день.");
    expect(
      orderPublishFailureMessage({
        details: "account_not_active",
        message: "Аккаунт ограничен. Обратитесь в поддержку.",
        status: 403,
      }),
    ).toBe("Аккаунт ограничен. Обратитесь в поддержку.");
  });
});
