const CACHE_NAME = "cosechas-cas-v6";

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

  // CLAVE: cualquier navegación (abrir/recargar la app, venga la URL con o
  // sin "index.html" al final, sea la raíz del sitio o el ícono instalado)
  // siempre va primero a la red, ignorando toda caché. Antes solo mirábamos
  // si la URL terminaba en "index.html" literalmente, y por eso a veces no
  // detectaba que había que buscar la versión nueva.
  const isNavigation = req.mode === "navigate";
  const isManifest = isOwnFile && req.url.endsWith("manifest.json");
  const isNetworkFirst = isNavigation || isManifest;
  const isCacheFirst = CACHE_FIRST.includes(req.url);

  if (!isOwnFile && !isCacheFirst) return; // deja pasar (Firestore, analytics, etc.)

  if (isNetworkFirst) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          const cacheKey = isNavigation ? "./index.html" : "./manifest.json";
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          return response;
        })
        .catch(() => caches.match(isNavigation ? "./index.html" : "./manifest.json"))
    );
    return;
  }

  if (!isCacheFirst) return; // cualquier otro archivo propio: directo a la red

  // Caché primero (íconos, SDK de Firebase, Chart.js): más rápido, casi no cambian.
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
