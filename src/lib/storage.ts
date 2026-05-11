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

/**
 * Простой адаптер для значений < 2 KB.
 * Совместим с Zustand persist `StateStorage` и `createJSONStorage`.
 */
export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (isWeb) {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
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

export const largeSecureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    }
    const metaRaw = await SecureStore.getItemAsync(`${key}${META_SUFFIX}`);
    if (!metaRaw) {
      // Backward-compat: значение могло быть сохранено без меты, как единое.
      return SecureStore.getItemAsync(key);
    }
    const meta = JSON.parse(metaRaw) as { chunks: number };
    const parts: string[] = [];
    for (let i = 0; i < meta.chunks; i++) {
      const part = await SecureStore.getItemAsync(`${key}${CHUNK_SUFFIX}${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      return;
    }
    // Очистка предыдущих чанков (вдруг новое значение короче).
    const oldMetaRaw = await SecureStore.getItemAsync(`${key}${META_SUFFIX}`);
    if (oldMetaRaw) {
      const oldMeta = JSON.parse(oldMetaRaw) as { chunks: number };
      for (let i = 0; i < oldMeta.chunks; i++) {
        await SecureStore.deleteItemAsync(`${key}${CHUNK_SUFFIX}${i}`);
      }
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}${META_SUFFIX}`);
      return;
    }

    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}${CHUNK_SUFFIX}${i}`, chunk);
    }
    await SecureStore.setItemAsync(`${key}${META_SUFFIX}`, JSON.stringify({ chunks }));
    // Очищаем "одиночный" слот на всякий.
    await SecureStore.deleteItemAsync(key);
  },
  removeItem: async (key: string): Promise<void> => {
    if (isWeb) {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
      return;
    }
    const metaRaw = await SecureStore.getItemAsync(`${key}${META_SUFFIX}`);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as { chunks: number };
      for (let i = 0; i < meta.chunks; i++) {
        await SecureStore.deleteItemAsync(`${key}${CHUNK_SUFFIX}${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}${META_SUFFIX}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};
