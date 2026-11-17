/* CATAT UANG — service worker (sw.js)
   Menyimpan tampilan aplikasi agar terbuka cepat dan tetap bisa dibuka saat offline.
   Data transaksi TIDAK lewat sini; itu langsung ke Google Apps Script. */
const VERSI = 'catat-uang-v1';
const INTI = ['./', './index.html', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(INTI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // kiriman data: biarkan langsung ke jaringan
  const url = new URL(req.url);
  const milikKita = url.origin === self.location.origin;
  const pustaka = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname);
  if (!milikKita && !pustaka) return;

  // Tampilkan dari simpanan dulu (cepat), lalu perbarui simpanan di belakang layar
  e.respondWith(
    caches.open(VERSI).then(async (cache) => {
      const tersimpan = await cache.match(req, { ignoreSearch: milikKita });
      const jaringan = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => tersimpan);
      return tersimpan || jaringan;
    })
  );
});
