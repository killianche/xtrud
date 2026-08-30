/**
 * useRecentSearches — история поисковых запросов в localStorage.
 *
 * Фидбэк user 2026-05-18 (research): «recent searches на пустой input».
 * Хранится локально (per-device), без БД — privacy + offline-friendly.
 *
 * API:
 *   const { recent, push, clear } = useRecentSearches();
 *   // recent: ["обои", "электрик"] (most recent first, max 10)
 *
 * Хранение: localStorage на web, in-memory на native (полноценный
 * AsyncStorage — отдельным спринтом, чтобы не тащить зависимость без нужды).
 */

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

const STORAGE_KEY = "xtrud-search-recent";
const MAX_RECENT = 10;
const MIN_LEN = 2;

function readStorage(): string[] {
  if (Platform.OS !== "web") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string" && s.length >= MIN_LEN)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeStorage(items: string[]): void {
  if (Platform.OS !== "web") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota / SSR — игнорируем
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readStorage());
  }, []);

  const push = useCallback((query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < MIN_LEN) return;
    setRecent((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== trimmed);
      const next = [trimmed, ...filtered].slice(0, MAX_RECENT);
      writeStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecent([]);
    writeStorage([]);
  }, []);

  return { recent, push, clear };
}
