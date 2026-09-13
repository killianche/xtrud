import { describe, expect, it } from "vitest";
import { pgErrorToHttp } from "../src/db.js";

describe("ошибки базы в HTTP", () => {
  it("взаимная блокировка и конфликт сериализации — 409 с просьбой повторить", () => {
    for (const code of ["40P01", "40001"]) {
      expect(pgErrorToHttp({ code, message: "deadlock detected" })).toEqual({
        status: 409,
        message: "Попробуйте ещё раз.",
        code,
      });
    }
  });

  it("прочие коды не изменились", () => {
    expect(pgErrorToHttp({ code: "P0002", message: "Задание не найдено." }).status).toBe(404);
    expect(pgErrorToHttp({ code: "P0001", message: "x" }).status).toBe(422);
    expect(pgErrorToHttp({ code: "XX000", message: "internal" })).toEqual({
      status: 500,
      message: "Ошибка сервера",
      code: "XX000",
    });
  });
});
