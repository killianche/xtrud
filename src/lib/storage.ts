// Кросс-платформенный KV-storage.
//
// Native (iOS/Android): expo-secure-store (зашифровано в Keychain/Keystore).
// Web: window.localStorage (на SSR — noop, чтобы не падать при static rendering).
//
// Используется:
// - Supabase auth session (через largeSecureStorage — с чанкингом, т.к. session JSON
//   может быть 3-4 KB, а iOS Keychain item лимит ~2 KB)
// - Zustand persist для пользовательских предпочтений (тема и т.д.) — через storage
//   (мелкие значения, чанкинг не нужен)

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";
const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const ENCODED_KEY_PREFIX = "xtrud.encoded.";

function nativeSecureStoreKey(key: string): string {
  if (SECURE_STORE_KEY_PATTERN.test(key) && !key.startsWith(ENCODED_KEY_PREFIX)) return key;

  let encoded = "";
  for (let index = 0; index < key.length; index += 1) {
    encoded += key.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `${ENCODED_KEY_PREFIX}${encoded}`;
}

/**
 * Простой адаптер для значений < 2 KB.
 * Совместим с Zustand persist `StateStorage` и `createJSONStorage`.
 */
export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    }
    return SecureStore.getItemAsync(nativeSecureStoreKey(key));
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(nativeSecureStoreKey(key), value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (isWeb) {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(nativeSecureStoreKey(key));
  },
};

/**
 * Адаптер с чанкингом — для Supabase auth.
 *
 * Делит значение на куски ≤1800 байт (запас под iOS Keychain лимит ~2048).
 * Метаданные о кол-ве чанков хранятся в ключе `${key}__meta`.
 * Чанки — в `${key}__${i}`.
 *
 * Совместим с Supabase auth `GoTrueClientOptions.storage`.
 */
const CHUNK_SIZE = 1800;
const META_SUFFIX = "__meta";
const CHUNK_SUFFIX = "__";

interface ChunkMeta {
  chunks: number;
  /** Absent on legacy snapshots, which use `${key}__${index}`. */
  generation?: string;
  byteAware?: boolean;
}

const storageOperationQueues = new Map<string, Promise<unknown>>();
let storageGeneration = 0;

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export function splitUtf8SafeChunks(value: string, maxBytes: number): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) {
    throw new Error("Chunk size must fit one UTF-8 code point");
  }
  if (value.length === 0) return [""];

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (chunk && chunkBytes + characterBytes > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function parseChunkMeta(value: string | null): ChunkMeta | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ChunkMeta>;
    if (!Number.isInteger(parsed.chunks) || (parsed.chunks ?? 0) < 1) return null;
    if (parsed.generation !== undefined && typeof parsed.generation !== "string") return null;
    return parsed as ChunkMeta;
  } catch {
    return null;
  }
}

function chunkKey(key: string, meta: ChunkMeta, index: number): string {
  return meta.generation
    ? `${key}${CHUNK_SUFFIX}${meta.generation}${CHUNK_SUFFIX}${index}`
    : `${key}${CHUNK_SUFFIX}${index}`;
}

async function removeChunks(key: string, meta: ChunkMeta | null): Promise<void> {
  if (!meta) return;
  for (let index = 0; index < meta.chunks; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, meta, index));
  }
}

async function enqueueStorageOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = storageOperationQueues.get(key) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(operation);
  storageOperationQueues.set(key, queued);
  try {
    return await queued;
  } finally {
    if (storageOperationQueues.get(key) === queued) storageOperationQueues.delete(key);
  }
}

export const largeSecureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return enqueueStorageOperation(key, async () => {
      if (isWeb) {
        return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      }
      const nativeKey = nativeSecureStoreKey(key);
      const meta = parseChunkMeta(await SecureStore.getItemAsync(`${nativeKey}${META_SUFFIX}`));
      if (!meta) {
        // Backward-compat: значение могло быть сохранено без меты, как единое.
        return SecureStore.getItemAsync(nativeKey);
      }
      const parts: string[] = [];
      for (let i = 0; i < meta.chunks; i += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(nativeKey, meta, i));
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    });
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await enqueueStorageOperation(key, async () => {
      if (isWeb) {
        if (typeof window !== "undefined") window.localStorage.setItem(key, value);
        return;
      }
      const nativeKey = nativeSecureStoreKey(key);
      const metaKey = `${nativeKey}${META_SUFFIX}`;
      const oldMeta = parseChunkMeta(await SecureStore.getItemAsync(metaKey));
      const chunks = splitUtf8SafeChunks(value, CHUNK_SIZE);

      if (chunks.length === 1) {
        await SecureStore.setItemAsync(nativeKey, value);
        // Removing the pointer commits the single-value representation.
        await SecureStore.deleteItemAsync(metaKey);
        await removeChunks(nativeKey, oldMeta);
        return;
      }

      storageGeneration += 1;
      const nextMeta: ChunkMeta = {
        chunks: chunks.length,
        generation: `${Date.now().toString(36)}-${storageGeneration.toString(36)}`,
        byteAware: true,
      };
      for (let index = 0; index < chunks.length; index += 1) {
        await SecureStore.setItemAsync(chunkKey(nativeKey, nextMeta, index), chunks[index] ?? "");
      }
      // Meta is the generation pointer: publish it only after every chunk exists.
      await SecureStore.setItemAsync(metaKey, JSON.stringify(nextMeta));
      await SecureStore.deleteItemAsync(nativeKey);
      await removeChunks(nativeKey, oldMeta);
    });
  },
  removeItem: async (key: string): Promise<void> => {
    await enqueueStorageOperation(key, async () => {
      if (isWeb) {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
        return;
      }
      const nativeKey = nativeSecureStoreKey(key);
      const metaKey = `${nativeKey}${META_SUFFIX}`;
      const meta = parseChunkMeta(await SecureStore.getItemAsync(metaKey));
      await SecureStore.deleteItemAsync(nativeKey);
      await SecureStore.deleteItemAsync(metaKey);
      await removeChunks(nativeKey, meta);
    });
  },
};
