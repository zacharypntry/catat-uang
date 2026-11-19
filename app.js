/* ARTA — logika aplikasi (app.js) */
'use strict';

/* =====================================================================
   1. FUNGSI MURNI (tanggal, format, ringkasan) — tidak menyentuh layar
   ===================================================================== */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const toDate = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

const rp = (n) => (n < 0 ? '-' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
function rpShort(n) {
  const a = Math.abs(n);
  const f = (v, s) => String(Math.round(v * 10) / 10).replace('.', ',') + ' ' + s;
  if (a >= 1e9) return f(n / 1e9, 'M');
  if (a >= 1e6) return f(n / 1e6, 'jt');
  if (a >= 1e3) return f(n / 1e3, 'rb');
  return String(n);
}
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
function tglPanjang(s) { const d = toDate(s); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); }
function tglPendek(s) { const d = toDate(s); return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); }

function periodRange(p, cs, ce, t) {
  const d = toDate(t);
  if (p === 'hari') return { s: t, e: t };
  if (p === 'minggu') { const s = addDays(t, -((d.getDay() + 6) % 7)); return { s: s, e: addDays(s, 6) }; }
  if (p === 'custom') { let s = cs || t, e = ce || t; if (s > e) { const x = s; s = e; e = x; } return { s: s, e: e }; }
  return { s: iso(new Date(d.getFullYear(), d.getMonth(), 1)), e: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
/* Periode pembanding: rentang yang setara tepat sebelum periode aktif */
function prevRange(p, r, t) {
  if (p === 'hari') return { s: addDays(t, -1), e: addDays(t, -1) };
  if (p === 'minggu') { const s = addDays(r.s, -7); return { s: s, e: addDays(s, daysBetween(r.s, t)) }; }
  if (p === 'bulan') {
    const d = toDate(t);
    const ps = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    return { s: iso(ps), e: iso(new Date(ps.getFullYear(), ps.getMonth(), Math.min(d.getDate(), last))) };
  }
  const len = daysBetween(r.s, r.e) + 1;
  return { s: addDays(r.s, -len), e: addDays(r.s, -1) };
}
function summarize(list, r) {
  const o = { masuk: 0, keluar: 0, saldo: 0, cat: {}, n: 0 };
  list.forEach((x) => {
    if (x.tanggal < r.s || x.tanggal > r.e) return;
    o.n++;
    if (x.jenis === 'pemasukan') o.masuk += x.nominal;
    else { o.keluar += x.nominal; o.cat[x.kategori] = (o.cat[x.kategori] || 0) + x.nominal; }
  });
  o.saldo = o.masuk - o.keluar;
  return o;
}
function sortedCats(catObj) {
  return Object.keys(catObj).map((k) => ({ name: k, total: catObj[k] })).sort((a, b) => b.total - a.total);
}
function buildInsights(list, p, r, t) {
  const sum = summarize(list, r);
  const out = [];
  const cats = sortedCats(sum.cat);
  if (cats.length) {
    out.push({ icon: 'top', title: cats[0].name + ' paling besar',
      text: rp(cats[0].total) + ', ' + Math.round(cats[0].total / sum.keluar * 100) + '% dari pengeluaran periode ini' });
  }
  if (sum.keluar > 0) {
    const end = r.e < t ? r.e : (r.s > t ? r.e : t);
    const days = Math.max(1, daysBetween(r.s, end) + 1);
    out.push({ icon: 'avg', title: 'Rata-rata ' + rp(sum.keluar / days) + ' per hari',
      text: 'Pengeluaran selama ' + days + ' hari berjalan' });
  }
  const pr = prevRange(p, r, t);
  const curEnd = (p === 'minggu' || p === 'bulan') ? t : r.e;
  const cur = summarize(list, { s: r.s, e: curEnd }).keluar;
  const prev = summarize(list, pr).keluar;
  const label = pr.s === pr.e ? tglPendek(pr.s) : tglPendek(pr.s) + ' sampai ' + tglPendek(pr.e);
  if (prev > 0) {
    const diff = cur - prev, pct = Math.round(Math.abs(diff) / prev * 100);
    if (diff === 0) out.push({ icon: 'same', title: 'Pengeluaran sama dengan periode sebelumnya', text: rp(prev) + ' pada ' + label });
    else out.push({ icon: diff > 0 ? 'up' : 'down',
      title: 'Pengeluaran ' + (diff > 0 ? 'naik ' : 'turun ') + pct + '%',
      text: 'Dibanding ' + rp(prev) + ' pada ' + label });
  } else if (cur > 0) {
    out.push({ icon: 'same', title: 'Belum ada pembanding', text: 'Tidak ada pengeluaran pada ' + label });
  }
  return out;
}
/* Kategori yang pernah dipakai, paling sering di depan */
function catStats(list, jenis) {
  const m = {};
  list.forEach((x, i) => {
    if (jenis && x.jenis !== jenis) return;
    const k = x.kategori;
    if (!m[k]) m[k] = { name: k, count: 0, last: -1 };
    m[k].count++; m[k].last = i;
  });
  return Object.keys(m).map((k) => m[k]).sort((a, b) => b.count - a.count || b.last - a.last);
}
function suggest(list, jenis, q, max) {
  q = (q || '').trim().toLowerCase();
  return catStats(list, jenis).filter((c) => !q || c.name.toLowerCase().indexOf(q) !== -1)
    .slice(0, max || 8).map((c) => c.name);
}
/* "makan" dan "Makan" dianggap kategori yang sama: pakai ejaan yang sudah ada */
function canonCat(list, jenis, typed) {
  const t = typed.trim().replace(/\s+/g, ' ');
  const hit = catStats(list, jenis).find((c) => c.name.toLowerCase() === t.toLowerCase());
  return hit ? hit.name : t;
}
function sortTx(list) {
  return list.map((x, i) => ({ x: x, i: i }))
    .sort((a, b) => (a.x.tanggal < b.x.tanggal ? 1 : a.x.tanggal > b.x.tanggal ? -1 : b.i - a.i))
    .map((o) => o.x);
}
function filterTx(list, f) {
  const q = (f.q || '').trim().toLowerCase();
  return list.filter((x) => {
    if (f.jenis && f.jenis !== 'semua' && x.jenis !== f.jenis) return false;
    if (f.kat && x.kategori !== f.kat) return false;
    if (f.from && x.tanggal < f.from) return false;
    if (f.to && x.tanggal > f.to) return false;
    if (q) {
      // Setiap kata harus ada, mis. "pemasukan gaji" atau "grab maret"
      const isi = (x.kategori + ' ' + (x.catatan || '') + ' ' + x.jenis).toLowerCase();
      if (!q.split(/\s+/).every((w) => isi.indexOf(w) !== -1)) return false;
    }
    return true;
  });
}
function lastMonths(t, n) {
  const d = toDate(t), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: m.getFullYear() + '-' + pad(m.getMonth() + 1), label: BULAN[m.getMonth()], year: m.getFullYear() });
  }
  return out;
}
function monthlyTotals(list, t, n) {
  const months = lastMonths(t, n);
  months.forEach((m) => { m.masuk = 0; m.keluar = 0; });
  const idx = {}; months.forEach((m, i) => { idx[m.key] = i; });
  list.forEach((x) => {
    const i = idx[x.tanggal.slice(0, 7)];
    if (i === undefined) return;
    if (x.jenis === 'pemasukan') months[i].masuk += x.nominal; else months[i].keluar += x.nominal;
  });
  return months;
}
function dailyTotals(list, p, r, t) {
  let s = r.s, e = r.e, note = '';
  if (p === 'hari') { s = addDays(t, -6); e = t; note = '7 hari terakhir'; }
  else if (daysBetween(s, e) > 30) { s = addDays(e, -30); note = '31 hari terakhir dari periode yang dipilih'; }
  const days = [], idx = {};
  for (let d = s; d <= e; d = addDays(d, 1)) { idx[d] = days.length; days.push({ date: d, total: 0 }); }
  list.forEach((x) => { if (x.jenis === 'pengeluaran' && idx[x.tanggal] !== undefined) days[idx[x.tanggal]].total += x.nominal; });
  return { days: days, note: note };
}
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const digits = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (typeof module !== 'undefined') {
  module.exports = { iso, toDate, addDays, daysBetween, rp, rpShort, periodRange, prevRange, summarize, buildInsights,
    catStats, suggest, canonCat, sortTx, filterTx, monthlyTotals, dailyTotals, digits, esc, tglPanjang };
}

/* =====================================================================
   2. APLIKASI (hanya berjalan di browser)
   ===================================================================== */
if (typeof document !== 'undefined') (function () {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } },
  };

  const S = {
    cfg: store.get('cu_cfg', null),
    tx: store.get('cu_tx', []),
    pending: store.get('cu_pending', []),
    lastSync: store.get('cu_last', 0),
    hasCache: store.get('cu_tx', null) !== null,
    period: store.get('cu_period', 'bulan'),
    cs: '', ce: '',
    view: 'beranda', trend: 'harian', donutJenis: 'pengeluaran',
    hist: { q: '', jenis: 'semua', kat: '', from: '', to: '', limit: 60 },
    editing: null, formJenis: 'pengeluaran',
    theme: store.get('cu_theme', 'sistem'),
    syncState: 'idle', charts: {},
    kat: store.get('cu_kat', { pemasukan: [], pengeluaran: [] }),
    katJenis: 'pengeluaran', formKat: '', formKatBaru: [], katSibuk: false,
  };
  const all = () => S.tx.concat(S.pending.map((p) => Object.assign({ pending: true }, p)));
  let peringatanSimpan = false;
  const persist = () => {
    const ok = store.set('cu_pending', S.pending);
    store.set('cu_tx', S.tx); store.set('cu_kat', S.kat);
    if (!ok && S.pending.length && !peringatanSimpan) {
      peringatanSimpan = true;
      toast('Penyimpanan HP penuh atau diblokir. Transaksi yang belum terkirim bisa hilang bila aplikasi ditutup.', 'warn');
    }
  };

  /* ---------- Kategori ---------- */
  const samaKat = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const daftarKat = (jenis) => (S.kat && S.kat[jenis]) || [];
  function jumlahPakai(jenis) {
    const n = {};
    all().forEach((x) => { if (x.jenis === jenis) { const k = x.kategori.toLowerCase(); n[k] = (n[k] || 0) + 1; } });
    return n;
  }
  /* Untuk chip di form: paling sering dipakai di depan */
  function urutKat(jenis) {
    const n = jumlahPakai(jenis);
    return daftarKat(jenis).map((k, i) => ({ k, i, n: n[k.toLowerCase()] || 0 }))
      .sort((a, b) => b.n - a.n || a.i - b.i).map((o) => o.k);
  }
  /* Ejaan baku: pakai yang sudah ada di daftar / riwayat */
  function bakuKat(jenis, nama) {
    nama = String(nama).replace(/\s+/g, ' ').trim();
    return daftarKat(jenis).find((k) => samaKat(k, nama)) || canonCat(all(), jenis, nama);
  }
  function tambahKatLokal(jenis, nama) {
    if (!daftarKat(jenis).some((k) => samaKat(k, nama))) { S.kat[jenis] = daftarKat(jenis).concat([nama]); persist(); }
  }
  /* Server lama (Code.gs belum diperbarui) tidak punya daftar kategori: ambil dari riwayat */
  function katDariRiwayat(tx) {
    const out = { pemasukan: [], pengeluaran: [] };
    tx.forEach((x) => { if (out[x.jenis] && !out[x.jenis].some((k) => samaKat(k, x.kategori))) out[x.jenis].push(x.kategori); });
    return out;
  }
  async function muatSemua(cfg) {
    try {
      return await api('muat', null, cfg);
    } catch (e) {
      if (!e.versiLama) throw e;
      const tx = await api('list', null, cfg);
      return { transaksi: tx, kategori: katDariRiwayat(tx) };
    }
  }

  /* ---------- Ikon ---------- */
  const I = {
    in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
    avg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6 4 4 6-7M15 8h5v5"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l6 6 4-4 6 7M15 16h5v-5"/></svg>',
    same: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 9h14M5 15h14"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.5h4.2a3.3 3.3 0 0 0 6.6 0h4.2V17a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z"/><circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
  };

  /* ---------- Toast & dialog ---------- */
  function toast(msg, kind, ms) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (kind === 'ok' ? I.ok : kind === 'warn' ? I.warn : '') + '<span>' + esc(msg) + '</span>';
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms || (kind === 'warn' ? 4200 : 2200));
  }
  let dialogDone = null;
  /* opts.input: tampilkan kolom isian (hasil = teksnya, atau false). opts.danger: tombol merah (bawaan). */
  function confirmBox(title, text, yes, opts) {
    opts = opts || {};
    const pakaiInput = typeof opts.input === 'string';
    $('dTitle').textContent = title; $('dText').textContent = text; $('dYes').textContent = yes || 'Hapus';
    $('dYes').className = opts.danger === false ? 'btn' : 'btn red';
    $('dInput').hidden = !pakaiInput; $('dYes').disabled = false;
    $('scrim2').classList.add('show'); $('dialog').classList.add('show');
    if (pakaiInput) { $('dInput').value = opts.input; $('dInput').focus(); $('dInput').select(); }
    else $('dNo').focus();
    return new Promise((res) => { dialogDone = res; });
  }
  function closeDialog(v) {
    if (v && !$('dInput').hidden) { v = $('dInput').value.replace(/\s+/g, ' ').trim(); if (!v) return; }
    $('scrim2').classList.remove('show'); $('dialog').classList.remove('show');
    if (dialogDone) { dialogDone(v); dialogDone = null; }
  }
  $('dInput').oninput = () => { $('dYes').disabled = !$('dInput').value.trim(); };
  $('dInput').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); closeDialog(true); } };
  $('dNo').onclick = () => closeDialog(false);
  $('dYes').onclick = () => closeDialog(true);
  $('scrim2').onclick = () => closeDialog(false);

  /* ---------- Tema ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const dark = S.theme === 'dark' || (S.theme === 'sistem' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#0b0d16' : '#ffffff';
    $('sTheme').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.theme)));
    if (S.view === 'analisis' && !$('app').hidden) renderAnalisis();
  }
  mq.addEventListener('change', applyTheme);
  $('sTheme').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.theme = b.dataset.v; store.set('cu_theme', S.theme); applyTheme();
  };

  /* ---------- Komunikasi dengan Apps Script ---------- */
  async function api(action, data, cfg) {
    cfg = cfg || S.cfg;
    let res;
    try {
      res = await fetch(cfg.url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ token: cfg.token, action: action }, data || {})),
      });
    } catch (e) {
      const err = new Error('Tidak ada koneksi internet.'); err.offline = true; throw err;
    }
    let j;
    try { j = await res.json(); } catch (e) {
      throw new Error('URL tidak merespons dengan benar. Periksa URL dan pastikan aksesnya "Siapa saja".');
    }
    if (!j.ok) {
      const lama = j.pesan === 'Aksi tidak dikenal.';
      const err = new Error(lama ? 'Code.gs di Apps Script belum diperbarui ke versi terbaru (lihat panduan bagian 7).' : (j.pesan || 'Terjadi kesalahan.'));
      err.auth = j.kode === 'AUTH'; err.versiLama = lama; throw err;
    }
    return j.data;
  }

  let mut = 0; /* bertambah tiap ada perubahan data, supaya hasil 'list' yang basi tidak menimpa */
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (S.pending.length) {
        const p = S.pending[0];
        const saved = await api('add', p);
        S.pending = S.pending.filter((q) => q.id !== p.id); S.tx.push(saved); mut++; persist();
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }

  let syncing = false;
  async function sync(silent) {
    if (!S.cfg || syncing) return;
    syncing = true; setSync('loading');
    try {
      await flush();
      let data, seen;
      let putaran = 0;
      do { seen = mut; data = await muatSemua(); } while (seen !== mut && ++putaran < 3);
      S.tx = data.transaksi; S.kat = data.kategori;
      S.hasCache = true; S.lastSync = Date.now();
      persist(); store.set('cu_last', S.lastSync);
      setSync('ok');
    } catch (e) {
      if (e.auth) { syncing = false; showGate(e.message); return; }
      setSync('err');
      if (!silent) toast(e.offline ? 'Sedang offline. Menampilkan data terakhir.' : e.message, 'warn');
    }
    syncing = false;
    render();
  }
  function setSync(st) {
    S.syncState = st;
    const n = S.pending.length;
    $('syncDot').className = 'dot ' + (st === 'loading' ? 'loading' : st === 'err' || n ? 'err' : st === 'ok' ? 'ok' : '');
    $('syncText').textContent = st === 'loading' ? 'Menyinkronkan' : n ? n + ' belum terkirim' : st === 'err' ? 'Offline' : 'Tersinkron';
  }

  /* ---------- Layar hubungkan ---------- */
  function showGate(msg) {
    $('app').hidden = true; $('nav').hidden = true; $('gate').hidden = false;
    closeForm();
    if (S.cfg) $('gUrl').value = S.cfg.url;
    $('gErr').textContent = msg || '';
  }
  function showApp() {
    $('gate').hidden = true; $('app').hidden = false; $('nav').hidden = false;
    render();
  }
  $('gateForm').onsubmit = async (e) => {
    e.preventDefault();
    const url = $('gUrl').value.trim(), token = $('gPass').value;
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { $('gErr').textContent = 'URL harus diawali https://script.google.com/ dan diakhiri /exec.'; return; }
    if (!token) { $('gErr').textContent = 'Isi kata sandi.'; return; }
    const btn = $('gBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Menghubungkan';
    $('gErr').textContent = '';
    try {
      const data = await muatSemua({ url: url, token: token });
      S.cfg = { url: url, token: token }; store.set('cu_cfg', S.cfg);
      S.tx = data.transaksi; S.kat = data.kategori; S.hasCache = true; S.lastSync = Date.now(); persist(); store.set('cu_last', S.lastSync);
      $('gPass').value = '';
      showApp(); setSync('ok'); toast('Terhubung ke spreadsheet', 'ok');
      if (antrianStruk) { const a = antrianStruk; antrianStruk = null; isiDariStruk(a.file, a.teks); }
      if (S.pending.length) sync(true);
    } catch (err) { $('gErr').textContent = err.message; }
    btn.disabled = false; btn.textContent = 'Hubungkan';
  };
  $('sLogout').onclick = async () => {
    const extra = S.pending.length ? ' Ada ' + S.pending.length + ' transaksi yang belum terkirim dan akan ikut terhapus dari HP ini.' : '';
    if (!(await confirmBox('Putuskan koneksi?', 'Kamu perlu memasukkan URL dan kata sandi lagi untuk memakai aplikasi.' + extra, 'Putuskan'))) return;
    ['cu_cfg', 'cu_tx', 'cu_pending', 'cu_last', 'cu_kat'].forEach(store.del);
    pengingatDimuat = false;
    S.cfg = null; S.tx = []; S.pending = []; S.kat = { pemasukan: [], pengeluaran: [] }; S.hasCache = false;
    $('gUrl').value = ''; showGate('');
  };

  /* ---------- Navigasi ---------- */
  function go(view) {
    S.view = view;
    ['beranda', 'riwayat', 'analisis', 'atur'].forEach((v) => { $('v-' + v).hidden = v !== view; });
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.go === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    render();
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
    const t = e.target.closest('.tx'); if (t) openTx(t.dataset.id);
  });
  $('fab').onclick = () => openForm(null);
  $('syncBtn').onclick = () => sync(false);
  $('sSync').onclick = () => sync(false);

  /* ---------- Pilihan periode (dipakai Beranda & Analisis) ---------- */
  const PERIODS = [['hari', 'Hari ini'], ['minggu', 'Minggu ini'], ['bulan', 'Bulan ini'], ['custom', 'Pilih tanggal']];
  function range() { return periodRange(S.period, S.cs, S.ce, today()); }
  function renderPeriod() {
    if (!S.cs) { const r = periodRange('bulan', '', '', today()); S.cs = r.s; S.ce = today(); }
    document.querySelectorAll('[data-period]').forEach((box) => {
      box.innerHTML = PERIODS.map((p) => '<button class="chip" data-p="' + p[0] + '" aria-pressed="' + (S.period === p[0]) + '">' + p[1] + '</button>').join('');
    });
    document.querySelectorAll('[data-custom]').forEach((box) => {
      box.hidden = S.period !== 'custom';
      if (!box.firstChild) {
        box.innerHTML = '<label class="field"><span>Dari</span><input class="input" type="date" data-c="cs"></label><label class="field"><span>Sampai</span><input class="input" type="date" data-c="ce"></label>';
      }
      box.querySelector('[data-c="cs"]').value = S.cs; box.querySelector('[data-c="ce"]').value = S.ce;
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    S.period = b.dataset.p; store.set('cu_period', S.period); render();
  });
  document.addEventListener('change', (e) => {
    const c = e.target.dataset && e.target.dataset.c; if (!c || !e.target.value) return;
    S[c] = e.target.value; render();
  });

  /* ---------- Potongan tampilan ---------- */
  function txRow(x, showDate) {
    const masuk = x.jenis === 'pemasukan';
    const sub = [showDate ? tglPendek(x.tanggal) : '', x.catatan].filter(Boolean).join(', ');
    return '<button class="tx" data-id="' + esc(x.id) + '">' +
      '<span class="ic ' + (masuk ? 'in' : 'out') + '">' + (masuk ? I.in : I.out) + '</span>' +
      '<span class="mid"><div class="kat">' + esc(x.kategori) + '</div>' + (sub ? '<div class="cat">' + esc(sub) + '</div>' : '') + '</span>' +
      '<span><div class="amt num ' + (masuk ? 'in' : 'out') + '">' + (masuk ? '+' : '-') + rp(x.nominal).replace('Rp ', 'Rp ') + '</div>' +
      (x.pending ? '<div class="wait">menunggu kirim</div>' : '') + '</span></button>';
  }
  function emptyBox(icon, title, text) {
    return '<div class="empty"><div class="art">' + icon + '</div><b>' + esc(title) + '</b><p>' + esc(text) + '</p></div>';
  }
  function skeleton(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += '<div class="skel" style="height:44px;margin-top:12px"></div>';
    return h;
  }
  const firstLoad = () => !S.hasCache && S.syncState === 'loading';

  /* ---------- Beranda ---------- */
  function renderBeranda() {
    const list = all(), r = range(), sum = summarize(list, r);
    const names = { hari: 'hari ini', minggu: 'minggu ini', bulan: 'bulan ini' };
    $('heroLabel').textContent = 'Saldo bersih ' + (names[S.period] || tglPendek(r.s) + ' sampai ' + tglPendek(r.e));
    $('heroSaldo').textContent = rp(sum.saldo);
    $('heroIn').textContent = rp(sum.masuk); $('heroOut').textContent = rp(sum.keluar);

    const ins = buildInsights(list, S.period, r, today());
    $('insightCard').hidden = !ins.length;
    $('insights').innerHTML = ins.map((i) => '<div class="insight"><div class="badge">' + I[i.icon] + '</div><div><b>' + esc(i.title) + '</b><span>' + esc(i.text) + '</span></div></div>').join('');

    const recent = sortTx(list).slice(0, 5);
    $('recent').innerHTML = firstLoad() ? skeleton(3)
      : recent.length ? recent.map((x) => txRow(x, true)).join('')
      : emptyBox(I.box, 'Belum ada transaksi', 'Tekan tombol + di bawah untuk mencatat yang pertama.');
  }

  /* ---------- Riwayat ---------- */
  function renderRiwayat() {
    const list = all(), f = S.hist;
    const cats = [];
    catStats(list).map((c) => c.name).concat(daftarKat('pengeluaran'), daftarKat('pemasukan'))
      .forEach((c) => { if (!cats.some((k) => samaKat(k, c))) cats.push(c); });
    cats.sort((a, b) => a.localeCompare(b, 'id'));
    $('hKat').innerHTML = '<option value="">Semua kategori</option>' + cats.map((c) => '<option' + (c === f.kat ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
    $('hJenis').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.jenis)));
    $('hFrom').value = f.from; $('hTo').value = f.to;
    const active = (f.jenis !== 'semua') + !!f.kat + !!f.from + !!f.to;
    $('hCount').hidden = !active; $('hCount').textContent = active;

    const rows = sortTx(filterTx(list, f));
    if (firstLoad()) { $('hList').innerHTML = skeleton(5); return; }
    if (!rows.length) {
      $('hList').innerHTML = list.length
        ? emptyBox(I.find, 'Tidak ada yang cocok', 'Coba kata lain atau longgarkan filter.')
        : emptyBox(I.box, 'Belum ada transaksi', 'Tekan tombol + di bawah untuk mencatat yang pertama.');
      return;
    }
    let html = '', lastDay = '';
    const dayNet = {};
    rows.forEach((x) => { dayNet[x.tanggal] = (dayNet[x.tanggal] || 0) + (x.jenis === 'pemasukan' ? x.nominal : -x.nominal); });
    rows.slice(0, f.limit).forEach((x) => {
      if (x.tanggal !== lastDay) {
        lastDay = x.tanggal;
        html += '<div class="day"><span>' + tglPanjang(x.tanggal) + '</span><span class="num">' + (dayNet[x.tanggal] > 0 ? '+' : '') + rp(dayNet[x.tanggal]) + '</span></div>';
      }
      html += txRow(x, false);
    });
    if (rows.length > f.limit) html += '<div style="margin-top:12px"><button class="btn ghost" id="hMore">Tampilkan lebih banyak (' + (rows.length - f.limit) + ' lagi)</button></div>';
    $('hList').innerHTML = html;
    const more = $('hMore'); if (more) more.onclick = () => { f.limit += 60; renderRiwayat(); };
  }
  let qTimer;
  $('hQ').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.hist.q = e.target.value; S.hist.limit = 60; renderRiwayat(); }, 150); };
  $('hFilterBtn').onclick = () => { const f = $('hFilters'); f.hidden = !f.hidden; $('hFilterBtn').setAttribute('aria-expanded', String(!f.hidden)); };
  $('hJenis').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.hist.jenis = b.dataset.v; renderRiwayat(); } };
  $('hKat').onchange = (e) => { S.hist.kat = e.target.value; renderRiwayat(); };
  $('hFrom').onchange = (e) => { S.hist.from = e.target.value; renderRiwayat(); };
  $('hTo').onchange = (e) => { S.hist.to = e.target.value; renderRiwayat(); };
  $('hReset').onclick = () => { Object.assign(S.hist, { jenis: 'semua', kat: '', from: '', to: '' }); renderRiwayat(); };

  /* ---------- Analisis ---------- */
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  /* Warna mengikuti kategori (urutan total sepanjang waktu), bukan peringkat di periode */
  function catColors(list, jenis) {
    const totals = {};
    list.forEach((x) => { if (x.jenis === jenis) totals[x.kategori] = (totals[x.kategori] || 0) + x.nominal; });
    const map = {};
    sortedCats(totals).forEach((c, i) => { map[c.name] = i < 8 ? cssVar('--s' + (i + 1)) : cssVar('--s0'); });
    return map;
  }
  function chart(key, canvasId, cfg) {
    const lama = S.charts[key], kanvas = $(canvasId);
    /* Grafik yang sudah ada diperbarui di tempat, supaya tidak berkedip saat sinkron selesai */
    if (lama && lama.canvas === kanvas && lama.config.type === cfg.type) {
      lama.data = cfg.data; lama.options = cfg.options; lama.update();
      return;
    }
    if (lama) lama.destroy();
    S.charts[key] = new window.Chart(kanvas, cfg);
  }
  function barOptions(tipTitle) {
    const grid = cssVar('--grid'), text2 = cssVar('--text2');
    return {
      maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { padding: 10, cornerRadius: 10, boxPadding: 4,
          callbacks: { title: tipTitle, label: (c) => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + rp(c.parsed.y) } },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: text2, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: text2, maxTicksLimit: 5, font: { size: 11 }, callback: (v) => rpShort(v) } },
      },
    };
  }
  function renderAnalisis() {
    const list = all(), r = range(), t = today(), sum = summarize(list, r);
    $('aRangeLabel').textContent = r.s === r.e ? tglPendek(r.s) : tglPendek(r.s) + ' sampai ' + tglPendek(r.e);
    const hasChart = typeof window.Chart !== 'undefined';
    $('chartOffline').hidden = hasChart;

    /* Donat: semua kategori bila ≤ 6; lebih dari itu 5 terbesar + Lainnya (rinciannya tetap di daftar) */
    const jn = S.donutJenis, masuk = jn === 'pemasukan';
    const catObj = {}; let total = 0;
    list.forEach((x) => { if (x.jenis === jn && x.tanggal >= r.s && x.tanggal <= r.e) { catObj[x.kategori] = (catObj[x.kategori] || 0) + x.nominal; total += x.nominal; } });
    const cats = sortedCats(catObj);
    $('aDonutJenis').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === jn)));
    $('donutTitle').textContent = (masuk ? 'Pemasukan' : 'Pengeluaran') + ' per kategori';
    $('cDonut').setAttribute('aria-label', 'Grafik donat ' + jn + ' per kategori');
    $('donutArea').hidden = !cats.length; $('donutEmpty').hidden = !!cats.length;
    if (!cats.length) $('donutEmpty').innerHTML = emptyBox(I.top, 'Belum ada ' + jn, 'Tidak ada ' + jn + ' pada periode ini.');
    const colors = catColors(list, jn);
    const nTop = cats.length <= 6 ? 6 : 5;
    const top = cats.slice(0, nTop).map((c) => ({ name: c.name, total: c.total, color: colors[c.name] }));
    const sisa = cats.slice(nTop);
    if (sisa.length) top.push({ name: 'Lainnya (' + sisa.length + ' kategori)', total: sisa.reduce((a, c) => a + c.total, 0), color: cssVar('--s0'), sisa: sisa });
    const pct = (v) => Math.round(v / total * 100) + '%';
    const baris = (c, sub) => '<div class="li' + (sub ? ' sub' : '') + '"><i class="sw" style="background:' + (sub ? 'transparent' : c.color) + '"></i><span class="nm">' + esc(c.name) +
      '</span><span class="pc num">' + pct(c.total) + '</span><span class="am num">' + rp(c.total) + '</span></div>';
    $('donutLegend').innerHTML = top.map((c) => baris(c) + (c.sisa ? c.sisa.map((x) => baris(x, true)).join('') : '')).join('');
    /* Tengah donat menampilkan total, atau irisan yang sedang disentuh (pengganti tooltip yang menutupi teks) */
    const tengah = (c) => { $('donutLabel').textContent = c ? c.name : (masuk ? 'Total masuk' : 'Total keluar'); $('donutTotal').textContent = c ? rp(c.total) + ' · ' + pct(c.total) : rp(total); };
    tengah(); S.donutReset = () => tengah();

    /* Tabel pemasukan vs pengeluaran selalu tersedia, juga saat grafik gagal dimuat */
    const months = monthlyTotals(list, t, 6);
    $('vsTable').innerHTML = '<tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th></tr>' +
      months.map((m) => '<tr><td>' + m.label + ' ' + m.year + '</td><td class="num">' + rp(m.masuk) + '</td><td class="num">' + rp(m.keluar) + '</td></tr>').join('');

    $('aTrend').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.trend)));
    const daily = dailyTotals(list, S.period, r, t);
    $('trendNote').textContent = S.trend === 'harian' ? (daily.note || 'Per hari pada periode yang dipilih') : '6 bulan terakhir';
    if (!hasChart) return;

    window.Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
    const surface = cssVar('--chart-surface'), cIn = cssVar('--c-in'), cOut = cssVar('--c-out');

    if (cats.length) chart('donut', 'cDonut', {
      type: 'doughnut',
      data: { labels: top.map((c) => c.name), datasets: [{ data: top.map((c) => c.total), backgroundColor: top.map((c) => c.color), borderColor: surface, borderWidth: 2, hoverOffset: 4 }] },
      options: { maintainAspectRatio: false, cutout: '70%', animation: { duration: 400 },
        onHover: (e, el) => tengah(el.length ? top[el[0].index] : null),
        plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    });

    const bar = { backgroundColor: cOut, borderRadius: 4, maxBarThickness: 22, categoryPercentage: 0.72, barPercentage: 0.9 };
    if (S.trend === 'harian') {
      const few = daily.days.length <= 7;
      chart('trend', 'cTrend', {
        type: 'bar',
        data: { labels: daily.days.map((d) => few ? HARI[toDate(d.date).getDay()].slice(0, 3) : String(toDate(d.date).getDate())),
          datasets: [Object.assign({ label: 'Pengeluaran', data: daily.days.map((d) => d.total) }, bar)] },
        options: barOptions((items) => tglPanjang(daily.days[items[0].dataIndex].date)),
      });
    } else {
      chart('trend', 'cTrend', {
        type: 'bar',
        data: { labels: months.map((m) => m.label), datasets: [Object.assign({ label: 'Pengeluaran', data: months.map((m) => m.keluar) }, bar)] },
        options: barOptions((items) => months[items[0].dataIndex].label + ' ' + months[items[0].dataIndex].year),
      });
    }
    chart('vs', 'cVs', {
      type: 'bar',
      data: { labels: months.map((m) => m.label), datasets: [
        { label: 'Pemasukan', data: months.map((m) => m.masuk), backgroundColor: cIn, borderRadius: 4, maxBarThickness: 16, categoryPercentage: 0.7, barPercentage: 0.86 },
        { label: 'Pengeluaran', data: months.map((m) => m.keluar), backgroundColor: cOut, borderRadius: 4, maxBarThickness: 16, categoryPercentage: 0.7, barPercentage: 0.86 },
      ] },
      options: barOptions((items) => months[items[0].dataIndex].label + ' ' + months[items[0].dataIndex].year),
    });
  }
  $('aDonutJenis').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.donutJenis = b.dataset.v; renderAnalisis(); } };
  $('aTrend').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.trend = b.dataset.v; renderAnalisis(); } };

  /* ---------- Atur ---------- */
  const IK = {
    ubah: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    hapus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  };
  function renderKatAdmin() {
    const jenis = S.katJenis, list = daftarKat(jenis), n = jumlahPakai(jenis);
    $('kJenis').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === jenis)));
    $('kList').innerHTML = list.length ? list.map((k, i) => {
      const c = n[k.toLowerCase()] || 0;
      return '<div class="krow"><button class="kname" data-k-ubah="' + i + '">' + esc(k) + '<small>' + (c ? c + ' transaksi' : 'Belum dipakai') + '</small></button>' +
        '<button class="kbtn" data-k-ubah="' + i + '" aria-label="Ganti nama ' + esc(k) + '">' + IK.ubah + '</button>' +
        '<button class="kbtn del" data-k-hapus="' + i + '" aria-label="Hapus ' + esc(k) + '">' + IK.hapus + '</button></div>';
    }).join('') : '<div class="kempty">Belum ada kategori ' + jenis + '. Tambahkan di atas, atau langsung saat mencatat transaksi.</div>';
  }
  $('kJenis').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.katJenis = b.dataset.v; $('kErr').textContent = ''; renderKatAdmin(); } };
  $('kNama').oninput = () => { $('kErr').textContent = ''; };
  $('kAdd').onsubmit = async (e) => {
    e.preventDefault();
    if (S.katSibuk) return;
    const jenis = S.katJenis, nama = $('kNama').value.replace(/\s+/g, ' ').trim();
    if (!nama) { $('kErr').textContent = 'Tulis nama kategorinya.'; $('kNama').focus(); return; }
    const ada = daftarKat(jenis).find((k) => samaKat(k, nama));
    if (ada) { $('kErr').textContent = 'Kategori "' + ada + '" sudah ada.'; return; }
    S.katSibuk = true; const btn = $('kAddBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      S.kat = await api('tambahKategori', { jenis, nama }); mut++; persist();
      $('kNama').value = ''; renderKatAdmin(); toast('Kategori "' + nama + '" ditambahkan', 'ok');
    } catch (err) {
      if (err.auth) { showGate(err.message); } else $('kErr').textContent = err.message;
    }
    S.katSibuk = false; btn.disabled = false; btn.textContent = 'Tambah';
  };
  $('kList').onclick = async (e) => {
    const bU = e.target.closest('[data-k-ubah]'), bH = e.target.closest('[data-k-hapus]');
    if ((!bU && !bH) || S.katSibuk) return;
    const jenis = S.katJenis, nama = daftarKat(jenis)[Number((bU || bH).dataset[bU ? 'kUbah' : 'kHapus'])];
    if (!nama) return;
    const c = jumlahPakai(jenis)[nama.toLowerCase()] || 0;
    if (bU) {
      const baru = await confirmBox('Ganti nama kategori',
        (c ? c + ' transaksi lama ikut diganti di spreadsheet. ' : '') + 'Jika nama baru sudah ada, keduanya digabung.', 'Simpan', { input: nama, danger: false });
      if (!baru || baru === nama) return;
      S.katSibuk = true;
      try {
        const r = await api('ubahKategori', { jenis, lama: nama, baru });
        S.kat = r.kategori;
        const final = daftarKat(jenis).find((k) => samaKat(k, baru)) || baru;
        S.tx.concat(S.pending).forEach((x) => { if (x.jenis === jenis && samaKat(x.kategori, nama)) x.kategori = final; });
        mut++; persist(); render();
        toast('Kategori diganti' + (r.diubah ? ', ' + r.diubah + ' transaksi diperbarui' : ''), 'ok');
      } catch (err) {
        if (err.auth) showGate(err.message); else toast('Gagal mengganti. ' + err.message, 'warn');
      }
      S.katSibuk = false;
    } else {
      const ok = await confirmBox('Hapus kategori "' + nama + '"?',
        'Kategori hilang dari pilihan.' + (c ? ' ' + c + ' transaksi lama tetap tercatat sebagai "' + nama + '".' : ''), 'Hapus');
      if (!ok) return;
      S.katSibuk = true;
      try {
        S.kat = await api('hapusKategori', { jenis, nama }); mut++; persist(); render();
        toast('Kategori dihapus', 'ok');
      } catch (err) {
        if (err.auth) showGate(err.message); else toast('Gagal menghapus. ' + err.message, 'warn');
      }
      S.katSibuk = false;
    }
  };

  const VERSI_APP = '1.6.1';
  function renderAtur() {
    $('sVersi').textContent = 'Versi aplikasi ' + VERSI_APP + ', pembaca struk ' + (window.Struk ? window.Struk.VERSI || 1 : '-') + '.';
    renderKatAdmin();
    muatPengingat();
    const when = S.lastSync ? new Date(S.lastSync).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'belum pernah';
    $('sInfo').textContent = S.tx.length + ' transaksi tersimpan di spreadsheet. Terakhir sinkron: ' + when + '.' +
      (S.pending.length ? ' ' + S.pending.length + ' transaksi menunggu dikirim.' : '');
  }

  /* ---------- Pengingat mencatat (disimpan di Apps Script, notifikasi lewat Google Calendar) ---------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  $('pJam').innerHTML = Array.from({ length: 23 }, (_, i) => '<option value="' + (i + 1) + '">' + pad2(i + 1) + '</option>').join('');
  $('pMenit').innerHTML = [0, 15, 30, 45].map((m) => '<option value="' + m + '">' + pad2(m) + '</option>').join('');
  let pengingatDimuat = false;
  function isiPengingat(p) {
    $('pAktif').checked = !!p.aktif; $('pJam').value = String(p.jam); $('pMenit').value = String(p.menit);
    $('pKosong').checked = p.hanyaJikaKosong !== false;
    infoPengingat(p);
  }
  function infoPengingat(p) {
    $('pInfo').textContent = !p ? '' : p.aktif
      ? 'Aktif: setiap hari pukul ' + pad2(p.jam) + '.' + pad2(p.menit) + (p.hanyaJikaKosong !== false ? ', kecuali hari itu sudah ada catatan.' : '.')
      : 'Pengingat mati.';
  }
  function kunciPengingat(sibuk) {
    ['pAktif', 'pJam', 'pMenit', 'pKosong', 'pSimpan', 'pUji'].forEach((id) => { $(id).disabled = sibuk; });
    $('pJamRow').setAttribute('aria-disabled', String(sibuk || !$('pAktif').checked));
  }
  function galatPengingat(err) {
    if (err.auth) { showGate(err.message); return; }
    $('pErr').textContent = err.offline ? 'Butuh internet untuk mengatur pengingat.' : err.message;
  }
  async function muatPengingat() {
    if (pengingatDimuat || !S.cfg) return;
    $('pErr').textContent = ''; $('pInfo').textContent = 'Memuat pengaturan…'; kunciPengingat(true);
    try { isiPengingat(await api('pengingat')); pengingatDimuat = true; }
    catch (err) { $('pInfo').textContent = ''; galatPengingat(err); }
    kunciPengingat(false);
  }
  const urlAplikasi = () => location.origin + location.pathname.replace(/index\.html$/, '');
  $('pAktif').onchange = () => kunciPengingat(false);
  $('pSimpan').onclick = async () => {
    $('pErr').textContent = ''; kunciPengingat(true);
    const btn = $('pSimpan'); btn.innerHTML = '<span class="spin"></span>Menyimpan';
    try {
      const p = await api('aturPengingat', { aktif: $('pAktif').checked, jam: Number($('pJam').value),
        menit: Number($('pMenit').value), hanyaJikaKosong: $('pKosong').checked, url: urlAplikasi() });
      isiPengingat(p); pengingatDimuat = true;
      toast(p.aktif ? 'Pengingat disimpan' : 'Pengingat dimatikan', 'ok');
    } catch (err) { galatPengingat(err); }
    btn.textContent = 'Simpan pengingat'; kunciPengingat(false);
  };
  $('pUji').onclick = async () => {
    $('pErr').textContent = ''; kunciPengingat(true);
    const btn = $('pUji'); btn.innerHTML = '<span class="spin"></span>Membuat';
    try {
      const r = await api('ujiPengingat', { url: urlAplikasi() });
      toast('Acara uji dibuat untuk pukul ' + r.pukul + '. Notifikasi Kalender seharusnya muncul di HP saat itu.', 'ok');
    } catch (err) { galatPengingat(err); }
    btn.textContent = 'Coba notifikasi'; kunciPengingat(false);
  };

  /* Sentuh di luar donat: tengahnya kembali ke total */
  document.addEventListener('pointerdown', (e) => { if (e.target.id !== 'cDonut' && S.donutReset) S.donutReset(); });
  $('cDonut').addEventListener('mouseleave', () => S.donutReset && S.donutReset());

  function render() {
    if ($('app').hidden) return;
    renderPeriod(); setSync(S.syncState);
    if (S.view === 'beranda') renderBeranda();
    else if (S.view === 'riwayat') renderRiwayat();
    else if (S.view === 'analisis') renderAnalisis();
    else renderAtur();
  }

  /* ---------- Form tambah / ubah ---------- */
  function setJenis(j) {
    if (S.formJenis !== j && S.formKat && !daftarKat(j).some((k) => samaKat(k, S.formKat)) &&
      !S.formKatBaru.some((k) => samaKat(k, S.formKat))) S.formKat = '';
    S.formJenis = j;
    $('fJenis').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === j)));
    renderSug();
  }
  function renderSug() {
    const names = urutKat(S.formJenis);
    [S.formKat].concat(S.formKatBaru).forEach((k) => { if (k && !names.some((n) => samaKat(n, k))) names.unshift(k); });
    $('fSug').innerHTML = names.map((c) => '<button type="button" class="chip' + (S.formKat && samaKat(c, S.formKat) ? ' on' : '') +
      '" data-cat="' + esc(c) + '" aria-pressed="' + !!(S.formKat && samaKat(c, S.formKat)) + '">' + esc(c) + '</button>').join('') +
      '<button type="button" class="chip add" data-new="1">+ Kategori baru</button>' +
      (names.length ? '' : '<div class="hint" style="width:100%">Belum ada kategori ' + S.formJenis + '. Buat yang pertama.</div>');
  }
  function pilihKat(nama) {
    S.formKat = nama; $('fErrKategori').textContent = '';
    $('fNewCat').hidden = true; $('fKategoriBaru').value = '';
    renderSug();
  }
  function pakaiKatBaru() {
    const v = $('fKategoriBaru').value.replace(/\s+/g, ' ').trim();
    if (!v) { $('fErrKategori').textContent = 'Tulis nama kategorinya.'; $('fKategoriBaru').focus(); return; }
    const nama = bakuKat(S.formJenis, v);
    if (!daftarKat(S.formJenis).some((k) => samaKat(k, nama)) && !S.formKatBaru.some((k) => samaKat(k, nama))) S.formKatBaru.push(nama);
    disentuh.add('kategori'); pilihKat(nama);
    $('fKategoriBaru').blur();
  }
  function setDate(d) {
    $('fTanggal').value = d;
    $('fToday').classList.toggle('on', d === today());
    $('fYest').classList.toggle('on', d === addDays(today(), -1));
  }
  function clearErrors() {
    $('fErrNominal').textContent = ''; $('fErrKategori').textContent = ''; $('fAmtBox').classList.remove('bad');
  }
  /* Kolom yang sudah disentuh pengguna tidak ditimpa hasil baca struk */
  const disentuh = new Set();
  let strukUrl = '', strukToken = 0;
  let teksTerbaca = '';
  function resetStruk() {
    teksTerbaca = ''; $('fStrukTeksBtn').hidden = true;
    strukToken++;
    if (strukUrl) { URL.revokeObjectURL(strukUrl); strukUrl = ''; }
    $('fStrukInfo').hidden = true; $('fStrukInfo').classList.remove('warn');
    $('viewer').hidden = true;
  }
  function statusStruk(judul, teks, progres, warn) {
    $('fStrukInfo').hidden = false;
    $('fStrukInfo').classList.toggle('warn', !!warn);
    $('fStrukTitle').textContent = judul; $('fStrukText').textContent = teks;
    $('fStrukBarBox').hidden = progres == null;
    if (progres != null) $('fStrukBar').style.width = Math.max(4, Math.round(progres * 100)) + '%';
  }
  function kilau(id) { const el = $(id); el.classList.remove('filled'); void el.offsetWidth; el.classList.add('filled'); }

  let formTerbuka = false; /* cegah ketuk ganda pada Simpan membuat dua transaksi */
  function openForm(x, tanpaFokus) {
    S.editing = x; formTerbuka = true;
    disentuh.clear(); resetStruk();
    $('fStrukBtn').hidden = !!x;
    $('fTitle').textContent = x ? 'Ubah transaksi' : 'Tambah transaksi';
    $('fNominal').value = x ? Number(x.nominal).toLocaleString('id-ID') : '';
    S.formKat = x ? x.kategori : ''; S.formKatBaru = [];
    $('fNewCat').hidden = true; $('fKategoriBaru').value = '';
    $('fCatatan').value = x ? (x.catatan || '') : '';
    $('fDelete').hidden = !x;
    $('fSave').disabled = false; $('fSave').textContent = x ? 'Simpan perubahan' : 'Simpan';
    clearErrors(); setDate(x ? x.tanggal : today()); setJenis(x ? x.jenis : 'pengeluaran');
    $('scrim').classList.add('show'); $('sheet').classList.add('show');
    $('sheet').scrollTop = 0;
    if (!x && !tanpaFokus) { void $('sheet').offsetHeight; $('fNominal').focus(); }
  }
  function closeForm() {
    formTerbuka = false;
    resetStruk();
    $('scrim').classList.remove('show'); $('sheet').classList.remove('show');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    S.editing = null;
  }
  function openTx(id) {
    const x = all().find((t) => t.id === id); if (!x) return;
    openForm(x);
  }
  $('fClose').onclick = closeForm; $('scrim').onclick = closeForm;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (dialogDone) closeDialog(false); else closeForm(); } });
  $('fJenis').onclick = (e) => { const b = e.target.closest('button'); if (b) { disentuh.add('jenis'); setJenis(b.dataset.v); } };
  $('fNominal').oninput = (e) => {
    disentuh.add('nominal');
    const d = digits(e.target.value);
    e.target.value = d ? Number(d).toLocaleString('id-ID') : '';
    clearErrors();
  };
  $('fNominal').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('fNominal').blur(); } };
  $('fKategoriBaru').oninput = () => { $('fErrKategori').textContent = ''; };
  $('fKategoriBaru').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); pakaiKatBaru(); } };
  $('fNewCatAdd').onclick = pakaiKatBaru;
  $('fKelola').onclick = () => { S.katJenis = S.formJenis; closeForm(); go('atur'); };
  $('fCatatan').oninput = () => disentuh.add('catatan');
  $('fSug').onclick = (e) => {
    if (e.target.closest('[data-new]')) {
      $('fNewCat').hidden = false; $('fErrKategori').textContent = ''; $('fKategoriBaru').focus();
      return;
    }
    const b = e.target.closest('[data-cat]'); if (!b) return;
    disentuh.add('kategori'); pilihKat(b.dataset.cat);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  };
  $('fToday').onclick = () => { disentuh.add('tanggal'); setDate(today()); };
  $('fYest').onclick = () => { disentuh.add('tanggal'); setDate(addDays(today(), -1)); };
  $('fTanggal').onchange = (e) => { disentuh.add('tanggal'); setDate(e.target.value || today()); };

  /* ---------- Isi otomatis dari bukti transaksi ---------- */
  let antrianStruk = null;
  async function isiDariStruk(file, teksKiriman) {
    if (!S.cfg || $('app').hidden) { antrianStruk = { file: file, teks: teksKiriman }; return; }
    if (!$('sheet').classList.contains('show') || S.editing) openForm(null, true);
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    resetStruk();
    const token = strukToken;
    $('fStrukBtn').hidden = true;
    $('fThumb').hidden = !file;
    if (file) { strukUrl = URL.createObjectURL(file); $('fThumbImg').src = strukUrl; }
    statusStruk('Membaca bukti transaksi', 'Biasanya beberapa detik. Pertama kali sedikit lebih lama.', file ? 0 : null);

    let teks = teksKiriman || '';
    if (file) {
      try {
        teks = (await window.Struk.bacaGambar(file, (p) => { if (token === strukToken) $('fStrukBar').style.width = Math.max(4, Math.round(p * 100)) + '%'; })) + '\n' + teks;
      } catch (err) {
        if (token !== strukToken) return;
        statusStruk('Bukti transaksi belum terbaca', (err.message || 'Terjadi kesalahan.') + ' Isi manual sambil melihat gambarnya.', null, true);
        return;
      }
    }
    if (token !== strukToken) return; // form sudah ditutup / struk lain dibuka
    teksTerbaca = teks.trim();

    const d = window.Struk.uraiStruk(teks, today());
    if (!disentuh.has('jenis')) setJenis(d.jenis);
    if (d.nominal && !disentuh.has('nominal')) { $('fNominal').value = d.nominal.toLocaleString('id-ID'); clearErrors(); kilau('fAmtBox'); }
    if (d.tanggal && !disentuh.has('tanggal')) { setDate(d.tanggal); kilau('fTanggal'); }
    if (d.catatan && !disentuh.has('catatan')) { $('fCatatan').value = d.catatan; kilau('fCatatan'); }
    const tebak = window.Struk.tebakKategori(S.tx, S.formJenis, d.pihak);
    const kat = tebak ? daftarKat(S.formJenis).find((k) => samaKat(k, tebak)) || '' : '';
    if (kat && !disentuh.has('kategori') && !S.formKat) { pilihKat(kat); kilau('fSug'); }
    renderSug();

    const kembar = d.nominal ? window.Struk.cariKembar(all(), { jenis: S.formJenis, tanggal: $('fTanggal').value, nominal: d.nominal, pihak: d.pihak }) : null;
    const kurang = [];
    if (!d.nominal) kurang.push('Nominal');
    if (!d.tanggal) kurang.push('tanggal');
    if (kembar) {
      statusStruk('Mungkin sudah tercatat', kembar.kategori + ' ' + rp(kembar.nominal) + ' pada ' + tglPendek(kembar.tanggal) + ' sudah ada. Simpan hanya jika ini transaksi lain.', null, true);
    } else if (kurang.length) {
      $('fStrukTeksBtn').hidden = !teksTerbaca;
      statusStruk(kurang.join(' dan ') + ' belum terbaca', (d.tanggal ? '' : 'Tanggal diisi hari ini. ') + 'Ketuk gambar untuk melihat buktinya.', null, true);
    } else {
      statusStruk('Terisi dari bukti transaksi', kat ? 'Kategori "' + kat + '" seperti transaksi sebelumnya. Periksa lalu simpan.' : 'Tinggal pilih kategori, lalu simpan.', null, false);
    }
    if (!d.nominal) $('fNominal').focus();
  }
  $('fStrukBtn').onclick = () => {
    if (window.Struk) window.Struk.siapkanPekerja().catch(() => {}); // panaskan pembaca selagi memilih gambar
    $('fStrukFile').click();
  };
  $('fStrukFile').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) isiDariStruk(f, '');
  };
  $('fThumb').onclick = () => { if (strukUrl) { $('viewerTeks').hidden = true; $('viewerImg').hidden = false; $('viewerImg').src = strukUrl; $('viewer').hidden = false; } };
  $('fStrukTeksBtn').onclick = () => { $('viewerImg').hidden = true; $('viewerTeks').hidden = false; $('viewerTeks').textContent = teksTerbaca || '(tidak ada teks)'; $('viewer').hidden = false; };
  $('viewer').onclick = () => { $('viewer').hidden = true; };

  /* Kiriman dari menu "Bagikan" di aplikasi bank (lewat sw.js) */
  async function ambilKiriman() {
    const q = location.search;
    if (!/[?&]share=/.test(q)) return null;
    history.replaceState(null, '', location.pathname);
    if (/share=gagal/.test(q)) { toast('Bukti transaksi tidak bisa diterima. Coba bagikan sekali lagi.', 'warn'); return null; }
    try {
      const c = await caches.open('catat-uang-kiriman');
      const rf = await c.match('kiriman-file'), rt = await c.match('kiriman-teks');
      const out = { file: rf ? await rf.blob() : null, teks: rt ? await rt.text() : '' };
      await c.delete('kiriman-file'); await c.delete('kiriman-teks');
      return out.file || out.teks.trim() ? out : null;
    } catch (e) { return null; }
  }

  $('form').onsubmit = async (e) => {
    e.preventDefault();
    if (!formTerbuka) return;
    clearErrors();
    const nominal = Number(digits($('fNominal').value) || 0);
    const ketik = $('fNewCat').hidden ? '' : $('fKategoriBaru').value.replace(/\s+/g, ' ').trim();
    const kategoriRaw = ketik || S.formKat;
    const tanggal = $('fTanggal').value || today();
    let bad = false;
    if (!(nominal > 0)) { $('fErrNominal').textContent = 'Isi nominal lebih dari 0.'; $('fAmtBox').classList.add('bad'); $('fNominal').focus(); bad = true; }
    if (!kategoriRaw) { $('fErrKategori').textContent = 'Pilih kategori, atau buat yang baru.'; bad = true; }
    if (bad) return;
    const item = { jenis: S.formJenis, tanggal: tanggal, nominal: nominal,
      kategori: bakuKat(S.formJenis, kategoriRaw), catatan: $('fCatatan').value.trim() };
    tambahKatLokal(item.jenis, item.kategori);

    if (S.editing && S.editing.pending) {
      /* Belum terkirim: ubah salinan di HP saja. Bila sedang dikirim, tunggu dulu. */
      if (flushing) await flushing.catch(() => {});
      const i = S.pending.findIndex((p) => p.id === S.editing.id);
      if (i !== -1) {
        S.pending[i] = Object.assign({ id: S.editing.id }, item); mut++; persist();
        closeForm(); render(); toast('Perubahan tersimpan. Akan dikirim saat online.', 'ok');
        if (navigator.onLine) sync(true);
        return;
      }
      /* sudah terkirim sementara itu: lanjut ubah di spreadsheet */
    }
    if (S.editing) {
      const old = S.editing, btn = $('fSave');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Menyimpan';
      try {
        const saved = await api('update', Object.assign({ id: old.id, jenisAsal: old.jenis }, item));
        const i = S.tx.findIndex((t) => t.id === old.id);
        if (i !== -1) S.tx[i] = saved; mut++; persist();
        closeForm(); render(); toast('Perubahan tersimpan', 'ok');
      } catch (err) {
        if (err.auth) { showGate(err.message); return; }
        btn.disabled = false; btn.textContent = 'Simpan perubahan';
        toast('Gagal menyimpan. ' + err.message, 'warn');
      }
      return;
    }

    /* Transaksi baru: langsung tampil, pengiriman berjalan di belakang */
    item.id = newId();
    S.pending.push(item); persist();
    closeForm(); render();
    try {
      await flush();
      setSync('ok'); render(); toast('Tersimpan ke spreadsheet', 'ok');
    } catch (err) {
      if (err.auth) { showGate(err.message); return; }
      setSync('err'); render();
      toast(err.offline ? 'Belum terkirim. Tersimpan di HP dan akan dikirim otomatis saat online.' : 'Gagal menyimpan. ' + err.message, 'warn');
    }
  };

  $('fDelete').onclick = async () => {
    const x = S.editing; if (!x) return;
    if (x.pending) {
      if (!(await confirmBox('Hapus transaksi ini?', x.kategori + ' ' + rp(x.nominal) + ' belum terkirim dan akan dihapus dari HP ini.', 'Hapus'))) return;
      if (flushing) await flushing.catch(() => {});
      if (S.pending.some((p) => p.id === x.id)) {
        S.pending = S.pending.filter((p) => p.id !== x.id); mut++; persist();
        closeForm(); render(); toast('Transaksi dihapus', 'ok');
        return;
      }
      /* sudah terkirim sementara itu: hapus juga dari spreadsheet */
      try {
        await api('delete', { id: x.id, jenis: x.jenis });
        S.tx = S.tx.filter((t) => t.id !== x.id); mut++; persist();
        closeForm(); render(); toast('Transaksi dihapus', 'ok');
      } catch (err) {
        if (err.auth) { showGate(err.message); return; }
        toast('Gagal menghapus. ' + err.message, 'warn');
      }
      return;
    }
    if (!(await confirmBox('Hapus transaksi ini?', x.kategori + ' ' + rp(x.nominal) + ' pada ' + tglPendek(x.tanggal) + ' akan dihapus dari spreadsheet.', 'Hapus'))) return;
    const btn = $('fDelete'); btn.disabled = true; btn.textContent = 'Menghapus…';
    try {
      await api('delete', { id: x.id, jenis: x.jenis });
      S.tx = S.tx.filter((t) => t.id !== x.id); mut++; persist();
      closeForm(); render(); toast('Transaksi dihapus', 'ok');
    } catch (err) {
      if (err.auth) { showGate(err.message); return; }
      toast('Gagal menghapus. ' + err.message, 'warn');
    }
    btn.disabled = false; btn.textContent = 'Hapus transaksi ini';
  };

  /* ---------- Mulai ---------- */
  applyTheme();
  if (S.cfg) { showApp(); go('beranda'); sync(true); } else showGate('');
  ambilKiriman().then((k) => {
    if (!k) return;
    if (!S.cfg) $('gErr').textContent = 'Hubungkan dulu, lalu bukti transaksi yang kamu bagikan akan langsung dibaca.';
    isiDariStruk(k.file, k.teks);
  });
  window.addEventListener('online', () => sync(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.cfg && Date.now() - S.lastSync > 60000) sync(true);
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* aplikasi tetap jalan tanpa mode offline */ });
  }
})();
