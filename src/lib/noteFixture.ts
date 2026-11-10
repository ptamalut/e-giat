/** Contoh notula (Rapat Panitia Bimtek) mengikuti format resmi; dipakai uji ekspor, tidak dimuat aplikasi. */
import { parseOutline } from './notes'
import type { NoteDocInput } from './noteDoc'
import type { NoteSection } from './types'

const sec = (id: string, type: NoteSection['type'], title: string, intro: string, outline = ''): NoteSection => ({ id, type, title, intro, items: parseOutline(outline) })

export const SAMPLE_KOP = {
  title: ['Mahkamah Agung Republik Indonesia', 'Direktorat Jenderal Badan Peradilan Agama', 'Pengadilan Tinggi Agama Maluku Utara'],
  address: ['Jalan Raya Kilometer 40, Balbar, Oba Utara', 'Kota Sofifi, Maluku Utara 97852, www.pta-malut.go.id, ptamalut@gmail.com'],
}

export const SAMPLE_NOTE: NoteDocInput & { title: string } = {
  title: 'Rapat Panitia Bimtek CPP',
  basis: 'Undangan Nomor 1598/KPTA.W29-A/UND.OT1.6/X/2026 tanggal 23 Oktober 2026',
  held_at: '2026-10-26T01:00:00.000Z',   // 10.00 WIT
  held_until: '',
  location: 'Ruang Aula Pengadilan Tinggi Agama Maluku Utara',
  agenda: 'Rapat Steering Committee (Panitia Pengarah) dan Organizing Committee (Panitia Pelaksana) Bimbingan Teknis Peningkatan Kompetensi Dasar Calon Panitera Pengganti (Bimtek CPP) Se-Wilayah Pengadilan Tinggi Agama Maluku Utara Tahun 2026',
  leader: 'Helmi Ashari, S.H.', leader_role: 'Ketua Organizing Committee', leader_nip: '196806051992031004',
  notetaker: 'Ramadhan Chairil Yustihan, S.T.', notetaker_nip: '199602022025061013',
  attendees: 'Ketua dan Wakil Ketua Pengadilan Tinggi Agama Maluku Utara, Steering Committee (Panitia Pengarah), Narasumber, serta Anggota Organizing Committee (Panitia Pelaksana) Bimtek CPP Tahun 2026',
  sections: [
    sec('a', 'teks', 'Pembukaan', 'Rapat dibuka oleh Ketua Organizing Committee, Helmi Ashari, S.H., selaku pimpinan rapat, dengan menyampaikan hal-hal sebagai berikut:',
      '1. Rapat dilaksanakan dalam rangka membahas persiapan pelaksanaan Bimbingan Teknis Peningkatan Kompetensi Dasar Calon Panitera Pengganti Se-Wilayah Pengadilan Tinggi Agama Maluku Utara Tahun 2026;\n2. Selanjutnya, pimpinan rapat mempersilakan Ketua Pengadilan Tinggi Agama Maluku Utara untuk memberikan pengarahan.'),
    sec('b', 'teks', 'Pengarahan Ketua Pengadilan Tinggi Agama Maluku Utara', 'Ketua Pengadilan Tinggi Agama Maluku Utara, Drs. M. Rosyid Ya’Kub, M.H., memberikan pengarahan sebagai berikut:',
      '1. **Struktur kepanitiaan.** Panitia penyelenggara terdiri atas Steering Committee dan Organizing Committee, sehingga tugas dan kedudukan masing-masing perlu dipahami dengan jelas;\n' +
      '2. **Perbaikan SK Panitia.** Keputusan Ketua Nomor 1557/KPTA.W29-A/SK.DL1.10/X/2026 perlu diperbaiki dengan memperhatikan hal-hal berikut:\n a. Perlu diklarifikasi kepada Panitera mengenai adanya nama yang tercantum rangkap;\n b. Jabatan Bendahara dihapus dari susunan panitia apabila kegiatan tidak memerlukan pengelolaan dana;\n' +
      '3. **Peserta luring.** Peserta yang mengikuti kegiatan secara luring berjumlah 10 (sepuluh) orang;'),
    sec('c', 'teks', 'Tanggapan dan Masukan Peserta Rapat', 'Atas pengarahan tersebut, peserta rapat menyampaikan tanggapan dan masukan sebagai berikut:',
      '1. **Wakil Ketua Pengadilan Tinggi Agama Maluku Utara (Drs. Suhardi, S.H.)**\n a. Kejelasan penyelenggaraan Bimtek CPP perlu dikoordinasikan dengan Direktorat Jenderal Badan Peradilan Agama;\n b. Materi Bimtek perlu dikoordinasikan dengan baik.\n' +
      '2. **Drs. Sartino, S.H., M.H. (Hakim Tinggi/Anggota Steering Committee)**\n a. Menyampaikan kedudukannya sebagai bagian dari Steering Committee;'),
    sec('d', 'teks', 'Arahan Penutup Ketua Pengadilan Tinggi Agama Maluku Utara', '',
      '1. Rapat lanjutan dilaksanakan sebelum hari Jumat, yaitu pada **hari Kamis, 29 Oktober 2026**, dengan mengundang seluruh panitia;\n2. Seksi Acara, Materi, dan Evaluasi menyusun soal pre-test dan post-test.'),
    sec('e', 'tindak_lanjut', 'Kesimpulan dan Rencana Tindak Lanjut', 'Berdasarkan hasil pembahasan, rapat menyepakati rencana tindak lanjut sebagai berikut:'),
    sec('f', 'teks', 'Penutup', 'Rapat ditutup oleh pimpinan rapat dengan ucapan terima kasih atas kehadiran dan masukan seluruh peserta rapat.'),
  ],
  follow_ups: [
    { id: '1', task: 'Memperbaiki SK Panitia: klarifikasi nama rangkap pada SC dan OC, menghapus jabatan Bendahara apabila tidak ada pengelolaan dana', pic: 'Ketua OC dan Sekretaris OC', due: '', done: false },
    { id: '2', task: 'Memastikan tanggal pelaksanaan Bimtek kepada Direktorat Jenderal Badan Peradilan Agama', pic: 'Steering Committee dan Ketua OC', due: '', done: false },
    { id: '3', task: 'Menyusun soal pre-test dan post-test serta menyusun peringkat peserta berdasarkan hasilnya', pic: 'Seksi Acara, Materi, dan Evaluasi', due: '', done: false },
  ],
  discussion: null, decisions: null,
}
