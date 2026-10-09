/* ==================================================================
   skrip/serve.mjs — Server statis kecil untuk memeriksa hasil build di lokal
   ------------------------------------------------------------------
   Jalankan `npm run preview` di folder web/ untuk membangun lalu
   membuka situsnya di http://localhost:4321.

   Gunanya satu: memeriksa hasil prerender SEBELUM diunggah. Membuka
   dist/index.html langsung dari berkas (file://) tidak cukup — alamat
   seperti /karya/slug/ butuh server yang bisa menyajikan index.html
   dari sebuah folder, dan itu tidak dilakukan browser pada file://.

   Tanpa dependensi, cukup modul bawaan Node.
   ================================================================== */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(DIR, '..', 'dist');
const PORT = Number(process.env.PORT) || 4321;

const TIPE = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

/**
 * dalamDist — pastikan jalur yang diminta tidak keluar dari dist/.
 *
 * Server ini hanya untuk lokal, tapi penjagaan ini tetap ada: tanpa
 * pemeriksaan, permintaan berisi "../.." bisa membaca berkas apa pun di
 * komputer yang menjalankannya — termasuk kunci SSH di folder rumah.
 */
function dalamDist(jalur) {
  const penuh = resolve(DIST, '.' + normalize(jalur));
  return penuh.startsWith(DIST) ? penuh : null;
}

const server = createServer(async (req, res) => {
  let jalur = decodeURIComponent((req.url || '/').split('?')[0]);
  let penuh = dalamDist(jalur);

  if (!penuh) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Jalur di luar dist/');
    return;
  }

  try {
    const s = await stat(penuh);
    if (s.isDirectory()) penuh = join(penuh, 'index.html');
  } catch {
    // Belum ada: coba sebagai folder (alamat tanpa garis miring penutup),
    // lalu jatuh ke 404.html seperti yang dilakukan hosting sungguhan.
    try {
      await stat(join(penuh, 'index.html'));
      penuh = join(penuh, 'index.html');
    } catch {
      penuh = join(DIST, '404.html');
      res.statusCode = 404;
    }
  }

  try {
    const isi = await readFile(penuh);
    res.writeHead(res.statusCode === 404 ? 404 : 200, {
      'Content-Type': TIPE[extname(penuh)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(isi);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tidak ditemukan. Sudah menjalankan `npm run build`?');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Situs tersaji di \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log('  Tekan Ctrl+C untuk berhenti.\n');
});
