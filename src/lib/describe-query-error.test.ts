import { describe, expect, it } from "vitest";
import { describeQueryError } from "./describe-query-error";
import { createTimeoutError } from "./fetch-with-timeout";

describe("describeQueryError", () => {
  it("объясняет таймаут как отсутствие связи", () => {
    const text = describeQueryError(createTimeoutError(12_000));
    expect(text.offline).toBe(true);
    expect(text.title).toBe("Нет связи");
  });

  it("объясняет обрыв сети как отсутствие связи", () => {
    const text = describeQueryError(new Error("Network request failed"));
    expect(text.offline).toBe(true);
  });

  it("серверную ошибку не выдаёт за отсутствие связи", () => {
    // PostgREST-ошибка приходит со своим кодом: это не проблема канала,
    // и предлагать «проверьте интернет» было бы ложью.
    const text = describeQueryError({
      code: "42501",
      message: "permission denied for table users",
    });
    expect(text.offline).toBe(false);
    expect(text.title).toBe("Не удалось загрузить");
  });

  it("не показывает пользователю техническую строку ошибки", () => {
    const raw = "FetchError: TypeError: Network request failed";
    const text = describeQueryError(new Error(raw));
    expect(text.title).not.toContain("FetchError");
    expect(text.hint).not.toContain("FetchError");
  });
});
