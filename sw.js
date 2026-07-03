const CACHE_NAME = "cosechas-cas-v2";

const APP_SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
];

// El SDK de Firebase se cachea aparte: así la app puede arrancar sin
// internet una vez que se instaló/abrió al menos una vez con señal.
const CDN_SHELL = [
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Se cachean uno por uno (con manejo de errores) para que un fallo de
    // red puntual no impida instalar el resto de la app.
    await Promise.all(
      CDN_SHELL.map(async (url) => {
        try {
          const res = await fetch(url, { mode: "cors" });
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
  const isCdnShell = CDN_SHELL.includes(req.url);
  if (!isOwnFile && !isCdnShell) return; // deja pasar (Firestore, analytics, etc.)

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => (isOwnFile ? caches.match("./index.html") : undefined));
    })
  );
});
