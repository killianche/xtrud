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
  getItemAsync: async (key: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
    return secureStoreState.data.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
    if (secureStoreState.shouldDelayFirstWrite && value.startsWith("FIRST")) {
      secureStoreState.shouldDelayFirstWrite = false;
      await new Promise<void>((resolve) => {
        secureStoreState.releaseFirstWrite = resolve;
      });
    }
    secureStoreState.data.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
    if (secureStoreState.delayDeleteKey === key) {
      secureStoreState.delayDeleteKey = undefined;
      await new Promise<void>((resolve) => {
        secureStoreState.releaseDelete = resolve;
      });
    }
    secureStoreState.data.delete(key);
  },
}));

import { largeSecureStorage, splitUtf8SafeChunks, storage, utf8ByteLength } from "./storage";

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

  it("encodes unsupported native key characters for both storage adapters", async () => {
    await storage.setItem("xtrud:theme", "dark");
    await largeSecureStorage.setItem("xtrud:order-draft", "Описание ".repeat(300));

    await expect(storage.getItem("xtrud:theme")).resolves.toBe("dark");
    await expect(largeSecureStorage.getItem("xtrud:order-draft")).resolves.toBe(
      "Описание ".repeat(300),
    );
    expect([...secureStoreState.data.keys()]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^xtrud\.encoded\.[A-Za-z0-9._-]+$/)]),
    );
    expect([...secureStoreState.data.keys()].every((key) => /^[A-Za-z0-9._-]+$/.test(key))).toBe(
      true,
    );

    await storage.removeItem("xtrud:theme");
    await largeSecureStorage.removeItem("xtrud:order-draft");
    await expect(storage.getItem("xtrud:theme")).resolves.toBeNull();
    await expect(largeSecureStorage.getItem("xtrud:order-draft")).resolves.toBeNull();
  });

  it("preserves valid Supabase keys and isolates the encoded-key namespace", async () => {
    const supabaseKey = "sb-wgeimsajvjkzrrnfrnkb-auth-token";
    const reservedPrefixKey = "xtrud.encoded.00780074007200750064";

    await storage.setItem(supabaseKey, "session");
    await storage.setItem("xtrud:theme", "dark");
    await storage.setItem(reservedPrefixKey, "reserved");

    expect(secureStoreState.data.get(supabaseKey)).toBe("session");
    await expect(storage.getItem("xtrud:theme")).resolves.toBe("dark");
    await expect(storage.getItem(reservedPrefixKey)).resolves.toBe("reserved");
    expect(secureStoreState.data.size).toBe(3);
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
