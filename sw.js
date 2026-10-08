/* Service Worker — Mamei
   Cache do "app shell" para funcionar offline e ser instalável.
   Suba a versão (CACHE) sempre que mudar os arquivos, pra forçar atualização. */
const CACHE = "mamei-v1";
const SHELL = [
  "./",
  "./index.html",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./sounds/shh.mp3",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Só cuidamos do nosso próprio site. Firebase/Google (sync) passa direto pra rede.
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== "GET") return;

  // Navegação: network-first (pega versão nova quando online), cai pro cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy));
        return r;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Demais arquivos do shell: cache-first.
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => cached))
  );
});

// Push recebido do servidor (app fechado): mostra a notificação.
self.addEventListener("push", (e) => {
  let data = { title: "🍼 Mamei", body: "Toque para abrir.", tag: "push" };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "push",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: data
    })
  );
});

// Clique numa notificação (lembrete de mamada/soneca): foca o app ou abre.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cl) => {
      for (const c of cl) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
