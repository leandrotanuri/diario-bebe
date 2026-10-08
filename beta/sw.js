/* O beta virou o app principal: este service worker se remove e manda as abas pra raiz. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf("mamei-beta") === 0).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((cl) => cl.forEach((c) => c.navigate(new URL("../", self.registration.scope).href)))
  );
});
