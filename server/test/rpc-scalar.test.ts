import { describe, expect, it } from "vitest";
import { rpcScalarBody } from "../src/rpc/routes.js";

describe("тело ответа функции с одним значением", () => {
  it("строка приходит JSON-строкой в кавычках, а не голым текстом", () => {
    // Ради этого и правка: голый «+79…» клиентский JSON.parse не разбирал.
    expect(rpcScalarBody("+79281234567")).toBe('"+79281234567"');
    expect(JSON.parse(rpcScalarBody("+79281234567"))).toBe("+79281234567");
  });

  it("uuid — тоже строка в кавычках", () => {
    const id = "c17f2662-fe32-4f4c-b6f2-7854225fa340";
    expect(JSON.parse(rpcScalarBody(id))).toBe(id);
  });

  it("числа, логические, объекты и пустое значение — как у PostgREST", () => {
    expect(rpcScalarBody(3)).toBe("3");
    expect(rpcScalarBody(true)).toBe("true");
    expect(JSON.parse(rpcScalarBody({ ok: true }))).toEqual({ ok: true });
    expect(rpcScalarBody(null)).toBe("null");
    expect(rpcScalarBody(undefined)).toBe("null");
  });
});
