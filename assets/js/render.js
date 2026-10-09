/* ==================================================================
   render.js — Penggambar halaman. Satu berkas, dua tempat jalan.
   ------------------------------------------------------------------
   Dipakai oleh:
     1. skrip/build.mjs di Node, saat situs dibangun. Hasilnya berkas
        HTML asli yang sudah berisi tulisannya.
     2. browser, HANYA pada mode pratinjau (?pratinjau=1). Pengunjung
        biasa tidak pernah menjalankannya — mereka menerima HTML jadi.

   Kenapa satu berkas dan bukan dua: kalau penggambar untuk prerender
   dan penggambar untuk pratinjau ditulis terpisah, keduanya akan
   berbeda. Bukan mungkin berbeda — pasti, dan biasanya pada detail
   yang justru sedang diperiksa orang di jendela pratinjau. Satu
   sumber berarti yang dilihat di pratinjau adalah yang nanti dibangun.

   ATURAN BERKAS INI: fungsi murni, data masuk → string HTML keluar.
   Tidak ada DOM, tidak ada fetch, tidak ada window. Itulah yang
   membuatnya bisa jalan di Node.
   ================================================================== */

(function (glob) {
  'use strict';

  /* ================================================================
     Perkakas dasar
     ================================================================ */

  /**
   * esc — escape untuk teks maupun nilai atribut.
   *
   * Dipakai pada SETIAP nilai yang berasal dari data, tanpa kecuali.
   * Satu-satunya yang ditanam tanpa escape adalah naskah karya dan bio
   * profil — keduanya sudah disanitasi di server (lihat Sanitize.gs),
   * dan keduanya ditandai jelas di tempatnya ditanam.
   */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  /** Konfigurasi: dari argumen, dari global browser, atau nilai cadangan. */
  function cfg(c) {
    var k = c || glob.PORTOFOLIO_CONFIG || {};
    return {
      LEBAR_SET: k.LEBAR_SET || [400, 640, 960, 1280],
      LEBAR_KARTU: k.LEBAR_KARTU || 640,
      LEBAR_BESAR: k.LEBAR_BESAR || 1280,
      KATA_PER_MENIT: k.KATA_PER_MENIT || 200
    };
  }

  /**
   * gbr — alamat gambar Drive pada lebar tertentu.
   *
   * Kembarannya di server ada di Helpers.gs (urlGambar). Dipakai di sini
   * supaya satu berkas yang diunggah sekali bisa disajikan 400 px di kartu
   * daftar dan 1280 px di halaman detail, tanpa kita menyimpan satu pun
   * salinan — Google yang membuat turunannya saat diminta.
   */
  function gbr(fileId, lebar) {
    var id = String(fileId || '').trim();
    if (!id) return '';
    var w = Math.max(64, Math.min(4096, num(lebar) || 800));
    return 'https://lh3.googleusercontent.com/d/' + id + '=w' + w;
  }

  /**
   * srcsetGbr — seluruh tangga lebar, supaya browser memilih sendiri.
   *
   * Ponsel mengambil 400 px untuk kartu selebar 343 px; layar beresolusi
   * ganda mengambil 1280 px untuk kartu yang sama. Menambah anak tangga
   * tidak menambah penyimpanan sedikit pun.
   */
  function srcsetGbr(fileId, k) {
    var c = cfg(k);
    if (!fileId) return '';
    return c.LEBAR_SET.map(function (w) { return gbr(fileId, w) + ' ' + w + 'w'; }).join(', ');
  }

  /** Perkiraan waktu baca dari jumlah kata. */
  function waktuBaca(kata, k) {
    var c = cfg(k);
    var n = num(kata);
    if (!n) return '';
    return Math.max(1, Math.round(n / c.KATA_PER_MENIT)) + ' menit baca';
  }

  /** Inisial dari nama — cadangan bila monogram tidak diisi di CMS. */
  function inisial(nama) {
    var p = String(nama || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  /** yyyy-MM-dd → "Maret 2025". Tanggal tanpa tanggalnya: hanya bulan & tahun. */
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function tglTeks(s) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(s || ''));
    if (!m) return '';
    var bln = BULAN[Number(m[2]) - 1];
    return bln ? bln + ' ' + m[1] : m[1];
  }

  /* ================================================================
     Ikon

     Ditanam sebagai SVG, bukan dimuat dari pustaka ikon. Alasannya
     konkret: halaman ini statis dan ingin tampil utuh pada muatan
     pertama, dan satu permintaan jaringan tambahan untuk enam ikon
     kecil adalah ongkos yang tidak sepadan. Totalnya di bawah 2 KB.
     ================================================================ */
  var IKON = {
    panah: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    luar: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
    surat: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    wa: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.3A8.5 8.5 0 1 1 21 11.5z"/>',
    ig: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
    li: '<path d="M4 9h3v11H4zM5.5 4a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z"/><path d="M10 20V9h3v1.6A3.8 3.8 0 0 1 16.3 9c2.3 0 3.7 1.5 3.7 4.3V20h-3v-6.1c0-1.5-.6-2.4-1.9-2.4-1.1 0-1.8.7-2.1 1.5V20z"/>',
    mata: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    pisah: '<path d="m9 6 6 6-6 6"/>',
    grafik: '<path d="M3 17l5-5 4 4 7-7"/><path d="M16 9h4v4"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    tutup: '<path d="M6 6l12 12M18 6 6 18"/>'
  };

  function ikon(nama, kelas) {
    var d = IKON[nama];
    if (!d) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (kelas ? ' class="' + esc(kelas) + '"' : '') + '>' + d + '</svg>';
  }

  /* ================================================================
     Tautan kontak
     ================================================================ */
  function tautanKontak(kontak) {
    var k = kontak || {};
    var out = [];
    if (k.email) out.push({ href: 'mailto:' + k.email, label: 'Email', ikon: 'surat' });
    if (k.whatsapp) out.push({ href: 'https://wa.me/' + String(k.whatsapp).replace(/\D/g, ''), label: 'WhatsApp', ikon: 'wa' });
    if (k.instagram) out.push({ href: 'https://instagram.com/' + k.instagram, label: 'Instagram', ikon: 'ig' });
    if (k.linkedin) out.push({ href: 'https://linkedin.com/in/' + k.linkedin, label: 'LinkedIn', ikon: 'li' });
    return out;
  }

  /**
   * alamatHubungi — tujuan tombol ajakan, dengan rantai cadangan.
   *
   * Tombol yang tertulis "Hubungi saya" tapi tidak menuju ke mana pun
   * lebih buruk daripada tidak ada tombol. Jadi: pakai tautan yang diisi;
   * kalau kosong, pakai email; kalau itu pun kosong, pakai WhatsApp; kalau
   * semuanya kosong, tombolnya tidak digambar sama sekali.
   */
  function alamatHubungi(d, tautan) {
    if (tautan) return tautan;
    var k = (d && d.kontak) || {};
    if (k.email) return 'mailto:' + k.email;
    if (k.whatsapp) return 'https://wa.me/' + String(k.whatsapp).replace(/\D/g, '');
    return '';
  }

  /* ================================================================
     Kerangka: header & footer
     ================================================================ */
  /**
   * tautanMenu — ubah satu item navigasi dari CMS jadi href yang benar.
   *
   * Jalurnya selalu relatif terhadap halaman yang sedang digambar (lihat
   * akar()), jadi situs tetap bekerja bila dihosting di sub-folder.
   */
  function tautanMenu(m, halaman) {
    var a = akar(halaman);
    if (m.jenis === 'eksternal') return m.target;
    if (m.jenis === 'about') return a + 'about/';
    if (m.jenis === 'kategori') return a + 'kategori/' + m.target + '/';
    if (m.jenis === 'anchor') return (halaman === 'beranda' ? '' : a) + '#' + m.target;
    return a;
  }

  function menuAktif(m, halaman) {
    if (m.jenis === 'about') return halaman === 'about';
    if (m.jenis === 'kategori') return halaman === 'kategori:' + m.target;
    if (m.jenis === 'beranda') return halaman === 'beranda';
    return false;
  }

  /**
   * navBawaan — susunan menu saat sheet Menu belum terisi.
   *
   * Dipakai hanya bila d.nav.header bernilai null, yang berarti "belum
   * pernah diatur". Daftar kosong (bukan null) berarti pemiliknya memang
   * sengaja mengosongkannya, dan itu dihormati.
   */
  function navBawaan(d) {
    var kat = (d.kategori || []).filter(function (k) { return k.jumlah > 0; });
    var out = [{ label: 'Beranda', jenis: 'beranda', target: '' }];

    // Kategori ikut jadi menu hanya bila jumlahnya masih wajar dipindai.
    // Lebih dari empat, yang terjadi bukan navigasi melainkan deretan kata
    // yang menutupi nama situsnya sendiri.
    if (kat.length && kat.length <= 4) {
      kat.forEach(function (k) {
        out.push({ label: k.nama, jenis: 'kategori', target: k.slug });
      });
    } else if (kat.length) {
      out.push({ label: 'Portofolio', jenis: 'anchor', target: 'karya' });
    }
    out.push({ label: 'Tentang', jenis: 'about', target: '' });
    return out;
  }

  function header(d, halaman) {
    var s = d.situs || {};
    var nama = s.nama || 'Portofolio';
    var hubungi = alamatHubungi(d, (d.cta || {}).link);

    var daftar = (d.nav && d.nav.header) || null;
    if (daftar === null) daftar = navBawaan(d);

    var adaTombol = daftar.some(function (m) { return m.tombol; });

    return '<header class="situs-head" id="situs-head">' +
      '<div class="wrap head-isi">' +
        '<a class="merek" href="' + esc(akar(halaman)) + '">' +
          '<span class="monogram">' + esc(s.inisial || inisial(nama)) + '</span>' +
          '<span class="merek-teks">' +
            '<span class="merek-nama" id="t-situs-nama">' + esc(nama) + '</span>' +
            (s.tagline ? '<span class="merek-tag" id="t-situs-tagline">' + esc(s.tagline) + '</span>' : '') +
          '</span>' +
        '</a>' +
        '<button class="nav-tombol" id="nav-tombol" aria-expanded="false" aria-controls="nav" aria-label="Buka menu">' +
          ikon('menu') + '</button>' +
        '<nav class="nav" id="nav">' +
          daftar.map(function (m) {
            var aktif = menuAktif(m, halaman);
            return '<a' + (m.tombol ? ' class="btn"' : '') +
              ' href="' + esc(tautanMenu(m, halaman)) + '"' +
              (m.tabBaru ? ' target="_blank" rel="noopener noreferrer"' : '') +
              (aktif ? ' aria-current="page"' : '') + '>' + esc(m.label) + '</a>';
          }).join('') +
          // Tombol Hubungi bawaan hanya muncul bila pemiliknya belum
          // membuat tombolnya sendiri. Dua tombol ajakan berdampingan
          // saling melemahkan.
          (!adaTombol && hubungi ? '<a class="btn" href="' + esc(hubungi) + '">Hubungi</a>' : '') +
        '</nav>' +
      '</div>' +
    '</header>';
  }

  /**
   * akar — jalur relatif ke akar situs dari sebuah halaman.
   *
   * Halaman detail karya tinggal dua tingkat di dalam (/karya/slug/), jadi
   * tautannya ke beranda harus '../../'. Memakai '/' mutlak akan rusak di
   * hosting yang menyajikan situs dari sub-folder — GitHub Pages dengan
   * nama repo, misalnya. Jalur relatif bekerja di keduanya.
   */
  function akar(halaman) {
    var h = String(halaman || '');
    if (h === 'beranda') return '';
    if (h === 'about' || h === '404') return '../';
    return '../../';          // karya:<slug> dan kategori:<slug>
  }

  function footer(d, halaman) {
    var s = d.situs || {};
    var f = d.footer || {};
    var kontak = tautanKontak(d.kontak);
    var tahun = new Date().getFullYear();

    var tautanFooter = (d.nav && d.nav.footer) || null;
    if (tautanFooter === null) {
      tautanFooter = [{ label: 'Tentang', jenis: 'about', target: '' }];
    }

    return '<footer class="situs-foot">' +
      '<div class="wrap">' +
        '<div class="foot-isi">' +
          '<div class="foot-kiri">' +
            '<div class="foot-merek">' + esc(s.nama || 'Portofolio') + '</div>' +
            (f.teks
              ? '<p class="foot-tag" id="t-footer-teks">' + esc(f.teks) + '</p>'
              : (s.tagline ? '<div class="foot-tag">' + esc(s.tagline) + '</div>' : '')) +
          '</div>' +
          (kontak.length
            ? '<div class="foot-tautan">' + kontak.map(function (t) {
                return '<a href="' + esc(t.href) + '"' +
                  (/^https?:/.test(t.href) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
                  ikon(t.ikon) + esc(t.label) + '</a>';
              }).join('') + '</div>'
            : '') +
        '</div>' +
        '<div class="foot-bawah">' +
          '<span>&copy; ' + tahun + ' ' + esc(s.nama || '') + '</span>' +
          tautanFooter.map(function (m) {
            return '<a href="' + esc(tautanMenu(m, halaman)) + '"' +
              (m.tabBaru ? ' target="_blank" rel="noopener noreferrer"' : '') +
              ' style="color:inherit">' + esc(m.label) + '</a>';
          }).join('') +
          (f.catatan ? '<span class="foot-catatan">' + esc(f.catatan) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</footer>';
  }

  /* ================================================================
     Seksi halaman depan

     Masing-masing mengembalikan '' bila isinya kosong. Itu yang membuat
     urutan seksi dari CMS bisa digambar begitu saja tanpa pemeriksaan
     tambahan: seksi tanpa isi menghilang sendiri, dan tidak meninggalkan
     ruang putih yang tidak bisa dijelaskan pemiliknya.
     ================================================================ */

  /**
   * seksiHero — bagian paling atas, dengan lima varian tata letak (PRD §9.2).
   *
   * Yang menentukan bentuknya hanya SATU kelas pada elemen <section>;
   * susunan HTML di dalamnya sama untuk kelima varian. Itu disengaja:
   * menggambar markup yang berbeda per varian berarti lima jalur kode yang
   * harus sama-sama benar, dan empat di antaranya jarang dilihat — jadi
   * yang rusak baru ketahuan setelah seseorang menggantinya.
   *
   * 'editorial' dan 'tengah' mengabaikan gambar sepenuhnya. Untuk
   * portofolio tulisan itu bukan kekurangan: hero bergambar memaksa
   * kalimat pembuka bersaing dengan foto, dan yang kalah selalu kalimatnya.
   */
  function seksiHero(d) {
    var h = d.hero || {};
    if (!h.judul && !h.teks) return '';

    var layout = h.layout || 'editorial';
    var pakaiGambar = !!h.fotoId && layout !== 'editorial';
    var hubungi = alamatHubungi(d, h.ctaLink);

    var kelas = ['hero', 'tata-' + layout];
    if (pakaiGambar) kelas.push('ada-gambar');
    if (pakaiGambar && layout === 'tumpuk' && h.latarGelap) kelas.push('latar-gelap');
    if (layout === 'kiri' || layout === 'kanan') kelas.push('gbr-' + (h.gambarLebar || 'sedang'));

    var teks =
      '<div class="hero-teks-kolom">' +
        (h.eyebrow ? '<span class="seksi-kata" id="t-hero-eyebrow">' + esc(h.eyebrow) + '</span>' : '') +
        '<h1><span id="t-hero-judul">' + esc(h.judul) + '</span>' +
          (h.subjudul ? '<span class="hero-sub" id="t-hero-subjudul">' + esc(h.subjudul) + '</span>' : '') +
        '</h1>' +
        (h.teks ? '<p class="hero-teks" id="t-hero-teks">' + esc(h.teks) + '</p>' : '') +
        (h.ctaLabel && hubungi
          ? '<div class="hero-aksi">' +
              '<a class="btn aksen" href="' + esc(hubungi) + '">' +
                '<span id="t-hero-ctaLabel">' + esc(h.ctaLabel) + '</span>' + ikon('panah') + '</a>' +
              '<a class="btn garis" href="#karya">Lihat karya</a>' +
            '</div>'
          : '<div class="hero-aksi"><a class="btn garis" href="#karya">Lihat karya' + ikon('panah') + '</a></div>') +
      '</div>';

    var gambar = pakaiGambar
      ? '<div class="hero-gambar">' + imgTag(h.fotoId, 'Gambar hero', 1280, 'eager') + '</div>'
      : '';

    // Pada layout 'tumpuk', gambar jadi latar sehingga ia harus digambar
    // LEBIH DULU di DOM — menumpuknya lewat z-index saja akan membuat
    // pembaca layar membacakan keterangan gambar sebelum judulnya.
    var isi = layout === 'tumpuk' ? gambar + teks : teks + gambar;

    return '<section class="' + kelas.join(' ') + '" id="hero">' +
      '<div class="wrap"><div class="hero-kisi">' + isi + '</div></div>' +
    '</section>';
  }

  function seksiTentang(d) {
    var t = d.tentang || {};
    var p = d.profil || {};
    if (!t.judul && !t.teks) return '';

    return '<section class="seksi" id="tentang"><div class="wrap">' +
      '<div class="kenal-kisi">' +
        (p.fotoId
          ? '<img class="kenal-foto" src="' + esc(gbr(p.fotoId, 400)) + '" ' +
            'alt="' + esc(p.nama || '') + '" width="190" height="190" loading="lazy" decoding="async">'
          : '<div class="kenal-foto"></div>') +
        '<div class="kenal-isi">' +
          (t.judul ? '<h2 id="t-tentang-judul">' + esc(t.judul) + '</h2>' : '') +
          (t.teks ? '<p id="t-tentang-teks">' + esc(t.teks) + '</p>' : '') +
          '<a class="kenal-tautan" href="about/">Selengkapnya tentang saya' + ikon('panah') + '</a>' +
        '</div>' +
      '</div>' +
    '</div></section>';
  }

  function seksiLayanan(d) {
    var l = d.layanan || {};
    var item = l.item || [];
    if (!item.length) return '';

    return '<section class="seksi berlatar" id="layanan"><div class="wrap">' +
      '<span class="seksi-kata">Layanan</span>' +
      (l.judul ? '<h2 class="seksi-judul" id="t-layanan-judul">' + esc(l.judul) + '</h2>' : '') +
      '<div style="height:28px"></div>' +
      '<div class="layanan-kisi">' +
        item.map(function (x, i) {
          return '<article class="layanan-kartu">' +
            '<span class="layanan-nomor">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
            '<h3>' + esc(x.judul) + '</h3>' +
            (x.deskripsi ? '<p>' + esc(x.deskripsi) + '</p>' : '') +
            (x.harga ? '<span class="layanan-harga">' + esc(x.harga) + '</span>' : '') +
          '</article>';
        }).join('') +
      '</div>' +
    '</div></section>';
  }

  function seksiStatistik(d) {
    var s = d.statistik || {};
    var item = s.item || [];
    if (!item.length) return '';

    return '<section class="seksi" id="statistik"><div class="wrap">' +
      '<span class="seksi-kata">Hasil</span>' +
      (s.judul ? '<h2 class="seksi-judul" id="t-statistik-judul">' + esc(s.judul) + '</h2>' : '') +
      '<div style="height:28px"></div>' +
      '<div class="statistik-kisi">' +
        item.map(function (x) {
          return '<div class="statistik-kartu">' +
            '<div class="statistik-angka">' + esc(x.angka) + '</div>' +
            '<div class="statistik-label">' + esc(x.label) + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div></section>';
  }

  function seksiTestimoni(d) {
    var t = d.testimoni || {};
    var item = (t.item || []).filter(function (x) { return x.kutipan; });
    if (!item.length) return '';

    return '<section class="seksi berlatar" id="testimoni"><div class="wrap">' +
      '<span class="seksi-kata">Testimoni</span>' +
      (t.judul ? '<h2 class="seksi-judul" id="t-testimoni-judul">' + esc(t.judul) + '</h2>' : '') +
      '<div style="height:28px"></div>' +
      '<div class="testimoni-kisi">' +
        item.map(function (x) {
          var orang = [x.nama, x.jabatan].filter(Boolean).join(', ');
          return '<figure class="testimoni-kartu">' +
            '<blockquote class="testimoni-kutip">' + esc(x.kutipan) + '</blockquote>' +
            (orang || x.perusahaan
              ? '<figcaption class="testimoni-orang">' +
                  (orang ? '<div class="testimoni-nama">' + esc(orang) + '</div>' : '') +
                  (x.perusahaan ? '<div class="testimoni-jabatan">' + esc(x.perusahaan) + '</div>' : '') +
                '</figcaption>'
              : '') +
          '</figure>';
        }).join('') +
      '</div>' +
    '</div></section>';
  }

  function seksiCta(d) {
    var c = d.cta || {};
    if (!c.judul && !c.teks) return '';
    var hubungi = alamatHubungi(d, c.link);

    return '<section class="seksi" id="hubungi"><div class="wrap">' +
      '<div class="cta-kotak">' +
        (c.judul ? '<h2 id="t-cta-judul">' + esc(c.judul) + '</h2>' : '') +
        (c.teks ? '<p id="t-cta-teks">' + esc(c.teks) + '</p>' : '') +
        (hubungi && c.label
          ? '<a class="btn" href="' + esc(hubungi) + '">' +
            '<span id="t-cta-label">' + esc(c.label) + '</span>' + ikon('panah') + '</a>'
          : '') +
      '</div>' +
    '</div></section>';
  }

  /* ================================================================
     Daftar karya
     ================================================================ */

  function imgTag(fileId, alt, lebar, muat) {
    if (!fileId) return '';
    return '<img src="' + esc(gbr(fileId, lebar)) + '" ' +
      'srcset="' + esc(srcsetGbr(fileId)) + '" ' +
      'sizes="(max-width: 540px) 92vw, (max-width: 820px) 150px, 230px" ' +
      'alt="' + esc(alt || '') + '" ' +
      'loading="' + (muat === 'eager' ? 'eager' : 'lazy') + '" decoding="async">';
  }

  function kartuKarya(d, k, halaman) {
    var ke = akar(halaman) + 'karya/' + k.slug + '/';

    var gambar = k.thumbId
      ? '<div class="karya-gbr">' + imgTag(k.thumbId, k.judul, 640) + '</div>'
      : '<div class="karya-gbr kosong">' + esc(namaKategori(d, k.kategori)) + '</div>';

    var tanda = [];
    if (k.hasil) tanda.push('<span class="karya-tanda hasil">' + ikon('grafik') + esc(k.hasil) + '</span>');
    if (k.jenisProyek) tanda.push('<span class="karya-tanda">' + esc(k.jenisProyek) + '</span>');
    if (k.kata) tanda.push('<span class="karya-tanda">' + esc(waktuBaca(k.kata)) + '</span>');
    if (k.link) tanda.push('<span class="karya-tanda">' + ikon('luar') + 'Tayang</span>');

    // data-cari memuat seluruh teks yang bisa dicari, sudah dikecilkan
    // hurufnya. Disiapkan saat membangun, bukan dihitung di browser:
    // mencari pada 40 kartu berarti membaca ulang teks tiap kartu di
    // setiap ketikan, dan atribut ini membuatnya satu kali saja.
    var cari = [k.judul, k.klien, k.jenisProyek, k.ringkasan, k.hasil, namaKategori(d, k.kategori)]
      .filter(Boolean).join(' ').toLowerCase();

    return '<a class="karya-baris" href="' + esc(ke) + '" data-karya="' + esc(k.id) + '"' +
      ' data-kategori="' + esc(k.kategori) + '" data-cari="' + esc(cari) + '">' +
      gambar +
      '<div class="karya-isi">' +
        (k.klien ? '<div class="karya-klien">' + esc(k.klien) + '</div>' : '') +
        '<div class="karya-judul">' + esc(k.judul) + '</div>' +
        (k.ringkasan ? '<p class="karya-ringkas">' + esc(k.ringkasan) + '</p>' : '') +
        (tanda.length ? '<div class="karya-meta">' + tanda.join('') + '</div>' : '') +
      '</div>' +
      '<span class="karya-panah">' + ikon('panah') + '</span>' +
    '</a>';
  }

  function namaKategori(d, slug) {
    var kat = (d.kategori || []).filter(function (k) { return k.slug === slug; })[0];
    return kat ? kat.nama : 'Karya';
  }

  /**
   * seksiKarya — portofolio, dikelompokkan per kategori.
   *
   * Dikelompokkan dan bukan satu daftar panjang karena itu yang dicari
   * pengunjungnya: orang yang butuh naskah email tidak sedang menilai
   * kemampuan menulis artikel. Kategori kosong dilewati, jadi
   * pengelompokan ini tidak pernah menampilkan judul tanpa isi.
   */
  function seksiKarya(d, halaman) {
    var karya = d.karya || [];
    if (!karya.length) {
      return '<section class="seksi" id="karya"><div class="wrap">' +
        '<div class="kosong"><h2>Portofolio sedang disusun</h2>' +
        '<p>Karyanya belum ditayangkan di sini. Hubungi langsung untuk melihat ' +
        'contoh tulisan yang relevan dengan proyek Anda.</p></div>' +
      '</div></section>';
    }

    var kisi = (d.situs || {}).tataKarya === 'kisi';
    var kelas = kisi ? 'karya-kisi' : 'karya-daftar';

    var perKat = {};
    karya.forEach(function (k) {
      (perKat[k.kategori] = perKat[k.kategori] || []).push(k);
    });

    var blok = (d.kategori || []).map(function (kat) {
      var isi = perKat[kat.slug];
      if (!isi || !isi.length) return '';
      return '<div class="kategori-blok">' +
        '<div class="kategori-head">' +
          '<h3><a href="' + esc(akar(halaman) + 'kategori/' + kat.slug + '/') + '" ' +
            'style="text-decoration:none">' + esc(kat.nama) + '</a></h3>' +
          '<span class="jumlah">' + isi.length + ' karya</span>' +
          (kat.deskripsi ? '<p class="ket">' + esc(kat.deskripsi) + '</p>' : '') +
        '</div>' +
        '<div class="' + kelas + '">' +
          isi.map(function (k) { return kartuKarya(d, k, halaman); }).join('') +
        '</div>' +
      '</div>';
    }).filter(Boolean).join('');

    // Penyaring hanya digambar bila memang ada yang bisa disaring. Dua
    // kategori atau kurang, atau karya yang sedikit, membuat deretan
    // keping penyaring jadi hiasan yang memakan ruang tanpa menghemat
    // gulungan siapa pun.
    var katBerisi = (d.kategori || []).filter(function (k) { return (perKat[k.slug] || []).length; });
    var perluSaring = katBerisi.length > 2 && karya.length >= 6;

    var saring = perluSaring
      ? '<div class="karya-saring" id="karya-saring">' +
          '<div class="saring-keping">' +
            '<button type="button" class="filter-chip on" data-saring="">Semua' +
              '<span class="n">' + karya.length + '</span></button>' +
            katBerisi.map(function (k) {
              return '<button type="button" class="filter-chip" data-saring="' + esc(k.slug) + '">' +
                esc(k.nama) + '<span class="n">' + (perKat[k.slug] || []).length + '</span></button>';
            }).join('') +
          '</div>' +
          '<label class="saring-cari">' +
            '<span class="sr">Cari karya</span>' +
            ikon('mata') +
            '<input type="search" id="karya-cari" placeholder="Cari judul, klien, atau kata kunci…" ' +
            'autocomplete="off">' +
          '</label>' +
        '</div>'
      : '';

    return '<section class="seksi" id="karya"><div class="wrap">' +
      '<span class="seksi-kata">Portofolio</span>' +
      '<h2 class="seksi-judul">Karya terpilih</h2>' +
      '<p class="seksi-teks">Setiap karya bisa dibaca utuh di sini. Yang sudah tayang ' +
        'juga punya tautan ke halaman aslinya.</p>' +
      saring +
      blok +
      // Keadaan kosong untuk hasil penyaringan. Selalu digambar, dan
      // disembunyikan sampai dibutuhkan — menyisipkannya lewat JavaScript
      // berarti ia muncul terlambat, setelah halaman sempat terlihat
      // benar-benar kosong.
      (perluSaring
        ? '<div class="kosong" id="karya-kosong" hidden><h2>Tidak ada yang cocok</h2><p></p></div>'
        : '') +
    '</div></section>';
  }

  /* ================================================================
     Seksi tambahan (PRD §10, §68)

     Enam bentuk, satu jalur penggambaran. Semua memakai pembungkus yang
     sama dan hanya berbeda isi dalamnya — itu yang membuat latar, jarak,
     dan aturan tampil-per-perangkat berlaku seragam tanpa diulang enam
     kali.
     ================================================================ */
  function seksiTambahan(d, halaman) {
    var daftar = d.seksi || [];
    if (!daftar.length) return '';
    return daftar.map(function (s) { return satuSeksi(d, s, halaman); }).join('');
  }

  function satuSeksi(d, s, halaman) {
    var isi = '';

    if (s.tipe === 'pemisah') {
      // Pemisah tidak punya isi dan tidak perlu pembungkus .wrap — ia
      // memang hanya ruang dan satu garis.
      return '<div class="seksi-pemisah jarak-' + esc(s.jarak) + ' di-' + esc(s.tampilDi) + '"' +
        (s.anchor ? ' id="' + esc(s.anchor) + '"' : '') + '><div class="wrap"><hr></div></div>';
    }

    var kepala =
      (s.eyebrow ? '<span class="seksi-kata">' + esc(s.eyebrow) + '</span>' : '') +
      (s.judul ? '<h2 class="seksi-judul">' + esc(s.judul) + '</h2>' : '');

    var tombol = (s.ctaLabel && s.ctaLink)
      ? '<div class="seksi-aksi"><a class="btn aksen" href="' + esc(s.ctaLink) + '"' +
        (/^https?:/i.test(s.ctaLink) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
        esc(s.ctaLabel) + ikon('panah') + '</a></div>'
      : '';

    if (s.tipe === 'teks') {
      // Isi sudah disanitasi server (lihat Sanitize.gs), sama seperti
      // naskah karya. Ditanam apa adanya.
      isi = kepala + (s.teks ? '<div class="seksi-isi">' + s.teks + '</div>' : '') + tombol;

    } else if (s.tipe === 'gambar') {
      var kolomTeks = '<div class="sg-teks">' + kepala +
        (s.teks ? '<div class="seksi-isi">' + s.teks + '</div>' : '') + tombol + '</div>';
      var kolomGbr = s.gambarId
        ? '<div class="sg-gambar">' +
          '<img src="' + esc(gbr(s.gambarId, 960)) + '" srcset="' + esc(srcsetGbr(s.gambarId)) + '" ' +
          'sizes="(max-width: 880px) 92vw, 46vw" alt="' + esc(s.judul || '') + '" ' +
          'loading="lazy" decoding="async"></div>'
        : '';
      isi = '<div class="seksi-gambar-kisi' + (s.gambarKanan ? '' : ' balik') + '">' +
        (s.gambarKanan ? kolomTeks + kolomGbr : kolomGbr + kolomTeks) + '</div>';

    } else if (s.tipe === 'poin') {
      var poin = (s.poin || []).filter(function (p) { return p.judul || p.teks; });
      if (!poin.length) return '';
      isi = kepala +
        '<div class="poin-kisi">' +
          poin.map(function (p, i) {
            return '<div class="poin-kartu">' +
              '<span class="poin-nomor">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
              (p.judul ? '<h3>' + esc(p.judul) + '</h3>' : '') +
              (p.teks ? '<p>' + esc(p.teks) + '</p>' : '') +
            '</div>';
          }).join('') +
        '</div>' + tombol;

    } else if (s.tipe === 'kutipan') {
      if (!s.teks) return '';
      isi = '<blockquote class="seksi-kutipan">' + s.teks + '</blockquote>';

    } else if (s.tipe === 'ajakan') {
      isi = '<div class="cta-kotak">' +
        (s.judul ? '<h2>' + esc(s.judul) + '</h2>' : '') +
        (s.teks ? '<div class="seksi-isi">' + s.teks + '</div>' : '') +
        (s.ctaLabel && s.ctaLink
          ? '<a class="btn" href="' + esc(s.ctaLink) + '"' +
            (/^https?:/i.test(s.ctaLink) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
            esc(s.ctaLabel) + ikon('panah') + '</a>'
          : '') +
      '</div>';
    }

    if (!isi) return '';

    return '<section class="seksi latar-' + esc(s.latar) + ' jarak-' + esc(s.jarak) +
      ' di-' + esc(s.tampilDi) + ' seksi-' + esc(s.tipe) + '"' +
      (s.anchor ? ' id="' + esc(s.anchor) + '"' : '') + '>' +
      '<div class="wrap">' + isi + '</div></section>';
  }

  /* ================================================================
     Form kontak (PRD §26, §56)
     ================================================================ */
  function seksiForm(d) {
    var f = d.form || {};
    if (!f.aktif || !f.aksi) return '';

    return '<section class="seksi berlatar" id="kontak"><div class="wrap">' +
      '<div class="form-kotak">' +
        '<div class="form-kepala">' +
          '<span class="seksi-kata">Hubungi</span>' +
          (f.judul ? '<h2 class="seksi-judul" id="t-form-judul">' + esc(f.judul) + '</h2>' : '') +
          (f.teks ? '<p class="seksi-teks" id="t-form-teks" style="margin-bottom:0">' +
            esc(f.teks) + '</p>' : '') +
        '</div>' +

        '<form class="form-kontak" id="form-kontak" data-aksi="' + esc(f.aksi) + '" novalidate>' +
          '<div class="fk-baris">' +
            '<label class="fk-field"><span>Nama <i>*</i></span>' +
              '<input name="nama" required maxlength="80" autocomplete="name"></label>' +
            '<label class="fk-field"><span>Email <i>*</i></span>' +
              '<input name="email" type="email" required maxlength="120" autocomplete="email"></label>' +
          '</div>' +
          '<div class="fk-baris">' +
            '<label class="fk-field"><span>Telepon</span>' +
              '<input name="telepon" maxlength="40" autocomplete="tel"></label>' +
            '<label class="fk-field"><span>Subjek</span>' +
              '<input name="subjek" maxlength="140" placeholder="mis. Butuh naskah halaman penjualan"></label>' +
          '</div>' +
          '<label class="fk-field"><span>Pesan <i>*</i></span>' +
            '<textarea name="pesan" rows="5" required maxlength="4000" ' +
            'placeholder="Ceritakan apa yang sedang Anda bangun, dan kapan Anda membutuhkannya."></textarea></label>' +

          // Jebakan robot. Disembunyikan dari mata DAN dari pembaca layar
          // (aria-hidden + tabindex -1), jadi tidak ada manusia yang
          // mungkin mengisinya secara tidak sengaja.
          '<div class="fk-jebakan" aria-hidden="true">' +
            '<label>Jangan isi kolom ini' +
            '<input name="website" tabindex="-1" autocomplete="off"></label>' +
          '</div>' +

          '<div class="fk-kaki">' +
            '<button class="btn aksen" type="submit" id="fk-kirim">' +
              '<span class="fk-label">' + esc(f.tombol || 'Kirim') + '</span>' + ikon('panah') + '</button>' +
            '<p class="fk-pesan" id="fk-pesan" role="status" aria-live="polite"></p>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div></section>';
  }

  /* ================================================================
     Pita cookie (PRD §70)

     Digambar SELALU, disembunyikan lewat atribut hidden, dan baru
     ditampilkan app.js setelah memeriksa localStorage. Kebalikannya —
     menyisipkannya lewat JavaScript — membuat pitanya muncul terlambat
     dan menggeser halaman yang sudah dibaca orang.
     ================================================================ */
  function pitaCookie(d) {
    var c = d.cookie || {};
    if (!c.aktif) return '';
    return '<div class="pita-cookie" id="pita-cookie" hidden role="region" aria-label="Pemberitahuan cookie">' +
      '<p>' + esc(c.teks) + '</p>' +
      '<button type="button" class="btn kecil" id="cookie-ok">' + esc(c.tombol || 'Mengerti') + '</button>' +
    '</div>';
  }

  /* ================================================================
     Halaman lengkap

     Masing-masing mengembalikan isi <body> — bukan dokumen utuh. Yang
     membungkusnya jadi dokumen adalah build.mjs (untuk berkas statis)
     atau app.js (untuk pratinjau).
     ================================================================ */

  function beranda(d) {
    var urut = ((d.situs || {}).seksi || ['hero', 'tentang', 'layanan', 'karya', 'statistik', 'testimoni', 'cta']);
    var peta = {
      hero: seksiHero, tentang: seksiTentang, layanan: seksiLayanan,
      karya: function (x) { return seksiKarya(x, 'beranda'); },
      statistik: seksiStatistik, testimoni: seksiTestimoni, cta: seksiCta
    };

    return header(d, 'beranda') +
      '<main id="isi">' +
        urut.map(function (key) {
          var f = peta[key];
          return f ? f(d) : '';
        }).join('') +
        // Seksi tambahan digambar SETELAH seksi bawaan, bukan diselipkan
        // di antaranya. Menggabungkan keduanya ke satu daftar urutan
        // terdengar lebih luwes, tapi berarti menghapus sebuah seksi
        // tambahan diam-diam mengubah urutan seksi bawaan juga.
        seksiTambahan(d, 'beranda') +
        seksiForm(d) +
      '</main>' +
      footer(d, 'beranda') +
      pitaCookie(d);
  }

  /**
   * halamanMaintenance — satu halaman untuk seluruh situs (PRD §32).
   *
   * Tanpa header, tanpa navigasi, tanpa footer. Mode perbaikan yang masih
   * menampilkan menu lengkap mengundang orang mengkliknya lalu menemukan
   * halaman yang juga ditutup — lebih membingungkan daripada satu layar
   * yang jelas.
   */
  function halamanMaintenance(d) {
    var m = d.maintenance || {};
    var s = d.situs || {};
    return '<main id="isi" class="maintenance"><div class="wrap">' +
      '<div class="mt-kotak">' +
        '<span class="monogram besar">' + esc(s.inisial || inisial(s.nama)) + '</span>' +
        '<h1>' + esc(m.judul || 'Sedang diperbarui') + '</h1>' +
        '<p>' + esc(m.teks || '') + '</p>' +
        (d.kontak && d.kontak.email
          ? '<a class="btn aksen" href="mailto:' + esc(d.kontak.email) + '">' +
            ikon('surat') + 'Hubungi lewat email</a>'
          : '') +
      '</div>' +
    '</div></main>';
  }

  /**
   * halamanKarya — halaman detail satu karya.
   *
   * karya: objek dari ?api=karya, LENGKAP dengan field .isi (HTML naskah).
   * tetangga: { sebelum, sesudah } — dihitung pemanggil dari daftar.
   */
  function halamanKarya(d, karya, tetangga) {
    var k = karya || {};
    var t = tetangga || {};
    var hal = 'karya:' + k.slug;
    var kat = (d.kategori || []).filter(function (x) { return x.slug === k.kategori; })[0];

    var tanda = [];
    if (k.hasil) tanda.push('<span class="karya-tanda hasil">' + ikon('grafik') + esc(k.hasil) + '</span>');
    if (k.peran) tanda.push('<span class="karya-tanda">' + esc(k.peran) + '</span>');
    if (k.tanggal) tanda.push('<span class="karya-tanda">' + esc(tglTeks(k.tanggal)) + '</span>');
    if (k.kata) tanda.push('<span class="karya-tanda">' + esc(waktuBaca(k.kata)) + '</span>');

    return header(d, hal) +
      '<main id="isi">' +
        '<article class="karya-atas"><div class="wrap">' +

          '<nav class="jejak" aria-label="Jejak navigasi">' +
            '<a href="' + esc(akar(hal)) + '">Beranda</a>' + ikon('pisah') +
            (kat ? '<a href="' + esc(akar(hal) + 'kategori/' + kat.slug + '/') + '">' +
              esc(kat.nama) + '</a>' + ikon('pisah') : '') +
            '<span>' + esc(k.judul) + '</span>' +
          '</nav>' +

          '<div class="karya-tajuk">' +
            (k.klien ? '<div class="karya-klien">' + esc(k.klien) +
              (k.jenisProyek ? ' &middot; ' + esc(k.jenisProyek) : '') + '</div>' : '') +
            '<h1>' + esc(k.judul) + '</h1>' +
          '</div>' +
          (k.ringkasan ? '<p class="karya-tajuk-ket">' + esc(k.ringkasan) + '</p>' : '') +
          (tanda.length ? '<div class="karya-tajuk-meta">' + tanda.join('') + '</div>' : '') +

          (k.link
            ? '<div class="karya-tajuk-aksi">' +
                '<a class="btn aksen" href="' + esc(k.link) + '" target="_blank" rel="noopener noreferrer">' +
                  'Lihat versi tayang' + ikon('luar') + '</a>' +
              '</div>'
            : '') +

          (k.thumbId
            ? '<div class="karya-gbr-besar">' +
                '<img src="' + esc(gbr(k.thumbId, 1280)) + '" srcset="' + esc(srcsetGbr(k.thumbId)) + '" ' +
                'sizes="(max-width: 1140px) 100vw, 1090px" alt="' + esc(k.judul) + '" ' +
                'loading="eager" decoding="async">' +
              '</div>'
            : '') +

          // ---- Naskah ----
          // Ditanam TANPA escape, dan itu satu-satunya tempat di berkas ini
          // yang melakukannya. Isinya sudah melewati sanitasiHtml() di server
          // sebelum disimpan (lihat Sanitize.gs): hanya tag dari daftar izin
          // yang bertahan, dan setiap href sudah diperiksa skemanya.
          (k.isi
            ? '<div class="naskah">' + k.isi + '</div>'
            : '<div class="naskah-kosong">Naskah karya ini belum ditayangkan.' +
              (k.link ? ' Versi tayangnya bisa dibuka lewat tombol di atas.' : '') + '</div>') +

          (t.sebelum || t.sesudah
            ? '<nav class="karya-nav" aria-label="Karya lain">' +
                (t.sebelum
                  ? '<a href="' + esc(akar(hal) + 'karya/' + t.sebelum.slug + '/') + '">' +
                      '<span class="arah">Sebelumnya</span>' +
                      '<span class="judul">' + esc(t.sebelum.judul) + '</span></a>'
                  : '<span></span>') +
                (t.sesudah
                  ? '<a class="kanan" href="' + esc(akar(hal) + 'karya/' + t.sesudah.slug + '/') + '">' +
                      '<span class="arah">Berikutnya</span>' +
                      '<span class="judul">' + esc(t.sesudah.judul) + '</span></a>'
                  : '<span></span>')
              + '</nav>'
            : '') +

        '</div></article>' +
      '</main>' +
      footer(d, hal) +
      pitaCookie(d);
  }

  function halamanKategori(d, kat) {
    var hal = 'kategori:' + kat.slug;
    var isi = (d.karya || []).filter(function (k) { return k.kategori === kat.slug; });
    var kisi = (d.situs || {}).tataKarya === 'kisi';

    return header(d, hal) +
      '<main id="isi">' +
        '<section class="kategori-atas"><div class="wrap">' +
          '<nav class="jejak" aria-label="Jejak navigasi">' +
            '<a href="' + esc(akar(hal)) + '">Beranda</a>' + ikon('pisah') +
            '<span>' + esc(kat.nama) + '</span>' +
          '</nav>' +
          '<span class="seksi-kata">' + isi.length + ' karya</span>' +
          '<h1>' + esc(kat.nama) + '</h1>' +
          (kat.deskripsi ? '<p class="ket">' + esc(kat.deskripsi) + '</p>' : '') +
        '</div></section>' +

        '<section class="seksi"><div class="wrap">' +
          (isi.length
            ? '<div class="' + (kisi ? 'karya-kisi' : 'karya-daftar') + '">' +
                isi.map(function (k) { return kartuKarya(d, k, hal); }).join('') +
              '</div>'
            : '<div class="kosong"><h2>Belum ada karya di kategori ini</h2>' +
              '<p>Kategorinya sudah disiapkan, isinya menyusul.</p>' +
              '<a class="btn garis" href="' + esc(akar(hal)) + '">Kembali ke beranda</a></div>') +
        '</div></section>' +
        seksiCta(d) +
        seksiForm(d) +
      '</main>' +
      footer(d, hal) +
      pitaCookie(d);
  }

  function halamanAbout(d) {
    var p = d.profil || {};
    var kontak = tautanKontak(d.kontak);

    return header(d, 'about') +
      '<main id="isi">' +
        // Tanpa foto, kolom kirinya tidak dipesan sama sekali. Sebuah kolom
        // kosong selebar 300px membuat tulisannya terdorong ke kanan tanpa
        // alasan yang terlihat — persis seperti halaman yang gambarnya gagal
        // dimuat, padahal memang tidak ada gambar yang diisi.
        '<div class="wrap"><div class="about-kisi' + (p.fotoId ? '' : ' tanpa-foto') + '">' +
          (p.fotoId
            ? '<div class="about-foto">' +
                '<img src="' + esc(gbr(p.fotoId, 640)) + '" srcset="' + esc(srcsetGbr(p.fotoId)) + '" ' +
                'sizes="(max-width: 880px) 220px, 300px" alt="' + esc(p.nama || '') + '" ' +
                'loading="eager" decoding="async">' +
              '</div>'
            : '') +
          '<div class="about-isi">' +
            '<h1>' + esc(p.nama || (d.situs || {}).nama || '') + '</h1>' +
            (p.peran ? '<div class="about-peran">' + esc(p.peran) + '</div>' : '') +
            // Bio: sudah tersanitasi di server, sama seperti naskah karya.
            (p.bio
              ? '<div class="naskah">' + p.bio + '</div>'
              : '<div class="naskah"><p>Halaman ini belum diisi.</p></div>') +
            (kontak.length
              ? '<div class="foot-tautan" style="margin-top:36px">' +
                  kontak.map(function (t) {
                    return '<a href="' + esc(t.href) + '"' +
                      (/^https?:/.test(t.href) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
                      ikon(t.ikon) + esc(t.label) + '</a>';
                  }).join('') +
                '</div>'
              : '') +
          '</div>' +
        '</div></div>' +
        seksiCta(d) +
        seksiForm(d) +
      '</main>' +
      footer(d, 'about') +
      pitaCookie(d);
  }

  function halaman404(d) {
    return header(d, '404') +
      '<main id="isi"><div class="wrap">' +
        '<div class="kosong" style="padding:140px 24px">' +
          '<h2>Halaman ini tidak ada</h2>' +
          '<p>Mungkin alamatnya salah ketik, atau karyanya sudah tidak ditayangkan lagi.</p>' +
          '<a class="btn" href="' + esc(akar('404')) + '">Kembali ke beranda' + ikon('panah') + '</a>' +
        '</div>' +
      '</div></main>' +
      footer(d, '404') +
      pitaCookie(d);
  }

  /* ================================================================
     Kepala dokumen & tema
     ================================================================ */

  /**
   * temaAtribut — atribut untuk tag <html>.
   *
   * Tema dan warna aksen ditulis sebagai atribut pada <html>, bukan
   * disuntikkan JavaScript setelah halaman dimuat. Bedanya terlihat:
   * yang kedua membuat situs berkedip putih sesaat sebelum berubah
   * gelap, pada setiap kunjungan.
   */
  function temaAtribut(d) {
    var s = d.situs || {};
    var tema = s.tema === 'gelap' ? 'gelap' : 'terang';
    return ' lang="id" data-tema="' + tema + '"';
  }

  /**
   * gayaToken — token desain jadi variabel CSS (PRD §23, §62).
   *
   * Ditulis sebagai blok <style> di <head>, bukan sebagai atribut style
   * pada <html> seperti sebelumnya. Dua alasan:
   *
   *   1. jumlahnya sekarang bukan satu lagi melainkan tujuh, dan atribut
   *      style sepanjang itu sulit dibaca saat memeriksa sumber halaman;
   *   2. ia harus bisa memuat @media — ukuran huruf judul pada skala
   *      115% perlu diturunkan lagi di layar sempit, dan atribut style
   *      tidak bisa memuat aturan bersyarat.
   *
   * Nilainya datang sudah jadi dari server (lihat nilaiPilihan di
   * Helpers.gs), jadi tabel pilihannya hanya ada di satu tempat.
   */
  function gayaToken(d) {
    var s = d.situs || {};
    var aksen = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.aksen || '') ? s.aksen : '#A8664A';
    var h = s.huruf || {};
    var lebar = (s.lebar || {}).nilai || '1140px';
    var sudut = s.sudut || {};
    var skala = Math.max(90, Math.min(115, Number(s.skala) || 100));

    var baris = [
      '--aksen:' + aksen,
      '--lebar:' + lebar,
      '--r:' + (sudut.r || '10px'),
      '--r-besar:' + (sudut.rb || '16px'),
      '--r-tombol:' + (sudut.tombol || '100px'),
      '--skala:' + (skala / 100)
    ];
    if (h.judul) baris.push("--serif:'" + h.judul + "', Georgia, serif");
    if (h.badan) baris.push("--sans:'" + h.badan + "', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");

    return '<style>:root{' + baris.join(';') + '}</style>';
  }

  /**
   * skripIntegrasi — pemanggilan GA / GTM / Pixel (PRD §47).
   *
   * Dibentuk dari ID, bukan dari potongan skrip yang ditempel orang.
   * Bedanya penting: bentuk yang ditulis di sini adalah bentuk yang kita
   * pahami dan bisa diperiksa, bukan kode pihak ketiga yang panjangnya
   * tidak terbatas dan isinya berubah dari waktu ke waktu.
   *
   * GTM diutamakan bila keduanya diisi — memuat GA langsung DAN lewat GTM
   * menghasilkan setiap kunjungan terhitung dua kali, kesalahan yang
   * sangat umum dan sangat sulit disadari dari angkanya saja.
   */
  function skripIntegrasi(d) {
    var i = d.integrasi || {};
    var out = [];

    if (i.gtm && /^GTM-[A-Z0-9]+$/i.test(i.gtm)) {
      out.push(
        '<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),' +
        'event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?' +
        '"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;' +
        'f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","' + i.gtm + '");<\/script>'
      );
    } else if (i.ga && /^G-[A-Z0-9]+$/i.test(i.ga)) {
      out.push(
        '<script async src="https://www.googletagmanager.com/gtag/js?id=' + i.ga + '"><\/script>' +
        '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}' +
        'gtag("js",new Date());gtag("config","' + i.ga + '");<\/script>'
      );
    }

    if (i.pixel && /^\d+$/.test(i.pixel)) {
      out.push(
        '<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?' +
        'n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;' +
        'n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;' +
        't.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,' +
        '"script","https://connect.facebook.net/en_US/fbevents.js");' +
        'fbq("init","' + i.pixel + '");fbq("track","PageView");<\/script>'
      );
    }

    return out.join('\n  ');
  }

  /**
   * metaKepala — judul, deskripsi, dan tag Open Graph.
   *
   * Inilah alasan utama situs ini di-prerender dan bukan digambar
   * JavaScript: WhatsApp, LinkedIn, dan Twitter tidak menjalankan skrip
   * saat membuat pratinjau tautan. Tanpa tag-tag ini tertulis di HTML,
   * setiap tautan karya yang dibagikan akan menampilkan judul yang sama.
   */
  function metaKepala(d, opt) {
    var s = d.situs || {};
    var o = opt || {};
    var situsNama = s.nama || 'Portofolio';
    var judul = o.judul ? (o.judul + ' — ' + situsNama) : (situsNama + (s.tagline ? ' — ' + s.tagline : ''));
    var desk = o.deskripsi || s.deskripsi || '';
    var dasar = String(s.url || '').replace(/\/+$/, '');

    // Canonical: yang ditulis sendiri menang atas yang diturunkan. Diisi
    // hanya saat tulisan yang sama juga tayang di tempat lain dan tempat
    // itu yang ingin dihitung mesin pencari — kasus nyata untuk
    // copywriter, yang naskahnya sering juga dimuat di situs klien.
    var kanonik = o.canonical || (dasar ? dasar + (o.jalur || '/') : '');

    // Robots: per halaman menimpa global. Nilai global sendiri sudah
    // dibatasi ke empat kombinasi yang sah di server.
    var robots = o.robots || (d.seo && d.seo.robots) || '';

    var gambar = o.gambarId ? gbr(o.gambarId, 1200)
      : ((d.seo && d.seo.gambarId) ? gbr(d.seo.gambarId, 1200)
        : (d.hero && d.hero.fotoId ? gbr(d.hero.fotoId, 1200) : ''));

    var out = [
      '<title>' + esc(judul) + '</title>',
      desk ? '<meta name="description" content="' + esc(desk) + '">' : '',
      kanonik ? '<link rel="canonical" href="' + esc(kanonik) + '">' : '',
      robots && robots !== 'index,follow' ? '<meta name="robots" content="' + esc(robots) + '">' : '',
      (d.integrasi && d.integrasi.verifGoogle)
        ? '<meta name="google-site-verification" content="' + esc(d.integrasi.verifGoogle) + '">' : '',

      '<meta property="og:type" content="' + (o.artikel ? 'article' : 'website') + '">',
      '<meta property="og:title" content="' + esc(o.judul || situsNama) + '">',
      '<meta property="og:site_name" content="' + esc(situsNama) + '">',
      '<meta property="og:locale" content="id_ID">',
      desk ? '<meta property="og:description" content="' + esc(desk) + '">' : '',
      kanonik ? '<meta property="og:url" content="' + esc(kanonik) + '">' : '',
      gambar ? '<meta property="og:image" content="' + esc(gambar) + '">' : '',
      gambar ? '<meta property="og:image:alt" content="' + esc(o.judul || situsNama) + '">' : '',

      '<meta name="twitter:card" content="' + (gambar ? 'summary_large_image' : 'summary') + '">',
      '<meta name="twitter:title" content="' + esc(o.judul || situsNama) + '">',
      desk ? '<meta name="twitter:description" content="' + esc(desk) + '">' : '',
      gambar ? '<meta name="twitter:image" content="' + esc(gambar) + '">' : ''
    ];
    return out.filter(Boolean).join('\n  ');
  }

  /**
   * dataTerstruktur — JSON-LD untuk mesin pencari.
   *
   * Membuat Google bisa mengenali halaman karya sebagai tulisan dengan
   * penulis dan tanggalnya, bukan sebagai halaman biasa. Untuk seorang
   * copywriter itu bukan hiasan: nama penulis yang terbaca mesin pencari
   * adalah separuh gunanya memiliki portofolio yang terindeks.
   */
  function dataTerstruktur(d, opt) {
    var s = d.situs || {};
    var p = d.profil || {};
    var o = opt || {};
    var dasar = String(s.url || '').replace(/\/+$/, '');
    var nama = p.nama || s.nama || '';

    var orang = {
      '@type': 'Person',
      name: nama,
      jobTitle: p.peran || s.tagline || undefined,
      url: dasar || undefined,
      image: p.fotoId ? gbr(p.fotoId, 640) : undefined
    };

    var isi;
    if (o.karya) {
      var k = o.karya;
      isi = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: k.judul,
        description: k.ringkasan || undefined,
        datePublished: /^\d{4}-\d{2}-\d{2}/.test(k.tanggal || '') ? k.tanggal : undefined,
        author: orang,
        publisher: orang,
        image: k.thumbId ? gbr(k.thumbId, 1200) : undefined,
        mainEntityOfPage: dasar ? dasar + '/karya/' + k.slug + '/' : undefined,
        wordCount: k.kata || undefined,
        about: o.kategoriNama || undefined
      };
    } else {
      isi = {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        mainEntity: orang,
        name: s.nama,
        description: s.deskripsi || undefined
      };
    }

    return '<script type="application/ld+json">' +
      JSON.stringify(isi).replace(/</g, '\\u003c') + '<\/script>';
  }

  /* ================================================================
     Ekspor
     ================================================================ */
  var Render = {
    esc: esc, gbr: gbr, srcsetGbr: srcsetGbr, ikon: ikon,
    inisial: inisial, tglTeks: tglTeks, waktuBaca: waktuBaca,
    tautanKontak: tautanKontak, alamatHubungi: alamatHubungi, namaKategori: namaKategori,
    header: header, footer: footer, akar: akar,
    seksiHero: seksiHero, seksiTentang: seksiTentang, seksiLayanan: seksiLayanan,
    seksiKarya: seksiKarya, seksiStatistik: seksiStatistik,
    seksiTestimoni: seksiTestimoni, seksiCta: seksiCta,
    seksiTambahan: seksiTambahan, seksiForm: seksiForm, pitaCookie: pitaCookie,
    kartuKarya: kartuKarya, tautanMenu: tautanMenu,
    beranda: beranda, halamanKarya: halamanKarya, halamanKategori: halamanKategori,
    halamanAbout: halamanAbout, halaman404: halaman404,
    halamanMaintenance: halamanMaintenance,
    temaAtribut: temaAtribut, gayaToken: gayaToken,
    metaKepala: metaKepala, dataTerstruktur: dataTerstruktur,
    skripIntegrasi: skripIntegrasi
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Render;
  else glob.Render = Render;

})(typeof globalThis !== 'undefined' ? globalThis : this);
