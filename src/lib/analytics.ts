/**
 * Аналитика для админки (№299, 0243): нажатия «Позвонить» / «WhatsApp» и
 * просмотр задания специалистом. «Отправил и забыл»: ошибки не
 * показываются, экран не ждёт сети. Кто нажал — база берёт из входа
 * (auth.uid()), связи проверяет сама (`track_event`); номера телефонов
 * сюда не передаются — только id задания, отклика и специалиста.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export type TrackKind = "call_click" | "whatsapp_click" | "order_view";
export type TrackSource =
  | "response_card"
  | "order_contacts"
  | "master_profile"
  | "feed"
  | "push"
  | "link";

function appBuild(): number | null {
  const cfg = Constants.expoConfig;
  const raw = Platform.OS === "ios" ? cfg?.ios?.buildNumber : cfg?.android?.versionCode;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>;

export function trackEvent(
  kind: TrackKind,
  ids: {
    orderId?: string | null;
    masterId?: string | null;
    responseId?: string | null;
    source: TrackSource;
  },
): void {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  try {
    void Promise.resolve(
      (supabase.rpc as unknown as UntypedRpc)("track_event", {
        p_kind: kind,
        p_order_id: ids.orderId ?? null,
        p_master_id: ids.masterId ?? null,
        p_response_id: ids.responseId ?? null,
        p_source: ids.source,
        p_platform: platform,
        p_app_build: appBuild(),
      }),
    ).catch(() => undefined);
  } catch {
    // Аналитика не должна мешать звонку.
  }
}
