const CACHE_NAME = "cosechas-cas-v5";

// Estos archivos SIEMPRE se intenta traer de internet primero (para que
// las actualizaciones se vean de inmediato); si no hay señal, se usa la
// última copia guardada.
const NETWORK_FIRST = [
  "./index.html",
  "./manifest.json",
];

// Estos casi nunca cambian, así que sí conviene servirlos directo desde
// la copia guardada (más rápido, y son pesados para descargar cada vez).
const CACHE_FIRST = [
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Se cachea cada archivo por separado: si uno falla (sin señal en ese
    // instante) no impide que el resto quede instalado.
    await Promise.all(
      [...NETWORK_FIRST, ...CACHE_FIRST].map(async (url) => {
        try {
          const res = await fetch(url, {
            mode: url.startsWith("http") ? "cors" : "same-origin",
            cache: "reload", // ignora la caché HTTP del navegador, siempre trae lo último
          });
          if (res.ok) await cache.put(url, res);
        } catch (e) { /* se descargará en el siguiente intento con señal */ }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Muy importante: NUNCA interceptar nada que no sea GET, ni las llamadas
  // reales de Firestore (sincronización en tiempo real). Esas deben ir
  // siempre directo a la red/caché propia de Firestore, sin pasar por aquí.
  if (req.method !== "GET") return;

  const isOwnFile = req.url.startsWith(self.location.origin);
  const isCacheFirst = CACHE_FIRST.includes(req.url);
  const isNetworkFirst = NETWORK_FIRST.some((p) => req.url.endsWith(p.replace("./", "")));
  if (!isOwnFile && !isCacheFirst) return; // deja pasar (Firestore, analytics, etc.)

  if (isNetworkFirst) {
    // Red primero, ignorando la caché HTTP del navegador: si hay señal,
    // siempre trae la versión más nueva de verdad (no una copia "casi nueva").
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Caché primero (íconos, SDK de Firebase): más rápido, casi no cambian.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      });
    })
  );
});
