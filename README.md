# LAKSANA — Pelaksanaan Kegiatan PTA Malut

LAKSANA adalah aplikasi absensi, kuis, laporan, dan sertifikat untuk pelaksanaan kegiatan PTA Malut.

Aplikasi web (React + Vite + TypeScript) dengan database **Supabase** untuk mengelola kegiatan: data pegawai per satuan kerja,
peserta, absensi lewat link/QR pribadi, notula, kuis pre test / post test berwaktu, sertifikat, dokumentasi, dan laporan lengkap.

## Alur aplikasi

| # | Langkah | Di mana |
|---|---------|---------|
| 0 | Isi **data pegawai** per satuan kerja (satu per satu atau tempel dari Excel) | Data pegawai |
| 1 | Tambah **kegiatan** lalu **aktifkan menu** yang dipakai (absensi, notula, kuis, sertifikat, dokumentasi) | Dashboard → Kegiatan → Ringkasan |
| 2 | Pilih **peserta dari data pegawai**; tentukan jenis (peserta/narasumber/panitia) dan hak akses menu tiap orang | Kegiatan → Peserta |
| 3 | Buat **sesi absensi** (jam buka/tutup) → tiap orang otomatis punya **link & QR pribadi** | Kegiatan → Absensi / Peserta |
| 4 | Buat **kuis** pre test / post test lengkap dengan durasi, jadwal buka-tutup, dan aturan lain | Kegiatan → Kuis |
| 5 | Catat **notula**, unggah **sertifikat** dan **dokumentasi** | Kegiatan → Notula / Sertifikat / Dokumentasi |
| 6 | Lihat **laporan**: kehadiran, hasil kuis, peringkat, pre vs post, analisis soal | Kegiatan → Laporan |

Peserta **tidak perlu login**: cukup membuka link pribadi `https://domain-anda/p/<token>` (atau scan QR) di HP, atau memasukkan **NIP**
di halaman depan (lihat di bawah).

## Fitur

**Halaman depan (landing) dan masuk dengan NIP**
- Alamat utama aplikasi (`/`) adalah halaman depan publik: profil LAKSANA, daftar **kegiatan berjalan**, cara masuk, dan ringkasan fitur.
  Kegiatan berstatus *Berjalan* tampil sebagai kartu; mengkliknya membuka `/k/<id kegiatan>` (alamat ini juga bisa dibagikan langsung).
- Peserta memasukkan **NIP**; bila cocok dengan data peserta/narasumber/panitia kegiatan itu, mereka langsung dibuka ke halaman pribadinya
  (`/p/<token>`). Panitia masuk lewat tombol *Masuk panitia*.
- Di *Ringkasan → Pengaturan kegiatan* ada opsi **Tampilkan di halaman depan (masuk dengan NIP)** per kegiatan (bawaan aktif). Matikan bila peserta
  hanya boleh masuk lewat link/QR.
- **Perhatikan:** NIP bukan rahasia seperti token. Siapa pun yang mengetahui NIP seseorang dapat membuka halamannya (termasuk mengerjakan kuis
  atas namanya). Untuk membatasi penebakan, server menolak pencarian setelah **5 kegagalan** untuk NIP yang sama atau **40 kegagalan** pada satu kegiatan
  dalam 10 menit, dan hanya kegiatan berjalan yang dibuka untuk umum. Untuk kegiatan yang menuntut keamanan lebih tinggi (mis. kuis yang menentukan nilai),
  matikan opsi ini dan bagikan link/QR pribadi saja.

**Menu per kegiatan, data pegawai, dan hak akses**
- **Menu kegiatan**: di *Ringkasan → Menu kegiatan* panitia mengaktifkan/menonaktifkan *Absensi, Notula, Kuis, Sertifikat,
  Dokumentasi* untuk tiap kegiatan (bawaan: semua aktif). Menu nonaktif hilang dari panitia dan peserta, dan ditolak di server;
  datanya tetap tersimpan. *Peserta*, *Laporan*, dan *Data pegawai* selalu ada.
- **Data pegawai** (menu di sidebar): induk data orang milik akun panitia, dikelompokkan per **satuan kerja** (penulisan yang
  berbeda huruf besar/kecil atau spasi otomatis digabung), dengan impor dari berkas dan "Ubah nama" satker.
  **Impor berkas Excel (.xlsx)** atau CSV: sistem membaca berkas langsung di browser lalu mengisi nama, NIP, pangkat/golongan, jabatan,
  satuan kerja, dan WhatsApp yang tersedia; kolom yang tidak ada dikosongkan dan bisa diperiksa dulu di pratinjau. Dua bentuk dikenali:
  (1) tabel dengan baris judul kolom, dan (2) *rekap pegawai* yang satu pegawainya memakai beberapa baris (kolom "Identitas" berisi nama lalu NIP,
  kolom "Jabatan" berisi jabatan lalu golongan; NIP bertitik otomatis dirapikan, "Pembina Utama, (IV/e)" menjadi "Pembina Utama (IV/e)").
  Satuan kerja diambil dari judul berkas ("… Pada <satuan kerja>") atau dari isian "satuan kerja bawaan" di pratinjau; boleh dikosongkan. NIP unik per akun.
  Mengubah data pegawai ikut memperbarui salinannya di semua kegiatan yang memakainya.
- **Peserta kegiatan dipilih dari data pegawai** (per satker, bisa pilih satu kelompok sekaligus). Tiap orang diberi **jenis**
  (peserta / narasumber / panitia) dan **hak akses menu** yang bisa diubah per orang atau massal. Daftar hak akses selalu sama
  dengan menu yang aktif pada kegiatan (mis. 5 menu aktif = 5 pilihan; menu nonaktif tidak tampil).
  Isian awal: peserta = absensi, kuis, sertifikat; narasumber = absensi, sertifikat; panitia = semua kecuali kuis. Menu yang boleh
  dipakai seseorang = menu aktif di kegiatan **dan** hak akses orang itu, ditegakkan di server (RPC portal). Peserta yang berhak
  melihat **notula Final** dan **dokumentasi** di halaman pribadinya.
- **Notula**: catatan rapat/sesi (waktu, tempat, pimpinan, pencatat, peserta rapat — bisa diisi dari absensi —, agenda,
  pembahasan, keputusan, dan **tindak lanjut** dengan penanggung jawab, tenggat, status selesai). Cetak/PDF dan unduh Word.
- **Dokumentasi**: unggah foto (dikompres otomatis, disimpan di Storage dengan nama acak) atau tambah tautan video/folder, dikelompokkan
  per **album**, dengan galeri, keterangan, dan penampil foto. Peserta yang diberi hak akses melihatnya di halaman pribadinya.

**Kegiatan & peserta**
- Status kegiatan (Draft / Berjalan / Selesai); draft menutup absensi & kuis untuk peserta.
- Data peserta: **Nama lengkap beserta gelar, NIP, Pangkat/Gol. Ruang, Jabatan, Satuan Kerja, No. WhatsApp**
  (saran pangkat/golongan PNS tersedia di formulir; avatar melewati gelar di depan nama seperti Dr., Ir., H.).
- **Jenis**: setiap orang berjenis *Peserta*, *Narasumber*, atau *Panitia* dan punya link/QR pribadi. Menu yang tampil di
  linknya mengikuti hak akses (bawaan narasumber/panitia: absensi + sertifikat, tanpa kuis); hanya *Peserta* yang masuk peringkat.
  Laporan kuis memuat orang yang punya hak akses kuis, laporan kehadiran memuat yang punya hak akses absensi.
- **Sertifikat**: admin mengunggah sertifikat (PDF/PNG/JPG, maks. 10 MB) per orang di tab *Sertifikat*, satu per satu atau
  banyak sekaligus. Berkas dicocokkan otomatis ke orangnya lewat **NIP** atau **nama** pada nama berkas
  (mis. `198001012005011001.pdf` atau `Budi Santoso.pdf`; gelar diabaikan, nama kembar/tidak cocok dipilih manual,
  tipe berkas dicek dari isinya). Setelah semua siap, admin menekan **Buka unduhan**; peserta, narasumber, dan panitia
  lalu mengunduh dari link pribadi masing-masing (tombol Unduh/Lihat). Ada daftar siapa yang belum punya sertifikat.
- **Foto selfie & lokasi saat absen**: tiap sesi absensi punya pilihan *Wajib foto selfie* dan *Wajib lokasi* (bawaan aktif;
  keduanya bisa dimatikan agar peserta absen satu ketukan). Bila aktif, peserta lebih dulu melihat penjelasan, baru
  menekan **Izinkan kamera & lokasi** sehingga browser meminta izin pada saat yang tepat. Foto dikompres di perangkat
  (sisi terpanjang 720 px, maks. ±450 KB), koordinat dicatat bersama akurasinya. Syarat ditegakkan di server: absen ditolak
  bila foto/lokasi kosong atau tidak valid. Di tab *Absensi* admin melihat kolom **Foto** (klik untuk memperbesar) dan **Lokasi**
  (tautan Google Maps), keduanya juga masuk ke CSV; tombol *Hapus foto* membersihkan foto satu sesi.
- **Pengelompokan per satuan kerja (satker)**: tab Peserta, Absensi, dan rekap kehadiran dikelompokkan per satker
  (peserta, narasumber, dan panitia dalam satu kelompok) dengan jumlah per peran, lipat/buka kelompok, filter satker,
  dan tampilan "Daftar" bila ingin tanpa kelompok. Penulisan nama satker yang berbeda huruf besar/kecil atau spasi
  otomatis digabung; tombol "Ubah nama" memperbaiki/menggabungkan satker sekaligus untuk semua anggotanya. Kartu QR dan
  ekspor CSV diurutkan per satker.
- **Atur urutan**: urutan satuan kerja dan urutan orang di dalam tiap satker bisa diatur (seret ikon ⋮⋮ atau tombol
  panah) dan tersimpan di database. Urutan dipakai di tab Peserta, Absensi, rekap kehadiran, kartu QR, CSV, dan ekspor.
  Satker baru dan orang baru otomatis menyusul di akhir; "Kembali ke abjad" menghapus urutan khusus.
- **Ekspor Word (.docx) dan PDF**: daftar peserta/narasumber/panitia per satker atau satu tabel, dengan pilihan peran,
  kolom (NIP, Pangkat/Gol., Jabatan, WhatsApp, Peran, kolom tanda tangan untuk daftar hadir), judul, dan orientasi A4.
  Dokumen dibuat langsung di browser (tanpa server) dengan nomor halaman dan tanggal cetak.
- Impor banyak peserta dengan menempel dari Excel: kolom dibaca dari baris judul (urutan bebas) atau urutan bawaan,
  nama bergelar yang memuat koma aman (pemisah Tab/titik koma/kutip), spasi pada NIP dihapus, NIP yang rusak menjadi
  angka ilmiah (1.98E+17) ditolak, ada pratinjau kolom, deteksi duplikat (NIP/nama), dan templat CSV.
- Link pribadi per peserta: salin, **QR code** (unduh PNG), kirim via **WhatsApp**, unduh daftar link (CSV),
  **cetak kartu QR** semua peserta, dan **buat ulang link** bila bocor.

**Absensi**
- Banyak sesi per kegiatan (Hari 1, Hari 2, …) dengan jam buka & tutup. Peserta hanya bisa absen pada rentang itu.
- Status otomatis **Hadir** / **Terlambat** (batas menit bisa diatur); panitia bisa mengubah manual (Izin, Sakit, Alpa).
- Pantauan langsung (auto-refresh 15 detik), tombol "tandai yang belum absen = Alpa", duplikat sesi +1 hari, ekspor CSV.

**Kuis**
- Jenis Pre Test / Post Test / Kuis lain; soal pilihan ganda dengan bobot poin, pembahasan, dan urutan yang bisa diatur.
- **Pengaturan waktu**: durasi pengerjaan (menit), jadwal dibuka & ditutup. Hitung mundur memakai **jam server**
  (tidak bisa dicurangi dengan mengubah jam HP, tetap berjalan walau halaman ditutup) dan otomatis mengumpulkan saat habis.
- Maks. percobaan, nilai kelulusan, acak soal & pilihan jawaban, wajib absen dulu, tampilkan/sembunyikan skor & pembahasan.
- **Impor soal dari teks** (tempel dari Word) dan **"Jadikan Post Test"** (salin soal Pre Test).
- Jawaban tersimpan otomatis; kirim ulang otomatis bila koneksi putus; dapat dilanjutkan bila halaman tertutup.
- Kunci jawaban **tidak pernah dikirim ke browser peserta** sebelum kuis dikumpulkan.

**Laporan** (semua bisa diekspor CSV dan dicetak / disimpan PDF)
- 🏆 Peringkat keseluruhan = bobot kehadiran + rata-rata skor kuis (bobot bisa diatur per kegiatan).
- 🏢 Per satker: jumlah per peran, rata-rata kehadiran, rata-rata kuis dan nilai akhir, serta peringkat satker.
- 🗓️ Rekap kehadiran peserta × sesi.
- 📝 Hasil per kuis: statistik, sebaran nilai, peringkat (skor lalu waktu tercepat), status lulus, reset percobaan peserta.
- 📈 Pre vs Post: peningkatan per peserta dan **N-Gain** (Hake).
- 🔍 Analisis butir soal: tingkat kesukaran dan sebaran jawaban.
- Peserta dapat melihat papan peringkat (top 10 + posisinya) bila diaktifkan panitia.

## Tema tampilan
Tersedia mode **terang**, **gelap**, dan **otomatis** (mengikuti pengaturan perangkat). Tombol pemilih tema ada di sidebar
panitia, bar atas versi HP, header halaman peserta, dan halaman login. Pilihan disimpan di browser masing-masing pengguna.

## Menjalankan

### 1. Siapkan Supabase
1. Buat project di <https://supabase.com>.
2. Buka **SQL Editor → New query**, tempel seluruh isi [`supabase/schema.sql`](supabase/schema.sql), lalu **Run**.
   (Aman dijalankan ulang untuk memperbarui fungsi.)
3. **Authentication → Providers → Email**: untuk uji coba cepat, matikan *Confirm email*.
   Bila aplikasi hanya untuk tim internal, matikan juga *Allow new users to sign up* setelah akun panitia dibuat.
4. **Project Settings → API**: salin *Project URL* dan *anon public key*.

> **Memperbarui database yang sudah ada:** jalankan ulang seluruh isi `supabase/schema.sql` di SQL Editor, atau cukup
> jalankan berkas perubahan di `supabase/migrations/` yang belum pernah dijalankan secara berurutan
> (`002_narasumber.sql`, `003_panitia.sql`, `004_urutan.sql`, `005_sertifikat.sql`, `006_selfie_lokasi.sql`, `007_pegawai_menu.sql`, `008_akses_notula_dokumentasi.sql`, lalu `009_halaman_depan.sql`).
>
> Migrasi 007 membentuk **data pegawai dari peserta yang sudah ada** (satu pegawai per NIP) dan menautkannya, sehingga kegiatan lama
> tetap utuh; hak akses kuis narasumber/panitia lama diisi *nonaktif* sesuai aturan sebelumnya. Langkah ini hanya berjalan sekali.
> Skrip bersifat idempotent dan otomatis menambah kolom baru (mis. `grade` dan `job_title` untuk Pangkat/Gol. dan Jabatan)
> tanpa menghapus data. Lakukan ini **sebelum** versi aplikasi baru dipakai.

### 2. Jalankan aplikasi
```bash
npm install
cp .env.example .env        # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```
Buka `/login`, daftar akun panitia, lalu buat kegiatan pertama.

### 3. Deploy
```bash
npm run build               # hasil di folder dist/
```
Unggah `dist/` ke Vercel / Netlify / Cloudflare Pages dan isi dua variabel lingkungan di atas.
Aplikasi memakai routing sisi-klien, jadi host harus mengarahkan semua path ke `index.html`
(sudah disiapkan: `vercel.json` untuk Vercel dan `public/_redirects` untuk Netlify/Cloudflare).
Link peserta memakai domain tempat aplikasi di-deploy, jadi deploy dulu sebelum membagikan link.

## Keamanan sertifikat
Berkas disimpan di bucket Supabase Storage `certificates` dengan nama acak (`<id kegiatan>/<32 hex>.<ext>`). Bucket bersifat
publik, tetapi alamat berkas **tidak bisa ditebak** dan hanya diberikan oleh server (`portal_certificate`) setelah token pribadi
valid **dan** unduhan dibuka panitia; hanya pemilik kegiatan yang boleh mengunggah, mengganti, menghapus, atau melihat daftar
berkas. Seperti link pribadi, alamat berkas yang sudah dibagikan oleh penerimanya bisa dibuka siapa pun yang memilikinya.

## Privasi foto selfie & lokasi
- Absen dengan selfie/lokasi memerlukan **HTTPS** (Vercel/Netlify sudah HTTPS; `localhost` juga diizinkan browser).
- Foto disimpan di bucket Storage `selfies` yang **privat** (maks. 512 KB, hanya JPEG). Peserta tidak punya akun, jadi unggahan
  hanya bisa lewat *slot sekali pakai* yang dicadangkan server (`portal_selfie_slot`) setelah token pribadi, jam sesi, dan
  status belum-absen divalidasi; path berkas acak. Hanya pemilik kegiatan yang bisa melihat (lewat tautan bertanda tangan
  berumur 1 jam) atau menghapus foto; peserta tidak bisa membaca foto siapa pun, termasuk fotonya sendiri.
- Foto ikut terhapus saat sesi, peserta, atau kegiatannya dihapus. Beri tahu peserta tujuan pengumpulan data ini sesuai
  kebijakan privasi lembaga Anda.

## Dokumentasi (foto) dan data pegawai
- Foto dokumentasi disimpan di bucket Storage `dokumentasi` (maks. 10 MB, JPEG/PNG/WebP). Seperti sertifikat, bucket bersifat publik tetapi
  nama berkas acak (`<id kegiatan>/<32 hex>.jpg`) dan alamatnya hanya diberikan server (`portal_docs`) kepada orang yang tokennya valid, menunya aktif,
  dan punya hak akses Dokumentasi; hanya pemilik kegiatan yang bisa mengunggah, mengganti, menghapus, atau melihat daftar berkas. Alamat yang sudah
  dibagikan penerimanya bisa dibuka siapa pun yang memilikinya.
- Data pegawai (nama, NIP, WhatsApp) milik akun panitia yang menginputnya (RLS per akun); akun lain tidak dapat melihatnya.

## Keamanan

- **Panitia** login dengan Supabase Auth; semua tabel memakai **Row Level Security** sehingga setiap akun hanya
  melihat dan mengubah kegiatan miliknya.
- **Peserta** (anon) tidak punya akses SELECT ke tabel apa pun. Semua aksi lewat fungsi RPC `security definer`
  (`portal_*`) yang memvalidasi token pribadi (122-bit acak). Skor dihitung di server.
- Anon key aman dipublikasikan di frontend karena akses dibatasi RLS dan RPC di atas. **Jangan** memakai `service_role` key di frontend.
- Link peserta bersifat rahasia seperti kata sandi; gunakan "Buat ulang link" bila bocor.

## Aturan nilai akhir

```
kehadiran %   = sesi berstatus Hadir/Terlambat ÷ total sesi
rata-rata kuis = rata-rata skor terbaik tiap kuis yang terbit dan "masuk nilai akhir" (belum dikerjakan = 0)
nilai akhir   = bobot × kehadiran + (100 − bobot) × rata-rata kuis      (bobot default 30%)
```
Perhitungan ada di satu tempat (`_ranking` di `schema.sql`) sehingga angka di halaman panitia dan peserta selalu sama.

## Struktur proyek

```
supabase/schema.sql        tabel, RLS, dan fungsi RPC (jalankan sekali di SQL Editor)
src/lib/                   tipe, klien Supabase, format, CSV, parser impor, logika laporan (+ unit test)
src/pages/admin/           dashboard, peserta, absensi, kuis, editor kuis, laporan
src/pages/portal/          halaman peserta, pengerjaan kuis, hasil
src/components/ui.tsx      modal, toast, konfirmasi, grafik batang, hook data
```

## Perintah

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | server pengembangan |
| `npm run build` | cek tipe + build produksi |
| `npm test` | unit test (parser impor, perhitungan laporan) |

## Ide pengembangan lanjutan
Tipe soal lain (benar/salah, isian, pilihan ganda kompleks), bank soal, sertifikat PDF otomatis untuk peserta lulus,
notifikasi email/WhatsApp otomatis, absensi berbasis lokasi (geofence), dan peran panitia berbagi kegiatan.
