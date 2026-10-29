// Service worker админки xtrud (№367): только уведомления. Ничего не
// кэширует — админка всегда работает с живыми данными.
//
// Сервер (xtrud-api, push/webpush.ts) шлёт JSON {title, body, url, tag} —
// без персональных данных: уведомление видно на заблокированном экране.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "xtrud", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "xtrud";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    renotify: true,
    icon: "/admin/icon-192.png",
    badge: "/admin/icon-192.png",
    data: { url: typeof data.url === "string" ? data.url : "/admin/#/inbox" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || "/admin/#/inbox";
  // Только свои адреса: уведомление не открывает чужой сайт.
  const target = new URL(raw, self.location.origin);
  const url =
    target.origin === self.location.origin && target.pathname.startsWith("/admin/")
      ? target.href
      : `${self.location.origin}/admin/#/inbox`;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(`${self.location.origin}/admin/`)) {
          await client.focus();
          if ("navigate" in client) return client.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
