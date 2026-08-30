import { describe, expect, it } from "vitest";
import { isNetworkTransportError } from "./network-transport-error";

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
