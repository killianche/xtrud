import { describe, expect, it } from "vitest";
import { isNetworkTransportError, isTimeoutError } from "./network-transport-error";

describe("isTimeoutError", () => {
  it("таймаут — да, мгновенный обрыв и ошибка сервера — нет (№378)", () => {
    expect(isTimeoutError({ code: "ETIMEDOUT", message: "Сервер не ответил за 12 с." })).toBe(true);
    expect(isTimeoutError(new Error("The request timed out."))).toBe(true);
    expect(isTimeoutError({ code: "ENETUNREACH", message: "Network request failed" })).toBe(false);
    expect(isTimeoutError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});

describe("isNetworkTransportError", () => {
  it("recognizes native fetch, DNS and timeout failures", () => {
    expect(isNetworkTransportError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkTransportError({ code: "ENOTFOUND", message: "getaddrinfo" })).toBe(true);
    expect(isNetworkTransportError({ code: "", details: "DNS NoSuchRecord" })).toBe(true);
    expect(isNetworkTransportError({ message: "The request timed out" })).toBe(true);
  });

  it("does not hide authorization or API contract failures", () => {
    expect(isNetworkTransportError({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isNetworkTransportError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isNetworkTransportError(new Error("column does not exist"))).toBe(false);
    expect(isNetworkTransportError(new TypeError("Cannot read properties of undefined"))).toBe(
      false,
    );
  });
});
