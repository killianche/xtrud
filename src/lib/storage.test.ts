import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStoreState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  releaseFirstWrite: undefined as (() => void) | undefined,
  shouldDelayFirstWrite: false,
  delayDeleteKey: undefined as string | undefined,
  releaseDelete: undefined as (() => void) | undefined,
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => secureStoreState.data.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (secureStoreState.shouldDelayFirstWrite && value.startsWith("FIRST")) {
      secureStoreState.shouldDelayFirstWrite = false;
      await new Promise<void>((resolve) => {
        secureStoreState.releaseFirstWrite = resolve;
      });
    }
    secureStoreState.data.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (secureStoreState.delayDeleteKey === key) {
      secureStoreState.delayDeleteKey = undefined;
      await new Promise<void>((resolve) => {
        secureStoreState.releaseDelete = resolve;
      });
    }
    secureStoreState.data.delete(key);
  },
}));

import { largeSecureStorage, splitUtf8SafeChunks, utf8ByteLength } from "./storage";

describe("largeSecureStorage", () => {
  beforeEach(() => {
    secureStoreState.data.clear();
    secureStoreState.releaseFirstWrite = undefined;
    secureStoreState.shouldDelayFirstWrite = false;
    secureStoreState.delayDeleteKey = undefined;
    secureStoreState.releaseDelete = undefined;
  });

  it("splits by UTF-8 bytes without cutting Unicode code points", () => {
    const value = `prefix-${"я".repeat(900)}-${"𐍈".repeat(20)}`;
    const chunks = splitUtf8SafeChunks(value, 1800);

    expect(chunks.join("")).toBe(value);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => utf8ByteLength(chunk) <= 1800)).toBe(true);
  });

  it("round-trips byte-chunked Unicode and keeps legacy chunk metadata readable", async () => {
    const value = "Описание ".repeat(300);
    await largeSecureStorage.setItem("draft", value);
    expect(await largeSecureStorage.getItem("draft")).toBe(value);

    secureStoreState.data.set("legacy__meta", JSON.stringify({ chunks: 2 }));
    secureStoreState.data.set("legacy__0", "старый-");
    secureStoreState.data.set("legacy__1", "формат");
    expect(await largeSecureStorage.getItem("legacy")).toBe("старый-формат");
  });

  it("serializes concurrent writes to the same logical key", async () => {
    secureStoreState.shouldDelayFirstWrite = true;
    const first = largeSecureStorage.setItem("session", "FIRST");
    const second = largeSecureStorage.setItem("session", "SECOND");

    for (let attempt = 0; attempt < 20 && !secureStoreState.releaseFirstWrite; attempt += 1) {
      await Promise.resolve();
    }
    expect(secureStoreState.data.get("session")).toBeUndefined();
    expect(secureStoreState.releaseFirstWrite).toBeTypeOf("function");
    secureStoreState.releaseFirstWrite?.();
    await Promise.all([first, second]);

    expect(await largeSecureStorage.getItem("session")).toBe("SECOND");
  });

  it("queues a reader behind an in-flight Unicode multichunk write", async () => {
    const value = `FIRST${"я".repeat(1_000)}`;
    secureStoreState.shouldDelayFirstWrite = true;
    const write = largeSecureStorage.setItem("draft-race", value);
    const read = largeSecureStorage.getItem("draft-race");

    for (let attempt = 0; attempt < 20 && !secureStoreState.releaseFirstWrite; attempt += 1) {
      await Promise.resolve();
    }
    expect(secureStoreState.releaseFirstWrite).toBeTypeOf("function");
    secureStoreState.releaseFirstWrite?.();
    await write;
    await expect(read).resolves.toBe(value);
  });

  it("queues a reader behind removal and never returns partial chunks", async () => {
    const value = "Удаляемый черновик ".repeat(150);
    await largeSecureStorage.setItem("remove-race", value);
    secureStoreState.delayDeleteKey = "remove-race__meta";
    const removal = largeSecureStorage.removeItem("remove-race");
    const read = largeSecureStorage.getItem("remove-race");

    for (let attempt = 0; attempt < 20 && !secureStoreState.releaseDelete; attempt += 1) {
      await Promise.resolve();
    }
    expect(secureStoreState.releaseDelete).toBeTypeOf("function");
    secureStoreState.releaseDelete?.();
    await removal;
    await expect(read).resolves.toBeNull();
  });
});
