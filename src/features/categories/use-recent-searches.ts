/**
 * useRecentSearches — недавние запросы при создании задания.
 *
 * Фидбэк владельца 2026-05-18 и повторно 2026-09-03: на пустом экране создания
 * задания нужны «недавние», а не пустота с лупой.
 *
 * Хранится только на устройстве (privacy + работает без сети), максимум 10
 * записей. Пишем ПОДТВЕРЖДЁННЫЕ формулировки — то, что человек реально выбрал,
 * а не каждую букву ввода.
 *
 * История: раньше хранилище было `window.localStorage` напрямую и на native
 * возвращало пустой массив всегда — то есть на iOS, единственной активной
 * платформе, функция не работала вообще. Теперь используется общий адаптер
 * `src/lib/storage.ts` (SecureStore на native, localStorage на web).
 *
 * Разбор и слияние записей живут в `recent-searches.ts` — там они без
 * react-native-зависимостей и покрыты тестами.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  mergeRecentSearch,
  parseRecentSearches,
  RECENT_SEARCHES_KEY,
} from "@/features/categories/recent-searches";
import { storage } from "@/lib/storage";

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);
  // Хранилище асинхронное: держим последнее значение, чтобы запись не зависела
  // от того, успел ли отработать setState.
  const latest = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void storage
      .getItem(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (cancelled) return;
        const items = parseRecentSearches(raw);
        latest.current = items;
        setRecent(items);
      })
      .catch(() => {
        // Недоступное хранилище — не повод ломать экран: просто нет истории.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const push = useCallback((query: string) => {
    const next = mergeRecentSearch(latest.current, query);
    if (next.length === latest.current.length && next[0] === latest.current[0]) return;
    latest.current = next;
    setRecent(next);
    void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const clear = useCallback(() => {
    latest.current = [];
    setRecent([]);
    void storage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
  }, []);

  return { recent, push, clear };
}
