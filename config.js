/* ==================================================================
   config.js — Satu-satunya berkas yang perlu Anda ubah dengan tangan.
   ------------------------------------------------------------------
   Isi API_URL dengan alamat web app Apps Script Anda, lengkap dengan
   ?api=situs di belakangnya.

   Cara mendapatkannya:
     1. Buka CMS (URL /exec hasil deploy Apps Script).
     2. Di halaman Dashboard ada kotak "Alamat Data".
     3. Tekan Salin, lalu tempel di antara tanda kutip di bawah ini.

   Bentuknya kira-kira seperti ini:
     https://script.google.com/macros/s/AKfycbx..../exec?api=situs

   Berkas ini dibaca DUA pihak, dan itu disengaja supaya tidak ada dua
   tempat yang harus disamakan:

     - skrip/build.mjs saat situs dibangun, untuk mengambil datanya;
     - browser, hanya pada mode pratinjau (?pratinjau=1).

   Pengunjung biasa tidak pernah memanggil API ini — mereka menerima
   HTML yang sudah berisi tulisannya.
   ================================================================== */

var PORTOFOLIO_CONFIG = {

  API_URL: 'https://script.google.com/macros/s/AKfycbyrIpSeQjuy4HgszgAlZOE1gwNKc-4wo8JWyLNc4i5WfBW5Ris5Riz0WZJdkrfERGrN/exec?api=situs',

  /**
   * LEBAR_SET — tangga lebar yang ditawarkan ke browser lewat srcset.
   *
   * Yang tersimpan di Drive adalah satu berkas per gambar. Yang menentukan
   * seberapa besar data yang benar-benar diunduh pengunjung adalah daftar
   * ini: browser memilih sendiri anak tangga yang paling pas untuk lebar
   * kartunya dan kerapatan layarnya, lalu Google yang membuatkan turunannya.
   *
   * Menambah anak tangga tidak menambah penyimpanan sedikit pun — tidak ada
   * satu pun salinan yang disimpan di pihak kita.
   */
  LEBAR_SET: [400, 640, 960, 1280],

  /**
   * LEBAR_KARTU / LEBAR_BESAR — nilai cadangan untuk browser lama yang
   * tidak mengenal srcset, dan lebar gambar di halaman detail karya.
   */
  LEBAR_KARTU: 640,
  LEBAR_BESAR: 1280,

  /**
   * KATA_PER_MENIT — dipakai menghitung perkiraan waktu baca.
   *
   * 200 adalah angka yang biasa dipakai untuk pembaca berbahasa Indonesia
   * pada teks pemasaran. Ia tidak perlu tepat; gunanya memberi tahu pembaca
   * apakah yang di depannya tiga menit atau dua puluh.
   */
  KATA_PER_MENIT: 200
};

// Dibaca Node (build) maupun browser, tanpa dua berkas yang harus disamakan.
if (typeof module !== 'undefined' && module.exports) module.exports = PORTOFOLIO_CONFIG;
else if (typeof window !== 'undefined') window.PORTOFOLIO_CONFIG = PORTOFOLIO_CONFIG;
