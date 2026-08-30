/**
 * useTouchLastActive — отмечает онлайн-активность пользователя для рейтинга
 * мастеров (Этап 2). Раз в сессию (троттл 10 мин) дёргает RPC `touch_last_active`,
 * который ставит `users.last_active_at = now()`. Под-балл «активность» в скоринге
 * (`recompute_master_ranking_scores`) читает эту отметку (fallback —
 * `last_seen_feed_at`).
 *
 * Вызывается из (tabs)/_layout — то есть когда пользователь реально пользуется
 * приложением. Троттл через module-level timestamp, чтобы не слать запрос на
 * каждый ре-рендер / перемонтаж и на каждое переключение AppState.
 */

import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";

const THROTTLE_MS = 10 * 60 * 1000; // не чаще раза в 10 минут

let lastPingAt = 0;

async function ping() {
  const now = Date.now();
  if (now - lastPingAt < THROTTLE_MS) return;
  lastPingAt = now;
  try {
    await supabase.rpc("touch_last_active");
  } catch {
    // Активность — не критичный сигнал; при ошибке разрешаем повтор позже.
    lastPingAt = 0;
  }
}

export function useTouchLastActive(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void ping();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void ping();
    });
    return () => sub.remove();
  }, [enabled]);
}
