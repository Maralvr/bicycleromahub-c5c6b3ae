// Service worker for web push notifications.
// Receives a "wake-up" push (no payload encryption) and shows a generic notification;
// the in-app notifications list shows the actual content when the user opens the app.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean up any caches from old PWA experiments — we don't cache anything.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    payload = {};
  }

  const title = payload.title || "New activity";
  const body = payload.body || "Open the app to see what changed.";
  const url = payload.url || "/notifications";
  const tag = payload.tag || "guide-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an existing tab on this origin if any.
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) {
              try {
                await client.navigate(target);
              } catch {
                /* navigate fails when cross-origin — fall back below */
              }
            } else {
              client.postMessage({ type: "navigate", url: target });
            }
            return;
          }
        } catch {
          /* ignore bad URLs */
        }
      }
      // No tab open — open a fresh one.
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});

// Allow clients to ping the SW (used by debugging / "Send test" flow).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ping") {
    event.source && event.source.postMessage({ type: "pong" });
  }
});
