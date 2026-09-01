const CACHE = "rmn-v2";
const ASSETS = [
  "./", "./index.html",
  "./css/app.css",
  "./js/config.js", "./js/api.js", "./js/railway-api.js", "./js/app.js",
  "./js/views/agenda.js", "./js/views/lista.js", "./js/views/turno.js",
  "./js/views/parte.js", "./js/views/pami.js",
  "./js/views/config.js", "./js/views/validaciones.js",
  "./manifest.json",
  "./icons/Icon-192.png", "./icons/Icon-512.png", "./icons/loading.jpg"
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
  const url = new URL(e.request.url);
  if (url.hostname.includes("script.google.com")) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ ok: false, error: "Sin conexión" }),
      { headers: { "Content-Type": "application/json" } }
    )));
    return;
  }
  // Red primero para los archivos propios de la app — así un deploy nuevo
  // se ve apenas hay conexión, en vez de quedar pegado al cache-first
  // hasta que alguien se acuerde de bumpear CACHE (fue justo lo que rompió
  // el acceso de jefatura/admin: index.html viejo + JS nuevo mezclados).
  // Caché queda solo como respaldo para cuando no hay red.
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
