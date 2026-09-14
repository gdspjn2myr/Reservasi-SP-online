// ============================================================================
// SERVICE WORKER — cache app shell (pola sama persis W-SMART). Naikkan
// APP_VERSION tiap kali file di bawah diubah supaya cache ter-update & user
// dapat notif "Versi baru tersedia".
// ============================================================================

const APP_VERSION = '1.0.3';
const CACHE_NAME = 'v.' + APP_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/departemen-data.js',
  './js/foto-compress.js',
  './js/auth.js',
  './js/api.js',
  './js/router.js',
  './js/reservasi.js',
  './js/spk.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Sengaja TIDAK skipWaiting() — worker baru nunggu sampai user pilih "Update
  // Sekarang" di app.js, bukan ganti versi sendiri di tengah user input data.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Jangan cache request ke backend Apps Script — selalu ambil data terbaru.
  if (req.method !== 'GET' || req.url.indexOf('script.google.com') !== -1) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
