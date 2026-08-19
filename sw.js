// Ciclo GLP — service worker
// Cache offline + entrega de lembretes locais agendados pelo app.
const CACHE = "ciclo-glp-v1";
const ASSETS = [
  "./index.html",
  "./app.compiled.js",
  "./vendor/react.min.js",
  "./vendor/react-dom.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});

// O app envia os lembretes via postMessage; o SW agenda com setTimeout.
// (No iOS os timers só rodam enquanto o app está aberto/recente; por isso
//  o app também reagenda a cada abertura — ver app.js.)
const timers = {};
self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "schedule") {
    Object.values(timers).forEach(clearTimeout);
    (msg.reminders || []).forEach((r, i) => {
      const delay = r.at - Date.now();
      if (delay <= 0 || delay > 2147483647) return;
      timers[i] = setTimeout(() => {
        self.registration.showNotification("Ciclo GLP", {
          body: r.body,
          icon: "./icons/icon-192.png",
          badge: "./icons/icon-192.png",
          tag: "dose-" + i,
          data: { url: "./index.html" },
        });
      }, delay);
    });
  }
  if (msg.type === "clear") Object.values(timers).forEach(clearTimeout);
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((cs) => {
      for (const c of cs) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
