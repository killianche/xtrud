/**
 * Hook для записи просмотра мастера. Делегирует в RPC `record_master_view`.
 *
 * Два слоя дедупа:
 *   1. Client-side (in-memory Map) — НЕ персистентный (теряется на reload).
 *      Цель: не спамить RPC во время одной сессии при скролле ленты.
 *   2. Server-side (24h cooldown по session_id, см. миграция 0096) — реальная
 *      защита от накрутки.
 *
 * Примечание: AsyncStorage в проекте не установлен, поэтому используем
 * in-memory Map. При перезапуске app дедуп client-side сбросится, но
 * server-side всё равно отфильтрует — это корректное поведение.
 *
 * USAGE:
 *   - MasterPreviewCard (mount → impression)
 *   - app/(tabs)/master/[id].tsx (mount → profile_open)
 */
import { useCallback } from "react";
import { getDeviceSessionId } from "@/lib/device-session-id";
import { supabase } from "@/lib/supabase";

type ViewType = "impression" | "profile_open";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// In-memory dedup. Map<"<masterId>:<type>", timestampMs>
const dedupCache = new Map<string, number>();

function isDuplicate(masterId: string, type: ViewType): boolean {
  const k = `${masterId}:${type}`;
  const last = dedupCache.get(k);
  if (typeof last !== "number") return false;
  if (Date.now() - last >= ONE_DAY_MS) {
    dedupCache.delete(k);
    return false;
  }
  return true;
}

function rememberView(masterId: string, type: ViewType): void {
  dedupCache.set(`${masterId}:${type}`, Date.now());
  // Лёгкий cleanup, чтобы Map не разрасталась при долгих сессиях.
  if (dedupCache.size > 500) {
    const now = Date.now();
    for (const [k, ts] of dedupCache.entries()) {
      if (now - ts > ONE_DAY_MS) dedupCache.delete(k);
    }
  }
}

export function useRecordMasterView() {
  return useCallback(async (masterId: string, type: ViewType): Promise<void> => {
    if (!masterId) return;
    if (isDuplicate(masterId, type)) return;
    try {
      const sessionId = await getDeviceSessionId();
      await supabase.rpc("record_master_view", {
        p_master_id: masterId,
        p_view_type: type,
        p_session_id: sessionId,
      });
      rememberView(masterId, type);
    } catch (e) {
      // Telemetry не должна ронять UI.
      console.warn("[record_master_view]", e);
    }
  }, []);
}
