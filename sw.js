const CACHE = "rmn-v1";
const ASSETS = [
  "/", "/index.html",
  "/css/app.css",
  "/js/config.js", "/js/api.js", "/js/app.js",
  "/js/views/agenda.js", "/js/views/lista.js", "/js/views/turno.js",
  "/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Red primero para API calls, caché para assets estáticos
  const url = new URL(e.request.url);
  if (url.hostname.includes("script.google.com")) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ ok: false, error: "Sin conexión" }),
      { headers: { "Content-Type": "application/json" } }
    )));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
