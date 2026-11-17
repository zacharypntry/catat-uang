/* CATAT UANG — service worker (sw.js)
   1. Menyimpan tampilan aplikasi agar terbuka cepat dan tetap bisa dibuka saat offline.
   2. Menerima bukti transaksi yang dibagikan dari aplikasi bank (menu "Bagikan").
   Data transaksi TIDAK lewat sini; itu langsung ke Google Apps Script. */
const VERSI = 'catat-uang-v2';
const KIRIMAN = 'catat-uang-kiriman';
const INTI = ['./', './index.html', './app.js', './struk.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(INTI)).then(() => self.skipWaiting()));
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const milikKita = url.origin === self.location.origin;

  if (req.method === 'POST' && milikKita && url.pathname.endsWith('/terima-struk')) {
    e.respondWith(terimaKiriman(req));
    return;
  }
  if (req.method !== 'GET') return;                       // kiriman data ke spreadsheet: langsung ke jaringan
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
