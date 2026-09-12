// TopMe push service worker — Chat & Pay notifications only. Deliberately
// minimal: no offline caching, no asset interception, nothing that could
// serve a stale page for a money-bearing screen. Registered from
// src/components/push/push-subscribe-button.tsx.

self.addEventListener("push", (event) => {
  let data = { title: "TopMe", body: "You have a new notification.", url: "/chat" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above rather than fail.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
