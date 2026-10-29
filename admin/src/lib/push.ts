// Web Push на этом устройстве (0255, №367).
//
// iPhone присылает уведомления сайту, только если он добавлен на экран
// «Домой» (iOS 16.4+) и разрешение спрошено по нажатию кнопки. Поэтому:
// service worker (public/sw.js) → разрешение → подписка с открытым ключом
// VAPID сервера → адрес подписки сохраняется в базе (admin_push_subscribe).

import { api } from "./api";
import { loadConfig } from "./config";

export type PushState =
  | "unsupported" // браузер не умеет
  | "needs-install" // iPhone, открыто в Safari, а не с экрана «Домой»
  | "denied" // запрещено в настройках
  | "off" // можно включить
  | "on"; // включено на этом устройстве

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return "needs-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await currentSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Браузер";
}

/** Включить на этом устройстве. Вызывать только из обработчика нажатия. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) throw new Error("Не удалось подключить уведомления. Обновите страницу.");
  await navigator.serviceWorker.ready;
  const { supabaseUrl } = await loadConfig();
  const res = await fetch(`${supabaseUrl}/v2/admin-push/key`);
  const { publicKey } = (await res.json()) as { publicKey: string | null };
  if (!publicKey) throw new Error("Уведомления на сервере не настроены.");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Браузер не выдал адрес подписки.");
  }
  await api.pushSubscribe(json.endpoint, json.keys.p256dh, json.keys.auth, deviceLabel());
  return "on";
}

/** Выключить на этом устройстве. */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return "off";
}
