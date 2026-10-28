const CACHE = "studyflow-v3";
const SHELL = ["/", "/study", "/manifest.webmanifest", "/icons/icon.svg", "/pdf.worker.min.mjs"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// A página informa os recursos que já carregou, para ficarem disponíveis offline após a primeira visita.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "CACHE_URLS") return;
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {}))),
    ),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Apenas GET do mesmo domínio. Chamadas a provedores de IA (outros domínios) nunca passam pelo cache.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(async () => {
        // Cada rota tem seu próprio documento offline: /study nunca deve virar a landing page.
        const cachedRoute = await caches.match(req);
        return cachedRoute ?? (await caches.match("/"));
      }),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
