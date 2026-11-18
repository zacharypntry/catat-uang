/* ARTA — service worker (sw.js)
   1. File aplikasi selalu diambil versi terbarunya dari internet; salinan tersimpan dipakai saat offline/lambat.
   2. Menerima bukti transaksi yang dibagikan dari aplikasi bank (menu "Bagikan").
   Data transaksi TIDAK lewat sini; itu langsung ke Google Apps Script. */
const VERSI = 'catat-uang-v8';
const KIRIMAN = 'catat-uang-kiriman';
const INTI = ['./', './index.html', './app.js', './struk.js', './manifest.json', './icon-192.png', './icon-512.png'];
const BATAS_TUNGGU = 1500; // ms; lebih lama dari ini, pakai salinan tersimpan dulu

self.addEventListener('install', (e) => {
  // cache: 'reload' = abaikan salinan lama di browser/CDN, ambil langsung dari server
  e.waitUntil(
    caches.open(VERSI)
      .then((c) => c.addAll(INTI.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSI && k !== KIRIMAN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Bukti transaksi dibagikan ke aplikasi: simpan sebentar, lalu buka aplikasi untuk membacanya */
async function terimaKiriman(req) {
  try {
    const fd = await req.formData();
    const file = fd.getAll('struk').find((f) => f && f.size);
    const teks = ['title', 'text', 'url'].map((k) => fd.get(k)).filter(Boolean).join('\n');
    const c = await caches.open(KIRIMAN);
    await c.delete('kiriman-file');
    if (file) await c.put('kiriman-file', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
    await c.put('kiriman-teks', new Response(teks, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } }));
    return Response.redirect('./index.html?share=1', 303);
  } catch (err) {
    return Response.redirect('./index.html?share=gagal', 303);
  }
}

/* File aplikasi: internet dulu (selalu versi terbaru), salinan tersimpan bila offline atau terlalu lama */
async function internetDulu(url) {
  const cache = await caches.open(VERSI);
  const kunci = url.origin + url.pathname;
  const ambil = fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res && res.ok) cache.put(kunci, res.clone());
    return res;
  });
  const tersimpan = await cache.match(kunci);
  if (!tersimpan) return ambil;
  const telat = new Promise((ok) => setTimeout(() => ok(tersimpan), BATAS_TUNGGU));
  return Promise.race([ambil.catch(() => tersimpan), telat]);
}

/* Pustaka dari CDN (nama berversi, isinya tidak berubah): salinan tersimpan dulu */
async function simpananDulu(req) {
  const cache = await caches.open(VERSI);
  const tersimpan = await cache.match(req);
  if (tersimpan) return tersimpan;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const milikKita = url.origin === self.location.origin;

  if (req.method === 'POST' && milikKita && url.pathname.endsWith('/terima-struk')) {
    e.respondWith(terimaKiriman(req));
    return;
  }
  if (req.method !== 'GET') return;                       // kiriman data ke spreadsheet: langsung ke jaringan
  if (milikKita) { e.respondWith(internetDulu(url)); return; }
  if (['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname)) {
    e.respondWith(simpananDulu(req));
  }
});
