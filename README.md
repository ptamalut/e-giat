# e-Giat — Absensi & Kuis Kegiatan

Aplikasi web (React + Vite + TypeScript) dengan database **Supabase** untuk mengelola kegiatan: daftar peserta,
absensi lewat link/QR pribadi, kuis pre test / post test berwaktu, dan laporan lengkap.

## Alur aplikasi

| # | Langkah | Di mana |
|---|---------|---------|
| 1 | Tambah **kegiatan** | Panitia → Dashboard |
| 2 | Input **peserta** (satu per satu atau tempel dari Excel) | Kegiatan → Peserta |
| 3 | Buat **sesi absensi** (jam buka/tutup) → tiap peserta otomatis punya **link & QR pribadi** | Kegiatan → Absensi / Peserta |
| 4 | Buat **kuis** pre test / post test lengkap dengan durasi, jadwal buka-tutup, dan aturan lain | Kegiatan → Kuis |
| 5 | Lihat **laporan**: kehadiran, hasil kuis, peringkat, pre vs post, analisis soal | Kegiatan → Laporan |

Peserta **tidak perlu login**: cukup membuka link pribadi `https://domain-anda/p/<token>` (atau scan QR) di HP.

## Fitur

**Kegiatan & peserta**
- Status kegiatan (Draft / Berjalan / Selesai); draft menutup absensi & kuis untuk peserta.
- Data peserta: **Nama lengkap beserta gelar, NIP, Pangkat/Gol. Ruang, Jabatan, Satuan Kerja, No. WhatsApp**
  (saran pangkat/golongan PNS tersedia di formulir; avatar melewati gelar di depan nama seperti Dr., Ir., H.).
- **Peran**: setiap orang berperan *Peserta*, *Narasumber*, atau *Panitia*. Narasumber dan Panitia punya link/QR pribadi
  dan melakukan absensi, tetapi tidak melihat atau mengerjakan kuis (ditegakkan di server) dan tidak masuk
  peringkat/laporan kuis. Peran dipilih di formulir, lewat filter, saat impor ("Impor sebagai"), atau lewat kolom
  opsional "Peran" di data Excel.
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
> (`002_narasumber.sql`, lalu `003_panitia.sql`).
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
