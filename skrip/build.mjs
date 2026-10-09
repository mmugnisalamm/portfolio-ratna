/* ==================================================================
   skrip/build.mjs — Membangun situs statis dari data CMS
   ------------------------------------------------------------------
   Dijalankan hosting setiap kali tombol Terbitkan ditekan di CMS
   (lihat Terbit.gs). Alurnya:

     1. baca API_URL dari web/config.js
     2. ambil ?api=situs                  -> daftar karya + isi halaman
     3. ambil ?api=karya&slug=...          -> naskah tiap karya
     4. gambar setiap halaman lewat render.js
     5. tulis ke dist/ beserta aset, sitemap, dan robots.txt

   Yang dihasilkan:
     dist/index.html                 beranda
     dist/karya/<slug>/index.html    satu per karya
     dist/kategori/<slug>/index.html satu per kategori
     dist/about/index.html           halaman About
     dist/404.html
     dist/sitemap.xml, dist/robots.txt
     dist/assets/...                 CSS, JS, config

   SATU KEPUTUSAN YANG PERLU DIKETAHUI: kalau pengambilan data gagal,
   skrip ini BERHENTI dengan kode galat alih-alih membangun situs
   kosong. Netlify dan Cloudflare Pages mempertahankan hasil terbit
   sebelumnya ketika pembangunan gagal — jadi gangguan sesaat pada
   Apps Script berakhir sebagai "situs tidak berubah", bukan sebagai
   "portofolionya hilang". Membangun apa yang bisa dibangun terdengar
   lebih ramah, tapi akibatnya justru yang paling merusak.
   ================================================================== */

import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const DIR = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(DIR, '..');
const DIST = join(WEB, 'dist');

// render.js ditulis sebagai skrip biasa yang mengisi module.exports bila
// ada, jadi ia bisa dimuat di sini maupun lewat <script> di browser —
// satu berkas, bukan dua yang harus disamakan.
const Render = require(join(WEB, 'assets/js/render.js'));
const CFG = require(join(WEB, 'config.js'));

/* ================================================================
   Perkakas
   ================================================================ */
const mulai = Date.now();
let adaPeringatan = false;

const log = (...a) => console.log('  ', ...a);
const ok = (...a) => console.log('  \x1b[32m✓\x1b[0m', ...a);
const ingat = (...a) => { adaPeringatan = true; console.log('  \x1b[33m!\x1b[0m', ...a); };

function mati(pesan, saran) {
  console.error('\n\x1b[31m✖ Pembangunan dibatalkan.\x1b[0m');
  console.error('  ' + pesan);
  if (saran) console.error('\n  ' + saran);
  console.error('');
  process.exit(1);
}

/**
 * GalatTetap — kegagalan yang tidak ada gunanya dicoba ulang.
 *
 * Bedanya dengan kegagalan jaringan penting: server yang menjawab
 * { ok: false, error: "Karya tidak ditemukan" } sudah memberi jawaban
 * pasti. Mengulanginya tiga kali dengan jeda memanjang hanya menambah
 * empat detik pada setiap pembangunan untuk mendapat jawaban yang sama.
 */
class GalatTetap extends Error {}

/**
 * ambil — GET JSON dengan percobaan ulang untuk kegagalan sesaat.
 *
 * Apps Script sesekali menjawab 429 atau 500 saat beberapa permintaan
 * datang berdekatan — dan skrip ini memang mengirim satu permintaan per
 * karya. Tiga kali percobaan dengan jeda yang memanjang menyelesaikan
 * hampir semuanya.
 *
 * Yang DIULANG: gagal jaringan, HTTP 5xx, HTTP 429, balasan yang bukan JSON.
 * Yang TIDAK diulang: HTTP 4xx selain 429, dan balasan ok:false dari server.
 */
async function ambil(url, label, percobaan = 3) {
  let galatTerakhir;

  for (let i = 1; i <= percobaan; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'portofolio-build' }
      });

      if (!res.ok) {
        const pesan = `HTTP ${res.status} ${res.statusText}`;
        // 429 (terlalu sering) dan 5xx memang membaik kalau ditunggu.
        // 403/404 tidak — mengulanginya hanya menunda pesan galatnya.
        if (res.status !== 429 && res.status < 500) throw new GalatTetap(pesan);
        throw new Error(pesan);
      }

      const teks = await res.text();
      let data;
      try {
        data = JSON.parse(teks);
      } catch {
        // Gejala yang paling sering: Apps Script membalas halaman login
        // HTML karena deploy-nya tidak disetel "Anyone".
        const petunjuk = /<html/i.test(teks)
          ? ' Server membalas HTML, bukan JSON — biasanya karena deploy Apps Script ' +
            'belum disetel "Who has access: Anyone".'
          : '';
        throw new Error('Balasan bukan JSON yang sah.' + petunjuk);
      }

      if (data && data.ok === false) {
        throw new GalatTetap(data.error || 'Server menolak permintaan.');
      }
      return data;
    } catch (e) {
      galatTerakhir = e;
      if (e instanceof GalatTetap) break;

      if (i < percobaan) {
        const jeda = i * 1200;
        ingat(`${label} gagal (${e.message}) — mencoba lagi dalam ${jeda / 1000}s`);
        await new Promise((r) => setTimeout(r, jeda));
      }
    }
  }
  throw new Error(`${label}: ${galatTerakhir.message}`);
}

/** Alamat endpoint, diturunkan dari API_URL supaya hanya satu yang perlu diisi. */
function endpoint(api, param = {}) {
  const dasar = String(CFG.API_URL || '').replace(/[?&]api=[^&]*/g, '');
  const u = new URL(dasar);
  u.searchParams.set('api', api);
  for (const [k, v] of Object.entries(param)) u.searchParams.set(k, v);
  return u.toString();
}

/** Tulis satu berkas HTML, lengkap dengan foldernya. */
async function tulis(jalur, isi) {
  const penuh = join(DIST, jalur);
  await mkdir(dirname(penuh), { recursive: true });
  await writeFile(penuh, isi, 'utf8');
  return isi.length;
}

/* ================================================================
   Kerangka dokumen

   Satu-satunya tempat di seluruh proyek yang menulis <html> dan <head>.
   render.js hanya menghasilkan isi <body>, supaya ia bisa dipakai juga
   oleh mode pratinjau — yang menggambar ke dalam dokumen yang sudah ada.
   ================================================================ */
function dokumen(d, { body, judul, deskripsi, jalur, gambarId, artikel, ld, akar,
                      robots, canonical }) {
  const kode = d.kode || {};
  const huruf = (d.situs && d.situs.huruf) || {};
  const muatHuruf = huruf.muat ||
    'Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Inter:wght@400;500;600';

  return `<!DOCTYPE html>
<html${Render.temaAtribut(d)}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${Render.metaKepala(d, { judul, deskripsi, jalur, gambarId, artikel, robots, canonical })}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://lh3.googleusercontent.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${muatHuruf}&display=swap">
  <link rel="stylesheet" href="${akar}assets/css/style.css">
  <link rel="icon" href="${favicon(d)}">
  ${Render.gayaToken(d)}
  ${ld || ''}
  ${Render.skripIntegrasi(d)}
  ${kode.css ? `<style>${kode.css}</style>` : ''}
  ${kode.head || ''}
</head>
<body>
  <a class="lompat" href="#isi">Lompat ke isi</a>
  ${body}
  <script src="${akar}config.js"></script>
  <script src="${akar}assets/js/render.js"></script>
  <script src="${akar}assets/js/app.js"></script>
  ${kode.body || ''}
</body>
</html>
`;
}

/**
 * favicon — monogram situs sebagai SVG yang ditanam langsung.
 *
 * Ditanam, bukan berkas tersendiri: satu permintaan jaringan lebih
 * sedikit, dan tidak ada berkas yang perlu dibuat ulang setiap kali
 * pemiliknya mengganti warna aksen dari CMS.
 */
function favicon(d) {
  const s = d.situs || {};
  const teks = (s.inisial || Render.inisial(s.nama)).slice(0, 2);
  const aksen = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.aksen || '') ? s.aksen : '#A8664A';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
    `<rect width='64' height='64' rx='14' fill='${aksen}'/>` +
    `<text x='32' y='43' font-family='Georgia,serif' font-size='30' font-weight='600' ` +
    `fill='%23ffffff' text-anchor='middle'>${Render.esc(teks)}</text></svg>`;
  return 'data:image/svg+xml,' + svg.replace(/#/g, '%23').replace(/"/g, "'");
}

/* ================================================================
   Pembangunan
   ================================================================ */
async function bangun() {
  console.log('\n\x1b[1mMembangun situs portofolio\x1b[0m\n');

  // ---- 1. Periksa konfigurasi ----
  if (!CFG.API_URL || !/^https:\/\/script\.google\.com\//.test(CFG.API_URL)) {
    mati(
      'API_URL di web/config.js belum diisi (atau bukan alamat Apps Script).',
      'Buka CMS -> Dashboard -> kotak "Alamat Data" -> Salin, lalu tempel ke web/config.js.'
    );
  }

  // ---- 2. Ambil data situs ----
  log('Mengambil data situs...');
  let d;
  try {
    d = await ambil(endpoint('situs'), 'Data situs');
  } catch (e) {
    mati(
      e.message,
      'Periksa: (a) deploy Apps Script sudah diperbarui setelah kode berubah, ' +
      '(b) "Who has access" = Anyone, (c) SETUP() sudah dijalankan.'
    );
  }

  const situs = d.situs || {};
  const karya = d.karya || [];
  const kategori = d.kategori || [];

  ok(`Data terbaca — ${karya.length} karya, ${kategori.length} kategori (versi ${d.versi})`);

  if (!situs.url) {
    ingat('Alamat Situs belum diisi di CMS. Tag kanonik, Open Graph, dan sitemap akan dilewati, ' +
          'sehingga pratinjau tautan di WhatsApp/LinkedIn tidak akan tampil utuh.');
  }
  if (!karya.length) {
    ingat('Belum ada karya yang tampil. Situs tetap dibangun, tapi halaman portofolionya kosong.');
  }
  if (d.terpotong) {
    ingat(`${d.terpotong} karya tidak ikut terkirim karena melewati batas API.`);
  }

  // ---- 3. Ambil naskah tiap karya ----
  // Dikirim dalam kelompok kecil, bukan sekaligus. Apps Script membatasi
  // permintaan yang berjalan bersamaan, dan membanjirinya dengan 30
  // permintaan sekaligus menghasilkan 429 yang harus diulang semuanya —
  // lebih lambat daripada mengirimnya bertahap sejak awal.
  const PER_KELOMPOK = 4;
  const naskah = new Map();

  if (karya.length) {
    log(`Mengambil naskah ${karya.length} karya...`);
    for (let i = 0; i < karya.length; i += PER_KELOMPOK) {
      const kelompok = karya.slice(i, i + PER_KELOMPOK);
      const hasil = await Promise.all(
        kelompok.map(async (k) => {
          try {
            const isi = await ambil(endpoint('karya', { slug: k.slug }), `Naskah "${k.slug}"`);
            return [k.slug, isi];
          } catch (e) {
            // Satu naskah yang gagal TIDAK membatalkan pembangunan: halaman
            // karyanya tetap dibuat dengan judul, ringkasan, dan tautan versi
            // tayangnya — yang hilang hanya badan tulisannya. Membatalkan
            // seluruh terbit karena satu dari tiga puluh naskah bermasalah
            // adalah pertukaran yang salah.
            ingat(`Naskah "${k.slug}" gagal diambil: ${e.message}`);
            return [k.slug, null];
          }
        })
      );
      hasil.forEach(([slug, isi]) => naskah.set(slug, isi));
      process.stdout.write(`   ${Math.min(i + PER_KELOMPOK, karya.length)}/${karya.length}\r`);
    }
    process.stdout.write('                    \r');
    const berhasil = [...naskah.values()].filter(Boolean).length;
    ok(`Naskah terbaca — ${berhasil}/${karya.length}`);
  }

  // ---- 4. Siapkan folder keluaran ----
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // ---- 4b. Mode perbaikan (PRD §32) ----
  //
  // Memotong seluruh sisa pembangunan. Yang dihasilkan satu halaman saja,
  // disajikan di setiap alamat lewat _redirects. Tidak ada halaman karya
  // yang dibangun — kalau dibangun, ia tetap bisa dibuka langsung lewat
  // alamatnya dan "mode perbaikan" jadi tidak berarti apa-apa.
  if ((d.maintenance || {}).aktif) {
    const html = dokumen(d, {
      body: Render.halamanMaintenance(d),
      judul: (d.maintenance || {}).judul || 'Sedang diperbarui',
      deskripsi: (d.maintenance || {}).teks,
      jalur: '/',
      akar: '/',
      robots: 'noindex,nofollow'
    });

    await tulis('index.html', html);
    await tulis('404.html', html);
    await tulis('robots.txt', 'User-agent: *\nDisallow: /\n');
    await tulis('_redirects', '/*  /index.html  200\n');
    await cp(join(WEB, 'assets'), join(DIST, 'assets'), { recursive: true });

    console.log('\n\x1b[33m⚑ MODE PERBAIKAN AKTIF\x1b[0m');
    console.log('  Situs dibangun sebagai satu halaman pemberitahuan.');
    console.log('  Matikan di CMS → Pengaturan → Mode Situs, lalu Terbitkan lagi.\n');
    return;
  }

  // ---- 5. Gambar halaman ----
  log('Menggambar halaman...');
  let jumlahHalaman = 0;
  let totalByte = 0;

  // Beranda
  totalByte += await tulis('index.html', dokumen(d, {
    body: Render.beranda(d),
    jalur: '/',
    akar: '',
    ld: Render.dataTerstruktur(d, {})
  }));
  jumlahHalaman++;

  // Halaman detail karya
  for (let i = 0; i < karya.length; i++) {
    const k = karya[i];
    const lengkap = naskah.get(k.slug);
    const gabung = Object.assign({}, k, lengkap || {});
    const tetangga = { sebelum: karya[i - 1] || null, sesudah: karya[i + 1] || null };

    const seo = k.seo || {};
    totalByte += await tulis(`karya/${k.slug}/index.html`, dokumen(d, {
      body: Render.halamanKarya(d, gabung, tetangga),
      // SEO per karya menimpa yang diturunkan. Dikosongkan di CMS, ia
      // kembali ke judul dan ringkasan — jadi kolom kosong bukan
      // kekurangan melainkan pilihan "ikut saja yang sudah ada".
      judul: seo.judul || k.judul,
      deskripsi: seo.deskripsi || k.ringkasan || situs.deskripsi,
      robots: seo.robots,
      canonical: seo.canonical,
      jalur: `/karya/${k.slug}/`,
      gambarId: k.thumbId,
      artikel: true,
      akar: '../../',
      ld: Render.dataTerstruktur(d, {
        karya: gabung,
        kategoriNama: Render.namaKategori(d, k.kategori)
      })
    }));
    jumlahHalaman++;
  }

  // Halaman kategori — hanya yang berisi. Kategori kosong akan jadi halaman
  // yang terindeks Google lalu mengecewakan orang yang mengkliknya.
  for (const kat of kategori) {
    if (!kat.jumlah) continue;
    totalByte += await tulis(`kategori/${kat.slug}/index.html`, dokumen(d, {
      body: Render.halamanKategori(d, kat),
      judul: kat.nama,
      deskripsi: kat.deskripsi || situs.deskripsi,
      jalur: `/kategori/${kat.slug}/`,
      akar: '../../',
      ld: Render.dataTerstruktur(d, {})
    }));
    jumlahHalaman++;
  }

  // Halaman About
  totalByte += await tulis('about/index.html', dokumen(d, {
    body: Render.halamanAbout(d),
    judul: 'Tentang',
    deskripsi: (d.profil || {}).peran || situs.deskripsi,
    jalur: '/about/',
    gambarId: (d.profil || {}).fotoId,
    akar: '../',
    ld: Render.dataTerstruktur(d, {})
  }));
  jumlahHalaman++;

  // 404 — ditulis di akar, bukan di sub-folder. Di situlah Netlify,
  // Cloudflare Pages, dan GitHub Pages mencarinya.
  totalByte += await tulis('404.html', dokumen(d, {
    body: Render.halaman404(d),
    judul: 'Halaman tidak ditemukan',
    jalur: '/404.html',
    // Jalur relatif tidak bisa dipakai di sini: halaman 404 disajikan pada
    // alamat APA PUN yang tidak ada, termasuk /karya/salah-ketik/ yang dua
    // tingkat di dalam. '../' dari sana akan menunjuk tempat yang salah.
    akar: '/'
  }));
  jumlahHalaman++;

  ok(`${jumlahHalaman} halaman digambar (${(totalByte / 1024).toFixed(0)} KB HTML)`);

  // ---- 6. Salin aset ----
  await cp(join(WEB, 'assets'), join(DIST, 'assets'), { recursive: true });
  await cp(join(WEB, 'config.js'), join(DIST, 'config.js'));
  const berkasAset = (await readdir(join(DIST, 'assets', 'js'))).length +
                     (await readdir(join(DIST, 'assets', 'css'))).length;
  ok(`Aset disalin (${berkasAset} berkas)`);

  // ---- 6b. _redirects (PRD §30, §31) ----
  //
  // Format Netlify, yang juga dipahami Cloudflare Pages. Satu baris per
  // pengalihan: "<dari> <ke> <kode>".
  //
  // Urutannya penting dan tidak boleh diacak: Netlify memakai aturan
  // PERTAMA yang cocok, bukan yang paling spesifik. Karena itu daftarnya
  // diurutkan dari jalur terpanjang ke terpendek — tanpa itu, sebuah
  // pengalihan untuk "/karya/" akan menelan semua pengalihan untuk
  // "/karya/nama-tertentu/" yang ada di bawahnya.
  const redirect = (d.redirect || []).slice().sort((a, b) => b.dari.length - a.dari.length);

  if (redirect.length) {
    const baris = redirect.map((r) => `${r.dari}  ${r.ke}  ${r.kode || 301}`);
    await tulis('_redirects', baris.join('\n') + '\n');
    ok(`_redirects ditulis (${redirect.length} pengalihan)`);

    // Pengalihan yang menunjuk halaman yang tidak dibangun akan berakhir
    // di 404 juga — pengalihan yang tidak mengalihkan apa-apa. Diperiksa
    // di sini karena hanya di sini daftar halaman yang BENAR-BENAR ada
    // sudah diketahui.
    const adaJalur = new Set([
      '/', '/about/',
      ...karya.map((k) => `/karya/${k.slug}/`),
      ...kategori.filter((k) => k.jumlah).map((k) => `/kategori/${k.slug}/`)
    ]);
    const buntu = redirect.filter((r) => !/^https?:/i.test(r.ke) && !adaJalur.has(r.ke));
    if (buntu.length) {
      ingat(`${buntu.length} pengalihan menunjuk halaman yang tidak ada: ` +
        buntu.slice(0, 3).map((r) => `${r.dari} → ${r.ke}`).join(', ') +
        (buntu.length > 3 ? ', …' : '') +
        '. Periksa di CMS → Redirect & SEO.');
    }
  }

  // ---- 7. sitemap.xml & robots.txt ----
  if (situs.url) {
    const dasar = String(situs.url).replace(/\/+$/, '');
    const hariIni = new Date().toISOString().slice(0, 10);

    const alamat = [
      { loc: '/', prioritas: '1.0' },
      { loc: '/about/', prioritas: '0.6' },
      ...kategori.filter((k) => k.jumlah).map((k) => ({ loc: `/kategori/${k.slug}/`, prioritas: '0.7' })),
      ...karya.map((k) => ({ loc: `/karya/${k.slug}/`, prioritas: '0.8' }))
    ];

    await tulis('sitemap.xml',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      alamat.map((a) =>
        `  <url><loc>${Render.esc(dasar + a.loc)}</loc>` +
        `<lastmod>${hariIni}</lastmod>` +
        `<priority>${a.prioritas}</priority></url>`
      ).join('\n') +
      '\n</urlset>\n'
    );

    // robots.txt mengikuti pengaturan SEO global. noindex di sana berarti
    // seluruh situs memang sedang disembunyikan — biasanya saat masih
    // disusun — dan robots.txt harus ikut mengatakannya.
    const tolakSemua = String((d.seo || {}).robots || '').indexOf('noindex') >= 0;
    await tulis('robots.txt', tolakSemua
      ? 'User-agent: *\nDisallow: /\n'
      : 'User-agent: *\nAllow: /\n\nSitemap: ' + dasar + '/sitemap.xml\n'
    );

    if (tolakSemua) {
      ingat('SEO global disetel NOINDEX — seluruh situs disembunyikan dari mesin pencari. ' +
        'Ubah di CMS → Redirect & SEO bila tidak disengaja.');
    }
    ok(`sitemap.xml ditulis (${alamat.length} alamat)`);
  } else {
    // Tanpa alamat situs, sitemap berisi alamat relatif — yang diabaikan
    // mesin pencari. Jadi yang ditulis hanya robots.txt, dan pemiliknya
    // diberi tahu apa yang perlu diisi.
    await tulis('robots.txt', 'User-agent: *\nAllow: /\n');
    ingat('sitemap.xml dilewati karena Alamat Situs belum diisi di CMS.');
  }

  // ---- Selesai ----
  const detik = ((Date.now() - mulai) / 1000).toFixed(1);
  console.log(`\n\x1b[32m✓ Selesai dalam ${detik}s\x1b[0m — ${jumlahHalaman} halaman di dist/`);
  if (adaPeringatan) {
    console.log('\x1b[33m  Ada peringatan di atas. Situsnya tetap dibangun dan bisa ditayangkan.\x1b[0m');
  }
  console.log('');
}

bangun().catch((e) => {
  // Jaring terakhir. Apa pun yang lolos sampai sini membatalkan
  // pembangunan, dan hosting mempertahankan terbit sebelumnya.
  console.error('\n\x1b[31m✖ Pembangunan gagal.\x1b[0m');
  console.error('  ' + (e && e.stack ? e.stack : e));
  console.error('');
  process.exit(1);
});
