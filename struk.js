/* ARTA — pembaca bukti transaksi (struk.js)
   1. bacaGambar(): mengubah gambar struk menjadi teks, di HP sendiri (gambar tidak dikirim ke mana pun).
   2. uraiStruk(): mengambil nominal, tanggal, jenis, dan pihak lawan dari teks itu. */
'use strict';

(function (root) {
  /* ===================== Bagian murni: mengurai teks ===================== */
  const BULAN = { jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8,
    sep: 9, okt: 10, oct: 10, nov: 11, nop: 11, des: 12, dec: 12 };
  const NAMA_BULAN = '(jan|feb|peb|mar|apr|mei|may|jun|jul|agu|agt|aug|sep|okt|oct|nov|nop|des|dec)[a-z]*\\.?';
  const pad = (n) => String(n).padStart(2, '0');

  /** "1.250.000,00" / "1,250,000.00" / "50.000" / "125000" -> angka rupiah bulat */
  function keAngka(s) {
    s = String(s).replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/\s/g, '');
    // Ribuan selalu 3 digit, jadi 1–2 digit terakhir pasti desimal, apa pun pemisahnya.
    // "36.000,00", "36.000.00" (sen kecil terbaca titik), "36.00000" (pemisah sen hilang)
    let m = s.match(/^(\d{1,3}(?:([.,])\d{3})+)(?:(?:[.,])(\d{1,2})|(\d{2}))?$/);
    if (m) return Math.round(Number(m[1].replace(/[.,]/g, '') + ((m[3] || m[4]) ? '.' + (m[3] || m[4]) : '')));
    m = s.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
    if (m) return Math.round(Number(m[1] + (m[2] ? '.' + m[2] : '')));
    return 0;
  }

  /* Rapikan hasil pemindaian: "1. 250 .000" -> "1.250.000", "Rp.50" -> "Rp 50" */
  function rapikan(teks) {
    return String(teks || '')
      .replace(/\r/g, '')
      .replace(/(\d)\s*([.,])\s*(?=\d{3}\b)/g, '$1$2')
      .replace(/\b(r ?p|bp|idr)\s*[.:]?\s*(?=[\dOo])/gi, 'Rp ')
      .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  }

  const RE_UANG = /Rp ([\dOoIl][\dOoIl.,]*\d)/g;
  const RE_ANGKA_LABEL = /(?:^|\s)(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)(?=\s|$)/g;
  const huruf = (s) => (s.match(/[a-z]/gi) || []).length;

  function cariNominal(baris) {
    const kandidat = [];
    baris.forEach((l, i) => {
      const temuan = [];
      let m;
      RE_UANG.lastIndex = 0;
      while ((m = RE_UANG.exec(l))) temuan.push(m[1]);
      // Angka tanpa "Rp" hanya dihitung bila barisnya berlabel jumlah/total
      const RE_LBL = /total|jumlah|nominal|amount|nilai|bayar/i;
      // ... atau angkanya sendirian di bawah baris label ("Total Transaksi" / "50.000")
      if (!temuan.length && (RE_LBL.test(l) || (huruf(l) < 3 && i > 0 && RE_LBL.test(baris[i - 1])))) {
        RE_ANGKA_LABEL.lastIndex = 0;
        while ((m = RE_ANGKA_LABEL.exec(l))) temuan.push(m[1]);
      }
      temuan.forEach((t) => {
        const nilai = keAngka(t);
        if (!(nilai > 0) || nilai > 1e12) return;
        let konteks = l.replace(/Rp [\d.,OoIl]+/g, ' ');
        const sendirian = huruf(konteks) < 3;
        if (sendirian && i > 0) konteks = baris[i - 1];
        const k = konteks.toLowerCase();
        let skor = 0;
        if (/total|grand total/.test(k)) skor += 50;
        if (/jumlah|nominal|amount|nilai|bayar|dibayar|transfer|pembayaran|menerima|diterima/.test(k)) skor += 30;
        if (/biaya|admin|fee|diskon|discount|cashback|potongan|promo|pajak|tax|tip/.test(k) && !/total/.test(k)) skor -= 40;
        if (/saldo|balance|limit|poin|point|sisa|available/.test(k)) skor -= 100;
        if (sendirian && huruf(l) < 3) skor += 20; // angka besar sendirian (gaya QRIS / e-wallet)
        kandidat.push({ nilai, skor, i });
      });
    });
    kandidat.sort((a, b) => b.skor - a.skor || a.i - b.i);
    return kandidat.length && kandidat[0].skor > -50 ? kandidat[0].nilai : 0;
  }

  function cariTanggal(teks, hariIni) {
    const t = teks.toLowerCase();
    const hasil = [];
    const tambah = (d, b, th, pos) => {
      d = +d; b = +b; th = +th;
      if (th < 100) th += 2000;
      if (b < 1 || b > 12 || d < 1 || d > 31 || th < 2000 || th > 2099) return;
      const tgl = new Date(th, b - 1, d);
      if (tgl.getMonth() !== b - 1) return;
      hasil.push({ iso: th + '-' + pad(b) + '-' + pad(d), pos });
    };
    let m;
    const reA = new RegExp('(\\d{1,2})[\\s\\-.]*' + NAMA_BULAN + '[\\s\\-.,]*(\\d{4}|\\d{2})\\b', 'g');
    while ((m = reA.exec(t))) tambah(m[1], BULAN[m[2]], m[3], m.index);
    const reB = new RegExp(NAMA_BULAN + '\\s+(\\d{1,2}),?\\s+(\\d{4})', 'g');
    while ((m = reB.exec(t))) tambah(m[2], BULAN[m[1]], m[3], m.index);
    const reC = /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g;
    while ((m = reC.exec(t))) tambah(m[3], m[2], m[1], m.index);
    const reD = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})\b/g;
    while ((m = reD.exec(t))) tambah(m[1], m[2], m[3], m.index);
    const reE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
    while ((m = reE.exec(t))) tambah(m[1], m[2], m[3], m.index);
    // "18/11 15:30:22" tanpa tahun (mis. m-BCA): tahun ini, atau tahun lalu bila jadinya di masa depan
    const reF = /\b(\d{1,2})\/(\d{1,2})(?![\/\-]?\d)\s+\d{1,2}[:.]\d{2}/g;
    const thIni = +hariIni.slice(0, 4);
    while ((m = reF.exec(t))) {
      const th = (pad(m[2]) + pad(m[1]) > hariIni.slice(5, 7) + hariIni.slice(8, 10)) ? thIni - 1 : thIni;
      tambah(m[1], m[2], th, m.index);
    }

    // Wajar: paling lama setahun lalu, paling jauh besok
    const now = new Date(hariIni + 'T00:00:00');
    const batasLama = new Date(now); batasLama.setDate(batasLama.getDate() - 400);
    const batasBaru = new Date(now); batasBaru.setDate(batasBaru.getDate() + 1);
    const wajar = hasil.filter((h) => { const d = new Date(h.iso + 'T00:00:00'); return d >= batasLama && d <= batasBaru; });
    if (!wajar.length) return '';
    const berlabel = wajar.find((h) => /tanggal|tgl|waktu|date|time/.test(t.slice(Math.max(0, h.pos - 40), h.pos)));
    return (berlabel || wajar.sort((a, b) => a.pos - b.pos)[0]).iso;
  }

  const RE_LABEL_KELUAR = /^(?:nama\s+)?(?:penerima|tujuan|kepada|merchant|nama toko|toko|penjual|beneficiary(?:\s+name)?|recipient|to|ke)\b\s*(?:name|nama)?\s*[:\-]?\s*/i;
  const RE_LABEL_MASUK = /^(?:nama\s+)?(?:pengirim|dari|from|sender)\b\s*[:\-]?\s*/i;
  const RE_LABEL_APAPUN = /^(?:nama|penerima|pengirim|tujuan|bank|rekening|no\.?|nomor|tanggal|waktu|jumlah|nominal|total|biaya|status|berita|keterangan|catatan|metode|sumber|ref|id)\b/i;

  function bersihkanNama(s) {
    s = String(s || '')
      .replace(/\b\d[\d\s\-*xX]{3,}\b/g, ' ')        // nomor rekening / telepon
      .replace(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{8,}\b/g, ' ') // kode transaksi, mis. A-A3FBB2OGWXQRAV
      .replace(/[*?#^~]+/g, ' ')
      .replace(/\b(?:bank|rek(?:ening)?|a\/n|an\.?)\b\s*$/i, '')
      .replace(/[|•·]+/g, ' ')
      .replace(/\s+-\s*$/, '')
      .replace(/^[\s:\-–]+|[\s:\-–,.]+$/g, '')
      .replace(/\s+/g, ' ').trim();
    if (huruf(s) < 2) return '';
    if (s === s.toUpperCase() && s.length > 3) {
      s = s.toLowerCase().replace(/(^|[\s(\-&/])([a-z])/g, (_, a, b) => a + b.toUpperCase())
        .replace(/\b(Pt|Cv|Tbk|Qris|Pln|Bpjs)\b/g, (w) => w.toUpperCase());
    }
    return s.slice(0, 40);
  }

  function cariPihak(baris, masuk) {
    const label = masuk ? RE_LABEL_MASUK : RE_LABEL_KELUAR;
    for (let i = 0; i < baris.length; i++) {
      const l = baris[i];
      if (!label.test(l)) continue;
      let nilai = bersihkanNama(l.replace(label, ''));
      if (!nilai && baris[i + 1] && !RE_LABEL_APAPUN.test(baris[i + 1]) && !/Rp \d/.test(baris[i + 1])) {
        nilai = bersihkanNama(baris[i + 1]);
      }
      if (nilai) return nilai;
    }
    // Tanpa label (gaya blu, kartu debit): nama tepat di atas baris kartu/rekening. Ambil yang terakhir
    // (yang pertama biasanya pemilik rekening sendiri).
    const RE_KARTU = /\b(?:card|kartu|debit|kredit|credit|rekening|account)\b.*(?:[•·.*xX]{3,}|\d{4})|(?:[•·.*]{3,}\s*){2,}\d{3,4}/i;
    let calon = '';
    for (let i = 1; i < baris.length; i++) {
      if (!RE_KARTU.test(baris[i]) || RE_LABEL_APAPUN.test(baris[i - 1]) || /Rp \d/.test(baris[i - 1])) continue;
      const n = bersihkanNama(baris[i - 1].replace(/^[^A-Za-z0-9]*[A-Z]\s+(?=[A-Z][a-z])/, ''));
      if (n) calon = n;
    }
    if (calon) return calon;
    const kalimat = baris.join(' ').match(masuk
      ? /\b(?:dari|from)\s+([A-Za-z][A-Za-z .'&]{2,40})/
      : /\b(?:ke|kepada|to)\s+([A-Z][A-Za-z .'&]{2,40})/);
    return kalimat ? bersihkanNama(kalimat[1]) : '';
  }

  function cariBerita(baris) {
    const re = /^(?:berita|keterangan|catatan|remarks?|deskripsi|description|pesan|note|notes)\b(?:\s+transfer)?\s*[:\-]?\s*/i;
    for (let i = 0; i < baris.length; i++) {
      if (!re.test(baris[i])) continue;
      let v = baris[i].replace(re, '').trim();
      if (!v && baris[i + 1] && !RE_LABEL_APAPUN.test(baris[i + 1])) v = baris[i + 1].trim();
      if (v && huruf(v) >= 2 && !/^[-–]+$/.test(v)) return v.slice(0, 60);
    }
    return '';
  }

  /** teks hasil pemindaian -> { nominal, tanggal, jenis, pihak, catatan } */
  function uraiStruk(teks, hariIni) {
    const baris = rapikan(teks);
    const semua = baris.join('\n');
    const masuk = /dana masuk|uang masuk|transfer masuk|(?:kamu|anda|telah)\s+menerima|diterima dari|received from|incoming transfer|money received/i.test(semua);
    const pihak = cariPihak(baris, masuk);
    const berita = cariBerita(baris);
    const qris = /\b[qgo0]r[i1l]s\b/i.test(semua); // "GRIS"/"0RIS": salah baca umum untuk QRIS
    const transfer = /transfer|pindah dana|kirim uang/i.test(semua);
    let catatan = '';
    if (pihak) catatan = masuk ? 'Dari ' + pihak : qris ? 'QRIS ' + pihak : transfer ? 'Transfer ke ' + pihak : pihak;
    else if (qris) catatan = 'Pembayaran QRIS';
    else {
      const jenisBayar = [[/token listrik|listrik prabayar|\bpln\b/i, 'Token listrik PLN'], [/pulsa|paket data|kuota/i, 'Pulsa/paket data'],
        [/top ?up|isi saldo/i, 'Top up saldo'], [/bpjs/i, 'BPJS'], [/virtual account/i, 'Pembayaran virtual account']]
        .find((j) => j[0].test(semua));
      if (jenisBayar) catatan = jenisBayar[1];
    }
    if (berita && berita.toLowerCase() !== pihak.toLowerCase()) catatan += (catatan ? ' (' + berita + ')' : berita);
    return {
      nominal: cariNominal(baris),
      tanggal: cariTanggal(semua, hariIni),
      jenis: masuk ? 'pemasukan' : 'pengeluaran',
      pihak: pihak,
      catatan: catatan.slice(0, 300),
    };
  }

  /** Kategori yang dulu dipakai untuk pihak yang sama (transaksi terbaru menang) */
  function tebakKategori(list, jenis, pihak) {
    const p = String(pihak || '').toLowerCase();
    if (p.length < 3) return '';
    let hit = null;
    list.forEach((x) => {
      if (x.jenis !== jenis || String(x.catatan || '').toLowerCase().indexOf(p) === -1) return;
      if (!hit || x.tanggal >= hit.tanggal) hit = x;
    });
    return hit ? hit.kategori : '';
  }

  /** Transaksi serupa yang sudah tercatat (cegah struk yang sama dicatat dua kali) */
  function cariKembar(list, d) {
    return list.find((x) => x.jenis === d.jenis && x.tanggal === d.tanggal && Number(x.nominal) === Number(d.nominal) &&
      (!d.pihak || String(x.catatan || '').toLowerCase().indexOf(d.pihak.toLowerCase()) !== -1)) || null;
  }

  /* ===================== Bagian browser: gambar -> teks ===================== */
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  let muatPustaka = null, pekerja = null, timerTidur = null;

  function pustaka() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (!muatPustaka) {
      muatPustaka = new Promise((ok, gagal) => {
        const s = document.createElement('script');
        s.src = TESSERACT_URL; s.async = true;
        s.onload = () => ok(root.Tesseract);
        s.onerror = () => { muatPustaka = null; gagal(new Error('Pembaca struk belum bisa dimuat. Periksa koneksi internet.')); };
        document.head.appendChild(s);
      });
    }
    return muatPustaka;
  }

  let laporProgres = () => {};
  async function siapkanPekerja() {
    if (pekerja) return pekerja;
    const T = await pustaka();
    pekerja = T.createWorker('ind', 1, {
      logger: (m) => { if (m.status === 'recognizing text') laporProgres(m.progress); },
    }).catch((e) => { pekerja = null; throw e; });
    return pekerja;
  }

  /* Gambar -> kanvas abu-abu; tangkapan layar mode gelap dibalik jadi teks gelap di latar terang */
  async function siapkanGambar(file) {
    let src;
    if (root.createImageBitmap) {
      try { src = await createImageBitmap(file); } catch (e) { src = null; }
    }
    if (!src) {
      src = await new Promise((ok, gagal) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = () => gagal(new Error('Gambar tidak bisa dibuka.'));
        img.src = URL.createObjectURL(file);
      });
    }
    const w0 = src.width, h0 = src.height;
    const skala = Math.min(w0 < 900 ? 900 / w0 : 1400 / Math.max(w0, 1400), 3);
    const w = Math.round(w0 * skala), h = Math.round(h0 * skala);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h), px = data.data;
    let total = 0;
    for (let i = 0; i < px.length; i += 4) {
      const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = y; total += y;
    }
    if (total / (px.length / 4) < 110) {
      for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  /** file gambar -> teks. onProgres(0..1) dipanggil selama membaca. */
  async function bacaGambar(file, onProgres) {
    clearTimeout(timerTidur);
    laporProgres = onProgres || (() => {});
    const [w, kanvas] = await Promise.all([siapkanPekerja(), siapkanGambar(file)]);
    const hasil = await w.recognize(kanvas, {}, { text: true, blocks: true });
    // Lepas memori bila 2 menit tidak dipakai
    timerTidur = setTimeout(() => { if (pekerja) { pekerja.then((x) => x.terminate()).catch(() => {}); pekerja = null; } }, 120000);
    return teksTanpaSenKecil(hasil.data) || hasil.data.text || '';
  }

  /* Banyak aplikasi bank menulis sen dengan huruf kecil ("Rp 5.000,00" dengan ",00" mini). Pembaca teks
     sering salah membacanya jadi ".000", sehingga Rp 5.000 terbaca Rp 5.000.000. Di sini digit di ujung
     angka yang tingginya jauh lebih kecil dari digit lain dibuang, beserta pemisah di depannya. */
  function buangSenKecil(word) {
    const sym = word.symbols || [];
    const isDigit = (t) => /^[0-9Oo]$/.test(t);
    const tinggi = (x) => x.bbox.y1 - x.bbox.y0;
    const digit = sym.filter((x) => isDigit(x.text));
    if (digit.length < 3) return word.text;
    const acuan = Math.max.apply(null, digit.map(tinggi));
    const kecil = (x) => isDigit(x.text) && (tinggi(x) < acuan * 0.75 || x.is_superscript);
    const potong = (n) => sym.slice(0, n).map((x) => x.text).join('').replace(/[.,]+$/, '');
    const adaBesar = (n) => sym.slice(0, n).some((x) => isDigit(x.text) && !kecil(x));

    // 1) Kelompok setelah pemisah terakhir berisi digit kecil -> seluruh kelompok itu sen
    //    (pembaca kadang menyisipkan digit palsu berukuran normal di antaranya)
    let sep = -1;
    for (let i = sym.length - 1; i >= 0; i--) { if (/^[.,]$/.test(sym[i].text)) { sep = i; break; } }
    if (sep > 0) {
      const ekor = sym.slice(sep + 1).filter((x) => isDigit(x.text));
      if (ekor.length >= 1 && ekor.length <= 3 && ekor.some(kecil) && adaBesar(sep)) return potong(sep);
    }
    // 2) Sen kecil menempel tanpa pemisah ("5.00000"): buang deretan digit kecil di ujung
    let i = sym.length - 1, n = 0;
    while (i >= 0 && kecil(sym[i])) { n++; i--; }
    if (n >= 1 && n <= 3 && adaBesar(i + 1)) return potong(i + 1);
    return word.text;
  }
  function teksTanpaSenKecil(data) {
    if (!data || !data.blocks || !data.blocks.length) return '';
    const baris = [];
    data.blocks.forEach((bl) => (bl.paragraphs || []).forEach((pa) => (pa.lines || []).forEach((ln) => {
      baris.push((ln.words || []).map((w) => (/\d/.test(w.text) && w.symbols ? buangSenKecil(w) : w.text)).join(' '));
    })));
    return baris.join('\n');
  }

  const VERSI = 3;
  const api = { VERSI, keAngka, uraiStruk, tebakKategori, cariKembar, bacaGambar, siapkanPekerja };
  if (typeof module !== 'undefined') module.exports = api;
  root.Struk = api;
})(typeof window !== 'undefined' ? window : globalThis);
