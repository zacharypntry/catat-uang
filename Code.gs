/**
 * CATAT UANG — penghubung aplikasi ke Google Sheets
 * File: Code.gs (tempel di Ekstensi > Apps Script pada spreadsheet-mu)
 *
 * WAJIB: ganti KATA_SANDI di bawah dengan kata sandi buatanmu sendiri
 * (minimal 8 karakter). Kata sandi ini yang nanti kamu ketik di aplikasi.
 */
const KATA_SANDI = 'GANTI-KATA-SANDI-INI';

const NAMA_SHEET = { pemasukan: 'Pemasukan', pengeluaran: 'Pengeluaran' };
const SHEET_KATEGORI = 'Kategori';
const LABEL_JENIS = { pemasukan: 'Pemasukan', pengeluaran: 'Pengeluaran' };
const HEADER = ['Tanggal', 'Kategori', 'Nominal', 'Catatan', 'ID'];
// Nama kolom lain yang juga dikenali (kalau suatu saat header diganti)
const ALIAS = {
  tanggal: ['tanggal', 'tgl', 'date'],
  kategori: ['kategori', 'category'],
  nominal: ['nominal', 'jumlah', 'amount'],
  catatan: ['catatan', 'keterangan', 'note', 'notes'],
  id: ['id'],
};
const MAKS_GAGAL = 8;        // percobaan kata sandi salah sebelum dikunci
const KUNCI_DETIK = 600;     // lama kunci: 10 menit

/* ---------- Jalankan sekali dari editor untuk menyiapkan sheet ---------- */
function siapkanSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Jakarta');
  ambilSheet_('pemasukan');
  ambilSheet_('pengeluaran');
  sheetKategori_();
  Logger.log('Sheet "Pemasukan", "Pengeluaran", dan "Kategori" siap dipakai.');
}

/* ---------- Pintu masuk web ---------- */
function doGet() {
  return keluaran_({ ok: true, pesan: 'API Catat Uang aktif.' });
}

function doPost(e) {
  try {
    let req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (err) {
      return keluaran_({ ok: false, pesan: 'Permintaan tidak valid.' });
    }

    const cekSandi = periksaSandi_(req.token);
    if (cekSandi) return keluaran_({ ok: false, kode: 'AUTH', pesan: cekSandi });

    switch (req.action) {
      case 'list':   return keluaran_({ ok: true, data: daftar_() });
      case 'muat':   return keluaran_({ ok: true, data: { transaksi: daftar_(), kategori: tulis_(bacaKategori_, req) } });
      case 'tambahKategori': return keluaran_({ ok: true, data: tulis_(tambahKategori_, req) });
      case 'ubahKategori':   return keluaran_({ ok: true, data: tulis_(ubahKategori_, req) });
      case 'hapusKategori':  return keluaran_({ ok: true, data: tulis_(hapusKategori_, req) });
      case 'add':    return keluaran_({ ok: true, data: tulis_(tambah_, req) });
      case 'update': return keluaran_({ ok: true, data: tulis_(ubah_, req) });
      case 'delete': return keluaran_({ ok: true, data: tulis_(hapus_, req) });
      case 'pengingat':      return keluaran_({ ok: true, data: bacaPengingat_() });
      case 'aturPengingat':  return keluaran_({ ok: true, data: tulis_(aturPengingat_, req) });
      case 'ujiPengingat':   return keluaran_({ ok: true, data: ujiPengingat_(req) });
      default:       return keluaran_({ ok: false, pesan: 'Aksi tidak dikenal.' });
    }
  } catch (err) {
    return keluaran_({ ok: false, pesan: String(err && err.message ? err.message : err) });
  }
}

/* ---------- Keamanan ---------- */
function periksaSandi_(token) {
  if (KATA_SANDI === 'GANTI-KATA-SANDI-INI' || KATA_SANDI.length < 8) {
    return 'Kata sandi di Code.gs belum diganti (minimal 8 karakter).';
  }
  const cache = CacheService.getScriptCache();
  const gagal = Number(cache.get('gagal') || 0);
  if (gagal >= MAKS_GAGAL) return 'Terlalu banyak percobaan salah. Coba lagi dalam 10 menit.';
  if (String(token || '') !== KATA_SANDI) {
    cache.put('gagal', String(gagal + 1), KUNCI_DETIK);
    return 'Kata sandi salah.';
  }
  if (gagal) cache.remove('gagal'); // berhasil masuk: hitungan salah dimulai dari nol lagi
  return '';
}

/* ---------- Bantuan umum ---------- */
function keluaran_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function tulis_(fn, req) {
  const kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    return fn(req);
  } finally {
    kunci.releaseLock();
  }
}

function zona_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function buatId_() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Ambil sheet; buat + beri header bila belum ada / masih kosong. */
function ambilSheet_(jenis) {
  const nama = NAMA_SHEET[jenis];
  if (!nama) throw new Error('Jenis transaksi tidak dikenal.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nama);
  if (!sh) sh = ss.insertSheet(nama);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Petakan nama kolom -> nomor kolom (1-based) berdasarkan baris header. */
function kolom_(sh) {
  const lebar = Math.max(sh.getLastColumn(), 1);
  const header = sh.getRange(1, 1, 1, lebar).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  const peta = {};
  Object.keys(ALIAS).forEach(function (k) {
    for (let i = 0; i < header.length; i++) {
      if (ALIAS[k].indexOf(header[i]) !== -1) { peta[k] = i + 1; break; }
    }
  });
  ['tanggal', 'kategori', 'nominal'].forEach(function (k) {
    if (!peta[k]) throw new Error('Kolom "' + k + '" tidak ditemukan di sheet ' + sh.getName() + '.');
  });
  // Kolom Catatan / ID ditambahkan di ujung kanan bila belum ada (data lama tidak disentuh)
  ['catatan', 'id'].forEach(function (k) {
    if (!peta[k]) {
      const baru = sh.getLastColumn() + 1;
      sh.getRange(1, baru).setValue(k === 'id' ? 'ID' : 'Catatan').setFontWeight('bold');
      peta[k] = baru;
    }
  });
  return peta;
}

function bacaTanggal_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function bacaNominal_(v) {
  if (typeof v === 'number') return Math.round(v);
  // Teks seperti "Rp 50.000,00": buang sen di ujung dulu, supaya tidak terbaca 5.000.000
  const angka = String(v || '').trim().replace(/[.,]\d{1,2}$/, '').replace(/[^\d]/g, '');
  return angka ? Number(angka) : 0;
}

/** Teks yang diawali = + - @ disimpan sebagai teks biasa, bukan rumus. */
function teksAman_(s) {
  s = String(s == null ? '' : s).trim().slice(0, 300);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function validasi_(req) {
  const tanggal = String(req.tanggal || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error('Tanggal tidak valid.');
  const nominal = Number(req.nominal);
  if (!isFinite(nominal) || nominal <= 0) throw new Error('Nominal harus lebih dari 0.');
  const kategori = String(req.kategori || '').trim().slice(0, 60);
  if (!kategori) throw new Error('Kategori wajib diisi.');
  if (!NAMA_SHEET[req.jenis]) throw new Error('Jenis transaksi tidak dikenal.');
  return {
    jenis: req.jenis,
    tanggal: tanggal,
    nominal: Math.round(nominal),
    kategori: kategori,
    catatan: String(req.catatan || '').trim().slice(0, 300),
  };
}

/** Cari nomor baris berdasarkan ID. 0 bila tidak ada. */
function cariBaris_(sh, kol, id) {
  const akhir = sh.getLastRow();
  if (akhir < 2 || !id) return 0;
  const ids = sh.getRange(2, kol.id, akhir - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function isiBaris_(sh, kol, baris, d, id) {
  const tgl = Utilities.parseDate(d.tanggal + ' 00:00', zona_(), 'yyyy-MM-dd HH:mm');
  sh.getRange(baris, kol.tanggal).setValue(tgl).setNumberFormat('dd/MM/yyyy');
  sh.getRange(baris, kol.kategori).setValue(teksAman_(d.kategori));
  sh.getRange(baris, kol.nominal).setValue(d.nominal).setNumberFormat('#,##0');
  sh.getRange(baris, kol.catatan).setValue(teksAman_(d.catatan));
  sh.getRange(baris, kol.id).setValue(teksAman_(id));
}

/* ---------- Aksi ---------- */
function daftar_() {
  const tz = zona_();
  const hasil = [];
  Object.keys(NAMA_SHEET).forEach(function (jenis) {
    const sh = ambilSheet_(jenis);
    const kol = kolom_(sh);
    const akhir = sh.getLastRow();
    if (akhir < 2) return;
    const data = sh.getRange(2, 1, akhir - 1, sh.getLastColumn()).getValues();
    const tanpaId = [];
    data.forEach(function (r, i) {
      const tanggal = bacaTanggal_(r[kol.tanggal - 1], tz);
      const nominal = bacaNominal_(r[kol.nominal - 1]);
      if (!tanggal || !(nominal > 0)) return; // lewati baris kosong / baris total
      let id = String(r[kol.id - 1] || '');
      if (!id) { id = buatId_() + i; tanpaId.push([i + 2, id]); }
      hasil.push({
        id: id,
        jenis: jenis,
        tanggal: tanggal,
        kategori: String(r[kol.kategori - 1] || '').trim() || 'Lainnya',
        nominal: nominal,
        catatan: String(r[kol.catatan - 1] || ''),
      });
    });
    // Baris yang diketik manual di sheet diberi ID supaya bisa diedit dari aplikasi
    // (gagal menulis ID tidak boleh menggagalkan pembacaan data)
    if (tanpaId.length) {
      try {
        tulis_(function () {
          tanpaId.forEach(function (p) {
            const sel = sh.getRange(p[0], kol.id);
            if (!sel.getValue()) sel.setValue(p[1]);
          });
        });
      } catch (e) { /* dicoba lagi pada sinkron berikutnya */ }
    }
  });
  return hasil;
}

function tambah_(req) {
  const d = validasi_(req);
  const sh = ambilSheet_(d.jenis);
  const kol = kolom_(sh);
  const id = String(req.id || '') || buatId_();
  // Kiriman ulang dengan ID yang sama tidak membuat baris ganda
  if (!cariBaris_(sh, kol, id)) {
    isiBaris_(sh, kol, sh.getLastRow() + 1, d, id);
    pastikanKategori_(d.jenis, d.kategori);
    tandaiMencatat_();
  }
  d.id = id;
  return d;
}

function ubah_(req) {
  const d = validasi_(req);
  const asal = NAMA_SHEET[req.jenisAsal] ? req.jenisAsal : d.jenis;
  const shAsal = ambilSheet_(asal);
  const kolAsal = kolom_(shAsal);
  const baris = cariBaris_(shAsal, kolAsal, req.id);
  if (!baris) throw new Error('Transaksi tidak ditemukan. Muat ulang data.');
  pastikanKategori_(d.jenis, d.kategori);
  if (asal === d.jenis) {
    isiBaris_(shAsal, kolAsal, baris, d, req.id);
  } else {
    // Jenis berubah: pindahkan ke sheet satunya
    const shBaru = ambilSheet_(d.jenis);
    isiBaris_(shBaru, kolom_(shBaru), shBaru.getLastRow() + 1, d, req.id);
    shAsal.deleteRow(baris);
  }
  d.id = req.id;
  return d;
}

function hapus_(req) {
  const sh = ambilSheet_(req.jenis);
  const kol = kolom_(sh);
  const baris = cariBaris_(sh, kol, req.id);
  if (baris) sh.deleteRow(baris);
  return { id: req.id };
}

/* ---------- Kategori (sheet "Kategori": Jenis | Kategori) ---------- */
function namaKategori_(s) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!s) throw new Error('Nama kategori wajib diisi.');
  return s;
}
function jenisDari_(s) {
  s = String(s || '').trim().toLowerCase();
  return NAMA_SHEET[s] ? s : '';
}
const sama_ = function (a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };

/** Ambil sheet Kategori; saat pertama dibuat, diisi dari kategori yang sudah dipakai di transaksi lama. */
function sheetKategori_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_KATEGORI);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET_KATEGORI);
  sh.getRange(1, 1, 1, 2).setValues([['Jenis', 'Kategori']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const awal = [];
  Object.keys(NAMA_SHEET).forEach(function (jenis) {
    const tx = ambilSheet_(jenis);
    if (tx.getLastRow() < 2) return;
    const kol = kolom_(tx);
    const dipakai = [];
    tx.getRange(2, kol.kategori, tx.getLastRow() - 1, 1).getValues().forEach(function (r) {
      const k = String(r[0] || '').trim();
      if (k && !dipakai.some(function (x) { return sama_(x, k); })) dipakai.push(k);
    });
    dipakai.forEach(function (k) { awal.push([LABEL_JENIS[jenis], teksAman_(k)]); });
  });
  if (awal.length) sh.getRange(2, 1, awal.length, 2).setValues(awal);
  return sh;
}

/** Baris kategori: [{baris, jenis, nama}] */
function barisKategori_() {
  const sh = sheetKategori_();
  const akhir = sh.getLastRow();
  if (akhir < 2) return [];
  return sh.getRange(2, 1, akhir - 1, 2).getValues().map(function (r, i) {
    return { baris: i + 2, jenis: jenisDari_(r[0]), nama: String(r[1] || '').trim() };
  }).filter(function (x) { return x.jenis && x.nama; });
}

function bacaKategori_() {
  const out = { pemasukan: [], pengeluaran: [] };
  barisKategori_().forEach(function (x) {
    if (!out[x.jenis].some(function (n) { return sama_(n, x.nama); })) out[x.jenis].push(x.nama);
  });
  return out;
}

function pastikanKategori_(jenis, nama) {
  const ada = barisKategori_().some(function (x) { return x.jenis === jenis && sama_(x.nama, nama); });
  if (!ada) {
    const sh = sheetKategori_();
    sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setValues([[LABEL_JENIS[jenis], teksAman_(nama)]]);
  }
}

function tambahKategori_(req) {
  const jenis = jenisDari_(req.jenis);
  if (!jenis) throw new Error('Jenis transaksi tidak dikenal.');
  pastikanKategori_(jenis, namaKategori_(req.nama));
  return bacaKategori_();
}

/** Ganti nama kategori. Transaksi lama dengan kategori itu ikut diganti. Nama yang sudah ada = digabung. */
function ubahKategori_(req) {
  const jenis = jenisDari_(req.jenis);
  if (!jenis) throw new Error('Jenis transaksi tidak dikenal.');
  const lama = namaKategori_(req.lama);
  let baru = namaKategori_(req.baru);
  const sh = sheetKategori_();
  const semua = barisKategori_();
  const target = semua.filter(function (x) { return x.jenis === jenis && sama_(x.nama, lama); });
  const lain = sama_(lama, baru) ? null : semua.find(function (x) { return x.jenis === jenis && sama_(x.nama, baru); });
  const sudahAda = !!lain;
  if (lain) baru = lain.nama; // digabung: pakai ejaan kategori yang sudah ada
  if (sudahAda) {
    target.sort(function (a, b) { return b.baris - a.baris; }).forEach(function (x) { sh.deleteRow(x.baris); });
  } else if (target.length) {
    sh.getRange(target[0].baris, 2).setValue(teksAman_(baru));
  } else {
    pastikanKategori_(jenis, baru);
  }
  // Ganti juga di transaksi lama, hanya sel kategori yang cocok
  const tx = ambilSheet_(jenis);
  const kol = kolom_(tx);
  let diubah = 0;
  if (tx.getLastRow() >= 2) {
    const huruf = kolomHuruf_(kol.kategori);
    const sel = [];
    tx.getRange(2, kol.kategori, tx.getLastRow() - 1, 1).getValues().forEach(function (r, i) {
      if (sama_(r[0], lama)) sel.push(huruf + (i + 2));
    });
    if (sel.length) { tx.getRangeList(sel).setValue(teksAman_(baru)); diubah = sel.length; }
  }
  return { kategori: bacaKategori_(), diubah: diubah };
}

/** Hapus dari daftar pilihan saja. Transaksi lama tidak diubah. */
function hapusKategori_(req) {
  const jenis = jenisDari_(req.jenis);
  if (!jenis) throw new Error('Jenis transaksi tidak dikenal.');
  const nama = namaKategori_(req.nama);
  const sh = sheetKategori_();
  barisKategori_().filter(function (x) { return x.jenis === jenis && sama_(x.nama, nama); })
    .sort(function (a, b) { return b.baris - a.baris; })
    .forEach(function (x) { sh.deleteRow(x.baris); });
  return bacaKategori_();
}

function kolomHuruf_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ---------- Pengingat mencatat (lewat Google Calendar) ----------
 * Setiap hari, lewat tengah malam, dibuat satu acara "Catat Uang" di Google Calendar-mu
 * pada jam pilihanmu, dengan notifikasi tepat di jam itu. Begitu kamu mencatat transaksi
 * hari itu lewat aplikasi, acaranya dihapus, jadi notifikasi tidak muncul.
 * Jalankan izinkanPengingat() sekali dari editor untuk memberi izin Kalender. */
const JUDUL_PENGINGAT = 'Catat Uang: belum ada catatan hari ini';
const PESAN_IZIN = 'Pengingat belum diizinkan. Di editor Apps Script, pilih fungsi izinkanPengingat, klik Jalankan, setujui izinnya, lalu buat Versi baru di Kelola deployment.';

/** Jalankan sekali dari editor: memunculkan permintaan izin Google Calendar dan pemicu waktu. */
function izinkanPengingat() {
  CalendarApp.getDefaultCalendar().getName();
  ScriptApp.getProjectTriggers();
  Logger.log('Izin pengingat sudah diberikan. Sekarang buat Versi baru di Terapkan > Kelola deployment.');
}

function props_() { return PropertiesService.getScriptProperties(); }
function hariIni_() { return Utilities.formatDate(new Date(), zona_(), 'yyyy-MM-dd'); }
function bacaJson_(k) { try { return JSON.parse(props_().getProperty(k) || 'null'); } catch (e) { return null; } }
function izinGagal_(e) {
  const m = String(e && e.message ? e.message : e);
  return /permission|izin|authori[sz]|otorisasi|scope|required/i.test(m) ? new Error(PESAN_IZIN) : e;
}

function bacaPengingat_() {
  const p = bacaJson_('pengingat') || {};
  return {
    aktif: !!p.aktif,
    jam: p.jam == null ? 21 : p.jam,
    menit: p.menit || 0,
    hanyaJikaKosong: p.hanyaJikaKosong !== false,
    url: p.url || '',
  };
}

function aturPengingat_(req) {
  const jam = Math.floor(Number(req.jam)), menit = Number(req.menit);
  if (!(jam >= 1 && jam <= 23)) throw new Error('Jam pengingat harus antara 01.00 dan 23.45.');
  if ([0, 15, 30, 45].indexOf(menit) === -1) throw new Error('Menit pengingat tidak valid.');
  let url = String(req.url || '').slice(0, 300);
  if (!/^https:\/\//.test(url)) url = '';
  const p = { aktif: !!req.aktif, jam: jam, menit: menit, hanyaJikaKosong: req.hanyaJikaKosong !== false, url: url };
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'siapkanPengingat') ScriptApp.deleteTrigger(t);
    });
    if (p.aktif) {
      ScriptApp.newTrigger('siapkanPengingat').timeBased().everyDays(1).atHour(0).nearMinute(15).inTimezone(zona_()).create();
    }
    props_().setProperty('pengingat', JSON.stringify(p));
    siapkanPengingat();
  } catch (e) { throw izinGagal_(e); }
  return bacaPengingat_();
}

/** Dijalankan otomatis tiap hari lewat tengah malam (dan saat pengaturan disimpan). */
function siapkanPengingat() {
  hapusAcara_('pengingatAcara');
  hapusAcara_('pengingatUji');
  const p = bacaPengingat_();
  if (!p.aktif) return;
  const hari = hariIni_();
  if (p.hanyaJikaKosong && sudahMencatat_(hari)) return;
  const mulai = Utilities.parseDate(hari + ' ' + ('0' + p.jam).slice(-2) + ':' + ('0' + p.menit).slice(-2), zona_(), 'yyyy-MM-dd HH:mm');
  if (mulai.getTime() <= Date.now()) return; // jamnya sudah lewat hari ini
  const ev = buatAcara_(JUDUL_PENGINGAT, mulai, p);
  props_().setProperty('pengingatAcara', JSON.stringify({ tanggal: hari, id: ev.getId() }));
}

function buatAcara_(judul, mulai, p) {
  const isi = 'Kamu belum mencatat pemasukan atau pengeluaran hari ini.' + (p.url ? '\n\nBuka Catat Uang: ' + p.url : '');
  const ev = CalendarApp.getDefaultCalendar().createEvent(judul, mulai, new Date(mulai.getTime() + 15 * 60000), { description: isi });
  ev.removeAllReminders();
  ev.addPopupReminder(0);
  return ev;
}

function hapusAcara_(kunci) {
  const a = bacaJson_(kunci);
  if (!a) return;
  try { const ev = CalendarApp.getEventById(a.id); if (ev) ev.deleteEvent(); } catch (e) { /* sudah dihapus manual */ }
  props_().deleteProperty(kunci);
}

function sudahMencatat_(hari) {
  if (props_().getProperty('terakhirCatat') === hari) return true;
  return daftar_().some(function (x) { return x.tanggal === hari; });
}

/** Dipanggil setiap kali transaksi baru masuk lewat aplikasi. Tidak boleh menggagalkan penyimpanan. */
function tandaiMencatat_() {
  try {
    const hari = hariIni_();
    if (props_().getProperty('terakhirCatat') === hari) return;
    props_().setProperty('terakhirCatat', hari);
    if (bacaPengingat_().hanyaJikaKosong) hapusAcara_('pengingatAcara');
  } catch (e) { /* pengingat tidak penting dibanding data */ }
}

/** Buat acara uji 3 menit dari sekarang, untuk memastikan notifikasi Kalender muncul di HP. */
function ujiPengingat_(req) {
  try {
    hapusAcara_('pengingatUji');
    const p = bacaPengingat_();
    if (/^https:\/\//.test(String(req.url || ''))) p.url = String(req.url).slice(0, 300);
    const mulai = new Date(Math.ceil((Date.now() + 3 * 60000) / 60000) * 60000);
    const ev = buatAcara_('Catat Uang: uji pengingat', mulai, p);
    props_().setProperty('pengingatUji', JSON.stringify({ tanggal: hariIni_(), id: ev.getId() }));
    return { pukul: Utilities.formatDate(mulai, zona_(), 'HH.mm') };
  } catch (e) { throw izinGagal_(e); }
}
