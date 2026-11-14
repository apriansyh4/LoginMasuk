import { getLang } from '@/lib/i18n/server';

export const metadata = { title: 'Privasi' };

const CONTENT = {
  id: {
    title: 'Pemberitahuan Privasi',
    sections: [
      [
        'Data yang kami kumpulkan',
        'Hanya email, nama tampilan, waktu persetujuan, dan konten yang Anda kirim (gambar produk, ukuran opsional, hasil validasi, dan model 3D). Tidak ada pelacakan atau iklan.',
      ],
      [
        'Untuk apa',
        'Untuk memvalidasi gambar Anda, membuat model 3D perkiraan, dan menampilkan riwayat Anda. Gambar tidak dipakai untuk melatih model AI.',
      ],
      [
        'Orang dan wajah',
        'Gambar yang berisi orang atau bagian tubuh ditolak sejak awal. Kami tidak menyimpan data wajah atau biometrik.',
      ],
      [
        'Penyimpanan',
        'File disimpan di bucket privat dan hanya diakses lewat URL bertanda tangan yang singkat. Unggahan dihapus otomatis setelah masa retensi (bawaan 30 hari). Menghapus kiriman juga menghapus filenya.',
      ],
      [
        'Akses admin',
        'Admin dapat melihat konten pengguna hanya untuk moderasi dan penanganan penyalahgunaan. Setiap tindakan admin dicatat di log audit.',
      ],
      ['Hak Anda', 'Anda dapat melihat dan menghapus data Anda. Ekspor data dan penghapusan akun akan segera hadir.'],
      [
        'Dasar hukum',
        'Pemberitahuan ini disusun selaras secara prinsip dengan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi. Ini bukan nasihat hukum.',
      ],
    ],
  },
};

export default async function PrivacyPage() {
  const c = CONTENT[await getLang()];
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="page-title">{c.title}</h1>
      {c.sections.map(([h, p]) => (
        <section key={h} className="mt-8">
          <h2 className="font-display text-xl font-extrabold">{h}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{p}</p>
        </section>
      ))}
    </article>
  );
}
