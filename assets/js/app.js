/* ==================================================================
   app.js — Skrip browser
   ------------------------------------------------------------------
   Punya dua wajah, dan perbedaan ukurannya disengaja:

   PENGUNJUNG BIASA. Isi halaman sudah ada di HTML-nya — digambar saat
   situs dibangun, bukan saat dibuka. Jadi yang dikerjakan berkas ini
   hanya tiga hal kecil: tombol menu di layar sempit, garis bawah
   header saat digulung, dan penanda menu yang sedang aktif. Situs ini
   tetap utuh dan terbaca walau JavaScript dimatikan sama sekali.

   MODE PRATINJAU (?pratinjau=1). Dibuka hanya dari dalam CMS. Di sini
   halaman MENGABAIKAN HTML statisnya, mengambil data langsung dari
   API, dan menggambar ulang dirinya memakai render.js — penggambar
   yang sama persis dengan yang dipakai saat membangun. Lalu ia
   mendengarkan CMS lewat postMessage, sehingga kalimat yang sedang
   diketik dan karya yang sedang diseret terlihat seketika.

   Pemisahan itu yang membuat alur kerjanya tidak terasa seperti
   menunggu: menulis dinilai di pratinjau yang selalu segar, dan
   pengunjung menerima berkas statis yang cepat dan terbaca mesin
   pencari.
   ================================================================== */
(function () {
  'use strict';

  var CFG = window.PORTOFOLIO_CONFIG || {};
  var PRATINJAU = /[?&]pratinjau=1/.test(location.search);

  /* ================================================================
     Bagian yang berjalan untuk semua orang
     ================================================================ */

  function pasangHeader() {
    var head = document.getElementById('situs-head');
    if (!head) return;

    var pernah = -1;
    var cek = function () {
      var lewat = window.scrollY > 8;
      if (lewat === pernah) return;      // hindari menyentuh DOM 60x/detik
      pernah = lewat;
      head.classList.toggle('gulung', lewat);
    };
    cek();
    window.addEventListener('scroll', cek, { passive: true });
  }

  function pasangNav() {
    var tombol = document.getElementById('nav-tombol');
    var nav = document.getElementById('nav');
    if (!tombol || !nav) return;

    var tutup = function () {
      nav.classList.remove('buka');
      tombol.setAttribute('aria-expanded', 'false');
      tombol.setAttribute('aria-label', 'Buka menu');
    };

    tombol.addEventListener('click', function () {
      var buka = !nav.classList.contains('buka');
      nav.classList.toggle('buka', buka);
      tombol.setAttribute('aria-expanded', buka ? 'true' : 'false');
      tombol.setAttribute('aria-label', buka ? 'Tutup menu' : 'Buka menu');
    });

    // Menu ditutup setelah salah satu tautannya dipilih. Pada tautan
    // jangkar (#karya) halamannya tidak berpindah, jadi tanpa ini menu
    // tetap menutupi bagian yang baru saja dituju.
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) tutup();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') tutup();
    });
  }

  /**
   * pasangSorotSeksi — tandai menu yang seksinya sedang terlihat.
   *
   * Hanya untuk tautan jangkar di beranda. Memakai IntersectionObserver,
   * bukan menghitung posisi di setiap kejadian gulung: yang kedua
   * memaksa browser mengukur ulang tata letak puluhan kali per detik,
   * dan itu terasa di ponsel.
   */
  function pasangSorotSeksi() {
    if (!window.IntersectionObserver) return;
    var jangkar = [].slice.call(document.querySelectorAll('#nav a[href^="#"], #nav a[href*="/#"]'));
    if (!jangkar.length) return;

    var peta = {};
    jangkar.forEach(function (a) {
      var id = (a.getAttribute('href') || '').split('#')[1];
      if (id) peta[id] = a;
    });

    var pengamat = new IntersectionObserver(function (entri) {
      entri.forEach(function (x) {
        var a = peta[x.target.id];
        if (!a) return;
        if (x.isIntersecting) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Object.keys(peta).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) pengamat.observe(s);
    });
  }

  /* ================================================================
     Form kontak (PRD §26, §56)
     ================================================================ */
  function pasangForm() {
    var form = document.getElementById('form-kontak');
    if (!form) return;

    var aksi = form.dataset.aksi;
    var tombol = document.getElementById('fk-kirim');
    var pesanEl = document.getElementById('fk-pesan');
    var terkirim = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (terkirim) return;

      // Validasi di browser dulu, supaya galat yang jelas tidak perlu
      // menunggu perjalanan ke server. Server tetap memeriksa semuanya
      // lagi — pemeriksaan di sini soal kenyamanan, bukan keamanan.
      var data = {};
      ['nama', 'email', 'telepon', 'subjek', 'pesan', 'website'].forEach(function (k) {
        var n = form.elements[k];
        if (n) data[k] = String(n.value || '').trim();
      });
      data.aksi = 'pesan';
      data.asal = location.pathname;

      if (!data.nama) return gagal('Isi nama Anda dulu.', 'nama');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
        return gagal('Alamat email sepertinya belum benar.', 'email');
      }
      if (data.pesan.length < 10) return gagal('Tulis pesannya sedikit lebih panjang.', 'pesan');

      sibuk(true);
      kabar('', '');

      // Dikirim sebagai text/plain, bukan application/json. Itu yang
      // membuatnya tergolong "permintaan sederhana" sehingga browser
      // tidak mengirim preflight OPTIONS lebih dulu — dan Apps Script
      // tidak bisa menjawab preflight, karena ia tidak mengizinkan kita
      // menulis header balasan sendiri. Isinya tetap JSON; doPost
      // membacanya dari postData.contents.
      fetch(aksi, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
        redirect: 'follow'
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          sibuk(false);
          if (res && res.ok) {
            terkirim = true;
            form.reset();
            kabar(res.pesan || 'Terima kasih, pesan Anda sudah masuk.', 'ok');
            // Tombol dimatikan setelah berhasil. Menekan dua kali karena
            // ragu apakah terkirim adalah hal yang sangat wajar, dan
            // hasilnya dua pesan identik di kotak masuk.
            if (tombol) {
              tombol.disabled = true;
              var lbl = tombol.querySelector('.fk-label');
              if (lbl) lbl.textContent = 'Terkirim';
            }
          } else {
            kabar((res && res.error) || 'Pesan gagal dikirim. Coba lagi sebentar lagi.', 'err');
          }
        })
        .catch(function () {
          sibuk(false);
          kabar('Pesan gagal dikirim — sambungan bermasalah. Coba lagi, atau kirim email langsung.', 'err');
        });

      function gagal(teks, fokus) {
        kabar(teks, 'err');
        var n = form.elements[fokus];
        if (n) n.focus();
        return false;
      }
    });

    function sibuk(on) {
      if (!tombol) return;
      tombol.disabled = on;
      var lbl = tombol.querySelector('.fk-label');
      if (lbl) {
        if (on) { lbl.dataset.asli = lbl.textContent; lbl.textContent = 'Mengirim…'; }
        else if (lbl.dataset.asli) lbl.textContent = lbl.dataset.asli;
      }
    }

    function kabar(teks, jenis) {
      if (!pesanEl) return;
      pesanEl.textContent = teks;
      pesanEl.className = 'fk-pesan' + (jenis ? ' ' + jenis : '');
    }
  }

  /* ================================================================
     Pita cookie (PRD §70)

     Keputusannya disimpan di localStorage, bukan di cookie. Sedikit
     ironis, tapi benar: localStorage tidak dikirim ke server mana pun,
     jadi menyimpan "sudah setuju" di sana justru tidak menambah satu pun
     penanda yang perlu disetujui.
     ================================================================ */
  var KUNCI_COOKIE = 'cookie_ok_v1';

  function pasangCookie() {
    var pita = document.getElementById('pita-cookie');
    if (!pita) return;

    var sudah = false;
    try { sudah = localStorage.getItem(KUNCI_COOKIE) === '1'; } catch (e) {}
    if (sudah) return;

    pita.hidden = false;
    var ok = document.getElementById('cookie-ok');
    if (ok) ok.addEventListener('click', function () {
      pita.hidden = true;
      try { localStorage.setItem(KUNCI_COOKIE, '1'); } catch (e) {}
    });
  }

  /* ================================================================
     Penyaring & pencarian karya (PRD §67, §74)

     Dikerjakan SEPENUHNYA di browser, pada kartu yang sudah ada di
     halaman. Tidak ada permintaan jaringan, tidak ada halaman yang
     dimuat ulang — dan yang terpenting, halaman tetap utuh dan terbaca
     mesin pencari tanpa JavaScript, karena seluruh kartunya sudah ada
     di HTML sejak awal. Penyaring hanya menyembunyikan sebagian.
     ================================================================ */
  function pasangSaring() {
    var kotak = document.getElementById('karya-saring');
    if (!kotak) return;

    var cari = document.getElementById('karya-cari');
    var keping = [].slice.call(kotak.querySelectorAll('[data-saring]'));
    var semuaKartu = [].slice.call(document.querySelectorAll('.karya-baris[data-kategori]'));
    var blok = [].slice.call(document.querySelectorAll('.kategori-blok'));
    var kosong = document.getElementById('karya-kosong');
    var aktif = '';

    function terapkan() {
      var q = (cari ? cari.value : '').trim().toLowerCase();
      var terlihat = 0;

      semuaKartu.forEach(function (k) {
        var cocokKat = !aktif || k.dataset.kategori === aktif;
        var cocokCari = !q || (k.dataset.cari || '').indexOf(q) >= 0;
        var tampil = cocokKat && cocokCari;
        k.hidden = !tampil;
        if (tampil) terlihat++;
      });

      // Judul kategori ikut disembunyikan saat seluruh isinya tersaring.
      // Tanpa itu, mencari satu kata akan menyisakan deretan judul
      // kategori yang di bawahnya tidak ada apa-apa.
      blok.forEach(function (b) {
        var ada = [].slice.call(b.querySelectorAll('.karya-baris[data-kategori]'))
          .some(function (k) { return !k.hidden; });
        b.hidden = !ada;
      });

      if (kosong) {
        kosong.hidden = terlihat > 0;
        if (!terlihat) {
          kosong.querySelector('p').textContent = q
            ? 'Tidak ada karya yang cocok dengan "' + q + '".'
            : 'Belum ada karya di kategori ini.';
        }
      }
    }

    keping.forEach(function (b) {
      b.addEventListener('click', function () {
        aktif = b.dataset.saring || '';
        keping.forEach(function (x) { x.classList.toggle('on', x === b); });
        terapkan();
      });
    });

    if (cari) {
      var tunda;
      cari.addEventListener('input', function () {
        clearTimeout(tunda);
        tunda = setTimeout(terapkan, 120);
      });
    }
  }

  /* ================================================================
     Mode pratinjau
     ================================================================ */
  var DATA = null;
  var saluranTerpasang = false;

  function mulaiPratinjau() {
    pitaPratinjau();

    var host = document.body;
    host.innerHTML = '<div class="memuat">Mengambil data terbaru…</div>';

    ambilData()
      .then(function (d) {
        DATA = d;
        gambar();
        if (!saluranTerpasang) { saluranTerpasang = true; pasangSaluran(); }
      })
      .catch(function (err) {
        host.innerHTML =
          '<div class="wrap"><div class="kosong" style="padding:100px 24px">' +
            '<h2>Data situs belum bisa dibaca</h2>' +
            '<p>' + teksAman(err && err.message ? err.message : 'Sambungan ke Apps Script gagal.') + '</p>' +
            '<p style="margin-top:14px;font-size:14px">Yang paling sering jadi penyebabnya: ' +
              '<b>API_URL</b> di <code>web/config.js</code> belum diisi, deploy Apps Script belum ' +
              'diperbarui setelah kodenya berubah, atau <b>Who has access</b> belum disetel ke ' +
              '<b>Anyone</b>.</p>' +
          '</div></div>';
        pitaPratinjau();
      });
  }

  /**
   * ambilData — JSON dari API, dengan JSONP sebagai jalur cadangan.
   *
   * Balasan akhir Apps Script datang dari googleusercontent dan sudah
   * membawa Access-Control-Allow-Origin: *, jadi fetch() biasanya cukup.
   * Jalur kedua ada untuk lingkungan yang tetap menolaknya — dan karena
   * jendela ini tinggal di dalam iframe lintas-asal, kegagalannya sulit
   * dibedakan dari "datanya memang tidak ada".
   */
  function ambilData() {
    var url = CFG.API_URL;
    if (!url) return Promise.reject(new Error('API_URL di web/config.js masih kosong.'));

    var segar = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();

    return fetch(segar, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Server menjawab HTTP ' + r.status);
        return r.json();
      })
      .then(periksaData)
      .catch(function () { return jsonp(segar).then(periksaData); });
  }

  function periksaData(d) {
    if (!d || typeof d !== 'object') throw new Error('Balasan server tidak bisa dibaca.');
    if (d.ok === false) throw new Error(d.error || 'Server menolak permintaan.');
    return d;
  }

  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var nama = '__pra' + Date.now();
      var s = document.createElement('script');
      var selesai = false;

      window[nama] = function (data) {
        selesai = true;
        resolve(data);
        bersih();
      };
      var bersih = function () {
        try { delete window[nama]; } catch (e) { window[nama] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
      };

      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + nama;
      s.onerror = function () { bersih(); reject(new Error('Alamat API tidak bisa dijangkau.')); };
      setTimeout(function () {
        if (!selesai) { bersih(); reject(new Error('Permintaan ke API kehabisan waktu.')); }
      }, 20000);

      document.head.appendChild(s);
    });
  }

  /**
   * gambar — gambar ulang seluruh halaman dari DATA.
   *
   * Memakai render.js, berkas yang sama yang dipakai build.mjs. Itu yang
   * menjamin apa yang terlihat di pratinjau adalah apa yang nanti benar-
   * benar dibangun — bukan tiruan yang mirip.
   */
  function gambar() {
    if (!DATA || !window.Render) return;
    var R = window.Render;

    terapkanTema(DATA);

    var rute = ruteSekarang();
    var html;

    if (rute.jenis === 'karya') {
      var k = (DATA.karya || []).filter(function (x) { return x.slug === rute.slug; })[0];
      if (k) {
        // Naskahnya tidak ikut di balasan daftar (lihat Publik.gs), jadi
        // halaman detail digambar dua tahap: kerangkanya sekarang, naskahnya
        // menyusul begitu ?api=karya menjawab. Dengan begitu pratinjau tidak
        // tampak menggantung selama naskah panjang masih di jalan.
        document.body.innerHTML = R.halamanKarya(DATA, k, tetangga(k));
        pasangUlang();
        ambilNaskah(rute.slug);
        return;
      }
      html = R.halaman404(DATA);
    } else if (rute.jenis === 'kategori') {
      var kat = (DATA.kategori || []).filter(function (x) { return x.slug === rute.slug; })[0];
      html = kat ? R.halamanKategori(DATA, kat) : R.halaman404(DATA);
    } else if (rute.jenis === 'about') {
      html = R.halamanAbout(DATA);
    } else {
      html = R.beranda(DATA);
    }

    document.body.innerHTML = html;
    pasangUlang();
  }

  function ambilNaskah(slug) {
    var url = CFG.API_URL;
    if (!url) return;
    var dasar = url.replace(/[?&]api=situs/, '');
    var pisah = dasar.indexOf('?') >= 0 ? '&' : '?';
    var alamat = dasar + pisah + 'api=karya&slug=' + encodeURIComponent(slug) + '&_=' + Date.now();

    fetch(alamat, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return jsonp(alamat); })
      .then(function (k) {
        if (!k || k.ok === false || !window.Render) return;
        var kotak = document.querySelector('.naskah, .naskah-kosong');
        if (!kotak) return;
        if (k.isi) {
          // Isi sudah disanitasi di server sebelum disimpan. Di sini ia
          // ditanam apa adanya, sama seperti yang dilakukan build.mjs.
          kotak.className = 'naskah';
          kotak.innerHTML = k.isi;
        }
      })
      .catch(function () { /* naskah gagal dimuat — kerangkanya tetap terlihat */ });
  }

  function tetangga(k) {
    var daftar = (DATA.karya || []);
    var i = -1;
    daftar.forEach(function (x, idx) { if (x.slug === k.slug) i = idx; });
    if (i < 0) return {};
    return { sebelum: daftar[i - 1] || null, sesudah: daftar[i + 1] || null };
  }

  /**
   * ruteSekarang — halaman mana yang sedang diminta.
   *
   * Dibaca dari hash lebih dulu, baru dari jalur. Hash dipakai karena
   * CMS mengarahkan pratinjau lewat postMessage tanpa memuat ulang
   * halaman, dan mengubah jalur di dalam iframe lintas-asal akan memicu
   * navigasi sungguhan.
   */
  function ruteSekarang() {
    var jalur = (location.hash || '').replace(/^#/, '') || location.pathname;

    var m = /\/?karya\/([^\/?#]+)/.exec(jalur);
    if (m) return { jenis: 'karya', slug: dekode(m[1]) };

    m = /\/?kategori\/([^\/?#]+)/.exec(jalur);
    if (m) return { jenis: 'kategori', slug: dekode(m[1]) };

    if (/\/?about\/?$/.test(jalur)) return { jenis: 'about' };
    return { jenis: 'beranda' };
  }

  function dekode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function terapkanTema(d) {
    var s = (d && d.situs) || {};
    var html = document.documentElement;
    html.setAttribute('data-tema', s.tema === 'gelap' ? 'gelap' : 'terang');
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.aksen || '')) {
      html.style.setProperty('--aksen', s.aksen);
    }
    if (s.nama) document.title = s.nama + (s.tagline ? ' — ' + s.tagline : '');
  }

  /** Dipanggil setiap kali body digambar ulang: pendengarnya ikut hilang. */
  function pasangUlang() {
    pasangHeader();
    pasangNav();
    pasangSorotSeksi();
    pasangSaring();
    pasangForm();
    pasangCookie();
    pasangTautanPratinjau();
    pitaPratinjau();
  }

  /**
   * pasangTautanPratinjau — di dalam pratinjau, tautan internal berpindah
   * halaman TANPA memuat ulang.
   *
   * Dua alasan. Memuat ulang di dalam iframe berarti mengambil data dari
   * API sekali lagi, yang membuat perpindahan terasa lambat. Dan karena
   * berkas statisnya mungkin belum pernah dibangun — pada situs yang baru
   * dipasang, /karya/slug/ memang belum ada — mengikuti tautannya akan
   * menampilkan halaman 404 milik hosting, bukan karyanya.
   */
  function pasangTautanPratinjau() {
    if (!PRATINJAU) return;
    document.body.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;

      var href = a.getAttribute('href') || '';
      if (!href || /^(https?:|mailto:|tel:)/i.test(href)) return;   // tautan luar: biarkan
      if (href.charAt(0) === '#') return;                            // jangkar: biarkan

      e.preventDefault();
      var jalur = href.replace(/^(\.\.\/)+/, '/').replace(/^\/?/, '/');
      location.hash = jalur;
      gambar();
      window.scrollTo(0, 0);
    });
  }

  function pitaPratinjau() {
    if (!PRATINJAU) return;
    if (document.querySelector('.pita-pratinjau')) return;
    var p = document.createElement('div');
    p.className = 'pita-pratinjau';
    p.innerHTML = (window.Render ? window.Render.ikon('mata') : '') + 'Pratinjau · data terbaru';
    document.body.appendChild(p);
  }

  function teksAman(s) {
    var d = document.createElement('div');
    d.textContent = String(s === null || s === undefined ? '' : s);
    return d.innerHTML;
  }

  /* ================================================================
     Saluran ke CMS

     Yang boleh menyeberang lewat sini sengaja dibatasi empat bentuk:
     daftar id karya, sekumpulan perubahan teks, satu alamat rute, dan
     perintah muat ulang.

     Teks DIPASANG LEWAT textContent, bukan innerHTML. Itu yang membuat
     pelonggaran ini aman: apa pun yang dikirim — termasuk oleh pengirim
     tak dikenal yang memuat alamat pratinjau ini di dalam bingkainya
     sendiri — paling jauh hanya mengubah teks yang terbaca di tab orang
     itu. Tidak ada yang tersimpan, tidak ada skrip yang bisa dieksekusi,
     dan pengunjung situs tidak pernah memasang pendengar ini sama sekali
     karena mereka tidak membuka halaman dengan ?pratinjau=1.
     ================================================================ */
  function pasangSaluran() {
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.jenis !== 'portofolio-pratinjau') return;

      if (d.aksi === 'urutan') terapkanUrutan(d.ids);
      else if (d.aksi === 'teks') terapkanTeks(d.isi);
      else if (d.aksi === 'rute') pindahRute(d.rute);
      else if (d.aksi === 'muat-ulang') location.reload();
    });

    // Beri tahu CMS bahwa halaman ini sudah siap menerima. Dipakai untuk
    // mengirim ulang keadaan terakhir setelah pratinjau dimuat ulang.
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ jenis: 'portofolio-pratinjau', aksi: 'siap' }, '*');
      }
    } catch (err) { /* lintas-asal menolak — CMS akan menunggu saja */ }
  }

  /**
   * terapkanUrutan — susun ulang kartu karya mengikuti daftar id.
   *
   * Dikerjakan langsung di DOM, bukan dengan menggambar ulang dari DATA.
   * Alasannya terasa saat dipakai: menggambar ulang seluruh halaman pada
   * setiap gerakan seretan membuat gambar berkedip, dan posisi gulung
   * halaman melompat ke atas. Menyusun ulang elemen yang sudah ada tidak.
   *
   * Penyusunannya per wadah kategori, bukan satu daftar besar: karya di
   * situs ini dikelompokkan, dan urutan global dari CMS harus diterjemahkan
   * jadi urutan di dalam masing-masing kelompok.
   */
  function terapkanUrutan(ids) {
    if (!ids || !ids.length) return;

    var peringkat = {};
    ids.forEach(function (id, i) { peringkat[String(id)] = i; });

    var wadahs = document.querySelectorAll('.karya-daftar, .karya-kisi');
    [].slice.call(wadahs).forEach(function (wadah) {
      var anak = [].slice.call(wadah.querySelectorAll('[data-karya]'));
      if (anak.length < 2) return;

      anak.sort(function (a, b) {
        var ra = peringkat[a.dataset.karya];
        var rb = peringkat[b.dataset.karya];
        // Kartu yang tidak ada di daftar (karya dari kategori lain yang
        // sedang tidak ditata) dibiarkan di belakang, urutannya tetap.
        if (ra === undefined && rb === undefined) return 0;
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        return ra - rb;
      });

      // Satu DocumentFragment, satu kali sentuh DOM.
      var frag = document.createDocumentFragment();
      anak.forEach(function (n) { frag.appendChild(n); });
      wadah.appendChild(frag);
    });
  }

  /**
   * terapkanTeks — pasang perubahan teks dari CMS ke elemen yang bersesuaian.
   *
   * Kunci 'hero.judul' menuju elemen ber-id 't-hero-judul'. Pemetaan lewat
   * id, bukan lewat pemilih yang menebak struktur, supaya menata ulang
   * tata letak di render.js tidak diam-diam mematikan pratinjau langsung.
   *
   * Elemen yang tidak ditemukan dilewati tanpa suara: itu keadaan yang
   * normal, bukan galat — seksi yang isinya kosong tidak digambar, jadi
   * mengetik di kolomnya memang belum punya tujuan sampai ada isinya.
   */
  function terapkanTeks(patch) {
    if (!patch || typeof patch !== 'object') return;

    Object.keys(patch).forEach(function (kunci) {
      if (!/^[a-zA-Z]+(\.[a-zA-Z]+)*$/.test(kunci)) return;     // bentuk kunci yang dikenal saja
      var node = document.getElementById('t-' + kunci.replace(/\./g, '-'));
      if (!node) return;

      var nilai = String(patch[kunci] === null || patch[kunci] === undefined ? '' : patch[kunci]);
      if (node.textContent === nilai) return;

      node.textContent = nilai;

      // Kedipan singkat: penanda bahwa yang baru diketik sudah sampai,
      // tanpa pembacanya harus mencari bagian mana yang berubah.
      node.classList.remove('baru-berubah');
      void node.offsetWidth;                                     // paksa animasi mulai ulang
      node.classList.add('baru-berubah');
    });
  }

  function pindahRute(rute) {
    var r = String(rute || '/');
    if (!/^[\w\-\/.]*$/.test(r)) return;         // alamat yang tidak masuk akal diabaikan
    location.hash = r.charAt(0) === '/' ? r : '/' + r;
    gambar();
    window.scrollTo(0, 0);
  }

  /* ================================================================
     Mulai
     ================================================================ */
  function mulai() {
    if (PRATINJAU) { mulaiPratinjau(); return; }
    pasangHeader();
    pasangNav();
    pasangSorotSeksi();
    pasangSaring();
    pasangForm();
    pasangCookie();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
